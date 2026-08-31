import { listen } from "@bazimazi/partyframe-server";
import { tapAdapter } from "./tapAdapter.js";

const port = Number(process.env.PORT ?? 2567);

await listen({
  defaultGameId: "tap",
  games: [tapAdapter],
  port,
});

console.info(`partyframe example: server :${port} — open http://<this-machine>:5173/game on the TV`);
