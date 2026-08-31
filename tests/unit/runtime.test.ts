import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineGame, listen } from "@bazimazi/partyframe-server";
import {
  RUNTIME_DEFAULTS,
  bindRuntime,
  resetRuntimeHost,
  runtimeHost,
} from "../../packages/partyframe-server/src/bind.js";
import { resetInstalled } from "../../packages/partyframe-server/src/catalog.js";

afterEach(() => {
  resetRuntimeHost();
  resetInstalled();
});

const minimal = {
  id: "tap",
  actionSchema: z.object({ type: z.literal("tap") }),
  createState: () => ({ taps: 0 }),
  handleAction: () => true,
};

describe("bindRuntime", () => {
  it("requires nothing but a default game id", () => {
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
  it("keeps what the author wrote", () => {
    const game = defineGame({ ...minimal, minPlayers: 2, maxPlayers: 4 });
    expect(game.id).toBe("tap");
    expect(game.minPlayers).toBe(2);
    expect(game.maxPlayers).toBe(4);
  });

  it("fills in every optional member, so a four-field game is playable", () => {
    const game = defineGame(minimal);

    expect(game.nameKey).toBe("game.tap.name");
    expect(game.minPlayers).toBe(1);
    expect(game.maxPlayers).toBe(8);
    expect(game.parseOptions({ anything: true })).toEqual({});
    expect(game.isFinished({} as never)).toBe(false);
    expect(game.getControllerState({} as never, "p1")).toEqual({ active: true, game: null });
    expect(game.createBot("easy").decide({} as never, "b1")).toBeNull();
  });

  it("defaults `start` to entering PLAYING rather than stalling on STARTING", () => {
    const requested: string[] = [];
    defineGame(minimal).start({
      requestStatus: (status: string) => requested.push(status),
    } as never);
    expect(requested).toEqual(["PLAYING"]);
  });

  it("defaults the public projection to the whole state", () => {
    const state = { taps: 3 };
    expect(defineGame(minimal).getPublicState({ state } as never)).toBe(state);
  });

  it("is idempotent, so a resolved game can be passed through again", () => {
    const once = defineGame({ ...minimal, minPlayers: 3 });
    const twice = defineGame(once);
    expect(twice.minPlayers).toBe(3);
    expect(twice.nameKey).toBe(once.nameKey);
  });
});

describe("listen", () => {
  it("refuses a server with no games", async () => {
    await expect(listen({ games: [] })).rejects.toThrow(/games` is empty/);
  });

  it("refuses a default game id that is not installed", async () => {
    await expect(
      listen({ games: [defineGame(minimal)], defaultGameId: "nope" }),
    ).rejects.toThrow(/not among the installed games/);
  });
});
