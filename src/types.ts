export type GameStatus =
  | "scheduled"
  | "in-progress"
  | "final"
  | "postponed"
  | "delayed"
  | "canceled"
  | "other";

export type GameFormat = "teams" | "fight" | "race";

export type Team = {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  homeAway: "home" | "away" | null;
  rank: number | null;
  record: string | null;
  score: string | null;
  color: string | null;
  logo: string | null;
  favorite: boolean;
};

export type Broadcast = {
  name: string;
  kind: "tv" | "streaming";
  market: string;
  region: string;
  lang: string | null;
  origin: "listed";
};

export type Odds = {
  provider: string | null;
  spread: string | null;
  overUnder: string | null;
  homeMoneyline: string | null;
  awayMoneyline: string | null;
  homeAbbreviation: string | null;
  awayAbbreviation: string | null;
};

export type WatchReason = {
  id: string;
  label: string;
};

export type GuideEvent = {
  id: string;
  date: string;
  start: string;
  timeEt: string;
  timeTbd?: boolean;
  timeZoneAbbr: string;
  weekday: string;
  dateLabel: string;
  sport: string;
  sportSlug: string;
  emoji: string;
  league: string;
  leagueSlug: string;
  competition: string;
  stage: string | null;
  season: string | null;
  week: number | null;
  name: string;
  shortName: string;
  format: GameFormat;
  status: GameStatus;
  statusDetail: string;
  venue: string | null;
  teams: Team[];
  broadcasts: Broadcast[];
  channels: string[];
  streaming: string[];
  broadcastSummary: string | null;
  odds?: Odds | null;
  mustWatch?: boolean;
  mustWatchReasons?: WatchReason[];
  favorite: boolean;
  favoriteIds: string[];
  favoriteNames: string[];
  color: string;
  headline: string;
  link: string | null;
};

export type FavoriteConfig = {
  id: string;
  name: string;
  sport: string;
  leagues: string[];
};

export type LeagueMeta = {
  slug: string;
  label: string;
  sport: string;
  sportLabel: string;
  emoji: string;
  competition: string;
  color: string;
  groups?: string;
};

export type Schedule = {
  schemaVersion: number;
  generatedAt: string;
  timezone: string;
  location: string;
  range: { start: string; end: string; days: number };
  dates: string[];
  sources: { id: string; name: string; url: string }[];
  coverage: string[];
  favorites: FavoriteConfig[];
  leagues: LeagueMeta[];
  counts: {
    requests: number;
    failed: number;
    events: number;
    favorites: number;
    mustWatch?: number;
    withBroadcast: number;
  };
  warnings: string[];
  events: GuideEvent[];
};
