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

function identityFromTeam(team) {
  const full = String(team?.displayName ?? "").trim();
  const short = String(team?.shortDisplayName ?? "").trim() || String(team?.name ?? "").trim();
  const name = full || short;
  if (!name) return null;
  return {
    name,
    shortName: short || name,
    abbreviation: String(team?.abbreviation ?? "").trim() || initials(name),
  };
}

function baseTeam(competitor, status) {
  const team = competitor?.team;
  const athlete = competitor?.athlete;
  const named = team ? identityFromTeam(team) : null;
  if (named) {
    return {
      id: String(team.id ?? competitor.id ?? ""),
      ...named,
      homeAway: competitor.homeAway === "home" || competitor.homeAway === "away" ? competitor.homeAway : null,
      rank: rankOf(competitor),
      record: recordOf(competitor),
      score: scoreOf(competitor, status),
      color: hexColor(team),
      logo: team.logo || null,
      conferenceId: team.conferenceId == null ? null : String(team.conferenceId),
    };
  }
  if (athlete) {
    const full = String(athlete.displayName || athlete.fullName || "").trim();
    const short = String(athlete.shortName || "").trim();
    const name = full || short || "TBD";
    return {
      id: String(athlete.id ?? competitor.id ?? ""),
      name,
      shortName: short || name,
      abbreviation: initials(name),
      homeAway: null,
      rank: null,
      record: recordOf(competitor),
      score: scoreOf(competitor, status),
      color: null,
      logo: null,
      conferenceId: null,
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

function moneyline(side) {
  const odds = side?.close?.odds ?? side?.open?.odds ?? null;
  return odds == null || odds === "" ? null : String(odds);
}

function pickOdds(competition, teams) {
  const odds = competition?.odds?.[0];
  if (!odds) return null;
  const home = teams.find((team) => team.homeAway === "home");
  const away = teams.find((team) => team.homeAway === "away");
  let spread = typeof odds.details === "string" && odds.details.trim() ? odds.details.trim() : null;
  if (!spread && typeof odds.spread === "number" && home) {
    const value = odds.spread > 0 ? `+${odds.spread}` : String(odds.spread);
    spread = `${home.abbreviation} ${value}`;
  }
  const overUnder = odds.overUnder == null || odds.overUnder === "" ? null : String(odds.overUnder);
  const homeMoneyline = moneyline(odds.moneyline?.home);
  const awayMoneyline = moneyline(odds.moneyline?.away);
  const provider = odds.provider?.displayName || odds.provider?.name || null;
  if (!provider && !spread && !overUnder && !homeMoneyline && !awayMoneyline) return null;
  return {
    provider,
    spread,
    overUnder,
    homeMoneyline,
    awayMoneyline,
    homeAbbreviation: home?.abbreviation ?? null,
    awayAbbreviation: away?.abbreviation ?? null,
  };
}

function timeIsTbd(competition, status) {
  if (competition?.timeValid === false) return true;
  const detail = `${status?.type?.shortDetail ?? ""} ${status?.type?.detail ?? ""}`;
  return /\bTBD\b/i.test(detail);
}

function finishListing({ id, start, when, league, event, competition, teams, hits, broadcasts, format, name, shortName, stage, session = null }) {
  const channels = uniqueNames(broadcasts, "tv");
  const streaming = uniqueNames(broadcasts, "streaming");
  const listed = [];
  for (const broadcast of broadcasts) {
    if (!listed.includes(broadcast.name)) listed.push(broadcast.name);
  }
  const stageLabel = stage === undefined ? stageFor(league, event) : stage;
  const favoriteIds = [];
  const favoriteNames = [];
  for (const hit of hits) {
    if (favoriteIds.includes(hit.id)) continue;
    favoriteIds.push(hit.id);
    favoriteNames.push(hit.name);
  }
  const competitionLabel = league.competition;
  const where = listed.length > 0 ? listed.join(", ") : "channel not announced";
  const stageBit = stageLabel ? ` · ${stageLabel}` : "";
  const statusSource = competition?.status || event?.status;
  const timeTbd = timeIsTbd(competition, statusSource);
  const whenText = timeTbd ? "Time TBD" : `${when.timeEt} ET`;
  return {
    id,
    date: when.date,
    start: new Date(start).toISOString(),
    timeEt: when.timeEt,
    timeTbd,
    timeZoneAbbr: when.timeZoneAbbr,
    weekday: when.weekday,
    dateLabel: when.dateLabel,
    sport: league.sportLabel,
    sportSlug: league.sport,
    emoji: league.emoji,
    league: league.label,
    leagueSlug: league.slug,
    competition: competitionLabel,
    stage: stageLabel,
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
    odds: pickOdds(competition, teams),
    favorite: favoriteIds.length > 0,
    favoriteIds,
    favoriteNames,
    color: league.color,
    headline: `${when.dateLabel} · ${whenText} · ${name} · ${league.label}${stageBit} · ${where}`,
    link: pickLink(event, competition),
    session,
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

const NON_FBS_CONFERENCE_IDS = new Set([
  "20",
  "21",
  "22",
  "24",
  "25",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "48",
  "177",
  "179",
]);

function isFbsSlate(listing) {
  const ids = listing.teams.map((team) => team.conferenceId).filter(Boolean);
  if (ids.length === 0) return true;
  return ids.some((id) => !NON_FBS_CONFERENCE_IDS.has(String(id)));
}

function keepListing(listing, league) {
  if (!listing) return false;
  if (league.fbsOnly && !isFbsSlate(listing)) return false;
  return true;
}

const SESSION_LABELS = {
  fp1: "Practice 1",
  p1: "Practice 1",
  "practice 1": "Practice 1",
  fp2: "Practice 2",
  p2: "Practice 2",
  "practice 2": "Practice 2",
  fp3: "Practice 3",
  p3: "Practice 3",
  "practice 3": "Practice 3",
  fp: "Practice",
  practice: "Practice",
  "practice / qualifying": "Practice / Qualifying",
  "practice/qualifying": "Practice / Qualifying",
  qual: "Qualifying",
  q: "Qualifying",
  qualifying: "Qualifying",
  sq: "Sprint Shootout",
  ss: "Sprint Shootout",
  "sprint shootout": "Sprint Shootout",
  "sprint qualifying": "Sprint Shootout",
  sr: "Sprint",
  sprint: "Sprint",
  "sprint race": "Sprint",
  race: "Race",
  r: "Race",
};

export function plainSessionLabel(raw) {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!key) return "";
  if (SESSION_LABELS[key]) return SESSION_LABELS[key];
  const numbered = key.match(/^(practice|qualifying)\s+(\d+)$/);
  if (numbered) {
    const word = numbered[1] === "practice" ? "Practice" : "Qualifying";
    return `${word} ${numbered[2]}`;
  }
  return key.replace(/\b[a-z0-9]/g, (letter) => letter.toUpperCase());
}

function sessionLabel(competition) {
  const type = competition?.type;
  const raw = type?.text || type?.abbreviation || type?.shortName || "";
  return plainSessionLabel(raw);
}

export function normalizeBout(event, competition, league, favorites, channelNames) {
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
  const name = `${teams[0].name} vs ${teams[1].name}`;
  const card = event?.shortName || event?.name || null;
  return finishListing({
    id: String(competition?.id || event?.id),
    start,
    when: formatEt(start),
    league,
    event,
    competition,
    teams,
    hits: built.flatMap((item) => item.hits),
    broadcasts: pickBroadcasts(competition?.geoBroadcasts, channelNames),
    format: "fight",
    name,
    shortName: name,
    stage: card && card !== name ? card : null,
  });
}

export function normalizeRace(event, competition, league, channelNames) {
  const start = competition?.date || event?.date;
  if (!start) return null;
  const session = sessionLabel(competition);
  const eventName = event?.name || league.label;
  const name = session ? `${eventName} · ${session}` : eventName;
  return finishListing({
    id: String(competition?.id || event?.id),
    start,
    when: formatEt(start),
    league,
    event,
    competition,
    teams: [],
    hits: [],
    broadcasts: pickBroadcasts(competition?.geoBroadcasts, channelNames),
    format: "race",
    name,
    shortName: event?.shortName ? (session ? `${event.shortName} · ${session}` : event.shortName) : name,
    stage: null,
    session: session || null,
  });
}

export function listingsFromScoreboard(json, league, favorites, channelNames) {
  const events = json?.events ?? [];
  const listings = [];
  if (league.mode === "fight-card") {
    for (const event of events) {
      const listing = normalizeFightCard(event, league, favorites, channelNames);
      if (keepListing(listing, league)) listings.push(listing);
    }
  } else if (league.mode === "bouts") {
    for (const event of events) {
      for (const competition of event?.competitions ?? []) {
        const listing = normalizeBout(event, competition, league, favorites, channelNames);
        if (keepListing(listing, league)) listings.push(listing);
      }
    }
  } else if (league.mode === "race") {
    for (const event of events) {
      for (const competition of event?.competitions ?? []) {
        const listing = normalizeRace(event, competition, league, channelNames);
        if (keepListing(listing, league)) listings.push(listing);
      }
    }
  } else {
    for (const event of events) {
      for (const competition of event?.competitions ?? []) {
        const listing = normalizeCompetition(event, competition, league, favorites, channelNames);
        if (keepListing(listing, league)) listings.push(listing);
      }
    }
  }
  return { listings, capped: events.length >= 1000 };
}
