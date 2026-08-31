import { defineGame } from "@bazimazi/partyframe-server";
import { z } from "zod";

const TARGET = 10;

export interface TapState {
  taps: Record<string, number>;
  winnerId: string;
}

export interface TapController {
  taps: number;
  target: number;
}

export const tapGame = defineGame({
  id: "tap",
  actionSchema: z.object({ type: z.literal("tap") }),
  createState: (): TapState => ({ taps: {}, winnerId: "" }),
  handleAction(ctx, playerId, action) {
    if (action.type !== "tap" || ctx.state.winnerId) return false;
    ctx.state.taps[playerId] = (ctx.state.taps[playerId] ?? 0) + 1;
    if ((ctx.state.taps[playerId] ?? 0) >= TARGET) {
      ctx.state.winnerId = playerId;
      ctx.players.addScore(playerId, 1);
    }
    return true;
  },
  isFinished(ctx) {
    return Boolean(ctx.state.winnerId);
  },
  getControllerState(ctx, playerId): { active: boolean; game: TapController } {
    return {
      active: !ctx.state.winnerId,
      game: { taps: ctx.state.taps[playerId] ?? 0, target: TARGET },
    };
  },
  createBot(difficulty) {
    const delayMs = difficulty === "easy" ? 420 : difficulty === "hard" ? 140 : 240;
    return {
      difficulty,
      decide: () => ({ action: { type: "tap" as const }, delayMs }),
    };
  },
});
