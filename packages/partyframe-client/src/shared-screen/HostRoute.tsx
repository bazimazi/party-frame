/**
 * The shared screen.
 *
 * Creates a session on mount, then renders whichever view matches the
 * authoritative session status. It contains no game rules and reads no
 * game-specific fields directly: everything game-shaped goes through the web
 * game registry, which is what lets a second game reuse this file unchanged.
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import type { ClientPlayer, SessionSettings } from "@partyframe/protocol";
import { useWebGame } from "../catalog.js";
import { voiceForEvent } from "../cues.js";
import { sfx } from "../sfx.js";
import { useT } from "../i18n/I18nProvider.js";
import { useServerConfig } from "../net/useServerConfig.js";
import { useSession } from "../net/useSession.js";
import { ConnectionBadge, ErrorScreen, LoadingScreen } from "../ui/common.js";
import { DevPanel } from "./DevPanel.js";
import { EventFeed } from "./EventFeed.js";
import { LobbyView } from "./LobbyView.js";
import { PlayerGrid } from "./PlayerGrid.js";
import { ResultsView } from "./ResultsView.js";

/**
 * The renderer is loaded only when a match actually starts.
 *
 * Phaser is by far the largest dependency in the app, and the lobby - the first
 * thing on screen and the thing a TV sits on while people file in - does not
 * need it. Deferring it also means the phone controller, which shares this
 * bundle, never pays for it at all.
 */
const GameStage = lazy(async () => ({
  default: (await import("./phaser/GameStage.js")).GameStage,
}));

export function HostRoute() {
  const t = useT();
  const { config } = useServerConfig();
  const [params] = useSearchParams();
  // Catalog id from the landing page. The shell does not name any game here.
  const requestedGameId = params.get("game") || undefined;
  const session = useSession(
    useMemo(() => ({ role: "host" as const, gameId: requestedGameId }), [requestedGameId]),
  );

  const snapshot = session?.snapshot ?? null;
  const status = snapshot?.status ?? "CREATED";
  const gameId = snapshot?.gameId ?? "";
  const webGame = useWebGame(gameId);

  /** Everyone who finished joining, in seat order. Unjoined rows stay hidden. */
  const players = useMemo<ClientPlayer[]>(
    () => (snapshot?.players ?? []).filter((player) => player.joined),
    [snapshot?.players],
  );

  /**
   * The game's own projection, resolved once per patch and shared by the canvas
   * and the surrounding UI.
   *
   * It already arrives as plain data; `normalizePublicState` only runs for a
   * game that installed a network adapter and has collections to unwrap.
   */
  const publicState = useMemo(() => {
    if (!snapshot) return null;
    return webGame?.normalizePublicState
      ? webGame.normalizePublicState(snapshot.game)
      : snapshot.game;
    // `gameRevision` is the cheap signal that `game` changed at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webGame, snapshot?.game, snapshot?.gameRevision]);

  const serverNow = useCallback(
    () => session?.connection.clock.now() ?? Date.now(),
    [session?.connection],
  );

  const send = session?.sendSessionAction;

  const updateSettings = useCallback(
    (patch: Partial<SessionSettings>) => {
      send?.({ type: "update-settings", settings: patch });
    },
    [send],
  );

  // The TV is the one screen allowed to make noise, and browsers require a
  // gesture before it can. Any click or key anywhere unlocks audio once.
  useEffect(() => {
    const unlock = () => {
      sfx.unlock();
      if (sfx.isReady) {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // A shared screen is meant to stay lit for a whole party.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Unsupported or refused; the screen may dim, which is cosmetic.
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  // Sound cues are driven by the event stream rather than by state diffs, so a
  // coalesced patch cannot leave the TV silent for the rest of the match.
  const soundCursor = useRef(0);
  useEffect(() => {
    const events = session?.events ?? [];
    if (events.length < soundCursor.current) soundCursor.current = 0;
    for (const event of events.slice(soundCursor.current)) {
      const voice = voiceForEvent(event.kind, webGame?.sfx);
      if (voice) sfx.play(voice);
    }
    soundCursor.current = events.length;
  }, [session?.events, webGame?.sfx]);

  if (!session) return <LoadingScreen message={t("host.connecting")} />;

  if (session.status === "error" && session.error) {
    return <ErrorScreen error={session.error} onRetry={() => window.location.reload()} />;
  }

  if (!snapshot || session.status === "connecting") {
    return <LoadingScreen message={t("host.starting")} />;
  }

  const inGame = status === "STARTING" || status === "PLAYING" || status === "ROUND_END";
  const round = webGame?.round?.(publicState) ?? 0;
  // Server metadata is the source of truth. `1` is only "unknown" - the room
  // still refuses a start that is below the installed game's minimum.
  const minPlayers = config.games.find((game) => game.id === gameId)?.minPlayers ?? 1;

  return (
    <div className="host">
      <header className="host__bar">
        <h1 className="host__title">{t(`game.${gameId}.name`)}</h1>
        <div className="host__bar-right">
          {inGame && round > 0 && (
            <span className="host__round">{t("host.round", { round })}</span>
          )}
          <span className="host__code">
            {t("host.roomLabel")} <strong>{snapshot.publicCode}</strong>
          </span>
          <ConnectionBadge status={session.status} />
        </div>
      </header>

      {session.status === "reconnecting" && (
        <p className="host__banner" role="status">
          {t("host.reconnecting")}
        </p>
      )}

      <main className="host__main">
        {status === "LOBBY" && (
          <LobbyView
            roomCode={snapshot.publicCode}
            publicBaseUrl={config.publicBaseUrl}
            players={players}
            settings={snapshot.settings}
            minPlayers={minPlayers}
            onStart={() => send?.({ type: "start-game" })}
            onSettings={updateSettings}
          />
        )}

        {inGame && (
          <div className="host__game">
            {/* No scene means no canvas: a game may be phones-only. */}
            {webGame?.scene && (
              <Suspense fallback={<div className="game-stage" />}>
                <GameStage
                  sceneKey={gameId}
                  loadScene={webGame.scene}
                  game={publicState}
                  players={players}
                  events={session.events}
                  running={inGame}
                  serverNow={serverNow}
                />
              </Suspense>
            )}
            <aside className="host__side">
              <PlayerGrid
                players={players}
                highlightId={webGame?.activePlayerId?.(publicState)}
                dimmedIds={webGame?.eliminatedIds?.(publicState)}
                badges={webGame?.badges?.(publicState)}
              />
              <EventFeed events={session.events} />
            </aside>
          </div>
        )}

        {status === "GAME_OVER" && (
          <ResultsView
            players={players}
            winnerId={webGame?.winnerId?.(publicState) ?? ""}
            onRematch={() => send?.({ type: "rematch" })}
            onLobby={() => send?.({ type: "return-to-lobby" })}
          />
        )}
      </main>

      {config.devTools && (
        <DevPanel
          roomCode={snapshot.publicCode}
          latencyMs={session.latencyMs}
          clockOffsetMs={session.connection.clock.offset}
          status={`${status} / ${session.status}`}
          send={(action) => send?.(action)}
        />
      )}
    </div>
  );
}
