/**
 * Reading the active game's public projection off the synchronised state.
 *
 * Two transports exist, and the client must not care which one a game chose:
 *
 * - `gameJson`, the platform default. The game returns plain data from
 *   `getPublicState()` and the server ships it as a string, so a game author
 *   never writes Colyseus schema.
 * - `game`, a real schema field, present only when the game installed a
 *   `GameNetworkAdapter` to get field-level patches.
 */

/**
 * One-entry memo for the parsed JSON projection.
 *
 * `gameJson` is re-read on every patch but changes far less often, and the
 * shared screen memoises on the identity of the parsed value. Parsing per patch
 * would hand it a new object every time and defeat that.
 */
export interface ProjectionCache {
  json: string;
  value: unknown;
}

export function createProjectionCache(): ProjectionCache {
  return { json: "", value: null };
}

export function readProjection(
  state: Record<string, unknown>,
  cache: ProjectionCache,
): unknown {
  // An adapter-backed game wins: its schema field is the live, patched one.
  if (state.game !== undefined && state.game !== null) return state.game;

  const json = typeof state.gameJson === "string" ? state.gameJson : "";
  if (json === cache.json) return cache.value;

  cache.json = json;
  try {
    cache.value = json ? JSON.parse(json) : null;
  } catch {
    // A malformed projection is a server bug, not something a TV should crash
    // on: keep rendering the platform chrome and wait for the next patch.
    cache.value = null;
  }
  return cache.value;
}
