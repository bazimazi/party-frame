# @bazimazi/partyframe-server

Server half of [partyframe](https://github.com/bazimazi/party-frame): the game
contract, the session room, and a one-call host.

```ts
import { defineGame, listen } from "@bazimazi/partyframe-server";
import { z } from "zod";

const tapGame = defineGame({
  id: "tap",
  actionSchema: z.object({ type: z.literal("tap") }),
  createState: () => ({ taps: {} as Record<string, number> }),
  handleAction(ctx, playerId) {
    ctx.state.taps[playerId] = (ctx.state.taps[playerId] ?? 0) + 1;
    return true;
  },
});

await listen({ games: [tapGame] });
```

`id`, `actionSchema`, `createState` and `handleAction` are the only required
fields; every other member of a game has a platform default. Public state is
returned as plain data from `getPublicState()` and synchronised for you, so a
game never imports Colyseus.

See the [root README](https://github.com/bazimazi/party-frame#readme) for the
full API, including the `GameNetworkAdapter` escape hatch.
