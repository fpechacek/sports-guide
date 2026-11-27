import { normalizeRace, plainSessionLabel } from "./normalize.mjs";

export const NASCAR_SERIES = {
  "nascar-premier": "series_1",
  "nascar-secondary": "series_2",
  "nascar-truck": "series_3",
};

export function nascarScheduleUrl(year) {
  return `https://cf.nascar.com/cacher/${year}/race_list_basic.json`;
}

export function yearsCovering(start, end) {
  const first = Number(String(start).slice(0, 4));
  const last = Number(String(end).slice(0, 4));
  const years = [];
  for (let year = first; year <= last; year += 1) years.push(year);
  return years;
}

function utcStamp(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const stamped = /[zZ]$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const date = new Date(stamped);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function numberedLabels(labels) {
  const counts = new Map();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const seen = new Map();
  return labels.map((label) => {
    if (!label || (counts.get(label) ?? 0) < 2 || /\d$/.test(label)) return label;
    const next = (seen.get(label) ?? 0) + 1;
    seen.set(label, next);
    return `${label} ${next}`;
  });
}

export function listingsFromNascarRaces(races, league, channelNames, { start, end, now = new Date() }) {
  const listings = [];
  for (const race of races ?? []) {
    const schedule = Array.isArray(race?.schedule) ? race.schedule : [];
    const pointsRace = schedule.some((item) => item?.run_type === 3);
    const raceName = String(race?.race_name ?? league.competition).replace(/\s+/g, " ").trim() || league.competition;
    const sessions = [];
    for (const item of schedule) {
      const runType = item?.run_type;
      if (runType !== 1 && runType !== 2) continue;
      if (runType === 2 && !pointsRace) continue;
      const startIso = utcStamp(item?.start_time_utc);
      if (!startIso) continue;
      sessions.push({ item, runType, startIso });
    }
    const labels = numberedLabels(sessions.map((session) => plainSessionLabel(session.item?.event_name)));
    sessions.forEach((session, index) => {
      const label = labels[index];
      if (!label || label === "Race") return;
      const ended = Date.parse(session.startIso) + 2 * 60 * 60 * 1000 < now.getTime();
      const status = ended
        ? { type: { name: "STATUS_FINAL", state: "post", shortDetail: "Final" } }
        : { type: { name: "STATUS_SCHEDULED", state: "pre", shortDetail: "Scheduled" } };
      const id = `nascar-${race.series_id ?? league.slug}-${race.race_id}-${session.runType}-${index}`;
      const competition = {
        id,
        date: session.startIso,
        type: { text: label },
        geoBroadcasts: [],
        status,
      };
      const listing = normalizeRace(
        {
          id: `nascar-${race.race_id}`,
          name: raceName,
          shortName: raceName,
          date: session.startIso,
          status,
        },
        competition,
        league,
        channelNames,
      );
      if (!listing || listing.date < start || listing.date > end) return;
      if (!listing.session || listing.session === "Race") return;
      listings.push(listing);
    });
  }
  return listings;
}
