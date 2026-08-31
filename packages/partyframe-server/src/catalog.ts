/**
 * The catalog of games this server can host.
 *
 * A game is installed by its rules alone. Its public projection is synchronised
 * as JSON, which is what lets `listen({ games: [myGame] })` be the whole
 * integration - no Colyseus schema, no projection code, no casts.
 *
 * A `GameNetworkAdapter` is the escape hatch for a game whose projection is
 * large or changes many times a second: it hands the platform a concrete
 * `SessionSchema` subclass so Colyseus can send field-level patches instead of
 * a whole document. Nothing else about the game changes either way.
 */

import { resolveGame, type AnyGameDefinition, type AnyPartyGame } from "@partyframe/game-core";
import type { SessionSchema } from "./sessionSchema.js";

export interface GameNetworkAdapter {
  game: AnyPartyGame | AnyGameDefinition;
  /** Builds the room's root state, a subclass of `SessionSchema`. */
  createState(): SessionSchema;
  /** Copies the game's public projection onto that state. */
  project(state: SessionSchema, publicState: unknown): void;
}

/** Any form accepted by `listen({ games })`. */
export type InstallableGame = AnyPartyGame | AnyGameDefinition | GameNetworkAdapter;

/** One installed game, with its optional custom network representation. */
export interface InstalledGame {
  game: AnyPartyGame;
  adapter: GameNetworkAdapter | null;
}

const installed = new Map<string, InstalledGame>();

function isAdapter(value: InstallableGame): value is GameNetworkAdapter {
  return "game" in value && typeof (value as GameNetworkAdapter).createState === "function";
}

export function install(entry: InstallableGame): void {
  const adapter = isAdapter(entry) ? entry : null;
  const game = resolveGame(adapter ? adapter.game : (entry as AnyGameDefinition));

  // A duplicate id is always a mistake: one of the two games would be
  // unreachable, and which one won would depend on array order.
  if (installed.has(game.id)) {
    throw new Error(`Game "${game.id}" is already installed`);
  }
  installed.set(game.id, { game, adapter });
}

export function getInstalled(gameId: string): InstalledGame | undefined {
  return installed.get(gameId);
}

/** Throws naming what is installed, rather than returning undefined into the room. */
export function requireInstalled(gameId: string): InstalledGame {
  const entry = installed.get(gameId);
  if (!entry) {
    throw new Error(
      `Unknown game "${gameId}". Installed: ${[...installed.keys()].join(", ") || "(none)"}`,
    );
  }
  return entry;
}

export function listInstalledGames(): Array<{
  id: string;
  nameKey: string;
  minPlayers: number;
  maxPlayers: number;
}> {
  return [...installed.values()].map(({ game }) => ({
    id: game.id,
    nameKey: game.nameKey,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
  }));
}

export function listInstalledIds(): string[] {
  return [...installed.keys()];
}

/** Test helper. Not used by a running server. */
export function resetInstalled(): void {
  installed.clear();
}
