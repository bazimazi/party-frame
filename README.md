# partyframe

TV-plus-phones party-game framework. The shared screen is the game; phones are
the controllers.

You write the rules. The platform owns sessions, room codes, QR joining,
players, bots, reconnection, the lobby, scoring and the whole session lifecycle.

## Install

```bash
npm install @bazimazi/partyframe-server   # server + game rules
npm install @bazimazi/partyframe-client   # TV + phones
```

Peer dependencies for the web app: `react`, `react-dom`, `react-router-dom`.
Add `phaser` if you ship a canvas scene.

These are the only two packages published to npm. Protocol, game-core and i18n
live in this repo and are bundled into those two.

## Quick start

A whole game is four required fields. Everything else has a default.

```ts
// tapGame.ts — shared rules, no sockets, no Colyseus, no DOM
import { defineGame } from "@bazimazi/partyframe-server";
import { z } from "zod";

export const tapGame = defineGame({
  id: "tap",
  actionSchema: z.object({ type: z.literal("tap") }),
  createState: () => ({ taps: {} as Record<string, number>, winnerId: "" }),
  handleAction(ctx, playerId) {
    ctx.state.taps[playerId] = (ctx.state.taps[playerId] ?? 0) + 1;
    if (ctx.state.taps[playerId]! >= 10) {
      ctx.state.winnerId = playerId;
      ctx.players.addScore(playerId, 1);
    }
    return true;
  },
  isFinished: (ctx) => Boolean(ctx.state.winnerId),
});
```

```ts
// server.ts
import { listen } from "@bazimazi/partyframe-server";
import { tapGame } from "./tapGame.js";

await listen({ games: [tapGame] });
```

```tsx
// web.tsx
import { createRoot } from "react-dom/client";
import { defineWebGame, PartyApp } from "@bazimazi/partyframe-client";
import "@bazimazi/partyframe-client/styles.css";

const tapWeb = defineWebGame({
  id: "tap",
  Controller: ({ envelope, send }) => (
    <button disabled={!envelope.active} onClick={() => send({ type: "tap" })}>
      Tap
    </button>
  ),
});

createRoot(document.getElementById("root")!).render(
  <PartyApp games={[tapWeb]} messages={{ en: { "game.tap.name": "Tap Race" } }} />,
);
```

That gives you `/game` (TV), `/join` (type a code) and `/join/:code` (QR scan).

## The two APIs

### `defineGame(...)` — the rules

Required: `id`, `actionSchema`, `createState`, `handleAction`.

| Optional | Default |
| --- | --- |
| `nameKey` | `game.<id>.name` |
| `minPlayers` / `maxPlayers` | `1` / `8` |
| `parseOptions` | `() => ({})` |
| `start` | enters `PLAYING` |
| `update` | does nothing |
| `isFinished` | never finishes |
| `getPublicState` | the whole state |
| `getControllerState` | `{ active: true, game: null }` |
| `createBot` | an idle bot |
| `onPlayerChanged`, `devCommands` | not called |

`getPublicState()` returns plain data and the platform synchronises it for you.
Nothing about Colyseus reaches a game.

Inside a rule function, `ctx` gives you `state`, `options`, `players`, a seeded
`rng` (never `Math.random`), the authoritative `now`, `emit()` for presentation
cues and `requestStatus()`.

### `defineWebGame(...)` — the screens

Required: `id` (matching the server game) and `Controller`.

Add `scene: () => import("./MyScene.js").then((m) => m.MyScene)` for a Phaser
canvas on the shared screen — written as a dynamic import so neither Phaser nor
your scene reaches a phone's bundle. The scene is an ordinary `Phaser.Scene`
subclass; the platform names it and passes a `StageBridge` to `init()`.

Optional accessors let the shared screen's built-in chrome read your projection:
`winnerId`, `activePlayerId`, `eliminatedIds`, `badges`, `round`, `sfx`.

Type both halves once and everything downstream is typed:

```ts
defineWebGame<TapPublic, TapController>({ ... })
```

### `listen(...)` — the server

```ts
await listen({
  games: [tapGame],       // required
  defaultGameId: "tap",   // defaults to games[0].id
  port: 2567,
  hostname: "0.0.0.0",
  publicBaseUrl: "",      // origin for QR codes when behind a proxy
  maxPlayers: 8,
  sessionTimeoutMs: 600_000,
  sessionMaxAgeMs: 10_800_000,
  devToolsEnabled: process.env.NODE_ENV !== "production",
  log: myLogger,
});
```

## Advanced: custom network state

Public state is synchronised as JSON, and only when it changes. If a game's
projection is large or changes many times a second, install a
`GameNetworkAdapter` instead to get field-level Colyseus patches:

```ts
import { SessionSchema, type GameNetworkAdapter } from "@bazimazi/partyframe-server";

class MySessionSchema extends SessionSchema {
  @type(MyPublicSchema) game = new MyPublicSchema();
}

const adapter: GameNetworkAdapter = {
  game: myGame,
  createState: () => new MySessionSchema(),
  project: (state, publicState) => { /* copy fields */ },
};

await listen({ games: [adapter] });
```

The client picks up the schema field automatically. Pair it with
`normalizePublicState` on the web game to unwrap Colyseus collections into
plain data.

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
| `@bazimazi/partyframe-server` | Node host, `defineGame`, `listen` |
| `@bazimazi/partyframe-client` | React TV + phone UI, `defineWebGame`, `PartyApp` |

See [CONTRIBUTING.md](./CONTRIBUTING.md) for developing this repo.
