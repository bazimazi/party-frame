/**
 * The one room type the platform needs.
 *
 * A `PartySessionRoom` owns a `GameSession`: its public code, its lobby, its
 * players (human and bot), its lifecycle and its authoritative clock. The game
 * being played is a plugin resolved at creation time, so this file contains no
 * Bomb Party logic whatsoever - swapping in a different game changes only which
 * adapter is looked up.
 *
 * Authority model, in one sentence: clients send *intentions*, this room decides
 * what actually happened, and the resulting state is what everyone renders.
 */

import { Room, ServerError, matchMaker, type Client } from "@colyseus/core";
import {
  Rng,
  randomSeed,
  validateSync,
  type BotStrategy,
  type GameContext,
  type GamePlayer,
  type PlayerRegistry,
} from "@party-frame/game-core";
import {
  ABSOLUTE_MAX_PLAYERS,
  AVATARS,
  CLOCK_BEACON_MS,
  ClockPingSchema,
  HOST_RECONNECT_SECONDS,
  JoinOptionsSchema,
  MAX_MESSAGE_BYTES,
  MSG,
  PARTY_ROOM,
  PLAYER_COLORS,
  PLAYER_RECONNECT_SECONDS,
  SERVER_TICK_MS,
  SessionActionSchema,
  type ClientRole,
  type ControllerEnvelope,
  type ControllerMode,
  type GameEventMessage,
  type PartyErrorCode,
  type SessionAction,
  type SessionStatus,
  type WelcomePayload,
} from "@party-frame/protocol";
import { requireAdapter, type GameNetworkAdapter } from "./adapters.js";
import { EVENT, runtimeHost, type Logger } from "./bind.js";
import { makeBotIdentity } from "./bots.js";
import { generateUniqueRoomCode } from "./roomCode.js";
import {
  CLOCK_PING_LIMITS,
  GAME_ACTION_LIMITS,
  RateLimiter,
  SESSION_ACTION_LIMITS,
} from "./rateLimit.js";
import { PlayerSchema, SessionSchema } from "./sessionSchema.js";

/** Options the matchmaker passes when a shared screen creates a session. */
export interface RoomCreateOptions {
  gameId?: string;
  /** Fixed seed, used only by tests to make a whole match reproducible. */
  seed?: number;
}

/** Metadata published to the matchmaker, used by the `/api/rooms/:code` lookup. */
export interface RoomMetadata {
  publicCode: string;
  gameId: string;
  status: SessionStatus;
  playerCount: number;
  maxPlayers: number;
}

interface ClientData {
  role: ClientRole;
  joinedAt: number;
}

/** Colyseus close codes must be >= 4000; these map onto `PartyErrorCode`. */
const JOIN_ERROR_CODE = 4400;

function rejectJoin(code: PartyErrorCode): never {
  // The message carries the machine-readable code; the client localises it and
  // never shows this string to a player.
  throw new ServerError(JOIN_ERROR_CODE, code);
}

/** Status values in which the game plugin should be ticking. */
const RUNNING_STATUSES = new Set<SessionStatus>(["STARTING", "PLAYING", "ROUND_END"]);

export class PartySessionRoom extends Room<SessionSchema, RoomMetadata> {
  override maxClients = ABSOLUTE_MAX_PLAYERS + 2;

  private adapter!: GameNetworkAdapter;
  private gameState: unknown;
  private gameOptions: unknown;
  private rng!: Rng;
  private registry!: PlayerRegistry;

  /** Presentation cues queued by the game during the current tick. */
  private eventQueue: GameEventMessage[] = [];
  /** Status the game asked for during the current tick, applied once at the end. */
  private requestedStatus: SessionStatus | null = null;

  /** Bot strategies, one per difficulty, shared by every bot at that level. */
  private botStrategies = new Map<string, BotStrategy<unknown, unknown, unknown>>();
  /** A bot's chosen action and the time it should be submitted. */
  private botPending = new Map<string, { action: unknown; dueAt: number }>();

  private readonly gameLimiter = new RateLimiter(GAME_ACTION_LIMITS);
  private readonly sessionLimiter = new RateLimiter(SESSION_ACTION_LIMITS);
  private readonly clockLimiter = new RateLimiter(CLOCK_PING_LIMITS);

