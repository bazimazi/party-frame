/**
 * The game plugin contract.
 *
 * A game supplies rules only. It never touches sockets, Colyseus schema, Phaser
 * or the DOM, which is what makes it unit-testable in Node and reusable by a
 * future headless simulator.
 *
 * The platform supplies everything else: sessions, room codes, QR joining,
 * players, bots, reconnection, lobby, scoring storage and the session lifecycle.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";
import type {
  BotDifficulty,
  ControllerEnvelope,
  GameEventMessage,
  SessionStatus,
} from "@partyframe/protocol";
import type { Rng } from "./rng.js";

/** A player as the game rules see them. Deliberately minimal. */
export interface GamePlayer {
  id: string;
  name: string;
  isBot: boolean;
  /** False while the player is inside their reconnection grace period. */
  connected: boolean;
  score: number;
  seat: number;
}

/**
 * Read/write access to the player roster, owned by the platform.
 *
 * Scores live here rather than in game state so that the lobby, scoreboard and
 * rematch flow work identically for every game.
 */
export interface PlayerRegistry {
  /** Everyone in the session, ordered by seat. */
  all(): readonly GamePlayer[];
  get(playerId: string): GamePlayer | undefined;
  has(playerId: string): boolean;
  addScore(playerId: string, delta: number): void;
  setScore(playerId: string, score: number): void;
}

/** Everything a game rule function is allowed to touch. */
export interface GameContext<TState, TOptions> {
  state: TState;
  options: TOptions;
  players: PlayerRegistry;
  /** Seeded, server-owned randomness. Never use `Math.random` in a game. */
  rng: Rng;
  /** Authoritative server time in epoch ms, fixed for the duration of the call. */
  now: number;
  /** Queues a presentation cue for the shared screen. Never authoritative. */
  emit(event: Omit<GameEventMessage, "at">): void;
  /**
   * Asks the platform to move the session to another status. The platform may
   * refuse (for example, it will not leave `GAME_OVER` on its own).
   */
  requestStatus(status: SessionStatus): void;
}

/** A decision a bot wants to make, and how long to pretend to think first. */
export interface BotDecision<TAction> {
  action: TAction;
  /** Delay in ms before the action is submitted, applied by the platform. */
  delayMs: number;
}

/**
 * Bot behaviour for one game.
 *
 * A strategy returns the same action shape a phone would send, so bot input
 * flows through the identical validate-authorise-execute path as human input.
 * There is no bot-only branch inside the rules.
 */
export interface BotStrategy<TState, TOptions, TAction> {
  difficulty: BotDifficulty;
  /**
   * Returns the bot's next intent, or `null` when it has nothing to do.
   *
   * Called on every server tick for every bot, so it must be cheap and must not
   * mutate state. The platform de-duplicates: while a decision is pending, the
   * strategy is not consulted again.
   */
  decide(
    ctx: GameContext<TState, TOptions>,
    botId: string,
  ): BotDecision<TAction> | null;
}

/**
 * A playable game.
 *
 * `TState` is the game's own plain-object state. It is the source of truth on
 * the server; the network schema is a projection of it, produced by an adapter
 * that lives in the server app, not here.
 */
export interface PartyGame<
  TState = unknown,
  TOptions = unknown,
  TAction = unknown,
  TController = unknown,
  TPublic = unknown,
> {
  readonly id: string;
  /** i18n key for the display name, not a pre-translated string. */
  readonly nameKey: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  /** Validates and defaults the host's game options. */
  parseOptions(raw: unknown): TOptions;

  /**
   * Runtime validator for `game-action` payloads.
   *
   * Typed as a Standard Schema so a game may use Zod, Valibot or anything else
   * without the platform depending on that choice.
   */
  readonly actionSchema: StandardSchemaV1<unknown, TAction>;

  /** Fresh state for a new match. Must not read any ambient clock or randomness. */
  createState(options: TOptions): TState;

  /**
   * Called once after the host starts a match, while the session is `STARTING`.
   *
   * Call `ctx.requestStatus("PLAYING")` to begin immediately, or
   * `ctx.requestStatus("STARTING")` to keep a countdown and move to `PLAYING`
   * later from `update()`. If you request nothing, the platform enters
   * `PLAYING` for you so phones do not sit on "Starting...".
   */
  start(ctx: GameContext<TState, TOptions>): void;

  /**
   * Applies one validated action.
   *
   * Returning `false` means the action was well formed but not legal right now
   * (wrong turn, wrong phase, duplicate submission). The platform turns that
   * into a `WRONG_STATE` error for the sender.
   */
  handleAction(
    ctx: GameContext<TState, TOptions>,
    playerId: string,
    action: TAction,
  ): boolean;

  /** Server tick. Owns all timing: fuses, deadlines, round transitions. */
  update(ctx: GameContext<TState, TOptions>, deltaMs: number): void;

  /** True once a winner can be declared. */
  isFinished(ctx: GameContext<TState, TOptions>): boolean;

  /** Called when a player disconnects, joins mid-game, or is removed. */
  onPlayerChanged?(
    ctx: GameContext<TState, TOptions>,
    playerId: string,
    change: "joined" | "left" | "disconnected" | "reconnected",
  ): void;

  /** The per-player projection sent to one phone. */
  getControllerState(
    ctx: GameContext<TState, TOptions>,
    playerId: string,
  ): Omit<ControllerEnvelope<TController>, "mode" | "gameId" | "score" | "revision">;

  /** The projection mirrored into network state for the shared screen. */
  getPublicState(ctx: GameContext<TState, TOptions>): TPublic;

  /** Builds a bot for the requested difficulty. */
  createBot(difficulty: BotDifficulty): BotStrategy<TState, TOptions, TAction>;

  /** Developer-mode shortcuts, e.g. skipping a round. Never reachable in production. */
  devCommands?: Record<string, (ctx: GameContext<TState, TOptions>, value?: number) => void>;
}

/** Convenience alias for a fully-erased game, used by the platform registry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPartyGame = PartyGame<any, any, any, any, any>;
