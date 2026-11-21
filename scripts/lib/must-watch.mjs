const REASON_ORDER = [
  "my-team",
  "title",
  "bowl",
  "knockout",
  "playoff",
  "primetime",
  "top-10",
  "ranked-matchup",
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
  "top-10": "Top 10",
  "ranked-matchup": "Ranked matchup",
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

function isKnockout(event, rule) {
  if (!rule || event.leagueSlug !== rule.league) return false;
  const stage = event.stage ?? "";
  if ((rule.knockoutStages ?? []).some((item) => stage.toLowerCase() === item.toLowerCase())) return true;
  if (stage.toLowerCase().includes("league phase")) return false;
  return includesKeyword(event, ["round of 16", "round of 32", "quarterfinal", "semifinal", "knockout"]);
}

export function classifyMustWatch(event, config) {
  const reasons = [];
  if (event.favorite) reasons.push("my-team");

  const college = config.collegeLeagues ?? [];
  if (college.includes(event.leagueSlug)) {
    const ranks = event.teams.map((team) => team.rank).filter((rank) => typeof rank === "number");
    const ceiling = config.rankedCeiling ?? 25;
    if (ranks.length >= 2 && ranks.every((rank) => rank <= ceiling)) reasons.push("ranked-matchup");
    if (ranks.some((rank) => rank <= (config.topRank ?? 10))) reasons.push("top-10");
  }

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
    mustWatchReasons: unique.map((id) => ({ id, label: REASON_LABELS[id] ?? id })),
  };
}
