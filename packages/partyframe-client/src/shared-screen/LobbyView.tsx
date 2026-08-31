/**
 * The lobby, as seen on the TV.
 *
 * Two columns: who is here on the left, how to get here on the right. The QR
 * panel keeps its position for the whole lobby so that a latecomer walking into
 * the room always finds it in the same place.
 */

import type { ClientPlayer, SessionSettings } from "@partyframe/protocol";
import { useT } from "../i18n/I18nProvider.js";
import { PlayerGrid } from "./PlayerGrid.js";
import { QrPanel } from "./QrPanel.js";

export function LobbyView({
  roomCode,
  publicBaseUrl,
  players,
  settings,
  minPlayers,
  onStart,
  onSettings,
}: {
  roomCode: string;
  publicBaseUrl?: string;
  players: ClientPlayer[];
  settings: SessionSettings;
  minPlayers: number;
  onStart: () => void;
  onSettings: (patch: Partial<SessionSettings>) => void;
}) {
  const t = useT();
  const canStart = players.length >= minPlayers;

  return (
    <div className="lobby">
      <section className="lobby__players">
        <header className="lobby__header">
          <h2 className="lobby__heading">{t("host.players")}</h2>
          <span className="lobby__count">
            {players.length} / {settings.maxPlayers}
          </span>
        </header>

        {players.length === 0 ? (
          <p className="lobby__empty">{t("host.waitingForPlayers")}</p>
        ) : (
          <PlayerGrid players={players} showReady />
        )}

        <div className="lobby__controls">
          <label className="lobby__setting">
            <span>{t("host.bots")}</span>
            <div className="stepper">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onSettings({ botCount: Math.max(0, settings.botCount - 1) })}
                aria-label={t("dev.removeBot")}
              >
                −
              </button>
              <output className="stepper__value">{settings.botCount}</output>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onSettings({ botCount: settings.botCount + 1 })}
                aria-label={t("dev.addBot")}
              >
                +
              </button>
            </div>
          </label>

          <label className="lobby__setting">
            <span>{t("host.botDifficulty")}</span>
            <div className="segmented" role="group">
              {(["easy", "medium", "hard"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  className="segmented__option"
                  aria-pressed={settings.botDifficulty === level}
                  onClick={() => onSettings({ botDifficulty: level })}
                >
                  {t(`difficulty.${level}`)}
                </button>
              ))}
            </div>
          </label>
        </div>

        <button
          type="button"
          className="btn btn--primary btn--big lobby__start"
          disabled={!canStart}
          onClick={onStart}
        >
          {canStart ? t("host.startGame") : t("host.needMorePlayers", { count: minPlayers })}
        </button>
      </section>

      <QrPanel roomCode={roomCode} publicBaseUrl={publicBaseUrl} />
    </div>
  );
}
