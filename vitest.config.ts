import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@partyframe/protocol": new URL("./packages/protocol/src/index.ts", import.meta.url).pathname,
      "@partyframe/game-core": new URL("./packages/game-core/src/index.ts", import.meta.url).pathname,
      "@bazimazi/partyframe-server": new URL("./packages/partyframe-server/src/index.ts", import.meta.url).pathname,
      "@bazimazi/partyframe-client": new URL("./packages/partyframe-client/src/index.ts", import.meta.url).pathname,
      "@partyframe/i18n": new URL("./packages/i18n/src/index.ts", import.meta.url).pathname,
    },
  },
});
