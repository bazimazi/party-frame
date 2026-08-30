import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@party-frame/protocol": new URL("./packages/protocol/src/index.ts", import.meta.url).pathname,
      "@party-frame/game-core": new URL("./packages/game-core/src/index.ts", import.meta.url).pathname,
      "@party-frame/runtime": new URL("./packages/runtime/src/index.ts", import.meta.url).pathname,
      "@party-frame/kit": new URL("./packages/kit/src/index.ts", import.meta.url).pathname,
      "@party-frame/i18n": new URL("./packages/i18n/src/index.ts", import.meta.url).pathname,
    },
  },
});
