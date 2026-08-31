/**
 * Binds a game's rules to a concrete Colyseus representation.
 *
 * The catalog calls `install()` once per shipped game. The room looks adapters
 * up by `gameId` and never imports a game package itself.
 */

import { getGame, registerGame, requireGame, type AnyPartyGame } from "@partyframe/game-core";
import type { SessionSchema } from "./sessionSchema.js";

export interface GameNetworkAdapter {
  game: AnyPartyGame;
  /** Builds the room's root state, a subclass of `SessionSchema`. */
  createState(): SessionSchema;
  /** Copies the game's public projection onto that state. */
  project(state: SessionSchema, publicState: unknown): void;
}

const adapters = new Map<string, GameNetworkAdapter>();

export function install(adapter: GameNetworkAdapter): void {
  if (!getGame(adapter.game.id)) {
    registerGame(adapter.game);
  }
  adapters.set(adapter.game.id, adapter);
}

export function getAdapter(gameId: string): GameNetworkAdapter | undefined {
  return adapters.get(gameId);
}

export function requireAdapter(gameId: string): GameNetworkAdapter {
  const adapter = adapters.get(gameId);
  if (!adapter) {
    requireGame(gameId);
    throw new Error(`Game "${gameId}" has no network adapter`);
  }
  return adapter;
}

export function listInstalledGames(): Array<{
  id: string;
  nameKey: string;
  minPlayers: number;
  maxPlayers: number;
}> {
  return [...adapters.values()].map(({ game }) => ({
    id: game.id,
    nameKey: game.nameKey,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
  }));
}

export function listAdapterIds(): string[] {
  return [...adapters.keys()];
}
