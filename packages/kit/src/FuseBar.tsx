/**
 * A countdown bar driven by the server's deadline.
 *
 * Animated by writing to the DOM node directly from a `requestAnimationFrame`
 * loop rather than through React state. A 60 fps `setState` would re-render the
 * whole controller sixty times a second on a phone that is also decoding a
 * WebSocket stream, for a value that only affects one CSS transform.
 *
 * The bar is presentational: the server decides when the fuse actually runs out.
 * A client with a slow connection sees the bar reach zero slightly late, which
 * is the correct failure direction.
 */

import { useEffect, useRef } from "react";

export function FuseBar({
  startedAt,
  endsAt,
  serverNow,
  label,
}: {
  /** Server epoch ms the countdown began. */
  startedAt: number;
  /** Server epoch ms the countdown ends. */
  endsAt: number;
  serverNow: () => number;
  label: string;
}) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const total = endsAt - startedAt;
    if (total <= 0) return;

    let frame = 0;
    const step = () => {
      const fill = fillRef.current;
      const root = rootRef.current;
      if (fill && root) {
        const remaining = Math.max(0, endsAt - serverNow());
        const fraction = Math.max(0, Math.min(1, remaining / total));
        fill.style.transform = `scaleX(${fraction})`;
        root.dataset.urgency = fraction < 0.2 ? "critical" : fraction < 0.45 ? "warn" : "calm";
        root.setAttribute("aria-valuenow", String(Math.ceil(remaining / 1000)));
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [startedAt, endsAt, serverNow]);

  return (
    <div
      className="fuse"
      ref={rootRef}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, Math.round((endsAt - startedAt) / 1000))}
    >
      <div className="fuse__fill" ref={fillRef} />
    </div>
  );
}
