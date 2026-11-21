import { matchingFavorites } from "./favorites.mjs";
import { formatEt } from "./time.mjs";

const STAGE_LABELS = {
  "league-phase": "League phase",
  "group-stage": "Group stage",
  "round-of-16": "Round of 16",
  "round-of-32": "Round of 32",
  "quarter-finals": "Quarterfinals",
  quarterfinals: "Quarterfinals",
  "semi-finals": "Semifinals",
  semifinals: "Semifinals",
  final: "Final",
  "knockout-round": "Knockout round",
  knockout: "Knockout",
  playoffs: "Playoffs",
  playoff: "Playoff",
  "post-season": "Postseason",
  postseason: "Postseason",
  bowls: "Bowls",
  bowl: "Bowl",
  "wild-card": "Wild card",
  "conference-championships": "Conference championships",
};

const WEEK_LEAGUES = new Set(["nfl", "college-football"]);

export function stageFor(league, event) {
  const week = event?.week?.number;
  if (WEEK_LEAGUES.has(league.slug) && typeof week === "number") {
    return `Week ${week}`;
  }
  const slug = event?.season?.slug;
  return STAGE_LABELS[slug] ?? null;
}

export function mapStatus(status) {
  const name = String(status?.type?.name ?? "");
  const state = String(status?.type?.state ?? "");
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("DELAY")) return "delayed";
  if (name.includes("SUSPEND")) return "other";
  if (name.includes("CANCEL") || name.includes("ABANDON")) return "canceled";
  if (state === "in") return "in-progress";
  if (state === "post") return "final";
  if (state === "pre") return "scheduled";
  return "other";
}

function hexColor(team) {
  const raw = String(team?.color ?? "").replace("#", "").trim();
  const alt = String(team?.alternateColor ?? "").replace("#", "").trim();
  const pick = raw && raw.toLowerCase() !== "000000" ? raw : alt;
  if (!/^[0-9a-fA-F]{6}/.test(pick)) return null;
  return `#${pick.slice(0, 6).toLowerCase()}`;
}

function rankOf(competitor) {
  const current = competitor?.curatedRank?.current;
  if (typeof current !== "number" || current <= 0 || current >= 99) return null;
  return current;
}

function recordOf(competitor) {
  const records = competitor?.records ?? [];
  const overall = records.find((record) => record.type === "total" || record.name === "overall");
  return overall?.summary ?? null;
}

function scoreOf(competitor, status) {
  if (status !== "in-progress" && status !== "final") return null;
  if (competitor?.score == null || competitor.score === "") return null;
  return String(competitor.score);
}

function isTbd(team) {
  const name = team.name.trim().toLowerCase();
  const abbreviation = (team.abbreviation ?? "").trim().toLowerCase();
  return name === "tbd" || abbreviation === "tbd" || name === "to be determined";
}

function initials(name) {
  const letters = name
    .split(/\s+/)
    .filter((part) => part && part !== "vs" && part !== "vs.")
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return letters.slice(0, 3) || "—";
}

function baseTeam(competitor, status) {
  const team = competitor?.team;
  const athlete = competitor?.athlete;
  if (team?.displayName) {
    return {
      id: String(team.id ?? competitor.id ?? ""),
      name: team.displayName,
      shortName: team.shortDisplayName || team.name || team.displayName,
      abbreviation: team.abbreviation || initials(team.displayName),
      homeAway: competitor.homeAway === "home" || competitor.homeAway === "away" ? competitor.homeAway : null,
      rank: rankOf(competitor),
      record: recordOf(competitor),
      score: scoreOf(competitor, status),
      color: hexColor(team),
      logo: team.logo || null,
    };
  }
  if (athlete) {
    const name = athlete.displayName || athlete.fullName || "TBD";
    return {
      id: String(athlete.id ?? competitor.id ?? ""),
      name,
      shortName: athlete.shortName || name,
      abbreviation: initials(name),
      homeAway: null,
      rank: null,
      record: recordOf(competitor),
      score: scoreOf(competitor, status),
      color: null,
      logo: null,
    };
  }
  return null;
}

