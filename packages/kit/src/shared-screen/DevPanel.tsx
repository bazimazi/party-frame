/**
 * Developer tools.
 *
 * Rendered only when the server reports `devTools: true`, which it refuses to do
 * in a production build. Every command it sends is also re-checked server-side,
 * so an attacker crafting the message by hand against a production server gets a
 * `NOT_ALLOWED` rather than a free round skip.
 *
 * Exists because the flows that are hardest to test by hand - reconnection,
 * explosions, a full lobby - are the ones most likely to break.
 */

import { useState } from "react";
import type { SessionAction } from "@party-frame/protocol";
import { useT } from "../i18n/I18nProvider.js";
import { buildJoinUrl, resolveServerHttpUrl } from "../net/endpoint.js";

/** Latency presets matching the conditions the network tests exercise. */
const LATENCY_PRESETS = [0, 50, 100, 250] as const;

export function DevPanel({
  roomCode,
  latencyMs,
  clockOffsetMs,
  status,
  send,
}: {
  roomCode: string;
  latencyMs: number;
  clockOffsetMs: number;
  status: string;
  send: (action: SessionAction) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [latency, setLatency] = useState(0);

  const command = (name: string) => () => send({ type: "dev-command", command: name });

  /**
   * Adds artificial delay to every socket on the server.
   *
   * Server-wide rather than per-client on purpose: the interesting failures are
   * the ones where the shared screen and a phone disagree about timing, and that
   * only shows up when both are slowed together.
   */
  const applyLatency = (milliseconds: number) => {
    setLatency(milliseconds);
    void fetch(`${resolveServerHttpUrl()}/api/dev/latency`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ milliseconds }),
    }).catch(() => undefined);
  };

  return (
    <div className="dev-panel" data-open={open || undefined}>
      <button
        type="button"
        className="dev-panel__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        🛠 {t("dev.title")}
      </button>

      {open && (
        <div className="dev-panel__body">
          <dl className="dev-panel__stats">
            <div>
              <dt>Status</dt>
              <dd>{status}</dd>
            </div>
            <div>
              <dt>RTT</dt>
              <dd>{latencyMs} ms</dd>
            </div>
            <div>
              <dt>Clock offset</dt>
              <dd>{Math.round(clockOffsetMs)} ms</dd>
            </div>
          </dl>

          <div className="dev-panel__actions">
            <button type="button" className="btn btn--ghost" onClick={command("add-bot")}>
              {t("dev.addBot")}
            </button>
            <button type="button" className="btn btn--ghost" onClick={command("remove-bot")}>
              {t("dev.removeBot")}
            </button>
            <button type="button" className="btn btn--ghost" onClick={command("short-fuse")}>
              Short fuse
            </button>
            <button type="button" className="btn btn--ghost" onClick={command("skip-round")}>
              {t("dev.skipRound")}
            </button>
            <button type="button" className="btn btn--ghost" onClick={command("force-game-over")}>
              {t("dev.forceGameOver")}
            </button>
          </div>

          <div className="dev-panel__row">
            <span className="dev-panel__row-label">{t("dev.simulateLatency")}</span>
            <div className="segmented" role="group">
              {LATENCY_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="segmented__option"
                  aria-pressed={latency === preset}
                  onClick={() => applyLatency(preset)}
                >
                  {preset === 0 ? "off" : `${preset}ms`}
                </button>
              ))}
            </div>
          </div>

          {roomCode && (
            <p className="dev-panel__hint">
              {t("dev.openController")}:{" "}
              <a href={buildJoinUrl(roomCode)} target="_blank" rel="noreferrer">
                {buildJoinUrl(roomCode)}
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