  private createdAt = 0;
  private lastConnectedAt = 0;
  private lastBeaconAt = 0;
  private nextSeat = 0;
  private controllerRevision = 0;
  /** Last envelope sent to each controller, so unchanged state is not resent. */
  private lastControllerJson = new Map<string, string>();

  private logger!: Logger;

  // ---------------------------------------------------------------- lifecycle

  override async onCreate(options: RoomCreateOptions): Promise<void> {
    const host = runtimeHost();
    const gameId = options.gameId ?? host.defaultGameId;
    this.adapter = requireAdapter(gameId);

    // Generated here rather than by the caller so a client can never choose,
    // guess or reuse a code. Colyseus awaits `onCreate` before admitting anyone,
    // so the code is in place before the first join.
    const publicCode = await generateUniqueRoomCode(async (candidate) => {
      const rooms = await matchMaker.query({ name: PARTY_ROOM });
      return rooms.some(
        (room) => (room.metadata as RoomMetadata | undefined)?.publicCode === candidate,
      );
    });

    this.logger = host.log.child({
      sessionId: this.roomId,
      roomCode: publicCode,
      gameId: this.adapter.game.id,
    });

    this.rng = new Rng(options.seed ?? randomSeed());
    this.gameOptions = this.adapter.game.parseOptions({});
    this.gameState = this.adapter.game.createState(this.gameOptions);

    const state = this.adapter.createState();
    state.publicCode = publicCode;
    state.gameId = this.adapter.game.id;
    state.status = "LOBBY";
    state.serverTime = Date.now();
    state.settings.maxPlayers = Math.min(host.maxPlayers, this.adapter.game.maxPlayers);
    state.settings.botCount = 0;
    state.settings.botDifficulty = "medium";
    this.setState(state);

    this.registry = this.createRegistry();

    // The session outlives an empty room on purpose: a TV that drops off Wi-Fi
    // must be able to come back to the same game. `checkExpiry` reclaims it.
    this.autoDispose = false;

    this.createdAt = Date.now();
    this.lastConnectedAt = this.createdAt;

    this.registerMessageHandlers();
    this.setSimulationInterval((deltaMs) => this.tick(deltaMs), SERVER_TICK_MS);
    void this.publishMetadata();

    this.logger.info(EVENT.SESSION_CREATED, { maxPlayers: state.settings.maxPlayers });
  }

  override onAuth(_client: Client, rawOptions: unknown): ClientData {
    const parsed = JoinOptionsSchema.safeParse(rawOptions ?? {});
    if (!parsed.success) rejectJoin("INVALID_PAYLOAD");

    const { role } = parsed.data;
    if (this.state.status === "CLOSED") rejectJoin("ROOM_CLOSED");

    if (role === "host") {
      // A second shared screen is refused rather than silently taking over, so a
      // stray tab cannot hijack the TV mid-game.
      const hostOnline = this.clients.some(
        (client) => (client.userData as ClientData | undefined)?.role === "host",
      );
      if (hostOnline) rejectJoin("NOT_ALLOWED");
    } else {
      const seated = [...this.state.players.values()].filter((p) => !p.isBot).length;
      if (seated >= this.state.settings.maxPlayers) rejectJoin("ROOM_FULL");
    }

    return { role, joinedAt: Date.now() };
  }

