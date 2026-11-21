import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildSchedule } from "./lib/build.mjs";
import { matchingFavorites } from "./lib/favorites.mjs";
import { classifyMustWatch } from "./lib/must-watch.mjs";
import { normalizeCompetition, pickBroadcasts } from "./lib/normalize.mjs";
import { formatEt } from "./lib/time.mjs";
import { emptyWatch, isWatched, pruneWatch, toggleWatch } from "./lib/watch-state.mjs";

const channelNames = { "USA Net": "USA Network", Tele: "Telemundo" };

const leagues = {
  nfl: {
    sport: "football",
    slug: "nfl",
    label: "NFL",
    sportLabel: "Football",
    emoji: "🏈",
    competition: "NFL",
    color: "#f0c36a",
  },
  cfb: {
    sport: "football",
    slug: "college-football",
    label: "NCAAF",
    sportLabel: "Football",
    emoji: "🏈",
    competition: "College Football",
    color: "#8fd6a6",
  },
  cbb: {
    sport: "basketball",
    slug: "mens-college-basketball",
    label: "NCAAM",
    sportLabel: "Basketball",
    emoji: "🏀",
    competition: "Men's College Basketball",
    color: "#ffcf70",
  },
  nhl: {
    sport: "hockey",
    slug: "nhl",
    label: "NHL",
    sportLabel: "Hockey",
    emoji: "🏒",
    competition: "NHL",
    color: "#9ad7f5",
  },
  soccer: {
    sport: "soccer",
    slug: "eng.1",
    label: "Premier League",
    sportLabel: "Soccer",
    emoji: "⚽",
    competition: "Premier League",
    color: "#d7b4ff",
  },
  ucl: {
    sport: "soccer",
    slug: "uefa.champions",
    label: "Champions League",
    sportLabel: "Soccer",
    emoji: "⚽",
    competition: "UEFA Champions League",
    color: "#9ec1ff",
  },
};

const favorites = [
  { id: "iowa-football", name: "Iowa Hawkeyes", sport: "football", leagues: ["college-football"], teamIds: ["2294"], names: ["Iowa Hawkeyes"] },
  { id: "georgia-football", name: "Georgia Bulldogs", sport: "football", leagues: ["college-football"], teamIds: ["61"], names: ["Georgia Bulldogs"] },
  { id: "tottenham", name: "Tottenham Hotspur", sport: "soccer", leagues: [], teamIds: ["367"], names: ["Tottenham Hotspur"] },
  { id: "steelers", name: "Pittsburgh Steelers", sport: "football", leagues: ["nfl"], teamIds: ["23"], names: ["Pittsburgh Steelers"] },
  { id: "florida-panthers", name: "Florida Panthers", sport: "hockey", leagues: ["nhl"], teamIds: ["26"], names: ["Florida Panthers"] },
  { id: "nuggets", name: "Denver Nuggets", sport: "basketball", leagues: ["nba"], teamIds: ["7"], names: ["Denver Nuggets"] },
];

function team(id, name, { homeAway = "away", rank = 99, record = "1-0", score = "0" } = {}) {
  return {
    id: String(id),
    homeAway,
    score,
    curatedRank: { current: rank },
    records: [{ name: "overall", type: "total", summary: record }],
    team: {
      id: String(id),
      displayName: name,
      shortDisplayName: name.split(" ").slice(-1)[0],
      abbreviation: name.slice(0, 3).toUpperCase(),
      color: "00338d",
    },
  };
}

function eventFor(name, date, competitors, broadcasts, extra = {}) {
  return {
    id: extra.id ?? "401",
    date,
    name,
    shortName: name,
    season: extra.season ?? { slug: "regular-season" },
    week: extra.week,
    status: { type: { name: "STATUS_SCHEDULED", state: "pre", shortDetail: "Scheduled" } },
    competitions: [
      {
        id: extra.competitionId ?? "9001",
        date,
        competitors,
        geoBroadcasts: broadcasts,
        venue: { fullName: "Test Stadium" },
      },
    ],
  };
}

