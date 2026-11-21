import { useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { FilterBar } from "./components/FilterBar";
import { GameCard } from "./components/GameCard";
import { SyncPicks } from "./components/SyncPicks";
import { applyFilters, defaultFilters, filtersToSearch, groupByDate, passesView, readFilters, type Filters } from "./lib/filter";
import { longDate, shortDate, todayEt, updatedLabel } from "./lib/time";
import { createSyncClient, loadSyncConfig, markDirty, pushAfterToggle, syncOnSignIn } from "./lib/sync";
import { isWatched, loadWatch, toggleStoredWatch, type WatchStore } from "./lib/watch";
import type { GuideEvent, LeagueMeta, Schedule } from "./types";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; schedule: Schedule };

function sportsIn(schedule: Schedule, events: GuideEvent[]) {
  const present = new Set(events.map((event) => event.sportSlug));
  const sports: { slug: string; label: string; emoji: string }[] = [];
  for (const league of schedule.leagues) {
    if (!present.has(league.sport) || sports.some((sport) => sport.slug === league.sport)) continue;
    sports.push({ slug: league.sport, label: league.sportLabel, emoji: league.emoji });
  }
  return sports;
}

function leaguesIn(schedule: Schedule, events: GuideEvent[]): LeagueMeta[] {
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.leagueSlug, (counts.get(event.leagueSlug) ?? 0) + 1);
  return schedule.leagues.filter((league) => (counts.get(league.slug) ?? 0) > 0);
}

