# @bazimazi/partyframe-client

Web half of [partyframe](https://github.com/bazimazi/party-frame): the shared
screen and the phone controllers.

```tsx
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
  scene: () => import("./TapScene.js").then((m) => m.TapScene),
});

createRoot(document.getElementById("root")!).render(
  <PartyApp games={[tapWeb]} messages={{ en: { "game.tap.name": "Tap Race" } }} />,
);
```

You get `/game` (TV), `/join` (type a code) and `/join/:code` (QR scan). Only
`id` and `Controller` are required on a web game.

Peers: `react`, `react-dom`, `react-router-dom`. Add `phaser` for canvas scenes;
it stays behind the `scene` dynamic import and never reaches a phone's bundle.

See the [root README](https://github.com/bazimazi/party-frame#readme) for the
full API.
