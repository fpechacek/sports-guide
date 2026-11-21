import type { CSSProperties } from "react";
import type { Broadcast, GameStatus, GuideEvent, Team } from "../types";
import { splitClock } from "../lib/time";

function pipColor(hex: string | null): string {
  if (!hex) return "#f0c14d";
  const raw = hex.replace("#", "");
  if (raw.length < 6) return "#f0c14d";
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) return "#f0c14d";
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.45 ? hex : "#f0c14d";
}

function orderTeams(teams: Team[]): Team[] {
  const rank: Record<"away" | "home", number> = { away: 0, home: 1 };
  return [...teams].sort((a, b) => {
    const aRank = a.homeAway ? rank[a.homeAway] : 2;
    const bRank = b.homeAway ? rank[b.homeAway] : 2;
    return aRank - bRank;
  });
}

function visibleBroadcasts(event: GuideEvent): { shown: Broadcast[]; extraLocal: number } {
  const national = event.broadcasts.filter((item) => item.market === "national");
  const local = event.broadcasts.filter((item) => item.market !== "national");
  if (national.length === 0) {
    return { shown: local.slice(0, 4), extraLocal: Math.max(0, local.length - 4) };
  }
  const localShown = local.slice(0, 2);
  return { shown: [...national, ...localShown], extraLocal: local.length - localShown.length };
}

function statusWord(status: GameStatus): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "in-progress":
      return "Live";
    case "final":
      return "Final";
    case "postponed":
      return "Postponed";
    case "delayed":
      return "Delayed";
    case "canceled":
      return "Canceled";
    case "other":
      return "Updated";
    default: {
      const neverStatus: never = status;
      return neverStatus;
    }
  }
}

function When({ event }: { event: GuideEvent }) {
  if (event.status === "scheduled" && event.timeTbd) {
    return (
      <div className="when">
        <span className="clock tbd">TBD</span>
        <span className="period">Time</span>
      </div>
    );
  }
  switch (event.status) {
    case "scheduled": {
      const { clock, period } = splitClock(event.timeEt);
      return (
        <div className="when">
          <span className="clock">{clock}</span>
          <span className="period">{period} ET</span>
        </div>
      );
    }
    case "in-progress":
      return (
        <div className="when live">
          <span className="live-dot" aria-hidden="true" />
          Live
        </div>
      );
    case "final":
      return <div className="when ended">Final</div>;
    case "postponed":
      return <div className="when ended">Ppd</div>;
    case "delayed":
      return <div className="when ended">Delay</div>;
    case "canceled":
      return <div className="when ended">Off</div>;
    case "other":
      return <div className="when ended">—</div>;
    default: {
      const neverStatus: never = event.status;
      return neverStatus;
    }
  }
}

