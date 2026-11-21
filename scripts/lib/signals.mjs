import { addDays, formatEt, todayEt } from "./time.mjs";

const USER_AGENT = "sports-guide/1.0 (personal tv guide; no AI)";
const DGB_PAGE = "https://www.dgbratings.com/";
const DGB_ROBOTS = "https://www.dgbratings.com/robots.txt";
const GOTD_PAGE = "https://gameoftheday.co/";
const GOTD_ROBOTS = "https://gameoftheday.co/robots.txt";
const GOTD_API = "https://gotd-server-prod-7kdfc33rqa-uc.a.run.app/api/games";

const DGB_LEAGUES = {
  cfb: ["college-football"],
  nfl: ["nfl"],
  nba: ["nba"],
  nhl: ["nhl"],
  cbb: ["mens-college-basketball"],
  mlb: ["mlb"],
};

const GOTD_LEAGUES = {
  NBA: ["nba"],
  NFL: ["nfl"],
  NHL: ["nhl"],
  MLB: ["mlb"],
  EPL: ["eng.1"],
};

const FLOOR = 35;
const CEILING = 78;
const TYPE_PENALTY = { preseason: 12 };

function robotsAllows(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim());
  let applies = false;
  let allowed = true;
  for (const line of lines) {
    const agent = line.match(/^user-agent:\s*(.+)$/i);
    if (agent) {
      applies = agent[1].trim() === "*";
      continue;
    }
    if (!applies) continue;
    const disallow = line.match(/^disallow:\s*(.*)$/i);
    if (disallow && (disallow[1] === "/" || disallow[1] === "/*")) allowed = false;
    const allow = line.match(/^allow:\s*(.*)$/i);
    if (allow && (allow[1] === "/" || allow[1] === "")) allowed = true;
  }
  return allowed;
}

async function readText(url, fetchImpl, headers = {}) {
  const response = await fetchImpl(url, {
    headers: {
      accept: "text/plain,text/html,text/x-component,application/json",
      "user-agent": USER_AGENT,
      ...headers,
    },
    signal: AbortSignal.timeout(20000),
    redirect: "follow",
  });
  if (!response.ok) return null;
  return await response.text();
}

function jsonArrayAt(text, marker) {
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  const start = text.indexOf("[", idx);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }
  return null;
}

export function gamesFromDgbPayload(text) {
  const games = jsonArrayAt(String(text), '"games":[');
  return Array.isArray(games) ? games : [];
}

export function dgbSignalsFromGames(games, limit = 5) {
  const byDate = new Map();
  for (const game of games ?? []) {
    const leagues = DGB_LEAGUES[game?.sport];
    if (!leagues || !game.away_display || !game.home_display || !game.start_date) continue;
    const score = Number(game.watchability_index);
    if (!Number.isFinite(score)) continue;
    let date;
    try {
      date = formatEt(game.start_date).date;
    } catch {
      continue;
    }
    const list = byDate.get(date) ?? [];
    list.push({ game, date, score, leagues });
    byDate.set(date, list);
  }
  const signals = [];
  for (const list of byDate.values()) {
    list.sort((a, b) => b.score - a.score || String(a.game.away_display).localeCompare(String(b.game.away_display)));
    for (const [index, item] of list.slice(0, limit).entries()) {
      const rank = index + 1;
      signals.push({
        id: "dgb",
        rank,
        label: `DGB #${rank}`,
        date: item.date,
        leagues: item.leagues,
        teams: [item.game.away_display, item.game.home_display],
      });
    }
  }
  return signals;
}

function reviewed(game) {
  const analysis = game?.analysis;
  if (game?.status !== "completed" || !analysis) return false;
  const thrill = analysis.thrillScore;
  if (!Number.isFinite(thrill) || thrill < 0 || thrill > 100) return false;
  if (thrill === 0 && analysis.fundamentalsScore === 0 && analysis.vibeScore === 0) return false;
  return true;
}