test("converts kickoff instants to Eastern time", () => {
  const afternoon = formatEt("2026-11-22T18:00:00Z");
  assert.equal(afternoon.date, "2026-11-22");
  assert.equal(afternoon.timeEt, "1:00 PM");
  assert.equal(afternoon.timeZoneAbbr, "EST");

  const evening = formatEt("2026-11-22T01:20:00Z");
  assert.equal(evening.date, "2026-11-21");
  assert.equal(evening.timeEt, "8:20 PM");
});

test("keeps US TV and streaming, renames cryptic channels, and drops radio", () => {
  const broadcasts = pickBroadcasts(
    [
      { type: { shortName: "TV" }, market: { type: "National" }, media: { shortName: "USA Net" }, region: "us", lang: "en" },
      { type: { shortName: "TV" }, market: { type: "National" }, media: { shortName: "Tele" }, region: "us", lang: "es" },
      { type: { shortName: "Streaming" }, market: { type: "National" }, media: { shortName: "Peacock" }, region: "us", lang: "en" },
      { type: { shortName: "Radio" }, market: { type: "National" }, media: { shortName: "ERADM" }, region: "us" },
      { type: { shortName: "TV" }, market: { type: "National" }, media: { shortName: "Sky" }, region: "gb" },
    ],
    channelNames,
  );
  assert.deepEqual(
    broadcasts.map((item) => item.name),
    ["USA Network", "Telemundo", "Peacock"],
  );
  assert.equal(broadcasts.some((item) => item.kind === "streaming" && item.name === "Peacock"), true);
});

test("falls back to a non-US feed only when ESPN lists nothing for the US", () => {
  const broadcasts = pickBroadcasts(
    [{ type: { shortName: "TV" }, market: { type: "National" }, media: { shortName: "Sky" }, region: "gb" }],
    channelNames,
  );
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0].region, "gb");
});

test("flags the right clubs and ignores lookalikes", () => {
  const game = (league, competitors) => {
    const event = eventFor("Game", "2026-11-21T18:00:00Z", competitors, []);
    return normalizeCompetition(event, event.competitions[0], league, favorites, channelNames);
  };

  const iowa = game(leagues.cfb, [team(2294, "Iowa Hawkeyes", { rank: 22 }), team(77, "Oregon Ducks", { homeAway: "home", rank: 8 })]);
  assert.equal(iowa.favorite, true);
  assert.deepEqual(iowa.favoriteIds, ["iowa-football"]);
  assert.equal(iowa.teams[0].rank, 22);
  assert.equal(iowa.teams[1].rank, 8);
  assert.equal(iowa.stage, null);

  const iowaHoops = game(leagues.cbb, [team(2294, "Iowa Hawkeyes"), team(1, "Someone Else", { homeAway: "home" })]);
  assert.equal(iowaHoops.favorite, false);

  const georgia = game(leagues.cfb, [team(61, "Georgia Bulldogs", { rank: 4 }), team(59, "Georgia Tech Yellow Jackets", { homeAway: "home" })]);
  assert.equal(georgia.favorite, true);
  assert.equal(georgia.teams.find((item) => item.id === "59").favorite, false);

  const techOnly = game(leagues.cfb, [team(59, "Georgia Tech Yellow Jackets"), team(2247, "Georgia State Panthers", { homeAway: "home" })]);
  assert.equal(techOnly.favorite, false);

  const steelers = game(leagues.nfl, [team(23, "Pittsburgh Steelers", { record: "7-4" }), team(21, "Philadelphia Eagles", { homeAway: "home" })]);
  assert.equal(steelers.favorite, true);
  assert.equal(steelers.teams[0].record, "7-4");

  const pitt = game(leagues.cfb, [team(221, "Pittsburgh Panthers"), team(1, "Other", { homeAway: "home" })]);
  assert.equal(pitt.favorite, false);

  const cats = game(leagues.nhl, [team(26, "Florida Panthers"), team(11, "Carolina Hurricanes", { homeAway: "home" })]);
  assert.deepEqual(cats.favoriteIds, ["florida-panthers"]);
  assert.equal(cats.teams.find((item) => item.name === "Carolina Hurricanes").favorite, false);

  const nflCats = game(leagues.nfl, [team(29, "Carolina Panthers"), team(23, "Pittsburgh Steelers", { homeAway: "home" })]);
  assert.deepEqual(nflCats.favoriteIds, ["steelers"]);
  assert.equal(nflCats.teams.find((item) => item.name === "Carolina Panthers").favorite, false);

  const spurs = game(leagues.soccer, [team(367, "Tottenham Hotspur"), team(359, "Arsenal", { homeAway: "home" })]);
  assert.equal(spurs.favorite, true);
  const spursEvent = eventFor(
    "Arsenal at Tottenham Hotspur",
    "2026-11-21T18:00:00Z",
    [team(359, "Arsenal"), team(367, "Tottenham Hotspur", { homeAway: "home" })],
    [],
    { season: { slug: "league-phase" } },
  );
  const spursEurope = normalizeCompetition(spursEvent, spursEvent.competitions[0], leagues.ucl, favorites, channelNames);
  assert.equal(spursEurope.favorite, true);
  assert.equal(spursEurope.stage, "League phase");

  const women = game(leagues.soccer, [team(20062, "Tottenham Hotspur Women"), team(1, "Other Women", { homeAway: "home" })]);
  assert.equal(women.favorite, false);

  const nuggets = matchingFavorites({ id: "7", name: "Denver Nuggets" }, { sport: "basketball", slug: "nba" }, favorites);
  assert.equal(nuggets.length, 1);
  const hockeySeven = matchingFavorites({ id: "7", name: "Buffalo Sabres" }, { sport: "hockey", slug: "nhl" }, favorites);
  assert.equal(hockeySeven.length, 0);
});

