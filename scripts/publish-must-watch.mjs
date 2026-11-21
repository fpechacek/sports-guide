import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMustWatchDocument, normalizeSupabaseUrl, supabaseHeaders } from "./lib/watch-sync.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "public", "must-watch.json");

function env(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : "";
}

async function supabaseGet(url, apiKey, pathname) {
  const response = await fetch(`${url}${pathname}`, {
    headers: supabaseHeaders(apiKey),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${pathname} HTTP ${response.status}: ${body.slice(0, 180)}`);
  }
  return response.json();
}

async function loadRows(url, serviceKey, userId) {
  let owner = userId;
  if (!owner) {
    const users = await supabaseGet(url, serviceKey, "/auth/v1/admin/users?page=1&per_page=20");
    const list = users.users ?? users;
    if (!Array.isArray(list) || list.length === 0) {
      console.log("Supabase has no signed-in user yet. Publishing an empty Must Watch file.");
      return { rows: [], updatedAt: null, source: "supabase" };
    }
    if (list.length > 1) {
      throw new Error("More than one Supabase user. Set SUPABASE_USER_ID to Frank's user id.");
    }
    owner = list[0].id;
  }
  const rows = await supabaseGet(
    url,
    serviceKey,
    `/rest/v1/watch_picks?user_id=eq.${owner}&select=event_id,event_date,kind,updated_at`,
  );
  const updatedAt = (rows ?? []).reduce((latest, row) => {
    if (!row.updated_at) return latest;
    return !latest || row.updated_at > latest ? row.updated_at : latest;
  }, null);
  return { rows: rows ?? [], updatedAt, source: "supabase" };
}

async function main() {
  const url = normalizeSupabaseUrl(env("SUPABASE_URL"));
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const userId = env("SUPABASE_USER_ID");
  if (!url || !serviceKey) {
    console.log("Supabase secrets are not set. Skipping Must Watch sync. The guide still updates.");
    return;
  }
  try {
    const loaded = await loadRows(url, serviceKey, userId);
    const document = buildMustWatchDocument(loaded);
    await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`);
    console.log(`Must Watch file: ${document.pinned.length} added, ${document.hidden.length} hidden.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Must Watch sync skipped: ${message}`);
    console.log("The schedule update will continue.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