function Side({ team, showScore }: { team: Team; showScore: boolean }) {
  return (
    <span className={team.favorite ? "side is-favorite" : "side"}>
      {team.favorite ? <span className="pip" style={{ background: pipColor(team.color) }} aria-hidden="true" /> : null}
      {team.rank != null ? <span className="rank">#{team.rank}</span> : null}
      <span className="abbr">{team.abbreviation}</span>
      {showScore && team.score != null ? <span className="score">{team.score}</span> : null}
    </span>
  );
}

function FightScores({ event }: { event: GuideEvent }) {
  const scored = event.teams.filter((team) => team.score != null);
  if (scored.length === 0) return null;
  return <p className="nicknames">{scored.map((team) => `${team.shortName} ${team.score}`).join(" · ")}</p>;
}

function Matchup({ event, showScore }: { event: GuideEvent; showScore: boolean }) {
  switch (event.format) {
    case "fight":
    case "race":
      return (
        <div className="matchup">
          <p className="fight-name">{event.name}</p>
          {showScore ? <FightScores event={event} /> : null}
        </div>
      );
    case "teams": {
      const [away, home] = orderTeams(event.teams);
      if (!away || !home) return <p className="fight-name">{event.name}</p>;
      const records =
        event.status === "scheduled" && (away.record || home.record)
          ? `${away.record ?? "—"} at ${home.record ?? "—"}`
          : null;
      return (
        <div className="matchup">
          <p className="abbr-line">
            <Side team={away} showScore={showScore} />
            <span className="at">at</span>
            <Side team={home} showScore={showScore} />
          </p>
          <p className="nicknames">
            <span className={away.favorite ? "nick fav" : "nick"}>{away.shortName}</span>
            <span className="nick-dot" aria-hidden="true">
              ·
            </span>
            <span className={home.favorite ? "nick fav" : "nick"}>{home.shortName}</span>
            {records ? <span className="records">{records}</span> : null}
          </p>
        </div>
      );
    }
    default: {
      const neverFormat: never = event.format;
      return neverFormat;
    }
  }
}

function oddsLine(event: GuideEvent): string | null {
  const odds = event.odds;
  if (!odds) return null;
  const parts: string[] = [];
  if (odds.provider) parts.push(odds.provider);
  if (odds.spread) parts.push(odds.spread);
  if (odds.overUnder) parts.push(`O/U ${odds.overUnder}`);
  const money: string[] = [];
  if (odds.awayMoneyline) money.push(`${odds.awayAbbreviation ?? "Away"} ${odds.awayMoneyline}`);
  if (odds.homeMoneyline) money.push(`${odds.homeAbbreviation ?? "Home"} ${odds.homeMoneyline}`);
  if (money.length > 0) parts.push(`ML ${money.join(" / ")}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function Pills({ event }: { event: GuideEvent }) {
  const { shown, extraLocal } = visibleBroadcasts(event);
  if (shown.length === 0) {
    return <p className="unlisted">Channel not announced</p>;
  }
  return (
    <ul className="pills">
      {shown.map((broadcast) => (
        <li
          key={`${broadcast.kind}-${broadcast.market}-${broadcast.name}-${broadcast.region}`}
          className={broadcast.kind === "tv" ? "pill pill-tv" : "pill pill-stream"}
        >
          {broadcast.kind === "streaming" ? "▷ " : ""}
          {broadcast.name}
          {broadcast.market !== "national" ? <span className="pill-note"> local</span> : null}
          {broadcast.region !== "us" ? <span className="pill-note"> {broadcast.region.toUpperCase()}</span> : null}
        </li>
      ))}
      {extraLocal > 0 ? <li className="pill pill-more">+{extraLocal} local</li> : null}
    </ul>
  );
}

export function GameCard({
  event,
  watched,
  scoreOpen,
  onToggleWatch,
  onToggleScore,
}: {
  event: GuideEvent;
  watched: boolean;
  scoreOpen: boolean;
  onToggleWatch: () => void;
  onToggleScore: () => void;
}) {
  const tagStyle = { "--tag": event.color } as CSSProperties;
  const reasons = (event.mustWatchReasons ?? []).slice(0, 3);
  const line = oddsLine(event);
  const canScore =
    (event.status === "in-progress" || event.status === "final") && event.teams.some((team) => team.score != null);
  return (
    <article className={event.favorite ? "card is-favorite" : "card"} data-status={event.status}>
      <When event={event} />
      <div className="card-main">
        <div className="card-top">
          <Matchup event={event} showScore={scoreOpen} />
          <label className="watch-check">
            <input
              type="checkbox"
              checked={watched}
              onChange={onToggleWatch}
              aria-label={watched ? `Remove ${event.shortName} from Must Watch` : `Add ${event.shortName} to Must Watch`}
            />
          </label>
        </div>
        <p className="tags">
          <span className="tag" style={tagStyle}>
            <span aria-hidden="true">{event.emoji}</span> {event.league}
          </span>
          {reasons.map((reason) => (
            <span key={reason.id} className="reason">
              {reason.label}
            </span>
          ))}
          {event.stage ? <span className="stage">{event.stage}</span> : null}
          <span className="sr-only">{statusWord(event.status)}</span>
        </p>
        <Pills event={event} />
        {line ? <p className="odds">{line}</p> : null}
        {canScore ? (
          <button type="button" className="score-toggle" aria-pressed={scoreOpen} onClick={onToggleScore}>
            Score
          </button>
        ) : null}
      </div>
    </article>
  );
}
