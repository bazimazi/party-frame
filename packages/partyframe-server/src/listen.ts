/**
 * One-call server bootstrap.
 *
 * Hosts should not have to wire Colyseus, CORS, `/api/config` and room lookup
 * themselves. `listen()` installs games, binds runtime defaults, and serves the
 * HTTP + WebSocket surface the client already talks to.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { PARTY_ROOM } from "@partyframe/protocol";
import { install, listInstalledGames, listInstalledIds, type InstallableGame } from "./catalog.js";
import { EVENT, bindRuntime, runtimeHost, type BindRuntimeInput } from "./bind.js";
import { PartySessionRoom, type RoomMetadata } from "./PartySessionRoom.js";

export interface ListenOptions extends BindRuntimeInput {
  /**
   * The games this server can host, in the order they should be offered.
   *
   * Each entry is a `defineGame()` result, a bare game definition, or - only
   * when a game needs field-level Colyseus patches - a `GameNetworkAdapter`.
   */
  games: InstallableGame[];
  /**
   * Which game a shared screen gets when it does not ask for one.
   * Defaults to the first entry in `games`.
   */
  defaultGameId?: string;
  /** Defaults to 2567. */
  port?: number;
  /** Defaults to `0.0.0.0`, so phones on the LAN can reach it. */
  hostname?: string;
  /** Public origin encoded in QR codes when the page sits behind a proxy. */
  publicBaseUrl?: string;
}

export interface PartyServer {
  gameServer: Server;
  httpServer: ReturnType<typeof createServer>;
  port: number;
  /** Shuts down the HTTP and WebSocket listeners. */
  close(): Promise<void>;
}

export interface PublicServerConfig {
  publicBaseUrl: string;
  defaultGameId: string;
  games: Array<{ id: string; nameKey: string; minPlayers: number; maxPlayers: number }>;
  devTools: boolean;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function publicServerConfig(publicBaseUrl = ""): PublicServerConfig {
  const host = runtimeHost();
  return {
    publicBaseUrl,
    defaultGameId: host.defaultGameId,
    games: listInstalledGames(),
    devTools: host.devToolsEnabled,
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...CORS,
  });
  res.end(JSON.stringify(body));
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  publicBaseUrl: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, publicServerConfig(publicBaseUrl));
    return;
  }

  const roomMatch = /^\/api\/rooms\/([^/]+)$/.exec(url.pathname);
  if (req.method === "GET" && roomMatch) {
    const code = decodeURIComponent(roomMatch[1] ?? "").toUpperCase();
    const rooms = await matchMaker.query({ name: PARTY_ROOM });
    const room = rooms.find(
      (candidate) => (candidate.metadata as RoomMetadata | undefined)?.publicCode === code,
    );
    if (!room) {
      sendJson(res, 404, { error: "ROOM_NOT_FOUND" });
      return;
    }
    const meta = room.metadata as RoomMetadata;
    sendJson(res, 200, {
      roomId: room.roomId,
      roomCode: meta.publicCode,
      gameId: meta.gameId,
      status: meta.status,
      playerCount: meta.playerCount,
      maxPlayers: meta.maxPlayers,
      joinable: meta.status === "LOBBY" && meta.playerCount < meta.maxPlayers,
    });
    return;
  }

  sendJson(res, 404, { error: "NOT_FOUND" });
}

export async function listen(options: ListenOptions): Promise<PartyServer> {
  const { games, port = 2567, hostname = "0.0.0.0", publicBaseUrl = "", ...runtime } = options;

  if (games.length === 0) {
    throw new Error("listen(): `games` is empty - a server with no games can host nothing");
  }

  // Installed first so `defaultGameId` can be inferred from the catalog, and so
  // an unknown explicit default fails here rather than on a player's first join.
  for (const entry of games) install(entry);

  const ids = listInstalledIds();
  const defaultGameId = runtime.defaultGameId ?? ids[0] ?? "";
  if (!ids.includes(defaultGameId)) {
    throw new Error(
      `listen(): defaultGameId "${defaultGameId}" is not among the installed games (${ids.join(", ")})`,
    );
  }

  bindRuntime({ ...runtime, defaultGameId });

  const httpServer = createServer((req, res) => {
    void handleHttp(req, res, publicBaseUrl);
  });

  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
    greet: false,
  });
  gameServer.define(PARTY_ROOM, PartySessionRoom);
  await gameServer.listen(port, hostname);

  runtimeHost().log.info(EVENT.SERVER_STARTED, { port, hostname, defaultGameId });

  return {
    gameServer,
    httpServer,
    port,
    close: () => gameServer.gracefullyShutdown(false),
  };
}
