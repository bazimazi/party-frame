/**
 * Shape of `GET /api/config`. Shared by the hook and tests so the fallback
 * cannot quietly grow a game id.
 */

export interface ServerConfigResponse {
  publicBaseUrl: string;
  defaultGameId: string;
  games: Array<{ id: string; nameKey: string; minPlayers: number; maxPlayers: number }>;
  devTools: boolean;
}

/** Used when the request fails or has not returned. Names no game. */
export const SERVER_CONFIG_FALLBACK: ServerConfigResponse = {
  publicBaseUrl: "",
  defaultGameId: "",
  games: [],
  devTools: false,
};
