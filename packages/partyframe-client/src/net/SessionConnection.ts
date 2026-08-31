/**
 * The client half of the session protocol.
 *
 * Deliberately framework-free: this class owns the socket, the reconnection
 * policy and the clock, and exposes a plain subscription. React binds to it in
 * `useSession`, and the Phaser scene reads from it directly - neither of them
 * has to know how a Colyseus room works.
 *
 * Nothing here decides anything about the game. Every method either sends an
 * intention to the server or reports what the server has said.
 */

import { Client, Room } from "colyseus.js";
import {
  MSG,
  PARTY_ROOM,
  type ClientPlayer,
  type ClientRole,
  type ControllerEnvelope,
  type GameEventMessage,
  type PartyError,
  type PartyErrorCode,
  type RoomLookupResponse,
  type SessionAction,
  type SessionSnapshot,
  type SessionStatus,
  type WelcomePayload,
} from "@partyframe/protocol";
import { ClockSync } from "./clock.js";
import { createProjectionCache, readProjection, type ProjectionCache } from "./projection.js";
import { resolveServerHttpUrl } from "./endpoint.js";
import { clearCredentials, loadCredentials, saveCredentials } from "./storage.js";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

export interface SessionView {
  status: ConnectionStatus;
  error: PartyError | null;
  snapshot: SessionSnapshot | null;
  controller: ControllerEnvelope | null;
  events: GameEventMessage[];
  playerId: string;
  roomCode: string;
  latencyMs: number;
}

/** How many event cues to keep for the shared screen's feed. */
const EVENT_HISTORY = 24;

/**
 * Reconnection backoff.
 *
 * Front-loaded because most real drops are momentary (a lift, a dead spot) and
 * recover within a second or two; the later, longer waits exist so a phone that
 * genuinely lost the network does not burn its battery retrying.
 */
