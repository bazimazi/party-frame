/**
 * Bootstrap configuration fetched from the game server.
 *
 * Kept to one small request made once per page load. It carries only things the
 * client cannot know on its own: the public base URL for QR codes when the app
 * sits behind a proxy, which games this build has installed, and whether
 * developer tooling is enabled on this server.
 */

import { useEffect, useState } from "react";
import { SERVER_CONFIG_FALLBACK, type ServerConfigResponse } from "./serverConfig.js";
import { resolveServerHttpUrl } from "./endpoint.js";

export type { ServerConfigResponse };

export function useServerConfig(): { config: ServerConfigResponse; loaded: boolean } {
  const [config, setConfig] = useState<ServerConfigResponse>(SERVER_CONFIG_FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`${resolveServerHttpUrl()}/api/config`, { signal: controller.signal })
      .then((response) =>
        response.ok ? (response.json() as Promise<ServerConfigResponse>) : SERVER_CONFIG_FALLBACK,
      )
      .then((value) => {
        setConfig(value);
        setLoaded(true);
      })
      .catch(() => {
        // The fallback is enough to render and to connect; a failed config
        // fetch must not block the shared screen from creating a session.
        setLoaded(true);
      });

    return () => controller.abort();
  }, []);

  return { config, loaded };
}
