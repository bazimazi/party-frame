import { describe, expect, it } from "vitest";
import { SERVER_CONFIG_FALLBACK } from "@bazimazi/partyframe-client";

describe("SERVER_CONFIG_FALLBACK", () => {
  it("does not name an installed game", () => {
    expect(SERVER_CONFIG_FALLBACK.defaultGameId).toBe("");
    expect(SERVER_CONFIG_FALLBACK.games).toEqual([]);
  });
});