const RECONNECT_DELAYS_MS = [300, 700, 1500, 3000, 5000, 8000, 12000];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads a MapSchema, a plain Map or a plain object uniformly. */
function readMap(source: unknown): Array<[string, Record<string, unknown>]> {
  if (!source) return [];
  const entries: Array<[string, Record<string, unknown>]> = [];
  const candidate = source as { forEach?: (cb: (v: unknown, k: string) => void) => void };
  if (typeof candidate.forEach === "function") {
    candidate.forEach((value, key) => {
      if (isRecord(value)) entries.push([key, value]);
    });
    return entries;
  }
  if (isRecord(source)) {
    for (const [key, value] of Object.entries(source)) {
      if (isRecord(value)) entries.push([key, value]);
    }
  }
  return entries;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Converts the live schema into plain, immutable data.
 *
 * React components render from this rather than from the schema itself: the
 * schema mutates in place, so a component memoised on it would never update,
 * and a component not memoised on it would re-render on every patch.
 */
function toSnapshot(state: unknown, cache: ProjectionCache): SessionSnapshot | null {
  if (!isRecord(state)) return null;

  const players: ClientPlayer[] = readMap(state.players)
    .map(([id, row]) => ({
      id: str(row.id, id),
      name: str(row.name),
      avatar: str(row.avatar),
      color: str(row.color),
      isBot: bool(row.isBot),
      isHost: bool(row.isHost),
      connected: bool(row.connected, true),
      ready: bool(row.ready),
      score: num(row.score),
      seat: num(row.seat),
      joined: bool(row.joined),
    }))
    .sort((a, b) => a.seat - b.seat);

  const settings = isRecord(state.settings) ? state.settings : {};

  return {
    publicCode: str(state.publicCode),
    status: str(state.status, "CREATED") as SessionStatus,
    gameId: str(state.gameId),
    serverTime: num(state.serverTime),
    players,
    settings: {
      maxPlayers: num(settings.maxPlayers, 8),
      botCount: num(settings.botCount),
      botDifficulty: str(settings.botDifficulty, "medium") as "easy" | "medium" | "hard",
      gameOptions: {},
    },
    hostPlayerId: str(state.hostPlayerId),
    hostConnected: bool(state.hostConnected),
    gameRevision: num(state.gameRevision),
    // Handed through untouched: only the active game's own client code knows
    // how to read it, and the platform deliberately treats it as opaque.
    game: readProjection(state, cache),
  };
}

export interface ConnectOptions {
  role: ClientRole;
  /** Required for controllers; omitted when a shared screen creates a session. */
  roomCode?: string;
  gameId?: string;
}

export class SessionConnection {
  private readonly client: Client;
  private room: Room | null = null;
  private view: SessionView = {
    status: "idle",
    error: null,
    snapshot: null,
    controller: null,
    events: [],
    playerId: "",
    roomCode: "",
    latencyMs: 0,
  };

  private listeners = new Set<(view: SessionView) => void>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private options: ConnectOptions | null = null;
  private readonly projection: ProjectionCache = createProjectionCache();

  readonly clock: ClockSync;

  constructor(private readonly serverUrl = resolveServerHttpUrl()) {
    this.client = new Client(this.serverUrl);
    this.clock = new ClockSync((t0) => this.room?.send(MSG.CLOCK_PING, { t0 }));
  }

  /** The live Colyseus state. Used by Phaser, which cannot afford a snapshot copy. */
  get liveState(): unknown {
    return this.room?.state ?? null;
  }

  get current(): SessionView {
    return this.view;
  }

  subscribe(listener: (view: SessionView) => void): () => void {
    this.listeners.add(listener);
    listener(this.view);
    return () => this.listeners.delete(listener);
  }

  private patch(changes: Partial<SessionView>): void {
    this.view = { ...this.view, ...changes };
    for (const listener of this.listeners) listener(this.view);
  }

  // ------------------------------------------------------------------ connect

  async connect(options: ConnectOptions): Promise<void> {
    this.options = options;
    this.disposed = false;
    this.patch({ status: "connecting", error: null });

    // A stored token is tried first: it is the only way back into the same seat,
    // and it is also the only path that survives a page reload mid-game.
    if (options.roomCode) {
      const stored = loadCredentials(options.role, options.roomCode);
      if (stored && (await this.tryReconnect(stored.reconnectionToken))) return;
    }

    try {
      const room =
        options.role === "host"
          ? await this.client.create(PARTY_ROOM, { role: "host", gameId: options.gameId })
          : await this.joinByCode(options.roomCode ?? "");
      this.attach(room);
    } catch (error) {
      this.fail(error);
    }
  }

  private async joinByCode(roomCode: string): Promise<Room> {
    const response = await fetch(
      `${this.serverUrl}/api/rooms/${encodeURIComponent(roomCode)}`,
    );
    if (!response.ok) throw new Error("ROOM_NOT_FOUND");

    const lookup = (await response.json()) as RoomLookupResponse;
    if (lookup.status === "CLOSED") throw new Error("ROOM_CLOSED");
    if (!lookup.joinable) throw new Error("ROOM_FULL");

    return this.client.joinById(lookup.roomId, { role: "controller" });
  }

  private async tryReconnect(token: string): Promise<boolean> {
    try {
      const room = await this.client.reconnect(token);
      this.attach(room);
      return true;
    } catch {
      // A stale token is expected after a session ends; fall through to a fresh
      // join rather than surfacing it as an error.
      if (this.options?.roomCode) {
        clearCredentials(this.options.role, this.options.roomCode);
      }
      return false;
    }
  }

  private attach(room: Room): void {
    this.room = room;
    this.reconnectAttempt = 0;
    this.clock.reset();
    this.clock.start();

    room.onStateChange((state) => {
      this.patch({ snapshot: toSnapshot(state, this.projection) });
    });

    room.onMessage(MSG.WELCOME, (payload: WelcomePayload) => {
      saveCredentials({
        roomId: room.roomId,
        roomCode: payload.roomCode,
        // The room object holds the canonical token; the payload is a fallback
        // for a client that reconnected and never saw its own `onJoin`.
        reconnectionToken: room.reconnectionToken || payload.reconnectionToken,
        playerId: payload.playerId,
        role: payload.role,
      });
      this.patch({
        playerId: payload.playerId,
        roomCode: payload.roomCode,
        status: "connected",
        error: null,
      });
    });

    room.onMessage(MSG.CONTROLLER_STATE, (envelope: ControllerEnvelope) => {
      // Out-of-order delivery is not possible over one socket, but a reconnection
      // can interleave an old push with a fresh one.
      const currentRevision = this.view.controller?.revision ?? -1;
      if (envelope.revision < currentRevision) return;
      this.patch({ controller: envelope });
    });

    room.onMessage(MSG.GAME_EVENT, (event: GameEventMessage) => {
      const events = [...this.view.events, event].slice(-EVENT_HISTORY);
      this.patch({ events });
    });

    room.onMessage(MSG.CLOCK_PONG, ({ t0, t1 }: { t0: number; t1: number }) => {
      this.clock.handlePong(t0, t1);
      this.patch({ latencyMs: Math.round(this.clock.rtt) });
    });

    room.onMessage(MSG.ERROR, (error: PartyError) => {
      this.patch({ error });
    });

    room.onError((code, message) => {
      this.patch({
        status: "error",
        error: { code: this.mapErrorCode(message), messageKey: `error.${this.mapErrorCode(message)}` },
      });
      void code;
    });

    room.onLeave((code) => this.handleLeave(code));

    this.patch({ status: "connected", roomCode: room.roomId ? this.view.roomCode : "" });
  }

  // -------------------------------------------------------------- disconnects

  private handleLeave(code: number): void {
    this.clock.stop();
    this.room = null;

    if (this.disposed || code === 1000) {
      this.patch({ status: "closed" });
      return;
    }

    // 4002 is this platform's "the session is over" close; retrying is pointless.
    if (code === 4002) {
      this.patch({
        status: "closed",
        error: { code: "ROOM_CLOSED", messageKey: "error.sessionExpired" },
      });
      this.forgetCredentials();
      return;
    }
    // 4001 is a kick.
    if (code === 4001) {
      this.patch({
        status: "closed",
        error: { code: "NOT_ALLOWED", messageKey: "error.NOT_ALLOWED" },
      });
      this.forgetCredentials();
      return;
    }

    this.patch({
      status: "reconnecting",
      error: { code: "INTERNAL", messageKey: "error.connectionLost" },
    });
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;

    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ??
      12000;
    this.reconnectAttempt += 1;

    if (this.reconnectAttempt > RECONNECT_DELAYS_MS.length + 4) {
      this.patch({
        status: "error",
        error: { code: "ROOM_CLOSED", messageKey: "error.sessionExpired" },
      });
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      void this.attemptReconnect();
    }, delay);
  }

  private async attemptReconnect(): Promise<void> {
    if (this.disposed || !this.options) return;

    const roomCode = this.view.roomCode || this.options.roomCode;
    if (roomCode) {
      const stored = loadCredentials(this.options.role, roomCode);
      if (stored && (await this.tryReconnect(stored.reconnectionToken))) return;
    }

    // The seat is gone, but the session may still be running: a controller can
    // rejoin as a new player, whereas a shared screen that lost its room has
    // nothing to rejoin and reports the session as ended.
    if (this.options.role === "controller" && roomCode) {
      try {
        this.attach(await this.joinByCode(roomCode));
        return;
      } catch {
        /* fall through to another backoff step */
      }
    }

    this.scheduleReconnect();
  }

  private forgetCredentials(): void {
    const roomCode = this.view.roomCode || this.options?.roomCode;
    if (this.options && roomCode) clearCredentials(this.options.role, roomCode);
  }

  private fail(error: unknown): void {
    const code = this.mapErrorCode(error instanceof Error ? error.message : String(error));
    this.patch({ status: "error", error: { code, messageKey: `error.${code}` } });
  }

  /** Server rejections carry a `PartyErrorCode` as their message. */
  private mapErrorCode(message: unknown): PartyErrorCode {
    const known: PartyErrorCode[] = [
      "ROOM_NOT_FOUND",
      "ROOM_FULL",
      "ROOM_CLOSED",
      "GAME_IN_PROGRESS",
      "INVALID_PAYLOAD",
      "NOT_ALLOWED",
      "RATE_LIMITED",
      "UNKNOWN_ACTION",
      "WRONG_STATE",
      "INTERNAL",
    ];
    const text = typeof message === "string" ? message : "";
    return known.find((code) => text.includes(code)) ?? "INTERNAL";
  }

  // ------------------------------------------------------------------- output

  sendSessionAction(action: SessionAction): void {
    this.room?.send(MSG.SESSION_ACTION, action);
  }

  sendGameAction(action: unknown): void {
    this.room?.send(MSG.GAME_ACTION, action);
  }

  /** Clears a transient error banner without touching the connection. */
  dismissError(): void {
    this.patch({ error: null });
  }

  async leave(consented = true): Promise<void> {
    this.disposed = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.clock.stop();
    this.forgetCredentials();
    try {
      await this.room?.leave(consented);
    } catch {
      /* already gone */
    }
    this.room = null;
    this.patch({ status: "closed" });
  }

  /** Tears down without telling the server, for React unmount during navigation. */
  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.clock.stop();
    this.listeners.clear();
    try {
      void this.room?.leave(false);
    } catch {
      /* ignore */
    }
    this.room = null;
  }
}
