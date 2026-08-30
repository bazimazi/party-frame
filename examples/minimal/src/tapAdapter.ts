import { MapSchema, Schema, type } from "@colyseus/schema";
import { SessionSchema, setIfChanged, type GameNetworkAdapter } from "@party-frame/runtime";
import { tapGame, type TapState } from "./tapGame.js";

class TapPublicSchema extends Schema {
  @type({ map: "number" }) taps = new MapSchema<number>();
  @type("string") winnerId = "";
}

class TapSessionSchema extends SessionSchema {
  @type(TapPublicSchema) game = new TapPublicSchema();
}

export const tapAdapter: GameNetworkAdapter = {
  game: tapGame,
  createState: () => new TapSessionSchema(),
  project(state, publicState) {
    const session = state as TapSessionSchema;
    const next = publicState as TapState;
    for (const [id, count] of Object.entries(next.taps)) {
      if (session.game.taps.get(id) !== count) session.game.taps.set(id, count);
    }
    setIfChanged(session.game, "winnerId", next.winnerId);
  },
};
