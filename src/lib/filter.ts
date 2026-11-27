import type { GuideEvent } from "../types";

export type Filters = {
  query: string;
  watch: boolean;
  onTv: boolean;
  sport: string;
  league: string;
  date: string;
};

export const defaultFilters: Filters = {
  query: "",
  watch: false,
  onTv: true,
  sport: "",
  league: "",
  date: "",
};

export function readFilters(search: string, today = ""): Filters {
  const params = new URLSearchParams(search);
  const dateParam = params.get("date");
  let date = today;
  if (dateParam === "all") date = "";
  else if (dateParam) date = dateParam;
  else if (!today) date = "";
  return {
    query: params.get("q") ?? "",
    watch: params.get("watch") === "1" || params.get("mine") === "1",
    onTv: params.get("tv") !== "0",
    sport: params.get("sport") ?? "",
    league: params.get("league") ?? "",
    date,
  };
}

export function filtersToSearch(filters: Filters, today = ""): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.watch) params.set("watch", "1");
  if (!filters.onTv) params.set("tv", "0");
  if (filters.sport) params.set("sport", filters.sport);
  if (filters.league) params.set("league", filters.league);
  if (!filters.date) params.set("date", "all");
  else if (filters.date !== today) params.set("date", filters.date);
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
    event.session ?? "",
    ...event.channels,
    ...event.streaming,
    ...event.broadcasts.map((broadcast) => broadcast.name),
    ...event.teams.flatMap((team) => [team.name, team.shortName, team.abbreviation]),
  ]
    .join(" ")
    .toLowerCase();
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

export function passesView(event: GuideEvent, filters: Filters): boolean {
  if (filters.date && event.date !== filters.date) return false;
  if (filters.sport && event.sportSlug !== filters.sport) return false;
  if (filters.league && event.leagueSlug !== filters.league) return false;
  if (!matchesQuery(event, filters.query)) return false;
  return true;
}

function showsWithoutBroadcast(event: GuideEvent): boolean {
  if (event.favorite || event.mustWatch) return true;
  if (event.format !== "race" || !event.session || event.session === "Race") return false;
  return true;
}

export function applyFilters(events: GuideEvent[], filters: Filters): GuideEvent[] {
  return events.filter((event) => {
    if (!passesView(event, filters)) return false;
    if (filters.onTv && !hasListing(event) && !showsWithoutBroadcast(event)) return false;
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
