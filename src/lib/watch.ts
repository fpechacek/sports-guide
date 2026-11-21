import { emptyWatch, isWatched, pruneWatch, toggleWatch, type WatchStore } from "../../scripts/lib/watch-state.mjs";
import type { GuideEvent } from "../types";

const KEY = "sports-guide-must-watch";

export type { WatchStore };
export { isWatched };

export function loadWatch(today: string): WatchStore {
  if (typeof localStorage === "undefined") return emptyWatch();
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "") as WatchStore;
    return pruneWatch(parsed, today);
  } catch {
    return emptyWatch();
  }
}

export function saveWatch(store: WatchStore, today: string): WatchStore {
  const pruned = pruneWatch(store, today);
  localStorage.setItem(KEY, JSON.stringify(pruned));
  return pruned;
}

export function toggleStoredWatch(event: GuideEvent, store: WatchStore, today: string): WatchStore {
  return saveWatch(toggleWatch(event, store, today), today);
}
