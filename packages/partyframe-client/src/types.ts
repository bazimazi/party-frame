/**
 * What a game contributes to the web app.
 *
 * The platform's screens - lobby, QR panel, player cards, event feed, results,
 * controller shell, connection handling - are shared by every game.
 */

import type { ComponentType } from "react";
import type { Translate } from "@partyframe/i18n";
import type { ClientPlayer, ControllerEnvelope } from "@partyframe/protocol";
import type { Voice } from "./sfx.js";

export interface PlayerBadge {
  /** Short text overlaid on the card, e.g. lives or "OUT". */
  text: string;
  tone: "neutral" | "good" | "bad";
}

/** Props every game-specific controller panel receives. */
export interface ControllerPanelProps {
  /** The envelope for this player, with `game` already narrowed by the panel. */
  envelope: ControllerEnvelope;
  /** Sends a game action. The server validates it; this is only an intention. */
  send: (action: unknown) => void;
  /** Clock-corrected server time, for local countdown interpolation. */
  serverNow: () => number;
  /** This player's own row, for name, colour and avatar. */
  me: ClientPlayer | undefined;
  /** Bound translator from the platform locale. */
  t: Translate;
}

export interface WebGame {
  id: string;
  /** Converts the raw synchronised projection into plain, iterable data. */
  normalizePublicState: (raw: unknown) => unknown;
  Controller: ComponentType<ControllerPanelProps>;
  /** Players to draw as eliminated on the shared screen. */
  eliminatedIds?: (publicState: unknown) => Set<string>;
  /** Per-player badge text, e.g. remaining lives. */
  badges?: (publicState: unknown) => Record<string, PlayerBadge>;
  /** The player whose turn it is, highlighted on the shared screen. */
  activePlayerId?: (publicState: unknown) => string | undefined;
  /** Current round, shown in the top bar. Zero or undefined hides it. */
  round?: (publicState: unknown) => number | undefined;
  /** Winner id at the end of a match, or "" for a tie. */
  winnerId?: (publicState: unknown) => string;
  /**
   * Game-owned event kinds → voices. Platform kinds (`player-joined`,
   * `game-started`, `game-ended`) are resolved first and cannot be overridden.
   */
  sfx?: Readonly<Record<string, Voice>>;
}
