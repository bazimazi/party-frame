/**
 * Which games this build knows how to render.
 *
 * The catalog is a React context rather than a module-level singleton: the
 * shells read it through a hook, so there is no "you forgot to call bind()"
 * failure mode, no import-order dependency, and a test can mount a route with
 * one stub game and no global cleanup.
 *
 * The client never imports a game itself - the app passes its catalog to
 * `<PartyApp games={...} />`, which is the only place the two meet.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AnyWebGame } from "./types.js";

const CatalogContext = createContext<ReadonlyMap<string, AnyWebGame> | null>(null);

export function GameCatalogProvider({
  games,
  children,
}: {
  games: readonly AnyWebGame[];
  children: ReactNode;
}) {
  const catalog = useMemo(() => {
    const byId = new Map<string, AnyWebGame>();
    for (const game of games) byId.set(game.id, game);
    return byId;
  }, [games]);

  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

/**
 * The web game for an id, or undefined when this build does not ship it.
 *
 * Undefined is a normal outcome, not an error: a server may host a game this
 * client was not built with, and the shells degrade to the platform screens.
 */
export function useWebGame(gameId: string): AnyWebGame | undefined {
  const catalog = useContext(CatalogContext);
  if (!catalog) {
    throw new Error(
      "@bazimazi/partyframe-client: render routes inside <PartyApp games={...} /> or <PartyRoutes games={...} />",
    );
  }
  return catalog.get(gameId);
}
