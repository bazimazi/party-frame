/**
 * The whole web app, in one component.
 *
 * `<PartyApp games={[myGame]} />` mounts the router, the locale provider and
 * the game catalog, and gives you `/game` on the TV, `/join` for typing a code
 * and `/join/:code` for a QR scan. An app that owns its own router renders
 * `<PartyRoutes games={...} />` inside it instead.
 */

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { addMessages } from "@partyframe/i18n";
import { GameCatalogProvider } from "./catalog.js";
import { HostRoute } from "./shared-screen/HostRoute.js";
import { JoinLanding } from "./controller/JoinLanding.js";
import { JoinRoute } from "./controller/JoinRoute.js";
import { I18nProvider } from "./i18n/I18nProvider.js";
import type { AnyWebGame } from "./types.js";

export interface PartyAppProps {
  /** Every game this build can render. Ids must match the server's. */
  games: readonly AnyWebGame[];
  /**
   * Extra translations, keyed by locale code.
   *
   * The usual content is a game's display name: `{ en: { "game.tap.name":
   * "Tap Race" } }`. Merged into the built-in dictionaries on first render.
   */
  messages?: Record<string, Record<string, string>>;
}

const applied = new WeakSet<object>();

function applyMessages(messages: PartyAppProps["messages"]): void {
  if (!messages || applied.has(messages)) return;
  applied.add(messages);
  for (const [locale, dictionary] of Object.entries(messages)) {
    addMessages(locale, dictionary);
  }
}

export function PartyRoutes({ games, messages }: PartyAppProps) {
  // Runs during render on purpose: the first `t()` call happens in the very
  // first commit below, so an effect would flash untranslated keys.
  applyMessages(messages);

  return (
    <I18nProvider>
      <GameCatalogProvider games={games}>
        <Routes>
          <Route path="/" element={<Navigate to="/game" replace />} />
          <Route path="/game" element={<HostRoute />} />
          <Route path="/join" element={<JoinLanding />} />
          <Route path="/join/:code" element={<JoinRoute />} />
        </Routes>
      </GameCatalogProvider>
    </I18nProvider>
  );
}

export function PartyApp(props: PartyAppProps) {
  return (
    <BrowserRouter>
      <PartyRoutes {...props} />
    </BrowserRouter>
  );
}