function withFavorite(team, league, favorites) {
  const hits = matchingFavorites(team, league, favorites);
  return {
    team: { ...team, favorite: hits.length > 0 },
    hits,
  };
}

function displayChannel(raw, channelNames) {
  return channelNames[raw] ?? raw;
}

function kindOf(shortName) {
  const value = String(shortName ?? "").toLowerCase();
  if (value === "tv") return "tv";
  if (value.includes("stream")) return "streaming";
  return null;
}

export function pickBroadcasts(geos, channelNames) {
  const list = Array.isArray(geos) ? geos : [];
  const us = list.filter((item) => !item?.region || item.region === "us");
  const chosen = us.length > 0 ? us : list;
  const broadcasts = [];
  const seen = new Set();
  for (const item of chosen) {
    const kind = kindOf(item?.type?.shortName);
    const raw = item?.media?.shortName?.trim();
    if (!kind || !raw) continue;
    const name = displayChannel(raw, channelNames);
    const market = String(item?.market?.type ?? "national").toLowerCase();
    const region = item?.region || (us.length > 0 ? "us" : "unknown");
    const key = `${kind}|${name.toLowerCase()}|${market}|${region}`;
    if (seen.has(key)) continue;
    seen.add(key);
    broadcasts.push({
      name,
      kind,
      market,
      region,
      lang: item?.lang ?? null,
      origin: "listed",
    });
  }
  const marketOrder = { national: 0, home: 1, away: 2 };
  const kindOrder = { tv: 0, streaming: 1 };
  broadcasts.sort((a, b) => {
    const marketDelta = (marketOrder[a.market] ?? 3) - (marketOrder[b.market] ?? 3);
    if (marketDelta !== 0) return marketDelta;
    return (kindOrder[a.kind] ?? 2) - (kindOrder[b.kind] ?? 2);
  });
  return broadcasts;
}

function uniqueNames(broadcasts, kind) {
  const names = [];
  for (const broadcast of broadcasts) {
    if (broadcast.kind !== kind || names.includes(broadcast.name)) continue;
    names.push(broadcast.name);
  }
  return names;
}

function venueName(event, competition) {
  return competition?.venue?.fullName || event?.venue?.displayName || null;
}

function pickLink(event, competition) {
  const groups = [competition?.links, event?.links];
  for (const links of groups) {
    if (!Array.isArray(links)) continue;
    for (const link of links) {
      const rel = link?.rel ?? [];
      if (typeof link?.href === "string" && link.href.startsWith("http") && (rel.includes("summary") || rel.includes("desktop"))) {
        return link.href;
      }
    }
  }
  for (const links of groups) {
    if (!Array.isArray(links)) continue;
    for (const link of links) {
      if (typeof link?.href === "string" && link.href.startsWith("http")) return link.href;
    }
  }
  return null;
}

function sortTeams(teams) {
  const order = { away: 0, home: 1 };
  teams.sort((a, b) => (order[a.homeAway] ?? 2) - (order[b.homeAway] ?? 2));
}