export function App() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<Filters>(() =>
    typeof window === "undefined" ? defaultFilters : readFilters(window.location.search),
  );
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [scores, setScores] = useState<Record<string, boolean>>({});
  const today = todayEt();
  const [watchStore, setWatchStore] = useState<WatchStore>(() => loadWatch(today));
  const [syncClient, setSyncClient] = useState<SupabaseClient | null>(null);
  const [syncUser, setSyncUser] = useState<User | null>(null);
  const [syncNote, setSyncNote] = useState("");
  const syncUserRef = useRef<User | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const url = `${import.meta.env.BASE_URL}schedule.json`;
    fetch(url, { signal: controller.signal, cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The schedule file returned HTTP ${response.status}.`);
        const data = (await response.json()) as Schedule;
        if (data.schemaVersion !== 1 || !Array.isArray(data.events)) {
          throw new Error("This schedule file is not a version this page can read.");
        }
        setLoad({ status: "ready", schedule: data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Could not load the schedule.";
        setLoad({ status: "error", message });
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void loadSyncConfig().then(async (config) => {
      if (!config.enabled || !active) return;
      const client = await createSyncClient(config);
      if (!active) return;
      setSyncClient(client);
      const { data: listener } = client.auth.onAuthStateChange((event, session) => {
        const next = session?.user ?? null;
        syncUserRef.current = next;
        setSyncUser(next);
        if (!next || (event !== "SIGNED_IN" && event !== "INITIAL_SESSION")) return;
        void syncOnSignIn(client, next, today)
          .then((store) => {
            if (active) setWatchStore(store);
          })
          .catch((error: unknown) => {
            if (active) setSyncNote(error instanceof Error ? error.message : "Saved on this phone. Sync will retry.");
          });
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [today]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      document.getElementById("guide-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    const next = `${window.location.pathname}${filtersToSearch(filters)}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) window.history.replaceState(null, "", next);
  }, [filters]);

  const view = useMemo(() => {
    if (load.status !== "ready") return null;
    const schedule = load.schedule;
    const watched = (event: GuideEvent) => isWatched(event, watchStore);
    const events = applyFilters(schedule.events, filters).filter((event) => !filters.watch || watched(event));
    const preview = schedule.events.filter(
      (event) => watched(event) && event.status !== "canceled" && passesView(event, filters),
    );
    return {
      schedule,
      events,
      groups: groupByDate(events),
      preview,
      sports: sportsIn(schedule, schedule.events),
      leagues: leaguesIn(schedule, schedule.events),
      watchTotal: schedule.events.filter((event) => watched(event) && event.status !== "canceled").length,
    };
  }, [load, filters, watchStore]);

  function toggleScore(id: string) {
    setScores((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleWatch(event: GuideEvent) {
    setWatchStore((current) => {
      const next = toggleStoredWatch(event, current, today);
      const user = syncUserRef.current;
      if (syncClient && user) {
        markDirty();
        void pushAfterToggle(syncClient, user, next).catch((error: unknown) => {
          setSyncNote(error instanceof Error ? error.message : "Saved on this phone. Sync will retry.");
        });
      }
      return next;
    });
  }

  async function install() {
    if (!installEvent) {
      setInstallHelp((open) => !open);
      return;
    }
    await installEvent.prompt();
    setInstallEvent(null);
  }

  function clearFilters() {
    setFilters(defaultFilters);
  }

  return (
    <div className="shell">
      <header className="mast">
        <div className="mast-row">
          <h1>Sports Guide</h1>
          <Button variant="ghost" size="sm" onClick={() => void install()}>
            Add to home
          </Button>
        </div>
        <div className="mast-meta">
          <p className="eyebrow">Merritt Island · ET</p>
          <p className="updated">
            {load.status === "ready" ? `Updated ${updatedLabel(load.schedule.generatedAt)} ET` : "Loading schedule"}
          </p>
        </div>
        {syncClient ? <SyncPicks client={syncClient} user={syncUser} note={syncNote} onSignedIn={() => setSyncUser(syncUserRef.current)} /> : null}
      </header>
      <div className="stripe" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      {installHelp ? (
        <p className="install-help" role="note">
          In Chrome or Samsung Internet, open the browser menu and tap <strong>Add to Home screen</strong> or{" "}
          <strong>Install app</strong>.
        </p>
      ) : null}

      {load.status === "loading" ? <Loading /> : null}
      {load.status === "error" ? (
        <div className="empty">
          <h2>Schedule didn’t load</h2>
          <p>{load.message}</p>
          <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
        </div>
      ) : null}

      {view ? (
        <>
          <div className="sticky-tools">
            <FilterBar
              filters={filters}
              sports={view.sports}
              leagues={view.leagues}
              dates={view.schedule.dates}
              today={today}
              dateLabel={shortDate}
              onChange={setFilters}
            />
          </div>
          <p className="count" aria-live="polite">
            {view.events.length} {view.events.length === 1 ? "game" : "games"}
            {filters.onTv ? " on TV or streaming" : ""}
            {view.watchTotal > 0 ? ` · ${view.watchTotal} in Must Watch` : ""}
          </p>

          {!filters.watch ? (
            <section className="block" aria-labelledby="watch-heading">
              <div className="block-head">
                <h2 id="watch-heading">Must Watch</h2>
              </div>
              {view.preview.length === 0 ? (
                <p className="quiet">Nothing in Must Watch for this view. Check a game to add it.</p>
              ) : (
                <div className="stack">
                  {view.preview.map((event) => (
                    <GameCard
                      key={`watch-${event.leagueSlug}-${event.id}`}
                      event={event}
                      watched={isWatched(event, watchStore)}
                      scoreOpen={scores[event.id] === true}
                      onToggleWatch={() => toggleWatch(event)}
                      onToggleScore={() => toggleScore(event.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section className="block" aria-labelledby="guide-heading">
            <div className="block-head">
              <h2 id="guide-heading">{filters.date ? longDate(filters.date) : "Full schedule"}</h2>
              <p>
                {filters.onTv
                  ? "Games without a listing are hidden, except Must Watch."
                  : "Every game in the window, including ones with no channel yet."}
              </p>
            </div>
            {view.events.length === 0 ? (
              <div className="empty tight">
                <h2>No games match</h2>
                <p>Try another day, turn off On TV, or clear the search.</p>
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            ) : (
              view.groups.map((group) => (
                <div key={group.date} className="day">
                  <h3>
                    {group.label}
                    {group.date === today ? <span className="today">Today</span> : null}
                  </h3>
                  <div className="stack">
                    {group.events.map((event) => (
                      <GameCard
                        key={`${event.leagueSlug}-${event.id}`}
                        event={event}
                        watched={isWatched(event, watchStore)}
                        scoreOpen={scores[event.id] === true}
                        onToggleWatch={() => toggleWatch(event)}
                        onToggleScore={() => toggleScore(event.id)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Loading() {
  return (
    <div className="stack loading" aria-hidden="true">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}
