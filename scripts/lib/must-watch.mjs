const REASON_ORDER = [
  "my-team",
  "title",
  "bowl",
  "knockout",
  "playoff",
  "primetime",
  "ranked-matchup",
  "dgb",
  "game-of-the-day",
  "big-six",
  "rivalry",
  "national-tv",
];

export const REASON_LABELS = {
  "my-team": "My team",
  title: "Title game",
  bowl: "Bowl",
  knockout: "Knockout",
  playoff: "Playoffs",
  primetime: "Primetime",
  "ranked-matchup": "Ranked matchup",
  dgb: "DGB",
  "game-of-the-day": "Game of the day",
  "big-six": "Big Six",
  rivalry: "Rivalry",
  "national-tv": "National TV",
};

function textBlob(event) {
  return [event.stage, event.season, event.competition, event.name].filter(Boolean).join(" ").toLowerCase();
}

function includesKeyword(event, words) {
  const text = textBlob(event);
  return (words ?? []).some((word) => text.includes(String(word).toLowerCase()));
}

function etHour(event) {
  if (event.timeTbd) return null;
  const match = String(event.timeEt ?? "").match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const period = match[3].toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour;
}

function namesMatch(teamName, configured) {
  const left = teamName.toLowerCase();
  const right = configured.toLowerCase();
  return left === right || left.includes(right) || right.includes(left);
}

function isRivalry(event, pairs) {
  const names = event.teams.map((team) => team.name);
  return (pairs ?? []).some((pair) => {
    if (!Array.isArray(pair) || pair.length < 2) return false;
    const [a, b] = pair;
    const hasA = names.some((name) => namesMatch(name, a));
    const hasB = names.some((name) => namesMatch(name, b));
    return hasA && hasB;
  });
}

function onNetwork(event, networks, { tvOnly }) {
  const wanted = (networks ?? []).map((name) => name.toLowerCase());
  return event.broadcasts.some((broadcast) => {
    if (tvOnly && broadcast.kind !== "tv") return false;
    if (tvOnly && broadcast.market !== "national") return false;
    return wanted.includes(broadcast.name.toLowerCase());
  });
}

function isPrimetime(event, rule) {
  if (!rule?.leagues?.includes(event.leagueSlug)) return false;
  const day = event.weekday;
  if (rule.thursday && day === "Thu") return true;
  if (rule.monday && day === "Mon") return true;
  const hour = etHour(event);
  if (day === "Sun" && hour != null && hour >= (rule.sundayStartHourEt ?? 19)) return true;
  return onNetwork(event, rule.networks, { tvOnly: true });
}

function isNationalTv(event, rule) {
  if (!rule?.leagues?.includes(event.leagueSlug)) return false;
  return onNetwork(event, rule.networks, { tvOnly: true });
}

function isBigSix(event, rule) {
  if (!rule || event.leagueSlug !== rule.league) return false;
  const clubs = rule.bigSix ?? [];
  const matched = event.teams.filter((team) => clubs.some((club) => namesMatch(team.name, club)));
  return matched.length >= 2;
}

