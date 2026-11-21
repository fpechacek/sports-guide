declare module "../../scripts/lib/watch-state.mjs" {
  export type WatchStore = {
    pinned: Record<string, string>;
    hidden: Record<string, string>;
  };

  export function emptyWatch(): WatchStore;
  export function pruneWatch(store: WatchStore | null | undefined, today: string): WatchStore;
  export function isAutoWatch(event: { id: string; mustWatch?: boolean; favorite?: boolean }): boolean;
  export function isWatched(
    event: { id: string; mustWatch?: boolean; favorite?: boolean },
    store: WatchStore | null | undefined,
  ): boolean;
  export function toggleWatch(
    event: { id: string; date: string; mustWatch?: boolean; favorite?: boolean },
    store: WatchStore | null | undefined,
    today: string,
  ): WatchStore;
}
