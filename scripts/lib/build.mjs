import { listingsFromScoreboard } from "./normalize.mjs";
import { addDays, compactDate, eachDate, todayEt } from "./time.mjs";

const COVERAGE = [
  "Broadcasts are US listings from ESPN's public scoreboard. Radio is omitted.",
  "If ESPN lists no US broadcast, non-US feeds are kept and tagged with their region.",
  "A TV channel is not turned into a streaming service. Streams appear only when ESPN lists them.",
  "Channels for later days are often blank until closer to game time.",
  "TBD at TBD placeholders are dropped. A UFC event is one card, not every bout.",
];

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  const width = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: width }, () => run()));
  return results;
}

export function scoreboardUrl(league, ymd) {
  return `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/scoreboard?dates=${compactDate(ymd)}&limit=1000`;
}

export async function buildSchedule({ now = new Date(), days = 14, leagues, favorites, channelNames, meta, fetchJson }) {
  const start = todayEt(now);
  const end = addDays(start, days - 1);
  const dates = eachDate(start, end);
  const activeLeagues = leagues.filter((league) => league.enabled !== false);
  const jobs = [];
  for (const league of activeLeagues) {
    for (const date of dates) jobs.push({ league, date });
  }

  const warnings = [];
  let failed = 0;
  const batches = await mapPool(jobs, 4, async (job) => {
    const url = scoreboardUrl(job.league, job.date);
    try {
      const json = await fetchJson(url);
      const parsed = listingsFromScoreboard(json, job.league, favorites, channelNames);
      if (parsed.capped) {
        warnings.push(`${job.league.slug} ${job.date}: response hit the 1000-event limit`);
      }
      return parsed.listings;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${job.league.slug} ${job.date}: ${message}`);
      return [];
    }
  });

  const byId = new Map();
  for (const listings of batches) {
    for (const listing of listings) {
      if (listing.date < start || listing.date > end) continue;
      byId.set(`${listing.leagueSlug}:${listing.id}`, listing);
    }
  }

  const events = [...byId.values()].sort((a, b) => {
    const byStart = a.start.localeCompare(b.start);
    if (byStart !== 0) return byStart;
    const byLeague = a.leagueSlug.localeCompare(b.leagueSlug);
    if (byLeague !== 0) return byLeague;
    return a.id.localeCompare(b.id);
  });

  const favoriteEvents = events.filter((event) => event.favorite).length;
  const withBroadcast = events.filter((event) => event.channels.length > 0 || event.streaming.length > 0).length;

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    timezone: meta.timezone,
    location: meta.location,
    range: { start, end, days },
    dates,
    sources: [
      {
        id: "espn-scoreboard",
        name: "ESPN public scoreboard",
        url: "https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard",
      },
    ],
    coverage: COVERAGE,
    favorites: favorites.map((favorite) => ({
      id: favorite.id,
      name: favorite.name,
      sport: favorite.sport,
      leagues: favorite.leagues ?? [],
    })),
    leagues: activeLeagues.map((league) => ({
      slug: league.slug,
      label: league.label,
      sport: league.sport,
      sportLabel: league.sportLabel,
      emoji: league.emoji,
      competition: league.competition,
      color: league.color,
    })),
    counts: {
      requests: jobs.length,
      failed,
      events: events.length,
      favorites: favoriteEvents,
      withBroadcast,
    },
    warnings,
    events,
  };
}
