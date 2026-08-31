/**
 * How the client reads a game's public state off the wire.
 *
 * This is the seam that lets a game ship without touching Colyseus: the server
 * serialises whatever `getPublicState()` returned, and this reads it back. If it
 * regresses, every game's shared screen goes blank at once.
 */

import { describe, expect, it } from "vitest";
import {
  createProjectionCache,
  readProjection,
} from "../../packages/partyframe-client/src/net/projection.js";

describe("readProjection", () => {
  it("parses the platform's JSON transport", () => {
    const cache = createProjectionCache();
    const state = { gameJson: '{"taps":{"a":3},"winnerId":""}' };
    expect(readProjection(state, cache)).toEqual({ taps: { a: 3 }, winnerId: "" });
  });

  it("returns null before the first projection arrives", () => {
    expect(readProjection({ gameJson: "" }, createProjectionCache())).toBeNull();
    expect(readProjection({}, createProjectionCache())).toBeNull();
  });

  it("keeps the same object identity while the JSON is unchanged", () => {
    const cache = createProjectionCache();
    const state = { gameJson: '{"round":1}' };
    // The shared screen memoises on this identity; a fresh parse per patch would
    // re-render the TV ten times a second for a state that never moved.
    expect(readProjection(state, cache)).toBe(readProjection(state, cache));
  });

  it("produces a new value once the JSON changes", () => {
    const cache = createProjectionCache();
    const first = readProjection({ gameJson: '{"round":1}' }, cache);
    const second = readProjection({ gameJson: '{"round":2}' }, cache);
    expect(first).not.toBe(second);
    expect(second).toEqual({ round: 2 });
  });

  it("prefers an adapter-backed schema field over the JSON transport", () => {
    const live = { round: 7 };
    const value = readProjection(
      { game: live, gameJson: '{"round":1}' },
      createProjectionCache(),
    );
    expect(value).toBe(live);
  });

  it("survives a malformed projection rather than crashing the TV", () => {
    expect(readProjection({ gameJson: "{not json" }, createProjectionCache())).toBeNull();
  });
});
