import { createRoot } from "react-dom/client";
import { PartyApp } from "@bazimazi/partyframe-client";
import "@bazimazi/partyframe-client/styles.css";
import { tapWeb } from "./tapWeb.js";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <PartyApp games={[tapWeb]} messages={{ en: { "game.tap.name": "Tap Race" } }} />,
);