  override onJoin(client: Client, _options: unknown, auth: ClientData): void {
    client.userData = auth;
    this.lastConnectedAt = Date.now();

    if (auth.role === "host") {
      this.state.hostConnected = true;
      this.logger.info(EVENT.HOST_ATTACHED, { playerId: client.sessionId });
    } else {
      this.ensurePlayerRow(client.sessionId);
    }

    this.sendWelcome(client);
    void this.publishMetadata();
    this.pushControllerState(client, true);
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const data = client.userData as ClientData | undefined;
    const role = data?.role ?? "controller";

    if (role === "host") {
      this.state.hostConnected = false;
      this.logger.warn(EVENT.HOST_DISCONNECTED, { consented });
      if (consented) return;
      try {
        // A TV losing Wi-Fi must not end everyone's game.
        await this.allowReconnection(client, HOST_RECONNECT_SECONDS);
        this.state.hostConnected = true;
        this.sendWelcome(client);
        this.logger.info(EVENT.HOST_RECONNECTED);
      } catch {
        this.logger.info(EVENT.HOST_DISCONNECTED, { recovered: false });
      }
      return;
    }

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (consented) {
      this.removePlayer(client.sessionId, "left");
      return;
    }

    player.connected = false;
    this.notifyGameOfPlayer(client.sessionId, "disconnected");
    this.emitPlatformEvent({
      kind: "player-disconnected",
      messageKey: "event.playerDisconnected",
      params: { name: player.name },
      playerId: player.id,
    });
    this.logger.info(EVENT.PLAYER_DISCONNECTED, { playerId: client.sessionId });

    try {
      const reconnected = await this.allowReconnection(client, PLAYER_RECONNECT_SECONDS);
      const row = this.state.players.get(client.sessionId);
      if (row) row.connected = true;
      reconnected.userData = data ?? { role: "controller", joinedAt: Date.now() };
      this.lastConnectedAt = Date.now();
      this.notifyGameOfPlayer(client.sessionId, "reconnected");
      this.emitPlatformEvent({
        kind: "player-reconnected",
        messageKey: "event.playerReconnected",
        params: { name: row?.name ?? "" },
        playerId: client.sessionId,
      });
      // onJoin does not run again after a reconnection, so identity and the
      // controller projection have to be re-sent explicitly.
      this.sendWelcome(reconnected);
      this.pushControllerState(reconnected, true);
      this.logger.info(EVENT.PLAYER_RECONNECTED, { playerId: client.sessionId });
    } catch {
      this.removePlayer(client.sessionId, "left");
    }
  }

  override onDispose(): void {
    this.gameLimiter.clear();
    this.sessionLimiter.clear();
    this.clockLimiter.clear();
    this.lastControllerJson.clear();
    this.logger.info(EVENT.SESSION_DISPOSED);
  }

  // ------------------------------------------------------------------ players

  /** Creates or revives the row for a controller's seat. */
  private ensurePlayerRow(playerId: string): PlayerSchema {
    const existing = this.state.players.get(playerId);
    if (existing) {
      existing.connected = true;
      return existing;
    }

    const player = new PlayerSchema();
    player.id = playerId;
    player.seat = this.nextSeat++;
    player.color = this.pickFreeColor();
    player.avatar = this.pickFreeAvatar();
    player.connected = true;
    player.joined = false;
    this.state.players.set(playerId, player);
    return player;
  }

  private pickFreeColor(): string {
    const taken = new Set([...this.state.players.values()].map((p) => p.color));
    return PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[0];
  }

  private pickFreeAvatar(): string {
    const taken = new Set([...this.state.players.values()].map((p) => p.avatar));
    return AVATARS.find((a) => !taken.has(a)) ?? AVATARS[0];
  }

  private removePlayer(playerId: string, reason: "left" | "kicked"): void {
    const player = this.state.players.get(playerId);
    if (!player) return;

    this.state.players.delete(playerId);
    this.botPending.delete(playerId);
    this.gameLimiter.forget(playerId);
    this.sessionLimiter.forget(playerId);
    this.clockLimiter.forget(playerId);
    this.lastControllerJson.delete(playerId);

    if (this.state.hostPlayerId === playerId) {
      this.state.hostPlayerId = this.electHostPlayer();
    }

    this.notifyGameOfPlayer(playerId, "left");
    this.emitPlatformEvent({
      kind: "player-left",
      messageKey: "event.playerLeft",
      params: { name: player.name },
      playerId,
    });
    this.logger.info(EVENT.PLAYER_LEFT, { playerId, reason });
    void this.publishMetadata();
  }

  /** The longest-seated joined human becomes host when the previous one leaves. */
  private electHostPlayer(): string {
    const candidate = [...this.state.players.values()]
      .filter((p) => !p.isBot && p.joined)
      .sort((a, b) => a.seat - b.seat)[0];

    for (const player of this.state.players.values()) {
      player.isHost = candidate ? player.id === candidate.id : false;
    }
    return candidate?.id ?? "";
  }

  /** Players the game rules operate on: everyone who has completed joining. */
  private gamePlayers(): PlayerSchema[] {
    return [...this.state.players.values()]
      .filter((p) => p.joined)
      .sort((a, b) => a.seat - b.seat);
  }

