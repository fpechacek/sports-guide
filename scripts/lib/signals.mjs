const PAGES = [
  {
    id: "dgb",
    url: "https://www.dgbratings.com/index",
    robots: "https://www.dgbratings.com/robots.txt",
  },
  {
    id: "game-of-the-day",
    url: "https://gameoftheday.co/",
    robots: "https://gameoftheday.co/robots.txt",
  },
];

const USER_AGENT = "sports-guide/1.0 (personal tv guide; no AI)";

function robotsAllows(text, path) {
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
    if (allow && (allow[1] === "/" || allow[1] === "" || path.startsWith(allow[1]))) allowed = true;
  }
  return allowed;
}

export function matchupsFromHtml(html) {
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
  const games = [];
  const pattern =
    /\b([A-Z][A-Za-z0-9'.]+(?:\s+[A-Z][A-Za-z0-9'.]+){0,4})\s+vs\.?\s+([A-Z][A-Za-z0-9'.]+(?:\s+[A-Z][A-Za-z0-9'.]+){0,4})\b/g;
  for (const match of text.matchAll(pattern)) {
    const away = match[1].trim();
    const home = match[2].trim();
    if (away.length < 3 || home.length < 3) continue;
    const blob = `${away} ${home}`.toLowerCase();
    if (/\b(email|subscribe|spoiler|watchable|privacy)\b/.test(blob)) continue;
    games.push({ teams: [away, home] });
    if (games.length >= 40) break;
  }
  return games;
}

async function readText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { accept: "text/plain,text/html", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  if (!response.ok) return null;
  return await response.text();
}

export async function loadWatchSignals(fetchImpl = globalThis.fetch) {
  const signals = [];
  for (const page of PAGES) {
    try {
      const robots = await readText(page.robots, fetchImpl);
      const path = new URL(page.url).pathname || "/";
      if (robots != null && !robotsAllows(robots, path)) continue;
      const html = await readText(page.url, fetchImpl);
      if (!html) continue;
      for (const game of matchupsFromHtml(html)) {
        signals.push({ id: page.id, teams: game.teams });
      }
    } catch {
      // A missing or blocked page is not a schedule failure.
    }
  }
  return signals;
}
