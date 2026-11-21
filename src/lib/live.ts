import type { GameStatus, GuideEvent, LeagueMeta, Schedule } from "../types";
import { todayEt } from "./time";

export type LivePatch = {
  status: GameStatus;
  statusDetail: string;
  scores: Record<string, string>;
};

const GROUPS: Record<string, string> = {
  "college-football": "80",
  "mens-college-basketball": "50",
  "womens-college-basketball": "50",
};

function liveWindowMs(event: GuideEvent): number {
  switch (event.sportSlug) {
    case "football":
      return 4.5 * 60 * 60 * 1000;
    case "basketball":
      return 3 * 60 * 60 * 1000;
    case "hockey":
      return 3 * 60 * 60 * 1000;
    case "baseball":
      return 4 * 60 * 60 * 1000;
    case "soccer":
      return 2.5 * 60 * 60 * 1000;
    case "mma":
      return 45 * 60 * 1000;
    case "racing":
      return 3.5 * 60 * 60 * 1000;
    default:
      return 3 * 60 * 60 * 1000;
  }
}

export function inferredStatus(event: GuideEvent, now: number): GameStatus {
  if (event.status === "in-progress") return "in-progress";
  if (event.timeTbd) return event.status;
  if (event.status !== "scheduled" && event.status !== "delayed" && event.status !== "other") return event.status;
  const start = Date.parse(event.start);
  if (Number.isNaN(start)) return event.status;
  const elapsed = now - start;
  if (elapsed >= 0 && elapsed < liveWindowMs(event)) return "in-progress";
  return event.status;
}

function mapEspnStatus(status: { type?: { name?: string; state?: string } } | undefined): GameStatus {
  const name = String(status?.type?.name ?? "");
  const state = String(status?.type?.state ?? "");
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("DELAY")) return "delayed";
  if (name.includes("CANCEL") || name.includes("ABANDON")) return "canceled";
  if (state === "in") return "in-progress";
  if (state === "post") return "final";
  if (state === "pre") return "scheduled";
  return "other";
}

export function displayEvent(event: GuideEvent, patch: LivePatch | undefined, now: number): GuideEvent {
  const inferred = inferredStatus(event, now);
  let status = inferred;
  if (patch) {
    status = patch.status === "scheduled" && inferred === "in-progress" ? "in-progress" : patch.status;
  }
  let teams = event.teams;
  if (patch && (status === "in-progress" || status === "final")) {
    teams = event.teams.map((team) => {
      const score = patch.scores[team.id];
      return score == null ? team : { ...team, score };
    });
  }
  const statusDetail = patch?.statusDetail || event.statusDetail;
  if (status === event.status && teams === event.teams && statusDetail === event.statusDetail) return event;
  return { ...event, status, statusDetail, teams };
}

export async function fetchLivePatches(schedule: Schedule, now = Date.now()): Promise<Map<string, LivePatch>> {
  const today = todayEt(new Date(now));
  const leagues = new Map<string, LeagueMeta>();
  for (const event of schedule.events) {
    if (event.date !== today || event.status === "canceled") continue;
    const league = schedule.leagues.find((item) => item.slug === event.leagueSlug);
    if (league) leagues.set(league.slug, league);
  }

  const patches = new Map<string, LivePatch>();
  await Promise.all(
    [...leagues.values()].map(async (league) => {
      const groups = league.groups || GROUPS[league.slug];
      const params = new URLSearchParams({ dates: today.replaceAll("-", "") });
      if (groups) params.set("groups", groups);
      const url = `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.slug}/scoreboard?${params}`;
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const json = (await response.json()) as {
          events?: {
            status?: { type?: { name?: string; state?: string; shortDetail?: string } };
            competitions?: {
              id?: string | number;
              status?: { type?: { name?: string; state?: string; shortDetail?: string } };
              competitors?: { score?: string | number; team?: { id?: string | number }; athlete?: { id?: string | number } }[];
            }[];
          }[];
        };
        for (const event of json.events ?? []) {
          for (const competition of event.competitions ?? []) {
            const status = mapEspnStatus(competition.status || event.status);
            const scores: Record<string, string> = {};
            if (status === "in-progress" || status === "final") {
              for (const competitor of competition.competitors ?? []) {
                const id = competitor.team?.id ?? competitor.athlete?.id;
                if (id == null || competitor.score == null || competitor.score === "") continue;
                scores[String(id)] = String(competitor.score);
              }
            }
            if (competition.id == null) continue;
            patches.set(`${league.slug}:${competition.id}`, {
              status,
              statusDetail: competition.status?.type?.shortDetail || event.status?.type?.shortDetail || "",
              scores,
            });
          }
        }
      } catch {
        // Keep the kickoff-time guess when ESPN is unreachable.
      }
    }),
  );
  return patches;
}
