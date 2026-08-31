import { defineWebGame, type ControllerPanelProps } from "@bazimazi/partyframe-client";
import type { TapController, TapState } from "./tapGame.js";

/** What the server's `getPublicState()` returns - here, the whole state. */
export type TapPublic = TapState;

function TapPanel({ envelope, send }: ControllerPanelProps<TapController>) {
  const { taps, target } = envelope.game;
  return (
    <div className="ctl-panel">
      <p className="ctl-panel__headline">
        {taps} / {target}
      </p>
      <p className="ctl-panel__sub">First to {target} wins</p>
      <button
        type="button"
        className="btn btn--primary btn--big btn--block"
        disabled={!envelope.active}
        onClick={() => send({ type: "tap" })}
      >
        Tap
      </button>
    </div>
  );
}

export const tapWeb = defineWebGame<TapPublic, TapController>({
  id: "tap",
  Controller: TapPanel,
  scene: () => import("./TapScene.js").then((m) => m.TapScene),
  winnerId: (state) => state?.winnerId ?? "",
});
