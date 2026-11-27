import { listingsFromNascarRaces, nascarScheduleUrl, NASCAR_SERIES, yearsCovering } from "./nascar.mjs";
import { classifyMustWatch } from "./must-watch.mjs";
import { listingsFromScoreboard } from "./normalize.mjs";
import { addDays, compactDate, eachDate, todayEt } from "./time.mjs";

const COVERAGE = [
  "Broadcasts are US listings from ESPN's public scoreboard. Radio is omitted.",
  "If ESPN lists no US broadcast, non-US feeds are kept and tagged with their region.",
  "A TV channel is not turned into a streaming service. Streams appear only when ESPN lists them.",
  "Channels for later days are often blank until closer to game time.",
  "TBD at TBD placeholders are dropped. College football keeps the FBS slate, including an FBS team hosting an FCS opponent, and drops FCS-only games.",
  "UFC is one row per fight. Auto racing is one row per session. Formula 1 sessions are Practice 1, Practice 2, Practice 3, Qualifying, Sprint Shootout, Sprint, and Race, with the TV or stream ESPN lists.",
  "NASCAR Cup, the O'Reilly Auto Parts Series, and the Craftsman Truck Series add practice and qualifying from NASCAR's public schedule. The race keeps the ESPN TV listing. A practice or qualifying session with no channel says the channel is not announced.",
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
  const params = new URLSearchParams({ dates: compactDate(ymd) });
  // ESPN's college football scoreboard returns only the early slate (25 games,
  // through about 3:00 PM ET) when limit=1000 is set. Omit limit.
  // College slates also need an explicit division group or the default feed
  // is a short TV list and drops the rest of the day.
  if (league.groups) params.set("groups", String(league.groups));
  return `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/scoreboard?${params}`;
}

export async function buildSchedule({ now = new Date(), days = 14, leagues, favorites, channelNames, mustWatch, meta, fetchJson }) {
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
  let requests = jobs.length;
  const batches = await mapPool(jobs, 4, async (job) => {
    const url = scoreboardUrl(job.league, job.date);
    try {
      const json = await fetchJson(url);
      const parsed = listingsFromScoreboard(json, job.league, favorites, channelNames);
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

  const nascarLeagues = activeLeagues.filter((league) => NASCAR_SERIES[league.slug]);
  for (const year of nascarLeagues.length > 0 ? yearsCovering(start, end) : []) {
    requests += 1;
    try {
      const json = await fetchJson(nascarScheduleUrl(year));
      for (const league of nascarLeagues) {
        const races = json?.[NASCAR_SERIES[league.slug]] ?? [];
        const listings = listingsFromNascarRaces(races, league, channelNames, { start, end, now });
        for (const listing of listings) byId.set(`${listing.leagueSlug}:${listing.id}`, listing);
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`nascar ${year}: ${message}`);
    }
  }

  const events = [...byId.values()].sort((a, b) => {
    const byStart = a.start.localeCompare(b.start);
    if (byStart !== 0) return byStart;
    const byLeague = a.leagueSlug.localeCompare(b.leagueSlug);
    if (byLeague !== 0) return byLeague;
    return a.id.localeCompare(b.id);
  });

  for (const event of events) {
    if (mustWatch) {
      const classified = classifyMustWatch(event, { ...mustWatch, signals: mustWatch.signals ?? [] });
      event.mustWatch = classified.mustWatch;
      event.mustWatchReasons = classified.mustWatchReasons;
    } else {
      event.mustWatch = event.favorite;
      event.mustWatchReasons = event.favorite ? [{ id: "my-team", label: "My team" }] : [];
    }
  }

  const favoriteEvents = events.filter((event) => event.favorite).length;
  const mustWatchEvents = events.filter((event) => event.mustWatch).length;
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
      ...(nascarLeagues.length > 0
        ? [
            {
              id: "nascar-schedule",
              name: "NASCAR public schedule",
              url: "https://cf.nascar.com/cacher/{year}/race_list_basic.json",
            },
          ]
        : []),
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
      ...(league.groups ? { groups: String(league.groups) } : {}),
    })),
    counts: {
      requests,
      failed,
      events: events.length,
      favorites: favoriteEvents,
      mustWatch: mustWatchEvents,
      withBroadcast,
    },
    warnings,
    events,
  };
}
