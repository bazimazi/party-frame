/**
 * The running commentary strip.
 *
 * Events are presentation cues, not state: if one is dropped nothing breaks, and
 * the feed intentionally shows only the last few so a TV never turns into a log
 * viewer. It is announced politely to assistive technology so a player using a
 * screen reader hears who answered and what blew up.
 */

import { useT } from "../i18n/I18nProvider.js";
import type { GameEventMessage } from "@partyframe/protocol";

const VISIBLE = 5;

/** Cues that exist for the game canvas only and would be noise in the feed. */
const HIDDEN_KINDS = new Set(["bomb-auto-passed", "start-refused"]);

export function EventFeed({ events }: { events: GameEventMessage[] }) {
  const t = useT();

  const visible = events
    .filter((event) => event.messageKey && !HIDDEN_KINDS.has(event.kind))
    .slice(-VISIBLE)
    .reverse();

  return (
    <section className="event-feed" aria-label={t("host.events")}>
      <ul className="event-feed__list" aria-live="polite">
        {visible.map((event, index) => (
          <li
            key={`${event.at}-${event.kind}-${index}`}
            className="event-feed__item"
            data-kind={event.kind}
            // The newest line is fully opaque; older ones recede.
            style={{ opacity: 1 - index * 0.18 }}
          >
            {t(event.messageKey!, event.params)}
          </li>
        ))}
      </ul>
    </section>
  );
}
