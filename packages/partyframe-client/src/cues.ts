/**
 * Maps presentation-event kinds to voices.
 *
 * Platform kinds are owned here so the shared screen never names a game.
 * A game may add its own kinds through `WebGame.sfx`; it cannot override a
 * platform kind.
 */

import type { Voice } from "./sfx.js";

export const PLATFORM_SFX: Readonly<Record<string, Voice>> = {
  "player-joined": "join",
  "game-started": "start",
  "game-ended": "win",
};

export function voiceForEvent(
  kind: string,
  gameSfx?: Readonly<Record<string, Voice>>,
): Voice | undefined {
  return PLATFORM_SFX[kind] ?? gameSfx?.[kind];
}
