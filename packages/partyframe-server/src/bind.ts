/**
 * Host-process bindings for the session room.
 *
 * The room must not import a game catalog or parse `.env`. The app installs
 * games, then calls `bindRuntime()` once before any room is created.
 */

export interface LogContext {
  sessionId?: string;
  roomCode?: string;
  playerId?: string;
  gameId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(event: string, context?: LogContext): void;
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
}

export interface RootLogger extends Logger {
  child(base: LogContext): Logger;
}

export const EVENT = {
  SERVER_STARTED: "SERVER_STARTED",
  SESSION_CREATED: "SESSION_CREATED",
  SESSION_DISPOSED: "SESSION_DISPOSED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  HOST_ATTACHED: "HOST_ATTACHED",
  HOST_DISCONNECTED: "HOST_DISCONNECTED",
  HOST_RECONNECTED: "HOST_RECONNECTED",
  PLAYER_JOINED: "PLAYER_JOINED",
  PLAYER_LEFT: "PLAYER_LEFT",
  PLAYER_DISCONNECTED: "PLAYER_DISCONNECTED",
  PLAYER_RECONNECTED: "PLAYER_RECONNECTED",
  PLAYER_ACTION: "PLAYER_ACTION",
  ACTION_REJECTED: "ACTION_REJECTED",
  RATE_LIMITED: "RATE_LIMITED",
  BOT_ADDED: "BOT_ADDED",
  BOT_REMOVED: "BOT_REMOVED",
  GAME_STARTED: "GAME_STARTED",
  GAME_ENDED: "GAME_ENDED",
  ROUND_STARTED: "ROUND_STARTED",
  ROUND_ENDED: "ROUND_ENDED",
  STATUS_CHANGED: "STATUS_CHANGED",
  GAME_ERROR: "GAME_ERROR",
} as const;

export interface RuntimeHost {
  defaultGameId: string;
  maxPlayers: number;
  sessionTimeoutMs: number;
  sessionMaxAgeMs: number;
  devToolsEnabled: boolean;
  log: RootLogger;
}

/** Fields `bindRuntime()` fills in when omitted. */
export const RUNTIME_DEFAULTS = {
  maxPlayers: 8,
  sessionTimeoutMs: 10 * 60 * 1000,
  sessionMaxAgeMs: 3 * 60 * 60 * 1000,
} as const;

/** Only `defaultGameId` is required. Everything else has a default. */
export type BindRuntimeInput = Partial<Omit<RuntimeHost, "defaultGameId">> & {
  defaultGameId: string;
};

let host: RuntimeHost | null = null;

function createConsoleLogger(base: LogContext = {}): RootLogger {
  const write = (
    fn: (...args: unknown[]) => void,
    event: string,
    context?: LogContext,
  ): void => {
    fn(event, { ...base, ...context });
  };
  return {
    debug: (event, context) => write(console.debug, event, context),
    info: (event, context) => write(console.info, event, context),
    warn: (event, context) => write(console.warn, event, context),
    error: (event, context) => write(console.error, event, context),
    child(next) {
      return createConsoleLogger({ ...base, ...next });
    },
  };
}

export function bindRuntime(next: BindRuntimeInput): void {
  host = {
    defaultGameId: next.defaultGameId,
    maxPlayers: next.maxPlayers ?? RUNTIME_DEFAULTS.maxPlayers,
    sessionTimeoutMs: next.sessionTimeoutMs ?? RUNTIME_DEFAULTS.sessionTimeoutMs,
    sessionMaxAgeMs: next.sessionMaxAgeMs ?? RUNTIME_DEFAULTS.sessionMaxAgeMs,
    devToolsEnabled: next.devToolsEnabled ?? process.env.NODE_ENV !== "production",
    log: next.log ?? createConsoleLogger(),
  };
}

export function runtimeHost(): RuntimeHost {
  if (!host) {
    throw new Error("@bazimazi/partyframe-server: bindRuntime() must run before a room is created");
  }
  return host;
}

/** Test helper. Not used by a running server. */
export function resetRuntimeHost(): void {
  host = null;
}
