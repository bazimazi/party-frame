import { afterEach, describe, expect, it } from "vitest";
import { defineGame } from "@party-frame/game-core";
import {
  RUNTIME_DEFAULTS,
  bindRuntime,
  resetRuntimeHost,
  runtimeHost,
} from "@party-frame/runtime";
import { z } from "zod";

afterEach(() => {
  resetRuntimeHost();
});

describe("bindRuntime", () => {
  it("requires only a default game id", () => {
    bindRuntime({ defaultGameId: "tap" });
    const host = runtimeHost();
    expect(host.defaultGameId).toBe("tap");
    expect(host.maxPlayers).toBe(RUNTIME_DEFAULTS.maxPlayers);
    expect(host.sessionTimeoutMs).toBe(RUNTIME_DEFAULTS.sessionTimeoutMs);
    expect(host.sessionMaxAgeMs).toBe(RUNTIME_DEFAULTS.sessionMaxAgeMs);
    expect(host.log.info).toBeTypeOf("function");
  });

  it("keeps explicit overrides", () => {
    bindRuntime({ defaultGameId: "tap", maxPlayers: 4, devToolsEnabled: false });
    expect(runtimeHost().maxPlayers).toBe(4);
    expect(runtimeHost().devToolsEnabled).toBe(false);
  });

  it("throws before bindRuntime runs", () => {
    expect(() => runtimeHost()).toThrow(/bindRuntime/);
  });
});

describe("defineGame", () => {
  it("returns the same game object", () => {
    const game = defineGame({
      id: "tap",
      nameKey: "game.tap.name",
      minPlayers: 1,
      maxPlayers: 8,
      actionSchema: z.object({ type: z.literal("tap") }),
      parseOptions: () => ({}),
      createState: () => ({ taps: 0 }),
      start() {},
      handleAction() {
        return true;
      },
      update() {},
      isFinished() {
        return false;
      },
      getControllerState() {
        return { active: true, game: null };
      },
      getPublicState(ctx) {
        return ctx.state;
      },
      createBot() {
        return { difficulty: "easy", decide: () => null };
      },
    });
    expect(game.id).toBe("tap");
  });
});