test("drops placeholder games and unranked sentinels", () => {
  const placeholder = eventFor("TBD at TBD", "2026-11-21T18:00:00Z", [team("tbd", "TBD"), team("tbd2", "TBD", { homeAway: "home" })], []);
  const listing = normalizeCompetition(placeholder, placeholder.competitions[0], leagues.cfb, favorites, channelNames);
  assert.equal(listing, null);

  const rankedEvent = eventFor(
    "A at B",
    "2026-11-21T18:00:00Z",
    [team(1, "Alpha", { rank: 99 }), team(2, "Beta", { homeAway: "home", rank: 10 })],
    [],
  );
  const ranked = normalizeCompetition(rankedEvent, rankedEvent.competitions[0], leagues.cfb, favorites, channelNames);
  assert.equal(ranked.teams[0].rank, null);
  assert.equal(ranked.teams[1].rank, 10);
});

test("buildSchedule dedupes a slate that ESPN repeats across days", async () => {
  const steelers = eventFor(
    "Pittsburgh Steelers at Philadelphia Eagles",
    "2026-11-22T18:00:00Z",
    [team(23, "Pittsburgh Steelers"), team(21, "Philadelphia Eagles", { homeAway: "home" })],
    [{ type: { shortName: "TV" }, market: { type: "National" }, media: { shortName: "CBS" }, region: "us" }],
    { id: "nfl-1", competitionId: "comp-1", week: { number: 11 } },
  );
  const outside = eventFor(
    "Way Later",
    "2026-12-20T18:00:00Z",
    [team(1, "Alpha"), team(2, "Beta", { homeAway: "home" })],
    [],
    { id: "nfl-2", competitionId: "comp-2" },
  );
  const schedule = await buildSchedule({
    now: new Date("2026-11-21T15:00:00Z"),
    days: 3,
    leagues: [leagues.nfl],
    favorites,
    channelNames,
    meta: { timezone: "America/New_York", location: "Merritt Island, Florida" },
    fetchJson: async () => ({ events: [steelers, outside] }),
  });
  assert.equal(schedule.events.length, 1);
  assert.equal(schedule.events[0].favorite, true);
  assert.deepEqual(schedule.events[0].channels, ["CBS"]);
  assert.equal(schedule.events[0].stage, "Week 11");
  assert.equal(schedule.events[0].headline.includes("CBS"), true);
  assert.equal(schedule.counts.requests, 3);
  assert.deepEqual(schedule.dates, ["2026-11-21", "2026-11-22", "2026-11-23"]);
});

