# @bazimazi/partyframe-server

Server package: Colyseus session room, `defineGame`, and `listen()`.

```ts
import { defineGame, listen } from "@bazimazi/partyframe-server";

await listen({ defaultGameId: "tap", games: [tapAdapter] });
```
