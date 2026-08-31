import Phaser from "phaser";
import { drainEvents, type StageBridge } from "@bazimazi/partyframe-client";
import type { TapPublic } from "./tapWeb.js";

/**
 * The shared screen's canvas.
 *
 * Lives in its own module so `tapWeb.tsx` can point at it with a dynamic
 * import: Phaser is the largest dependency in the app and must never reach a
 * phone's bundle.
 */
export class TapScene extends Phaser.Scene {
  private bridge!: StageBridge;
  private roster!: Phaser.GameObjects.Text;

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