test("checked-in favorites stay specific", async () => {
  const config = JSON.parse(await readFile(new URL("../config/favorites.json", import.meta.url), "utf8"));
  const byId = Object.fromEntries(config.favorites.map((favorite) => [favorite.id, favorite]));
  assert.deepEqual(byId["florida-panthers"].leagues, ["nhl"]);
  assert.deepEqual(byId["florida-panthers"].teamIds, ["26"]);
  assert.deepEqual(byId["iowa-football"].leagues, ["college-football"]);
  assert.deepEqual(byId["georgia-football"].leagues, ["college-football"]);
  assert.deepEqual(byId.tottenham.teamIds, ["367"]);
  assert.deepEqual(byId.tottenham.leagues, []);
  assert.equal(byId.tottenham.sport, "soccer");
  assert.deepEqual(byId.steelers.leagues, ["nfl"]);
  assert.deepEqual(byId.nuggets.leagues, ["nba"]);
  assert.equal(config.timezone, "America/New_York");
});

test("a TBD kickoff stays a favorite and does not pretend to be midnight", () => {
  const event = eventFor(
    "Georgia Tech Yellow Jackets at Georgia Bulldogs",
    "2026-11-28T05:00:00Z",
    [team(59, "Georgia Tech Yellow Jackets"), team(61, "Georgia Bulldogs", { homeAway: "home", rank: 5 })],
    [],
    { week: { number: 13 } },
  );
  event.competitions[0].timeValid = false;
  event.status.type.shortDetail = "TBD";
  event.status.type.detail = "11/28 - TBD";
  const listing = normalizeCompetition(event, event.competitions[0], leagues.cfb, favorites, channelNames);
  assert.equal(listing.favorite, true);
  assert.equal(listing.timeTbd, true);
  assert.equal(listing.channels.length, 0);
  assert.match(listing.headline, /Time TBD/);
  assert.equal(listing.odds, null);
});

test("odds keep the provider, spread, moneyline, and total", () => {
  const event = eventFor(
    "Auburn Tigers at Alabama Crimson Tide",
    "2026-11-28T17:00:00Z",
    [team(2, "Auburn Tigers"), team(333, "Alabama Crimson Tide", { homeAway: "home" })],
    [],
  );
  event.competitions[0].odds = [
    {
      provider: { name: "DraftKings", displayName: "DraftKings" },
      details: "ALA -15.5",
      overUnder: 50.5,
      spread: -15.5,
      moneyline: { home: { close: { odds: "-650" } }, away: { close: { odds: "+450" } } },
    },
  ];
  const listing = normalizeCompetition(event, event.competitions[0], leagues.cfb, favorites, channelNames);
  assert.equal(listing.odds.provider, "DraftKings");
  assert.equal(listing.odds.spread, "ALA -15.5");
  assert.equal(listing.odds.overUnder, "50.5");
  assert.equal(listing.odds.homeMoneyline, "-650");
  assert.equal(listing.odds.awayMoneyline, "+450");
});

