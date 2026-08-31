import { createRoot } from "react-dom/client";
import { addMessages, bindKit, PartyApp } from "@bazimazi/partyframe-client";
import "@bazimazi/partyframe-client/styles.css";
import { TapSceneClass, tapWeb } from "./tapWeb.js";

addMessages("en", {
  "game.tap.name": "Tap Race",
});

bindKit({
  getWebGame: (gameId) => (gameId === "tap" ? tapWeb : undefined),
  loadSceneForGame: async (gameId) => (gameId === "tap" ? TapSceneClass : null),
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(<PartyApp />);
