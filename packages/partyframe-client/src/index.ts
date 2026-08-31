/**
 * Public API of `@bazimazi/partyframe-client`.
 *
 * Two entry points cover the whole product: `defineWebGame()` to describe what
 * a game looks like, and `<PartyApp games={...} />` to mount the TV and phone
 * shells around it.
 *
 * The session client, the routes, the config fetch and the audio engine are
 * intentionally not exported. They are how the shells are built, not a surface
 * a game is meant to reach into.
 */

// ------------------------------------------------------------ mounting the app
export { PartyApp, PartyRoutes, type PartyAppProps } from "./PartyApp.js";

// ------------------------------------------------------------- describing a game
export { defineWebGame } from "./types.js";
export type {
  AnyWebGame,
  ControllerPanelProps,
  GameSceneClass,
  PlayerBadge,
  WebGame,
} from "./types.js";
export type { ClientPlayer, ControllerEnvelope, GameEventMessage } from "@partyframe/protocol";

// --------------------------------------------------------------- inside a scene
export { drainEvents, type StageBridge } from "./bridge.js";

// ------------------------------------------------------- inside a controller panel
export { haptic, type Voice } from "./sfx.js";
export { FuseBar } from "./FuseBar.js";
export { useI18n, useT } from "./i18n/I18nProvider.js";

// ------------------------------------------------------------------ localisation
export { addMessages, registerLocale, type LocaleDefinition, type Translate } from "@partyframe/i18n";
