/**
 * End-of-match results.
 *
 * The winner is stated in words, not only implied by position: a podium alone is
 * ambiguous from the back of a room, and a tie has no podium at all. The rematch
 * button is the primary action because nobody has to rescan anything - the
 * session, its code and every seat survive into the next match.
 */

import type { ClientPlayer } from "@partyframe/protocol";
import { useT } from "../i18n/I18nProvider.js";
import { PlayerAvatar } from "../ui/common.js";

export function ResultsView({
  players,
  winnerId,
  onRematch,
  onLobby,
}: {
  players: ClientPlayer[];
  /** Empty when the match ended in a genuine score tie. */
  winnerId: string;
  onRematch: () => void;
  onLobby: () => void;
}) {
  const t = useT();
  const ranked = [...players].sort((a, b) => b.score - a.score || a.seat - b.seat);
  const winner = ranked.find((player) => player.id === winnerId);

  return (
    <div className="results">
      <h1 className="results__title">
        {winner ? t("host.winner", { name: winner.name }) : t("host.winnerTie")}
      </h1>

      {winner && (
        <div className="results__winner" style={{ "--player-color": winner.color } as React.CSSProperties}>
          <PlayerAvatar player={winner} size={120} />
          <span className="results__trophy" aria-hidden="true">
            🏆
          </span>
        </div>
      )}

      <h2 className="results__subtitle">{t("host.finalScores")}</h2>

      <ol className="results__list">
        {ranked.map((player, index) => (
          <li
            key={player.id}
            className="results__row"
            style={{ "--player-color": player.color } as React.CSSProperties}
          >
            <span className="results__rank">{index + 1}</span>
            <PlayerAvatar player={player} size={48} />
            <span className="results__name">
              {player.name}
              {player.isBot && <span className="tag tag--bot">BOT</span>}
            </span>
            <span className="results__score">{player.score}</span>
          </li>
        ))}
      </ol>

      <div className="results__actions">
        <button type="button" className="btn btn--primary btn--big" onClick={onRematch}>
          {t("host.playAgain")}
        </button>
        <button type="button" className="btn btn--ghost btn--big" onClick={onLobby}>
          {t("host.backToLobby")}
        </button>
      </div>
    </div>
  );
}
