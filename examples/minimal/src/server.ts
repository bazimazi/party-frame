import { listen } from "@bazimazi/partyframe-server";
import { tapGame } from "./tapGame.js";

const port = Number(process.env.PORT ?? 2567);

await listen({ games: [tapGame], port });

console.info(`partyframe example: server :${port} — open http://<this-machine>:5173/game on the TV`);