function isWomensSport(event, config) {
  const listed = new Set(config.womensLeagues ?? ["wnba", "womens-college-basketball", "usa.nwsl"]);
  if (listed.has(event.leagueSlug)) return true;
  const blob = `${event.league ?? ""} ${event.competition ?? ""} ${event.leagueSlug ?? ""}`.toLowerCase();
  return /\bwomen(?:'s|s)?\b/.test(blob) || blob.includes("nwsl") || blob.includes("wnba");
}

const SCHOOL_CONTINUATIONS = new Set(["state", "tech", "a&m", "college", "university", "southern", "northern", "eastern", "western", "central"]);

function wordsOf(value) {
  return String(value)
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .split(/[^a-z0-9&]+/)
    .filter(Boolean);
}

export function teamNameMatches(eventName, signalName) {
  const event = wordsOf(eventName);
  const signal = wordsOf(signalName);
  if (signal.length === 0 || event.length < signal.length) return false;
  for (let i = 0; i < signal.length; i += 1) {
    if (event[i] !== signal[i]) return false;
  }
  const next = event[signal.length];
  if (!next) return true;
  if (SCHOOL_CONTINUATIONS.has(next)) return false;
  if (next === "oh" || next === "fl") return false;
  return true;
}

function signalMatches(event, signal) {
  const wanted = signal?.teams ?? [];
  if (wanted.length < 2) return false;
  if (signal.date && event.date && signal.date !== event.date) return false;
  if (Array.isArray(signal.leagues) && signal.leagues.length > 0 && !signal.leagues.includes(event.leagueSlug)) return false;
  return wanted.every((name) =>
    event.teams.some((team) => [team.name, team.shortName, team.abbreviation].some((value) => value && teamNameMatches(value, name))),
  );
}

function signalReasons(event, signals) {
  let bestDgb = null;
  let gameOfDay = false;
  for (const signal of signals ?? []) {
    if (!signalMatches(event, signal)) continue;
    if (signal.id === "dgb") {
      const rank = Number(signal.rank) || 0;
      if (!bestDgb || (rank > 0 && rank < bestDgb.rank)) {
        bestDgb = { rank: rank || 99, label: signal.label || (rank ? `DGB #${rank}` : "DGB") };
      }
    } else if (signal.id === "game-of-the-day") {
      gameOfDay = true;
    }
  }
  const ids = [];
  const labels = {};
  if (bestDgb) {
    ids.push("dgb");
    labels.dgb = bestDgb.label;
  }
  if (gameOfDay) ids.push("game-of-the-day");
  return { ids, labels };
}

function isKnockout(event, rule) {
  if (!rule || event.leagueSlug !== rule.league) return false;
  const stage = event.stage ?? "";
  if ((rule.knockoutStages ?? []).some((item) => stage.toLowerCase() === item.toLowerCase())) return true;
  if (stage.toLowerCase().includes("league phase")) return false;
  return includesKeyword(event, ["round of 16", "round of 32", "quarterfinal", "semifinal", "knockout"]);
}

export function classifyMustWatch(event, config) {
  if (isWomensSport(event, config)) {
    return { mustWatch: false, mustWatchReasons: [] };
  }

  const reasons = [];
  if (event.favorite) reasons.push("my-team");

  const college = config.collegeLeagues ?? [];
  if (college.includes(event.leagueSlug)) {
    const ranks = event.teams.map((team) => team.rank).filter((rank) => typeof rank === "number");
    const ceiling = config.rankedCeiling ?? 25;
    if (ranks.length >= 2 && ranks.every((rank) => rank <= ceiling)) reasons.push("ranked-matchup");
  }

  const signals = signalReasons(event, config.signals);
  reasons.push(...signals.ids);

  if (isRivalry(event, config.rivalries)) reasons.push("rivalry");
  if (includesKeyword(event, config.keywords?.title)) reasons.push("title");
  if (includesKeyword(event, config.keywords?.bowl)) reasons.push("bowl");
  if (includesKeyword(event, config.keywords?.playoff)) reasons.push("playoff");
  if (isPrimetime(event, config.primetime)) reasons.push("primetime");
  if (isNationalTv(event, config.nationalTv)) reasons.push("national-tv");
  if (isBigSix(event, config.premierLeague)) reasons.push("big-six");
  if (isKnockout(event, config.championsLeague)) reasons.push("knockout");

  const unique = [...new Set(reasons)];
  unique.sort((a, b) => REASON_ORDER.indexOf(a) - REASON_ORDER.indexOf(b));
  return {
    mustWatch: unique.length > 0,
    mustWatchReasons: unique.map((id) => ({ id, label: signals.labels[id] ?? REASON_LABELS[id] ?? id })),
  };
}
