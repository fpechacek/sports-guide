import type { SupabaseClient, User } from "@supabase/supabase-js";
import { mergeOnSignIn, rowsToStore, storeToRows, type PickRow } from "../../scripts/lib/watch-sync.mjs";
import type { WatchStore } from "../../scripts/lib/watch-state.mjs";
import { loadWatch, saveWatch } from "./watch";

export type SyncConfig = {
  enabled: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

const DIRTY = "sports-guide-sync-dirty";

export async function loadSyncConfig(): Promise<SyncConfig> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}sync-config.json`, { cache: "no-cache" });
    if (!response.ok) return disabled();
    const data = (await response.json()) as Partial<SyncConfig>;
    if (!data.enabled || !data.supabaseUrl || !data.supabaseAnonKey) return disabled();
    return {
      enabled: true,
      supabaseUrl: data.supabaseUrl,
      supabaseAnonKey: data.supabaseAnonKey,
    };
  } catch {
    return disabled();
  }
}

function disabled(): SyncConfig {
  return { enabled: false, supabaseUrl: "", supabaseAnonKey: "" };
}

export function redirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

export async function createSyncClient(config: SyncConfig): Promise<SupabaseClient> {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

async function readRemote(client: SupabaseClient): Promise<PickRow[]> {
  const { data, error } = await client.from("watch_picks").select("event_id,event_date,kind");
  if (error) throw new Error(error.message);
  return (data ?? []) as PickRow[];
}

export async function pushStore(client: SupabaseClient, user: User, store: WatchStore): Promise<void> {
  const rows = storeToRows(store).map((row) => ({ ...row, user_id: user.id }));
  if (rows.length > 0) {
    const { error } = await client.from("watch_picks").upsert(rows, { onConflict: "user_id,event_id" });
    if (error) throw new Error(error.message);
  }
  const { data, error } = await client.from("watch_picks").select("event_id");
  if (error) throw new Error(error.message);
  const keep = new Set(rows.map((row) => row.event_id));
  const remove = (data ?? []).map((row) => String(row.event_id)).filter((id) => !keep.has(id));
  if (remove.length === 0) return;
  const deleted = await client.from("watch_picks").delete().in("event_id", remove);
  if (deleted.error) throw new Error(deleted.error.message);
}

export async function syncOnSignIn(client: SupabaseClient, user: User, today: string): Promise<WatchStore> {
  const local = loadWatch(today);
  if (localStorage.getItem(DIRTY) === "1") {
    await pushStore(client, user, local);
    localStorage.removeItem(DIRTY);
    return local;
  }
  const remote = await readRemote(client);
  const merged = mergeOnSignIn(local, remote);
  const store = saveWatch(rowsToStore(storeToRows(merged.store)), today);
  if (merged.uploads.length > 0) await pushStore(client, user, store);
  return store;
}

export async function pushAfterToggle(client: SupabaseClient, user: User, store: WatchStore): Promise<void> {
  localStorage.setItem(DIRTY, "1");
  await pushStore(client, user, store);
  localStorage.removeItem(DIRTY);
}

export function markDirty(): void {
  localStorage.setItem(DIRTY, "1");
}
