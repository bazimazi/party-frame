/**
 * Turns an author's `GameDefinition` into the resolved `PartyGame` the platform
 * runs.
 *
 * Two jobs, both about keeping the authoring surface small:
 *
 * 1. It fills in every optional member with a platform default, so the room can
 *    call `game.update()` or `game.isFinished()` without a guard on each line
 *    and a four-field game is genuinely playable.
 * 2. It preserves the definition's type parameters, so `handleAction`,
 *    `getPublicState` and `createBot` stay typed against each other instead of
 *    collapsing to `unknown` the way a variable annotation would.
 */

import type {
  AnyGameDefinition,
  AnyPartyGame,
  GameDefinition,
  PartyGame,
} from "./types.js";

/** Hard ceiling on players in one session, mirrored from the protocol. */
const DEFAULT_MAX_PLAYERS = 8;

export function defineGame<
  TState,
  TOptions = Record<string, never>,
  TAction = unknown,
  TController = null,
  TPublic = TState,
>(
  definition: GameDefinition<TState, TOptions, TAction, TController, TPublic>,
): PartyGame<TState, TOptions, TAction, TController, TPublic> {
  return {
    ...definition,
    nameKey: definition.nameKey ?? `game.${definition.id}.name`,
    minPlayers: definition.minPlayers ?? 1,
    maxPlayers: definition.maxPlayers ?? DEFAULT_MAX_PLAYERS,
    parseOptions:
      definition.parseOptions ?? (() => ({}) as TOptions),
    start: definition.start ?? ((ctx) => ctx.requestStatus("PLAYING")),
    update: definition.update ?? (() => undefined),
    isFinished: definition.isFinished ?? (() => false),
    getControllerState:
      definition.getControllerState ??
      (() => ({ active: true, game: null as TController })),
    getPublicState:
      definition.getPublicState ?? ((ctx) => ctx.state as unknown as TPublic),
    // An idle bot rather than none at all: the lobby can still seat one, and the
    // game never has to branch on whether bots exist.
    createBot:
      definition.createBot ?? ((difficulty) => ({ difficulty, decide: () => null })),
  };
}

/**
 * Accepts either form and returns the resolved one.
 *
 * `defineGame()` is the documented path, but `listen({ games })` also takes a
 * bare definition; this is what makes that safe. Resolving twice is harmless.
 */
export function resolveGame(game: AnyGameDefinition | AnyPartyGame): AnyPartyGame {
  return defineGame(game);
}
