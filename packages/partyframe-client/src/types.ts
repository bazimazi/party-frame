/**
 * What a game contributes to the web app.
 *
 * The platform's screens - lobby, QR panel, player cards, event feed, results,
 * controller shell, connection handling - are shared by every game. A `WebGame`
 * fills in the two things that cannot be shared: the phone's control panel and,
 * optionally, what the shared screen draws.
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
export interface ControllerPanelProps<TController = unknown> {
  /** The envelope for this player, typed by the game's controller projection. */
  envelope: ControllerEnvelope<TController>;
  /** Sends a game action. The server validates it; this is only an intention. */
  send: (action: unknown) => void;
  /** Clock-corrected server time, for local countdown interpolation. */
  serverNow: () => number;
  /** This player's own row, for name, colour and avatar. */
  me: ClientPlayer | undefined;
  /** Bound translator from the platform locale. */
  t: Translate;
}

/**
 * A Phaser scene class.
 *
 * Plain `new () => Scene` on purpose: the platform names the scene itself when
 * it adds it, so a game's scene needs no static key and no cast.
 */
export type GameSceneClass = new () => import("phaser").Scene;

/**
 * A game's contribution to the shared screen and the phones.
 *
 * `id` must match the server game's `id`; everything else is optional. A game
 * that only needs a phone panel is two fields long.
 */
export interface WebGame<TPublic = unknown, TController = unknown> {
  /** Must match the `id` of the game registered on the server. */
  id: string;

  /** The phone's control panel, rendered inside the platform's controller shell. */
  Controller: ComponentType<ControllerPanelProps<TController>>;

  /**
   * The Phaser scene drawn on the shared screen, loaded on demand.
   *
   * Written as a dynamic import (`scene: () => import("./MyScene.js").then(m => m.MyScene)`)
   * so neither Phaser nor the scene reaches a phone's bundle. Omit it for a
   * game with no canvas.
   */
  scene?: () => Promise<GameSceneClass>;

  /**
   * Escape hatch for reshaping the server's projection before anything reads it.
   *
   * Rarely needed: public state arrives as the plain data `getPublicState()`
   * returned. Supply this only when the game installed a `GameNetworkAdapter`
   * server-side and has Colyseus collections to unwrap.
   */
  normalizePublicState?: (raw: unknown) => TPublic;

  /**
   * Accessors the shared screen reads.
   *
   * Each receives `null` until the first projection arrives - the lobby renders
   * before any match exists - so the parameter is nullable on purpose.
   */

  /** Players to draw as eliminated on the shared screen. */
  eliminatedIds?: (publicState: TPublic | null) => Set<string>;
  /** Per-player badge text, e.g. remaining lives. */
  badges?: (publicState: TPublic | null) => Record<string, PlayerBadge>;
  /** The player whose turn it is, highlighted on the shared screen. */
  activePlayerId?: (publicState: TPublic | null) => string | undefined;
  /** Current round, shown in the top bar. Zero or undefined hides it. */
  round?: (publicState: TPublic | null) => number | undefined;
  /** Winner id at the end of a match, or "" for a tie. */
  winnerId?: (publicState: TPublic | null) => string;

  /**
   * Game-owned event kinds mapped to voices. Platform kinds (`player-joined`,
   * `game-started`, `game-ended`) are resolved first and cannot be overridden.
   */
  sfx?: Readonly<Record<string, Voice>>;
}

/** Convenience alias for a fully-erased web game, used by the shells. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyWebGame = WebGame<any, any>;

/**
 * Identity helper that pins a web game's type parameters.
 *
 * Pass the projection and controller types once - `defineWebGame<TapPublic,
 * TapController>({ ... })` - and every accessor plus the `Controller` component
 * is typed, instead of each one casting `unknown` on its first line.
 */
export function defineWebGame<TPublic = unknown, TController = unknown>(
  game: WebGame<TPublic, TController>,
): WebGame<TPublic, TController> {
  return game;
}
