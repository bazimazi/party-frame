/** Session, player and controller types shared across the whole platform. */

/**
 * Lifecycle of a game session.
 *
 * `CREATED` exists only between room construction and the host attaching; a
 * client that observes it should render the connecting state, not the lobby.
 */
export type SessionStatus =
  | "CREATED"
  | "LOBBY"
  | "STARTING"
  | "PLAYING"
  | "ROUND_END"
  | "GAME_OVER"
  | "CLOSED";

/** Which experience a connected client is presenting. */
export type ClientRole = "host" | "controller";

/**
 * What the phone should be rendering right now.
 *
 * The server derives this from session status so that a controller never has to
 * infer its own mode from game-specific state.
 */
export type ControllerMode =
  | "setup"
  | "lobby"
  | "starting"
  | "game"
  | "round-end"
  | "game-over";

export type BotDifficulty = "easy" | "medium" | "hard";

/** Player as seen by clients. Contains no tokens and no server internals. */
export interface ClientPlayer {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  score: number;
  /** Join order, used for stable seat ordering on the shared screen. */
  seat: number;
  /**
   * False between the socket opening and the player submitting their profile.
   *
   * An unjoined row already holds a seat, which is what makes the capacity check
   * and reconnection work, but it is hidden from the lobby.
   */
  joined: boolean;
}

/** Host-configurable session settings. */
export interface SessionSettings {
  maxPlayers: number;
  botCount: number;
  botDifficulty: BotDifficulty;
  /** Game-specific settings blob, validated by the active game plugin. */
  gameOptions: Record<string, unknown>;
}

/** Credentials a client persists so it can resume its seat after a drop. */
export interface StoredCredentials {
  roomId: string;
  roomCode: string;
  reconnectionToken: string;
  playerId: string;
  role: ClientRole;
  /** Epoch ms after which the credentials are assumed dead. */
  expiresAt: number;
}

/** Response of `GET /api/rooms/:code`. */
export interface RoomLookupResponse {
  roomId: string;
  roomCode: string;
  gameId: string;
  status: SessionStatus;
  playerCount: number;
  maxPlayers: number;
  joinable: boolean;
}

/** Machine-readable failure reasons surfaced to the UI. */
export type PartyErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_CLOSED"
  | "GAME_IN_PROGRESS"
  | "INVALID_PAYLOAD"
  | "NOT_ALLOWED"
  | "RATE_LIMITED"
  | "UNKNOWN_ACTION"
  | "WRONG_STATE"
  | "INTERNAL";

/** Error envelope pushed to a single client over the `error` message channel. */
export interface PartyError {
  code: PartyErrorCode;
  /** i18n key; clients localise this rather than showing raw server text. */
  messageKey: string;
}

/**
 * Plain, immutable snapshot of the synchronised session state.
 *
 * Clients convert the live Colyseus schema into one of these before handing it
 * to React, so components receive ordinary data they can memoise on rather than
 * a mutable object that changes identity twenty times a second.
 */
export interface SessionSnapshot {
  publicCode: string;
  status: SessionStatus;
  gameId: string;
  serverTime: number;
  /** Every seat, ordered, including rows that have not finished joining. */
  players: ClientPlayer[];
  settings: SessionSettings;
  hostPlayerId: string;
  hostConnected: boolean;
  gameRevision: number;
  /** The active game's public projection. Shape is defined by that game. */
  game: unknown;
}
