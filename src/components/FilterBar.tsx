import { Input } from "@/components/ui/input";
import type { Filters } from "../lib/filter";
import type { LeagueMeta } from "../types";

type SportChip = {
  slug: string;
  label: string;
  emoji: string;
};

type Props = {
  filters: Filters;
  sports: SportChip[];
  leagues: LeagueMeta[];
  dates: string[];
  today: string;
  dateLabel: (ymd: string) => string;
  onChange: (filters: Filters) => void;
};

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string | (string | number)[];
}) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

export function FilterBar({ filters, sports, leagues, dates, today, dateLabel, onChange }: Props) {
  const leagueChoices = leagues.filter((league) => !filters.sport || league.sport === filters.sport);
  return (
    <div className="tools">
      <label className="search" htmlFor="guide-search">
        <span className="sr-only">Search teams, leagues, channels, or streaming services</span>
        <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <Input
          id="guide-search"
          value={filters.query}
          placeholder="Team, league, channel, or service"
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
        />
      </label>

      <div className="scroller" role="toolbar" aria-label="Filters">
        <Chip pressed={filters.watch} onClick={() => onChange({ ...filters, watch: !filters.watch })}>
          ★ Must Watch
        </Chip>
        <Chip pressed={filters.onTv} onClick={() => onChange({ ...filters, onTv: !filters.onTv })}>
          On TV
        </Chip>
        <Chip
          pressed={filters.sport === "" && filters.league === ""}
          onClick={() => onChange({ ...filters, sport: "", league: "" })}
        >
          All
        </Chip>
        {sports.map((sport) => (
          <Chip
            key={sport.slug}
            pressed={filters.sport === sport.slug}
            onClick={() =>
              onChange({
                ...filters,
                sport: filters.sport === sport.slug ? "" : sport.slug,
                league: "",
              })
            }
          >
            {`${sport.emoji} ${sport.label}`}
          </Chip>
        ))}
      </div>

      {filters.sport && leagueChoices.length > 1 ? (
        <div className="scroller leagues" role="toolbar" aria-label="Leagues">
          <Chip pressed={filters.league === ""} onClick={() => onChange({ ...filters, league: "" })}>
            Every league
          </Chip>
          {leagueChoices.map((league) => (
            <Chip
              key={league.slug}
              pressed={filters.league === league.slug}
              onClick={() =>
                onChange({
                  ...filters,
                  league: filters.league === league.slug ? "" : league.slug,
                  sport: league.sport,
                })
              }
            >
              {`${league.emoji} ${league.label}`}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="scroller dates" role="toolbar" aria-label="Dates">
        <Chip pressed={filters.date === ""} onClick={() => onChange({ ...filters, date: "" })}>
          All days
        </Chip>
        {dates.map((date) => (
          <Chip key={date} pressed={filters.date === date} onClick={() => onChange({ ...filters, date: filters.date === date ? "" : date })}>
            {`${dateLabel(date)}${date === today ? " · today" : ""}`}
          </Chip>
        ))}
      </div>
    </div>
  );
}
