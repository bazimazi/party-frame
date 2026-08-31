import Phaser from "phaser";
import type { ControllerPanelProps, GameSceneClass, StageBridge, WebGame } from "@bazimazi/partyframe-client";
import { drainEvents } from "@bazimazi/partyframe-client";

interface TapPublic {
  taps: Record<string, number>;
  winnerId: string;
}

interface TapControllerState {
  taps: number;
  target: number;
}

function readTaps(raw: unknown): Record<string, number> {
  const taps: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return taps;
  const candidate = raw as { forEach?: (cb: (value: number, key: string) => void) => void };
  if (typeof candidate.forEach === "function") {
    candidate.forEach((value, key) => {
      taps[key] = value;
    });
    return taps;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number") taps[key] = value;
  }
  return taps;
}

export function TapController({ envelope, send }: ControllerPanelProps) {
  const game = envelope.game as TapControllerState;
  return (
    <div className="ctl-panel">
      <p className="ctl-panel__headline">
        {game.taps} / {game.target}
      </p>
      <p className="ctl-panel__sub">First to {game.target} wins</p>
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

export class TapScene extends Phaser.Scene {
  static readonly KEY = "tap";
  private bridge!: StageBridge;
  private roster!: Phaser.GameObjects.Text;

  constructor() {
    super(TapScene.KEY);
  }

  init(data: { bridge: StageBridge }) {
    this.bridge = data.bridge;
  }

  create() {
    this.add.text(40, 28, "First to 10 taps", {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "28px",
      color: "#94a3b8",
    });
    this.roster = this.add.text(40, 88, "", {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "36px",
      color: "#f8fafc",
      lineSpacing: 14,
    });
  }

  override update() {
    drainEvents(this.bridge);
    const game = this.bridge.game as TapPublic | null;
    this.roster.setText(
      this.bridge.players
        .map((player) => `${player.avatar}  ${player.name}   ${game?.taps[player.id] ?? 0}`)
        .join("\n"),
    );
  }
}

export const tapWeb: WebGame = {
  id: "tap",
  normalizePublicState: (raw) => {
    const record = (raw ?? {}) as { taps?: unknown; winnerId?: string };
    return { taps: readTaps(record.taps), winnerId: record.winnerId ?? "" };
  },
  Controller: TapController,
  winnerId: (state) => (state as TapPublic).winnerId,
};

export const TapSceneClass = TapScene as GameSceneClass;
