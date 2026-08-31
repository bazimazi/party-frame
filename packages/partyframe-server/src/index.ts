/**
 * Public API of `@bazimazi/partyframe-server`.
 *
 * Two entry points cover the whole product: `defineGame()` to write the rules,
 * `listen()` to run them. Everything below those is either a type you need to
 * annotate with, or the deliberate escape hatch for a game that has outgrown
 * JSON state sync.
 *
 * Room internals - the registry, rate limiter, room-code generator, runtime
 * host and `PartySessionRoom` itself - are intentionally not exported. They are
 * implementation, and a game that reaches for them is fighting the platform.
 */

// ------------------------------------------------------------- writing a game
export { defineGame } from "@partyframe/game-core";
export { Rng, randomSeed } from "@partyframe/game-core";
export type {
  BotDecision,
  BotStrategy,
  GameContext,
  GameDefinition,
  GamePlayer,
  PartyGame,
  PlayerChange,
  PlayerRegistry,
} from "@partyframe/game-core";
export type { BotDifficulty, ControllerProjection, GameEventMessage, SessionStatus } from "@partyframe/protocol";

// ------------------------------------------------------------ running a server
export { listen, type ListenOptions, type PartyServer, type PublicServerConfig } from "./listen.js";
export type { LogContext, Logger, RootLogger } from "./bind.js";

// ------------------------------------------------------------- advanced: state
/**
 * Only for a game whose public projection is too large or too hot for the
 * default JSON sync. Supplying an adapter opts that game into field-level
 * Colyseus patches and, with them, into knowing Colyseus exists.
 */
export { type GameNetworkAdapter, type InstallableGame } from "./catalog.js";
export { SessionSchema, PlayerSchema, SettingsSchema, setIfChanged } from "./sessionSchema.js";