function winPct(side) {
  const wins = side?.wins;
  const losses = side?.losses;
  if (!Number.isFinite(wins) || !Number.isFinite(losses)) return null;
  const total = wins + losses;
  return total > 0 ? wins / total : null;
}

function hashUnit(id) {
  let hash = 2166136261;
  const text = String(id);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

function predicted(game) {
  const home = winPct(game.pregame?.home);
  const away = winPct(game.pregame?.away);
  if (home == null || away == null) {
    return Math.round(FLOOR + hashUnit(game.id) * (CEILING - FLOOR) * 0.5 + 10);
  }
  const rested = [game.pregame?.home?.restDays, game.pregame?.away?.restDays].every(
    (days) => !Number.isFinite(days) || days >= 1,
  );
  const rest = rested ? 1 : 0.94;
  return Math.round(FLOOR + ((home + away) / 2 * 0.45 + 0.55 * (1 - Math.abs(home - away))) * rest * (CEILING - FLOOR));
}

function gotdScore(game) {
  const base = reviewed(game) ? game.analysis.thrillScore : predicted(game);
  return base - (TYPE_PENALTY[game.gameType] || 0);
}

export function featuredGotd(games) {
  const ranked = [...(games ?? [])].sort((a, b) => {
    const aReviewed = reviewed(a);
    const bReviewed = reviewed(b);
    if (aReviewed !== bReviewed) return aReviewed ? -1 : 1;
    const delta = gotdScore(b) - gotdScore(a);
    if (delta) return delta;
    const time = Date.parse(a.startTime) - Date.parse(b.startTime);
    if (Number.isFinite(time) && time) return time;
    return String(a.id).localeCompare(String(b.id));
  });
  return ranked.find((game) => reviewed(game) || game.status === "scheduled") ?? null;
}

function gotdSignal(game) {
  const leagues = GOTD_LEAGUES[game?.league];
  if (!leagues || !game.awayTeam || !game.homeTeam || !game.startTime) return null;
  let date;
  try {
    date = formatEt(game.startTime).date;
  } catch {
    return null;
  }
  return {
    id: "game-of-the-day",
    label: "Game of the day",
    date,
    leagues,
    teams: [game.awayTeam, game.homeTeam],
  };
}

async function loadDgb(fetchImpl) {
  const robots = await readText(DGB_ROBOTS, fetchImpl);
  if (robots != null && !robotsAllows(robots)) return [];
  const payload = await readText(DGB_PAGE, fetchImpl, { RSC: "1", Accept: "text/x-component" });
  if (!payload) return [];
  return dgbSignalsFromGames(gamesFromDgbPayload(payload));
}

async function loadGotd(fetchImpl, dates) {
  const robots = await readText(GOTD_ROBOTS, fetchImpl);
  if (robots != null && !robotsAllows(robots)) return [];
  const signals = [];
  const seen = new Set();
  for (const date of dates) {
    const url = `${GOTD_API}?date=${date}&timeZone=America%2FNew_York&limit=100&showSpoilers=true`;
    const body = await readText(url, fetchImpl, { accept: "application/json" });
    if (!body) continue;
    let games = [];
    try {
      games = JSON.parse(body).games ?? [];
    } catch {
      continue;
    }
    const signal = gotdSignal(featuredGotd(games));
    if (!signal || seen.has(`${signal.date}:${signal.teams.join("|")}`)) continue;
    seen.add(`${signal.date}:${signal.teams.join("|")}`);
    signals.push(signal);
  }
  return signals;
}

export async function loadWatchSignals(fetchImpl = globalThis.fetch, options = {}) {
  const start = options.dates?.[0] ?? todayEt();
  const dates = options.dates ?? Array.from({ length: 8 }, (_, index) => addDays(start, index));
  const signals = [];
  try {
    signals.push(...(await loadDgb(fetchImpl)));
  } catch {
    // DGB being down does not stop the schedule.
  }
  try {
    signals.push(...(await loadGotd(fetchImpl, dates)));
  } catch {
    // Game of the Day being down does not stop the schedule.
  }
  return signals;
}