test("Must Watch rules mark big games and leave ordinary ones out", async () => {
  const rules = JSON.parse(await readFile(new URL("../config/must-watch.json", import.meta.url), "utf8"));
  const base = {
    timeTbd: false,
    timeEt: "1:00 PM",
    weekday: "Sat",
    stage: "Week 13",
    season: "regular-season",
    competition: "College Football",
    broadcasts: [],
    favorite: false,
    teams: [
      { name: "Vanderbilt Commodores", rank: null },
      { name: "Kentucky Wildcats", rank: null },
    ],
  };

  const georgia = classifyMustWatch(
    {
      ...base,
      name: "Georgia Tech Yellow Jackets at Georgia Bulldogs",
      leagueSlug: "college-football",
      favorite: true,
      teams: [
        { name: "Georgia Tech Yellow Jackets", rank: null },
        { name: "Georgia Bulldogs", rank: 5 },
      ],
    },
    rules,
  );
  assert.equal(georgia.mustWatch, true);
  assert.deepEqual(
    georgia.mustWatchReasons.map((reason) => reason.id),
    ["my-team", "top-10", "rivalry"],
  );

  const ranked = classifyMustWatch(
    {
      ...base,
      leagueSlug: "college-football",
      teams: [
        { name: "Oregon Ducks", rank: 8 },
        { name: "Ohio State Buckeyes", rank: 1 },
      ],
    },
    rules,
  );
  assert.ok(ranked.mustWatchReasons.some((reason) => reason.id === "ranked-matchup"));
  assert.ok(ranked.mustWatchReasons.some((reason) => reason.id === "top-10"));

  const noon = {
    ...base,
    name: "New Orleans Saints at Chicago Bears",
    leagueSlug: "nfl",
    weekday: "Sun",
    timeEt: "1:00 PM",
    competition: "NFL",
    stage: "Week 11",
    broadcasts: [{ name: "FOX", kind: "tv", market: "national" }],
    teams: [
      { name: "New Orleans Saints", rank: null },
      { name: "Chicago Bears", rank: null },
    ],
  };
  const afternoon = classifyMustWatch(noon, rules);
  assert.equal(afternoon.mustWatch, false);

  const snf = classifyMustWatch(
    {
      ...noon,
      timeEt: "8:20 PM",
      broadcasts: [{ name: "NBC", kind: "tv", market: "national" }],
    },
    rules,
  );
  assert.ok(snf.mustWatchReasons.some((reason) => reason.id === "primetime"));

  const six = classifyMustWatch(
    {
      ...base,
      name: "Arsenal at Liverpool",
      leagueSlug: "eng.1",
      competition: "Premier League",
      stage: null,
      teams: [
        { name: "Arsenal", rank: null },
        { name: "Liverpool", rank: null },
      ],
    },
    rules,
  );
  assert.ok(six.mustWatchReasons.some((reason) => reason.id === "big-six"));

  const euro = {
    ...base,
    leagueSlug: "uefa.champions",
    stage: "League phase",
    competition: "UEFA Champions League",
    teams: [
      { name: "Barcelona", rank: null },
      { name: "Arsenal", rank: null },
    ],
  };
  const leaguePhase = classifyMustWatch(euro, rules);
  assert.equal(leaguePhase.mustWatch, false);

  const round = classifyMustWatch({ ...euro, stage: "Round of 16" }, rules);
  assert.ok(round.mustWatchReasons.some((reason) => reason.id === "knockout"));

  const nhl = {
    ...base,
    leagueSlug: "nhl",
    competition: "NHL",
    stage: null,
    broadcasts: [{ name: "ESPN+", kind: "streaming", market: "national" }],
    teams: [
      { name: "Buffalo Sabres", rank: null },
      { name: "Florida Panthers", rank: null },
    ],
  };
  const espnPlus = classifyMustWatch(nhl, rules);
  assert.equal(espnPlus.mustWatch, false);

  const espn = classifyMustWatch(
    {
      ...nhl,
      broadcasts: [{ name: "ESPN", kind: "tv", market: "national" }],
    },
    rules,
  );
  assert.ok(espn.mustWatchReasons.some((reason) => reason.id === "national-tv"));
});

test("a checkbox hides an automatic Must Watch game and keeps a manual one", () => {
  const today = "2026-11-21";
  const georgia = { id: "401856760", date: "2026-11-28", mustWatch: true, favorite: true };
  const ordinary = { id: "999", date: "2026-11-22", mustWatch: false, favorite: false };
  let store = emptyWatch();
  assert.equal(isWatched(georgia, store), true);
  store = toggleWatch(georgia, store, today);
  assert.equal(isWatched(georgia, store), false);
  store = toggleWatch(georgia, store, today);
  assert.equal(isWatched(georgia, store), true);

  store = toggleWatch(ordinary, store, today);
  assert.equal(isWatched(ordinary, store), true);
  store = toggleWatch(ordinary, store, today);
  assert.equal(isWatched(ordinary, store), false);

  const stale = pruneWatch({ pinned: { old: "2026-11-20", keep: "2026-11-22" }, hidden: { gone: "2026-11-19" } }, today);
  assert.deepEqual(stale.pinned, { keep: "2026-11-22" });
  assert.deepEqual(stale.hidden, {});
});
