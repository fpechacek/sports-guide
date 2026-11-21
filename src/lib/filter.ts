import type { GuideEvent } from "../types";

export type Filters = {
  query: string;
  mine: boolean;
  onTv: boolean;
  sport: string;
  league: string;
  date: string;
};

export const defaultFilters: Filters = {
  query: "",
  mine: false,
  onTv: true,
  sport: "",
  league: "",
  date: "",
};

export function readFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  return {
    query: params.get("q") ?? "",
    mine: params.get("mine") === "1",
    onTv: params.get("tv") !== "0",
    sport: params.get("sport") ?? "",
    league: params.get("league") ?? "",
    date: params.get("date") ?? "",
  };
}

export function filtersToSearch(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.mine) params.set("mine", "1");
  if (!filters.onTv) params.set("tv", "0");
  if (filters.sport) params.set("sport", filters.sport);
  if (filters.league) params.set("league", filters.league);
  if (filters.date) params.set("date", filters.date);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function hasListing(event: GuideEvent): boolean {
  return event.channels.length > 0 || event.streaming.length > 0;
}

export function matchesQuery(event: GuideEvent, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    event.name,
    event.shortName,
    event.sport,
    event.league,
    event.competition,
    event.stage ?? "",
    event.venue ?? "",
    event.broadcastSummary ?? "",
    ...event.channels,
    ...event.streaming,
    ...event.broadcasts.map((broadcast) => broadcast.name),
    ...event.teams.flatMap((team) => [team.name, team.shortName, team.abbreviation]),
  ]
    .join(" ")
    .toLowerCase();
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

export function applyFilters(events: GuideEvent[], filters: Filters): GuideEvent[] {
  return events.filter((event) => {
    if (filters.mine && !event.favorite) return false;
    if (filters.date && event.date !== filters.date) return false;
    if (filters.sport && event.sportSlug !== filters.sport) return false;
    if (filters.league && event.leagueSlug !== filters.league) return false;
    if (filters.onTv && !event.favorite && !hasListing(event)) return false;
    if (!matchesQuery(event, filters.query)) return false;
    return true;
  });
}

export function favoritePreview(events: GuideEvent[], filters: Filters): GuideEvent[] {
  return events.filter((event) => {
    if (!event.favorite) return false;
    if (event.status === "final" || event.status === "canceled") return false;
    if (filters.date && event.date !== filters.date) return false;
    if (filters.sport && event.sportSlug !== filters.sport) return false;
    if (filters.league && event.leagueSlug !== filters.league) return false;
    if (!matchesQuery(event, filters.query)) return false;
    return true;
  });
}

export function groupByDate(events: GuideEvent[]): { date: string; label: string; events: GuideEvent[] }[] {
  const groups: { date: string; label: string; events: GuideEvent[] }[] = [];
  for (const event of events) {
    const last = groups.at(-1);
    if (!last || last.date !== event.date) {
      groups.push({ date: event.date, label: event.dateLabel, events: [event] });
    } else {
      last.events.push(event);
    }
  }
  return groups;
}
