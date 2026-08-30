# party-frame

TV-plus-phones party-game framework. The shared screen is the game; phones are
the controllers.

## Install

```bash
npm install @party-frame/runtime   # server
npm install @party-frame/kit       # TV + phones
npm install @party-frame/game-core # game rules (optional if you only host)
```

Peer dependencies for the web app: `react`, `react-dom`, `react-router-dom`.
Add `phaser` if you ship a canvas scene.

## Quick start

### Server

```ts
import { listen } from "@party-frame/runtime";
import { tapAdapter } from "./tapAdapter.js";

await listen({
  defaultGameId: "tap",
  games: [tapAdapter],
});
```

### Web

```tsx
import { createRoot } from "react-dom/client";
import { addMessages, bindKit, PartyApp } from "@party-frame/kit";
import "@party-frame/kit/styles.css";

addMessages("en", { "game.tap.name": "Tap Race" });
bindKit({ getWebGame, loadSceneForGame });
createRoot(document.getElementById("root")!).render(<PartyApp />);
```

That gives you `/game` (TV), `/join` (type a code), and `/join/:code` (QR).

## Write a game

```ts
import { defineGame } from "@party-frame/game-core";
import { z } from "zod";

export const tapGame = defineGame({
  id: "tap",
  nameKey: "game.tap.name",
  minPlayers: 1,
  maxPlayers: 8,
  actionSchema: z.object({ type: z.literal("tap") }),
  parseOptions: () => ({}),
  createState: () => ({ taps: {}, winnerId: "" }),
  start(ctx) {
    ctx.requestStatus("PLAYING");
  },
  handleAction(ctx, playerId) {
    ctx.state.taps[playerId] = (ctx.state.taps[playerId] ?? 0) + 1;
    return true;
  },
  update() {},
  isFinished(ctx) {
    return Boolean(ctx.state.winnerId);
  },
  getControllerState(ctx, playerId) {
    return { active: true, game: { taps: ctx.state.taps[playerId] ?? 0 } };
  },
  getPublicState(ctx) {
    return ctx.state;
  },
  createBot(difficulty) {
    return { difficulty, decide: () => ({ action: { type: "tap" }, delayMs: 200 }) };
  },
});
```

Register the same game on the server with `install()` / `listen({ games })`,
and on the web with `bindKit()`. The frame never imports your catalog.

## Try it

```bash
npm install
npm run example
```

Open `http://<this-machine>:5173/game` on a TV or laptop. Use the LAN address,
not `localhost`, so phones can scan the QR code.

## Packages

| Install this | When |
| --- | --- |
| `@party-frame/runtime` | Node / Colyseus host |
| `@party-frame/kit` | React TV + phone UI |
| `@party-frame/game-core` | Authoring `PartyGame` rules |

`protocol` and `i18n` ship as transitive dependencies. You do not install them
directly.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for developing this repo.
