/**
 * The phone while waiting in the lobby, between rounds, and after the match.
 *
 * These three states share one component because they share one job: tell the
 * player what is happening and offer at most one action. Anything more elaborate
 * competes with the TV, which is where everyone is actually looking.
 */

import type { ClientPlayer, ControllerMode } from "@party-frame/protocol";
import { haptic, sfx } from "../sfx.js";
import { useT } from "../i18n/I18nProvider.js";

export function LobbyPanel({
  mode,
  me,
  isHost,
  score,
  onReady,
  onStart,
  onRematch,
}: {
  mode: ControllerMode;
  me: ClientPlayer | undefined;
  isHost: boolean;
  score: number;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onRematch: () => void;
}) {
  const t = useT();

  if (mode === "game-over") {
    return (
      <div className="ctl-panel ctl-panel--calm">
        <p className="ctl-panel__headline">{t("controller.gameOver")}</p>
        <p className="ctl-panel__sub">{t("controller.finalScore", { score })}</p>
        {isHost ? (
          <button
            type="button"
            className="btn btn--primary btn--big btn--block"
            onClick={() => {
              haptic(15);
              onRematch();
            }}
          >
            {t("controller.hostRematch")}
          </button>
        ) : (
          <p className="ctl-panel__sub">{t("controller.waitingForHost")}</p>
        )}
      </div>
    );
  }

  if (mode === "starting" || mode === "round-end") {
    return (
      <div className="ctl-panel ctl-panel--calm">
        <p className="ctl-panel__headline">
          {mode === "starting" ? t("controller.starting") : t("controller.roundOver")}
        </p>
        <p className="ctl-panel__sub">{t("controller.waitingForNextRound")}</p>
      </div>
    );
  }

  const ready = me?.ready ?? false;

  return (
    <div className="ctl-panel ctl-panel--calm">
      <p className="ctl-panel__headline">{t("controller.getReady")}</p>

      <button
        type="button"
        className={`btn btn--big btn--block ${ready ? "btn--ghost" : "btn--primary"}`}
        aria-pressed={ready}
        onClick={() => {
          sfx.play("ready");
          haptic(12);
          onReady(!ready);
        }}
      >
        {ready ? t("controller.ready") + " ✓" : t("controller.ready")}
      </button>

      {isHost ? (
        <>
          <p className="ctl-panel__sub">{t("controller.youAreHost")}</p>
          <button
            type="button"
            className="btn btn--big btn--block"
            onClick={() => {
              haptic(15);
              onStart();
            }}
          >
            {t("controller.hostStart")}
          </button>
        </>
      ) : (
        <p className="ctl-panel__sub">{t("controller.waitingForHost")}</p>
      )}
    </div>
  );
}