  private createRegistry(): PlayerRegistry {
    const toGamePlayer = (p: PlayerSchema): GamePlayer => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      connected: p.connected,
      score: p.score,
      seat: p.seat,
    });

    return {
      all: () => this.gamePlayers().map(toGamePlayer),
      get: (playerId) => {
        const row = this.state.players.get(playerId);
        return row && row.joined ? toGamePlayer(row) : undefined;
      },
      has: (playerId) => Boolean(this.state.players.get(playerId)?.joined),
      addScore: (playerId, delta) => {
        const row = this.state.players.get(playerId);
        if (row) row.score = Math.max(0, row.score + delta);
      },
      setScore: (playerId, score) => {
        const row = this.state.players.get(playerId);
        if (row) row.score = Math.max(0, score);
      },
    };
  }

  // --------------------------------------------------------------------- bots

  /** Adds or removes bots so the roster matches `settings.botCount`. */
  private reconcileBots(): void {
    const bots = [...this.state.players.values()].filter((p) => p.isBot);
    const humans = [...this.state.players.values()].filter((p) => !p.isBot && p.joined);
    const capacity = Math.max(0, this.state.settings.maxPlayers - humans.length);
    const target = Math.min(this.state.settings.botCount, capacity);

    for (let i = bots.length; i > target; i -= 1) {
      const victim = bots[i - 1];
      if (!victim) break;
      this.state.players.delete(victim.id);
      this.botPending.delete(victim.id);
      this.logger.info(EVENT.BOT_REMOVED, { playerId: victim.id });
    }

    for (let i = bots.length; i < target; i += 1) {
      const takenNames = new Set([...this.state.players.values()].map((p) => p.name.toLowerCase()));
      const takenColors = new Set([...this.state.players.values()].map((p) => p.color));
      const identity = makeBotIdentity(i, takenNames, takenColors);

      const bot = new PlayerSchema();
      bot.id = `bot-${this.roomId}-${i}-${this.nextSeat}`;
      bot.seat = this.nextSeat++;
      bot.name = identity.name;
      bot.avatar = identity.avatar;
      bot.color = identity.color;
      bot.isBot = true;
      bot.connected = true;
      bot.joined = true;
      bot.ready = true;
      this.state.players.set(bot.id, bot);
      this.logger.info(EVENT.BOT_ADDED, { playerId: bot.id });
    }

    // Settings may have asked for more bots than there was room for.
    this.state.settings.botCount = Math.min(this.state.settings.botCount, capacity);
    void this.publishMetadata();
  }

  private botStrategy(): BotStrategy<unknown, unknown, unknown> {
    const difficulty = this.state.settings.botDifficulty;
    let strategy = this.botStrategies.get(difficulty);
    if (!strategy) {
      strategy = this.adapter.game.createBot(
        difficulty === "easy" || difficulty === "hard" ? difficulty : "medium",
      );
      this.botStrategies.set(difficulty, strategy);
    }
    return strategy;
  }

  /**
   * Drives every bot through the human action path.
   *
   * A bot never mutates game state directly: it produces the same payload a
   * phone would send, and that payload goes through the same validation and the
   * same `handleAction` call.
   */
  private tickBots(ctx: GameContext<unknown, unknown>, now: number): void {
    const strategy = this.botStrategy();

    for (const bot of this.gamePlayers()) {
      if (!bot.isBot) continue;

      const pending = this.botPending.get(bot.id);
      if (pending) {
        if (now < pending.dueAt) continue;
        this.botPending.delete(bot.id);
        this.applyGameAction(bot.id, pending.action, now);
        continue;
      }

      const decision = strategy.decide(ctx, bot.id);
      if (decision) {
        this.botPending.set(bot.id, {
          action: decision.action,
          dueAt: now + Math.max(0, decision.delayMs),
        });
      }
    }
  }

  // ----------------------------------------------------------------- messages

  private registerMessageHandlers(): void {
    this.onMessage(MSG.SESSION_ACTION, (client, payload: unknown) => {
      if (!this.checkPayload(client, payload)) return;
      if (!this.sessionLimiter.tryConsume(client.sessionId, Date.now())) {
        this.sendError(client, "RATE_LIMITED");
        this.logger.warn(EVENT.RATE_LIMITED, { playerId: client.sessionId, channel: "session" });
        return;
      }

      const parsed = SessionActionSchema.safeParse(payload);
      if (!parsed.success) {
        this.sendError(client, "INVALID_PAYLOAD");
        return;
      }
      this.handleSessionAction(client, parsed.data);
    });

    this.onMessage(MSG.GAME_ACTION, (client, payload: unknown) => {
      if (!this.checkPayload(client, payload)) return;
      const now = Date.now();

      if (!this.gameLimiter.tryConsume(client.sessionId, now)) {
        this.sendError(client, "RATE_LIMITED");
        this.logger.warn(EVENT.RATE_LIMITED, { playerId: client.sessionId, channel: "game" });
        return;
      }

      const data = client.userData as ClientData | undefined;
      if (data?.role !== "controller") {
        this.sendError(client, "NOT_ALLOWED");
        return;
      }
      if (!RUNNING_STATUSES.has(this.state.status as SessionStatus)) {
        this.sendError(client, "WRONG_STATE");
        return;
      }

      const player = this.state.players.get(client.sessionId);
      if (!player?.joined) {
        this.sendError(client, "NOT_ALLOWED");
        return;
      }

      const validated = validateSync(this.adapter.game.actionSchema, payload);
      if (!validated.ok) {
        this.sendError(client, "INVALID_PAYLOAD");
        this.logger.debug(EVENT.ACTION_REJECTED, {
          playerId: client.sessionId,
          issues: validated.issues,
        });
        return;
      }

      const applied = this.applyGameAction(client.sessionId, validated.value, now);
      if (!applied) this.sendError(client, "WRONG_STATE");
    });

    this.onMessage(MSG.CLOCK_PING, (client, payload: unknown) => {
      if (!this.clockLimiter.tryConsume(client.sessionId, Date.now())) return;
      const parsed = ClockPingSchema.safeParse(payload);
      if (!parsed.success) return;
      client.send(MSG.CLOCK_PONG, { t0: parsed.data.t0, t1: Date.now() });
    });
  }

  /**
   * Rejects payloads that are too large before any parsing work happens.
   *
   * Colyseus has already decoded the message by this point, so this is a guard
   * against a client wasting the rules engine's time, not a transport-level
   * defence - the transport's own frame limit handles that.
   */
  private checkPayload(client: Client, payload: unknown): boolean {
    let size = 0;
    try {
      size = JSON.stringify(payload ?? null).length;
    } catch {
      this.sendError(client, "INVALID_PAYLOAD");
      return false;
    }
    if (size > MAX_MESSAGE_BYTES) {
      this.sendError(client, "INVALID_PAYLOAD");
      this.logger.warn(EVENT.ACTION_REJECTED, { playerId: client.sessionId, size });
      return false;
    }
    return true;
  }

  private handleSessionAction(client: Client, action: SessionAction): void {
    const data = client.userData as ClientData | undefined;
    const isHostScreen = data?.role === "host";
    const player = this.state.players.get(client.sessionId);
    const isHostPlayer = Boolean(player && player.isHost);
    const canControlSession = isHostScreen || isHostPlayer;

    switch (action.type) {
      case "set-profile": {
        if (!player) return this.sendError(client, "NOT_ALLOWED");
        if (this.state.status === "CLOSED") return this.sendError(client, "ROOM_CLOSED");

        const firstJoin = !player.joined;
        player.name = action.name;
        player.avatar = action.avatar;
        player.color = action.color;
        player.joined = true;

        if (firstJoin) {
          if (this.state.hostPlayerId === "") {
            this.state.hostPlayerId = player.id;
            player.isHost = true;
          }
          this.notifyGameOfPlayer(player.id, "joined");
          this.emitPlatformEvent({
            kind: "player-joined",
            messageKey: "event.playerJoined",
            params: { name: player.name },
            playerId: player.id,
          });
          this.logger.info(EVENT.PLAYER_JOINED, { playerId: player.id });
          this.reconcileBots();
        }
        void this.publishMetadata();
        return;
      }

      case "set-ready": {
        if (!player?.joined) return this.sendError(client, "NOT_ALLOWED");
        player.ready = action.ready;
        return;
      }

      case "leave": {
        this.removePlayer(client.sessionId, "left");
        client.leave(1000);
        return;
      }

      case "start-game": {
        if (!canControlSession) return this.sendError(client, "NOT_ALLOWED");
        if (this.state.status !== "LOBBY") return this.sendError(client, "WRONG_STATE");
        this.startGame();
        return;
      }

      case "rematch": {
        if (!canControlSession) return this.sendError(client, "NOT_ALLOWED");
        if (this.state.status !== "GAME_OVER") return this.sendError(client, "WRONG_STATE");
        this.startGame();
        return;
      }

      case "return-to-lobby": {
        if (!canControlSession) return this.sendError(client, "NOT_ALLOWED");
        if (this.state.status !== "GAME_OVER") return this.sendError(client, "WRONG_STATE");
        this.returnToLobby();
        return;
      }

      case "update-settings": {
        if (!canControlSession) return this.sendError(client, "NOT_ALLOWED");
        if (this.state.status !== "LOBBY") return this.sendError(client, "WRONG_STATE");
        this.applySettings(action.settings);
        return;
      }

      case "kick-player": {
        if (!canControlSession) return this.sendError(client, "NOT_ALLOWED");
        if (action.playerId === client.sessionId) return this.sendError(client, "NOT_ALLOWED");
        const target = this.clients.find((c) => c.sessionId === action.playerId);
        this.removePlayer(action.playerId, "kicked");
        target?.leave(4001);
        return;
      }

      case "dev-command": {
        if (!runtimeHost().devToolsEnabled) return this.sendError(client, "NOT_ALLOWED");
        if (!canControlSession) return this.sendError(client, "NOT_ALLOWED");
        this.runDevCommand(action.command, action.value);
        return;
      }
    }
  }

  private applySettings(patch: {
    maxPlayers?: number;
    botCount?: number;
    botDifficulty?: "easy" | "medium" | "hard";
    gameOptions?: Record<string, unknown>;
  }): void {
    const { settings } = this.state;

    if (patch.maxPlayers !== undefined) {
      const humans = [...this.state.players.values()].filter((p) => !p.isBot && p.joined).length;
      // Never set a cap below the number of people already in the room.
      settings.maxPlayers = Math.max(
        humans,
        Math.min(patch.maxPlayers, this.adapter.game.maxPlayers, runtimeHost().maxPlayers),
      );
    }
    if (patch.botDifficulty !== undefined) {
      settings.botDifficulty = patch.botDifficulty;
      this.botStrategies.clear();
    }
    if (patch.botCount !== undefined) {
      settings.botCount = Math.max(0, Math.min(patch.botCount, ABSOLUTE_MAX_PLAYERS));
    }
    if (patch.gameOptions !== undefined) {
      this.gameOptions = this.adapter.game.parseOptions(patch.gameOptions);
    }

    this.reconcileBots();
  }

  // ---------------------------------------------------------------- lifecycle

  private startGame(): void {
    this.reconcileBots();

    const joined = this.gamePlayers();
    if (joined.length < this.adapter.game.minPlayers) {
      this.emitPlatformEvent({
        kind: "start-refused",
        messageKey: "host.needMorePlayers",
        params: { count: this.adapter.game.minPlayers },
      });
      return;
    }

    this.gameState = this.adapter.game.createState(this.gameOptions);
    this.botPending.clear();
    for (const player of this.state.players.values()) {
      player.ready = false;
    }

    this.setStatus("STARTING");

    const ctx = this.buildContext(Date.now());
    this.adapter.game.start(ctx);
    // A countdown game calls requestStatus("STARTING") to hold this phase, then
    // PLAYING from update(). Anything else would sit here forever.
    const holdStarting = this.requestedStatus === "STARTING";
    this.finishTick(ctx);
    if (this.state.status === "STARTING" && !holdStarting) {
      this.setStatus("PLAYING");
    }

    this.logger.info(EVENT.GAME_STARTED, { players: joined.length });
  }

  private returnToLobby(): void {
    this.gameState = this.adapter.game.createState(this.gameOptions);
    this.botPending.clear();
    for (const player of this.state.players.values()) {
      player.ready = false;
      player.score = 0;
    }
    this.setStatus("LOBBY");
    this.projectGameState(Date.now());
  }

  private setStatus(status: SessionStatus): void {
    if (this.state.status === status) return;
    this.state.status = status;
    this.logger.info(EVENT.STATUS_CHANGED, { status });
    void this.publishMetadata();
  }

  /**
   * Applies a status the game asked for, filtered by what the platform allows.
   *
   * The game may move between playing states, but it may not put the session
   * back into the lobby or close it - those are platform decisions.
   */
  private applyRequestedStatus(): void {
    const requested = this.requestedStatus;
    this.requestedStatus = null;
    if (!requested) return;

    if (requested === "PLAYING" || requested === "ROUND_END") {
      if (RUNNING_STATUSES.has(this.state.status as SessionStatus)) this.setStatus(requested);
      return;
    }
    if (requested === "GAME_OVER") {
      this.setStatus("GAME_OVER");
      this.botPending.clear();
      this.logger.info(EVENT.GAME_ENDED);
    }
  }

  // -------------------------------------------------------------- game bridge

  private buildContext(now: number): GameContext<unknown, unknown> {
    return {
      state: this.gameState,
      options: this.gameOptions,
      players: this.registry,
      rng: this.rng,
      now,
      emit: (event) => {
        this.eventQueue.push({ ...event, at: now });
      },
      requestStatus: (status) => {
        this.requestedStatus = status;
      },
    };
  }

  /** Runs one validated action through the rules and settles the resulting tick. */
  private applyGameAction(playerId: string, action: unknown, now: number): boolean {
    const ctx = this.buildContext(now);
    let handled = false;
    try {
      handled = this.adapter.game.handleAction(ctx, playerId, action);
    } catch (error) {
      this.logger.error(EVENT.GAME_ERROR, {
        playerId,
        message: error instanceof Error ? error.message : String(error),
      });
      handled = false;
    }
    this.finishTick(ctx);
    if (handled) this.logger.debug(EVENT.PLAYER_ACTION, { playerId });
    return handled;
  }

  private notifyGameOfPlayer(
    playerId: string,
    change: "joined" | "left" | "disconnected" | "reconnected",
  ): void {
    const hook = this.adapter.game.onPlayerChanged;
    if (!hook) return;
    const ctx = this.buildContext(Date.now());
    try {
      hook.call(this.adapter.game, ctx, playerId, change);
    } catch (error) {
      this.logger.error(EVENT.GAME_ERROR, {
        playerId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    this.finishTick(ctx);
  }

  /** Broadcasts queued events, applies status requests and republishes state. */
  private finishTick(ctx: GameContext<unknown, unknown>): void {
    if (
      RUNNING_STATUSES.has(this.state.status as SessionStatus) &&
      this.requestedStatus !== "GAME_OVER" &&
      this.adapter.game.isFinished(ctx)
    ) {
      this.requestedStatus = "GAME_OVER";
    }
    this.applyRequestedStatus();
    this.flushEvents();
    this.projectGameState(ctx.now);
  }

  private projectGameState(now: number): void {
    const ctx = this.buildContext(now);
    try {
      this.adapter.project(this.state, this.adapter.game.getPublicState(ctx));
      this.state.gameRevision += 1;
    } catch (error) {
      this.logger.error(EVENT.GAME_ERROR, {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private flushEvents(): void {
    if (this.eventQueue.length === 0) return;
    const events = this.eventQueue;
    this.eventQueue = [];
    for (const event of events) {
      this.broadcast(MSG.GAME_EVENT, event);
    }
  }

  private emitPlatformEvent(event: Omit<GameEventMessage, "at">): void {
    this.broadcast(MSG.GAME_EVENT, { ...event, at: Date.now() });
  }

  // ------------------------------------------------------------ controller io

  private controllerMode(player: PlayerSchema | undefined): ControllerMode {
    if (!player?.joined) return "setup";
    switch (this.state.status as SessionStatus) {
      case "LOBBY":
        return "lobby";
      case "STARTING":
        return "starting";
      case "PLAYING":
        return "game";
      case "ROUND_END":
        return "round-end";
      case "GAME_OVER":
        return "game-over";
      default:
        return "setup";
    }
  }

  private buildEnvelope(playerId: string): ControllerEnvelope {
    const player = this.state.players.get(playerId);
    const mode = this.controllerMode(player);

    let gamePart: Pick<ControllerEnvelope, "active" | "game"> = { active: false, game: null };
    if (player?.joined) {
      const ctx = this.buildContext(Date.now());
      try {
        gamePart = this.adapter.game.getControllerState(ctx, playerId);
      } catch (error) {
        this.logger.error(EVENT.GAME_ERROR, {
          playerId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      mode,
      gameId: this.state.gameId,
      active: gamePart.active,
      score: player?.score ?? 0,
      game: gamePart.game,
      revision: this.controllerRevision,
    };
  }

  /** Sends a controller its projection, skipping sends that would change nothing. */
  private pushControllerState(client: Client, force = false): void {
    const data = client.userData as ClientData | undefined;
    if (data?.role !== "controller") return;

    const envelope = this.buildEnvelope(client.sessionId);
    // `revision` is excluded from the comparison so it does not defeat the check.
    const { revision: _revision, ...comparable } = envelope;
    const json = JSON.stringify(comparable);
    if (!force && this.lastControllerJson.get(client.sessionId) === json) return;

    this.lastControllerJson.set(client.sessionId, json);
    this.controllerRevision += 1;
    client.send(MSG.CONTROLLER_STATE, { ...envelope, revision: this.controllerRevision });
  }

  private pushAllControllerStates(): void {
    for (const client of this.clients) {
      this.pushControllerState(client);
    }
  }

  private sendWelcome(client: Client): void {
    const data = client.userData as ClientData | undefined;
    const payload: WelcomePayload = {
      playerId: client.sessionId,
      role: data?.role ?? "controller",
      roomId: this.roomId,
      roomCode: this.state.publicCode,
      // The client rebuilds the full token from its own room object; this is
      // sent so a client that lost its copy can still recover it.
      reconnectionToken: `${this.roomId}:${client.reconnectionToken}`,
      gameId: this.state.gameId,
      serverTime: Date.now(),
    };
    client.send(MSG.WELCOME, payload);
  }

  private sendError(client: Client, code: PartyErrorCode): void {
    client.send(MSG.ERROR, { code, messageKey: `error.${code}` });
  }

  // --------------------------------------------------------------------- tick

  private tick(deltaMs: number): void {
    const now = Date.now();

    if (RUNNING_STATUSES.has(this.state.status as SessionStatus)) {
      const ctx = this.buildContext(now);
      try {
        this.adapter.game.update(ctx, deltaMs);
        this.tickBots(ctx, now);
      } catch (error) {
        this.logger.error(EVENT.GAME_ERROR, {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      this.finishTick(ctx);
    }

    this.pushAllControllerStates();

    if (now - this.lastBeaconAt >= CLOCK_BEACON_MS) {
      this.lastBeaconAt = now;
      this.state.serverTime = now;
    }

    this.checkExpiry(now);
  }

  /**
   * Reclaims sessions nobody is using.
   *
   * Two independent limits: an idle timeout that starts when the last client
   * leaves, and an absolute age cap so a forgotten room on a TV in an empty
   * office cannot live forever.
   */
  private checkExpiry(now: number): void {
    if (this.clients.length > 0) {
      this.lastConnectedAt = now;
      return;
    }
    const idleFor = now - this.lastConnectedAt;
    const age = now - this.createdAt;
    const limits = runtimeHost();
    if (idleFor < limits.sessionTimeoutMs && age < limits.sessionMaxAgeMs) return;

    this.logger.info(EVENT.SESSION_EXPIRED, { idleFor, age });
    this.state.status = "CLOSED";
    void this.disconnect(4002);
  }

  // ----------------------------------------------------------------- metadata

  private async publishMetadata(): Promise<void> {
    try {
      await this.setMetadata({
        publicCode: this.state.publicCode,
        gameId: this.state.gameId,
        status: this.state.status as SessionStatus,
        playerCount: [...this.state.players.values()].filter((p) => p.joined && !p.isBot).length,
        maxPlayers: this.state.settings.maxPlayers,
      });
    } catch (error) {
      this.logger.warn("METADATA_FAILED", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // --------------------------------------------------------------- dev tools

  /**
   * Developer-mode shortcuts.
   *
   * Reachable only when `ENABLE_DEV_TOOLS` is on *and* the build is not
   * production, checked again at the call site. Platform commands are handled
   * here; anything else is delegated to the game plugin.
   */
  private runDevCommand(command: string, value?: number): void {
    switch (command) {
      case "add-bot": {
        this.state.settings.botCount = Math.min(
          this.state.settings.botCount + 1,
          ABSOLUTE_MAX_PLAYERS,
        );
        this.reconcileBots();
        return;
      }
      case "remove-bot": {
        this.state.settings.botCount = Math.max(0, this.state.settings.botCount - 1);
        this.reconcileBots();
        return;
      }
      case "end-session": {
        this.state.status = "CLOSED";
        void this.disconnect(4002);
        return;
      }
      default: {
        const handler = this.adapter.game.devCommands?.[command];
        if (!handler) return;
        const ctx = this.buildContext(Date.now());
        handler(ctx, value);
        this.finishTick(ctx);
      }
    }
  }
}
