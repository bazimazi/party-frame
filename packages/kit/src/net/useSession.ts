/**
 * React bindings for `SessionConnection`.
 *
 * `useSyncExternalStore` is used rather than local state so every consumer sees
 * exactly one consistent view per commit, and so the connection object itself
 * stays outside React's lifecycle - it must survive a re-render, and it must not
 * be recreated when a parent happens to update.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { SessionAction } from "@party-frame/protocol";
import { SessionConnection, type ConnectOptions, type SessionView } from "./SessionConnection.js";

export interface UseSessionResult extends SessionView {
  connection: SessionConnection;
  sendSessionAction: (action: SessionAction) => void;
  sendGameAction: (action: unknown) => void;
  dismissError: () => void;
  leave: () => void;
}

/**
 * Opens (and owns) one session connection for the lifetime of the component.
 *
 * `options` is captured on first render on purpose: changing the room code means
 * a different session, which is a different route, not a mutation of this one.
 */
export function useSession(options: ConnectOptions | null): UseSessionResult | null {
  const connectionRef = useRef<SessionConnection | null>(null);
  const startedRef = useRef(false);

  if (options && !connectionRef.current) {
    connectionRef.current = new SessionConnection();
  }
  const connection = connectionRef.current;

  useEffect(() => {
    if (!connection || !options || startedRef.current) return;
    startedRef.current = true;
    void connection.connect(options);

    return () => {
      connection.dispose();
      startedRef.current = false;
    };
    // Intentionally runs once: a different session is a different mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!connection) return () => undefined;
      return connection.subscribe(() => listener());
    },
    [connection],
  );

  const getSnapshot = useCallback(
    () => connection?.current ?? EMPTY_VIEW,
    [connection],
  );

  const view = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const api = useMemo(() => {
    if (!connection) return null;
    return {
      connection,
      sendSessionAction: (action: SessionAction) => connection.sendSessionAction(action),
      sendGameAction: (action: unknown) => connection.sendGameAction(action),
      dismissError: () => connection.dismissError(),
      leave: () => void connection.leave(true),
    };
  }, [connection]);

  if (!connection || !api) return null;
  return { ...view, ...api };
}

const EMPTY_VIEW: SessionView = {
  status: "idle",
  error: null,
  snapshot: null,
  controller: null,
  events: [],
  playerId: "",
  roomCode: "",
  latencyMs: 0,
};
