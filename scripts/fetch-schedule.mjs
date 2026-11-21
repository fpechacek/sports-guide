import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchedule } from "./lib/build.mjs";
import { loadWatchSignals } from "./lib/signals.mjs";
import { addDays, todayEt } from "./lib/time.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USER_AGENT = "sports-guide/1.0 (personal tv guide; no AI)";

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

async function readJson(relativePath) {
  const file = path.join(root, relativePath);
  return JSON.parse(await readFile(file, "utf8"));
}

async function fetchJson(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(25000),
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}`);
        await delay(400 * attempt);
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /^HTTP 4/.test(error.message) && !error.message.includes("429")) {
        throw error;
      }
      if (attempt === 3) break;
      await delay(400 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  const days = Number(argValue("--days", "14"));
  if (!Number.isInteger(days) || days < 1 || days > 21) {
    throw new Error("--days must be a whole number from 1 to 21");
  }
  const out = path.resolve(root, argValue("--out", "public/schedule.json"));
  const favoriteConfig = await readJson("config/favorites.json");
  const leagueConfig = await readJson("config/leagues.json");
  const channelNames = await readJson("config/channel-names.json");
  const mustWatch = await readJson("config/must-watch.json");
  const favorites = favoriteConfig.favorites ?? [];
  const leagues = leagueConfig.leagues ?? [];
  let signals = [];
  try {
    const start = todayEt();
    const dates = Array.from({ length: days }, (_, index) => addDays(start, index));
    signals = await loadWatchSignals(fetch, { dates });
  } catch {
    signals = [];
  }
  const dgbCount = signals.filter((signal) => signal.id === "dgb").length;
  const gotdCount = signals.filter((signal) => signal.id === "game-of-the-day").length;
  console.log(
    dgbCount + gotdCount > 0
      ? `Watch signals: ${dgbCount} DGB picks, ${gotdCount} Game of the Day.`
      : "Watch signals: none. DGB Ratings and Game of the Day did not return a game list.",
  );

  console.log(`Fetching ${leagues.length} leagues for ${days} days in ${favoriteConfig.timezone}.`);
  const schedule = await buildSchedule({
    days,
    leagues,
    favorites,
    channelNames,
    mustWatch: { ...mustWatch, signals },
    meta: {
      timezone: favoriteConfig.timezone ?? "America/New_York",
      location: favoriteConfig.location ?? "Merritt Island, Florida",
    },
    fetchJson,
  });

  if (schedule.counts.events === 0) {
    throw new Error("ESPN returned no games. Left the existing schedule file untouched.");
  }
  const temporary = `${out}.tmp`;
  await writeFile(temporary, `${JSON.stringify(schedule, null, 2)}\n`);
  await rename(temporary, out);

  const counts = schedule.counts;
  console.log(
    `${schedule.range.start} through ${schedule.range.end}: ${counts.events} games, ${counts.withBroadcast} with a US TV or streaming listing, ${counts.favorites} favorites, ${counts.mustWatch} Must Watch.`,
  );
  console.log(`Requests ${counts.requests}, failed ${counts.failed}. Wrote ${path.relative(root, out)}.`);
  if (schedule.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of schedule.warnings) console.log(`  ${warning}`);
  }
  console.log("Favorite games:");
  const favoriteGames = schedule.events.filter((event) => event.favorite);
  if (favoriteGames.length === 0) {
    console.log("  none in this window");
  }
  for (const event of favoriteGames) {
    console.log(`  ${event.headline}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
