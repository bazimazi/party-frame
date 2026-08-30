/**
 * The envelope every phone receives on `MSG.CONTROLLER_STATE`.
 *
 * The platform owns the envelope; the active game owns `game`. A controller
 * shell can therefore render connection, identity and mode without knowing
 * anything about the game, and delegate only the inner panel to a game-specific
 * component.
 */

import type { ControllerMode } from "./session.js";

export interface ControllerEnvelope<TGame = unknown> {
  /** Which shell the phone should present. */
  mode: ControllerMode;
  /** Identifier of the active game, used to pick the controller component. */
  gameId: string;
  /** True while this player may act at all (not eliminated, not spectating). */
  active: boolean;
  /** Player's current score, mirrored here so the shell never reads game state. */
  score: number;
  /** Game-specific projection for this one player. Opaque to the platform. */
  game: TGame;
  /** Monotonic counter; lets a client drop out-of-order envelopes. */
  revision: number;
}
