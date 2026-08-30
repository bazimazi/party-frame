# @party-frame/runtime

Colyseus session room for party-frame.

```ts
import { listen } from "@party-frame/runtime";

await listen({ defaultGameId: "tap", games: [tapAdapter] });
```

`bindRuntime({ defaultGameId })` is enough when you bring your own HTTP server.
See the root README for the full host seam.
