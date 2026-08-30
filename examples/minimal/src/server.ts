import { listen } from "@party-frame/runtime";
import { tapAdapter } from "./tapAdapter.js";

const port = Number(process.env.PORT ?? 2567);

await listen({
  defaultGameId: "tap",
  games: [tapAdapter],
  port,
});

console.info(`party-frame example: server :${port} — open http://<this-machine>:5173/game on the TV`);