function finishListing({ id, start, when, league, event, competition, teams, hits, broadcasts, format, name, shortName }) {
  const channels = uniqueNames(broadcasts, "tv");
  const streaming = uniqueNames(broadcasts, "streaming");
  const listed = [];
  for (const broadcast of broadcasts) {
    if (!listed.includes(broadcast.name)) listed.push(broadcast.name);
  }
  const stage = stageFor(league, event);
  const favoriteIds = [];
  const favoriteNames = [];
  for (const hit of hits) {
    if (favoriteIds.includes(hit.id)) continue;
    favoriteIds.push(hit.id);
    favoriteNames.push(hit.name);
  }
  const competitionLabel = league.competition;
  const where = listed.length > 0 ? listed.join(", ") : "channel not announced";
  const stageBit = stage ? ` · ${stage}` : "";
  return {
    id,
    date: when.date,
    start: new Date(start).toISOString(),
    timeEt: when.timeEt,
    timeZoneAbbr: when.timeZoneAbbr,
    weekday: when.weekday,
    dateLabel: when.dateLabel,
    sport: league.sportLabel,
    sportSlug: league.sport,
    emoji: league.emoji,
    league: league.label,
    leagueSlug: league.slug,
    competition: competitionLabel,
    stage,
    season: event?.season?.slug ?? null,
    week: typeof event?.week?.number === "number" ? event.week.number : null,
    name,
    shortName: shortName || name,
    format,
    status: mapStatus(competition?.status || event?.status),
    statusDetail: competition?.status?.type?.shortDetail || event?.status?.type?.shortDetail || event?.status?.type?.description || "",
    venue: venueName(event, competition),
    teams,
    broadcasts,
    channels,
    streaming,
    broadcastSummary: listed.length > 0 ? listed.join(" · ") : null,
    favorite: favoriteIds.length > 0,
    favoriteIds,
    favoriteNames,
    color: league.color,
    headline: `${when.dateLabel} · ${when.timeEt} ET · ${name} · ${league.label}${stageBit} · ${where}`,
    link: pickLink(event, competition),
  };
}

export function normalizeCompetition(event, competition, league, favorites, channelNames) {
  const start = competition?.date || event?.date;
  if (!start) return null;
  const status = mapStatus(competition?.status || event?.status);
  const built = [];
  for (const competitor of competition?.competitors ?? []) {
    const base = baseTeam(competitor, status);
    if (base) built.push(withFavorite(base, league, favorites));
  }
  const teams = built.map((item) => item.team);
  if (teams.length < 2 || teams.every(isTbd)) return null;
  sortTeams(teams);
  const hits = built.flatMap((item) => item.hits);
  return finishListing({
    id: String(competition?.id || event?.id),
    start,
    when: formatEt(start),
    league,
    event,
    competition,
    teams,
    hits,
    broadcasts: pickBroadcasts(competition?.geoBroadcasts, channelNames),
    format: "teams",
    name: event?.name || teams.map((team) => team.name).join(" at "),
    shortName: event?.shortName || event?.name,
  });
}

export function normalizeFightCard(event, league, favorites, channelNames) {
  const competitions = event?.competitions ?? [];
  if (!event?.date || competitions.length === 0) return null;
  const main = [...competitions].reverse().find((competition) => (competition.competitors ?? []).length >= 2) ?? competitions[0];
  const status = mapStatus(event.status);
  const built = [];
  for (const competitor of main?.competitors ?? []) {
    const base = baseTeam(competitor, status);
    if (base) built.push(withFavorite(base, league, favorites));
  }
  const teams = built.map((item) => item.team);
  if (teams.length < 2) return null;
  const geos = competitions.flatMap((competition) => competition.geoBroadcasts ?? []);
  return finishListing({
    id: String(event.id),
    start: event.date,
    when: formatEt(event.date),
    league,
    event,
    competition: main,
    teams,
    hits: built.flatMap((item) => item.hits),
    broadcasts: pickBroadcasts(geos, channelNames),
    format: "fight",
    name: event.name,
    shortName: event.shortName || event.name,
  });
}

export function listingsFromScoreboard(json, league, favorites, channelNames) {
  const events = json?.events ?? [];
  const listings = [];
  if (league.mode === "fight-card") {
    for (const event of events) {
      const listing = normalizeFightCard(event, league, favorites, channelNames);
      if (listing) listings.push(listing);
    }
  } else {
    for (const event of events) {
      for (const competition of event?.competitions ?? []) {
        const listing = normalizeCompetition(event, competition, league, favorites, channelNames);
        if (listing) listings.push(listing);
      }
    }
  }
  return { listings, capped: events.length >= 1000 };
}
