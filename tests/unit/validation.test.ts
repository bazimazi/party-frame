/**
 * Runtime validation of everything that arrives from a client.
 *
 * TypeScript types stop at the socket. These schemas are the actual boundary, so
 * they are tested against the shapes a hostile or buggy client would send, not
 * only the ones the app produces.
 */

import { describe, expect, it } from "vitest";
import {
  JoinOptionsSchema,
  PlayerNameSchema,
  RoomCodeSchema,
  SessionActionSchema,
  SessionSettingsPatchSchema,
} from "@partyframe/protocol";

describe("RoomCodeSchema", () => {
  it("accepts and upper-cases a valid code", () => {
    expect(RoomCodeSchema.parse("ac3f")).toBe("AC3F");
  });

  it("trims surrounding whitespace from a pasted code", () => {
    expect(RoomCodeSchema.parse("  AC3F  ")).toBe("AC3F");
  });

  it("rejects the wrong length", () => {
    expect(RoomCodeSchema.safeParse("AC3").success).toBe(false);
    expect(RoomCodeSchema.safeParse("AC3FF").success).toBe(false);
  });

  it("rejects characters excluded for being ambiguous", () => {
    // O, I, L, S, B, Z, 0, 1, 2, 5, 8 are deliberately not in the alphabet.
    for (const code of ["AC0F", "AC1F", "ACOF", "ACIF", "ACLF", "ACBF"]) {
      expect(RoomCodeSchema.safeParse(code).success).toBe(false);
    }
  });

  it("rejects non-strings", () => {
    expect(RoomCodeSchema.safeParse(1234).success).toBe(false);
    expect(RoomCodeSchema.safeParse(null).success).toBe(false);
  });
});

describe("PlayerNameSchema", () => {
  it("accepts an ordinary name", () => {
    expect(PlayerNameSchema.parse("Ali")).toBe("Ali");
  });

  it("keeps non-Latin scripts intact", () => {
    expect(PlayerNameSchema.parse("علی")).toBe("علی");
    expect(PlayerNameSchema.parse("さくら")).toBe("さくら");
  });

  it("trims rather than rejecting padded input", () => {
    expect(PlayerNameSchema.parse("  Sara  ")).toBe("Sara");
  });

  it("strips control characters instead of failing", () => {
    // Built from char codes so this file contains no invisible characters.
    const bell = String.fromCharCode(0x07);
    const nul = String.fromCharCode(0x00);
    expect(PlayerNameSchema.parse(`Re${bell}za`)).toBe("Reza");
    expect(PlayerNameSchema.parse(`A${nul}li`)).toBe("Ali");
  });

  it("strips zero-width and bidi-override characters", () => {
    // These can spoof another player's name on the shared screen.
    const zeroWidth = String.fromCharCode(0x200b);
    const rtlOverride = String.fromCharCode(0x202e);
    const bom = String.fromCharCode(0xfeff);
    expect(PlayerNameSchema.parse(`Ali${zeroWidth}Sara`)).toBe("AliSara");
    expect(PlayerNameSchema.parse(`${rtlOverride}Ali`)).toBe("Ali");
    expect(PlayerNameSchema.parse(`Sa${bom}ra`)).toBe("Sara");
  });

  it("rejects a name that is empty once sanitised", () => {
    const zeroWidth = String.fromCharCode(0x200b);
    expect(PlayerNameSchema.safeParse("   ").success).toBe(false);
    expect(PlayerNameSchema.safeParse(zeroWidth + zeroWidth).success).toBe(false);
  });

  it("rejects an over-long name", () => {
    expect(PlayerNameSchema.safeParse("x".repeat(17)).success).toBe(false);
  });
});

describe("SessionActionSchema", () => {
  it("accepts each supported action", () => {
    const actions = [
      { type: "set-ready", ready: true },
      { type: "start-game" },
      { type: "rematch" },
      { type: "return-to-lobby" },
      { type: "leave" },
      { type: "kick-player", playerId: "abc" },
    ];
    for (const action of actions) {
      expect(SessionActionSchema.safeParse(action).success).toBe(true);
    }
  });

  it("rejects an unknown action type", () => {
    expect(SessionActionSchema.safeParse({ type: "delete-everything" }).success).toBe(false);
  });

  it("rejects a known action with the wrong payload", () => {
    expect(SessionActionSchema.safeParse({ type: "set-ready", ready: "yes" }).success).toBe(false);
    expect(SessionActionSchema.safeParse({ type: "set-ready" }).success).toBe(false);
  });

  it("rejects a profile with an avatar outside the allowed set", () => {
    const result = SessionActionSchema.safeParse({
      type: "set-profile",
      name: "Ali",
      avatar: "<script>",
      color: "#ff5d5d",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a colour outside the palette", () => {
    const result = SessionActionSchema.safeParse({
      type: "set-profile",
      name: "Ali",
      avatar: "🦊",
      color: "#123456",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-object payload", () => {
    for (const payload of [null, undefined, "start-game", 42, []]) {
      expect(SessionActionSchema.safeParse(payload).success).toBe(false);
    }
  });
});

describe("SessionSettingsPatchSchema", () => {
  it("accepts a partial patch", () => {
    expect(SessionSettingsPatchSchema.safeParse({ botCount: 2 }).success).toBe(true);
    expect(SessionSettingsPatchSchema.safeParse({}).success).toBe(true);
  });

  it("rejects values outside the platform limits", () => {
    expect(SessionSettingsPatchSchema.safeParse({ maxPlayers: 99 }).success).toBe(false);
    expect(SessionSettingsPatchSchema.safeParse({ maxPlayers: 0 }).success).toBe(false);
    expect(SessionSettingsPatchSchema.safeParse({ botCount: -1 }).success).toBe(false);
  });

  it("rejects non-integer counts", () => {
    expect(SessionSettingsPatchSchema.safeParse({ botCount: 1.5 }).success).toBe(false);
  });
});

describe("JoinOptionsSchema", () => {
  it("accepts the two roles", () => {
    expect(JoinOptionsSchema.safeParse({ role: "host" }).success).toBe(true);
    expect(JoinOptionsSchema.safeParse({ role: "controller" }).success).toBe(true);
  });

  it("rejects an invented role", () => {
    expect(JoinOptionsSchema.safeParse({ role: "admin" }).success).toBe(false);
  });
});
