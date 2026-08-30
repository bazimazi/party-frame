import type { PartyGame } from "./types.js";

/**
 * Identity helper that preserves the game's type parameters.
 *
 * Pass a `PartyGame` object through this instead of annotating the variable,
 * so `handleAction` and `getPublicState` stay typed against each other.
 */
export function defineGame<TState, TOptions, TAction, TController, TPublic>(
  game: PartyGame<TState, TOptions, TAction, TController, TPublic>,
): PartyGame<TState, TOptions, TAction, TController, TPublic> {
  return game;
}
