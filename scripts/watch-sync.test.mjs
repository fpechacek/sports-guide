import assert from "node:assert/strict";
import test from "node:test";
import { buildMustWatchDocument, isSyncConfigured, mergeOnSignIn, rowsToStore, storeToRows } from "./lib/watch-sync.mjs";

test("first sign-in copies this phone's picks when the database is empty", () => {
  const local = {
    pinned: { "999": "2026-11-22" },
    hidden: { "401856760": "2026-11-28" },
  };
  const merged = mergeOnSignIn(local, []);
  assert.deepEqual(merged.store.hidden, { "401856760": "2026-11-28" });
  assert.deepEqual(merged.store.pinned, { "999": "2026-11-22" });
  assert.equal(merged.uploads.length, 2);
});

test("sign-in keeps database picks and adds only new ones from this phone", () => {
  const local = {
    pinned: { newgame: "2026-11-23" },
    hidden: { "401856760": "2026-11-28" },
  };
  const remote = [{ event_id: "401856760", event_date: "2026-11-28", kind: "pin" }];
  const merged = mergeOnSignIn(local, remote);
  assert.equal(merged.store.hidden["401856760"], undefined);
  assert.equal(merged.store.pinned["401856760"], "2026-11-28");
  assert.equal(merged.store.pinned.newgame, "2026-11-23");
  assert.deepEqual(merged.uploads, [{ event_id: "newgame", event_date: "2026-11-23", kind: "pin" }]);
});

test("a hide wins over a pin for the same game", () => {
  const store = rowsToStore([
    { event_id: "1", event_date: "2026-11-22", kind: "pin" },
    { event_id: "1", event_date: "2026-11-22", kind: "hide" },
  ]);
  assert.deepEqual(store.pinned, {});
  assert.deepEqual(store.hidden, { "1": "2026-11-22" });
  const rows = storeToRows({ pinned: { "1": "2026-11-22" }, hidden: { "1": "2026-11-22" } });
  assert.deepEqual(rows, [{ event_id: "1", event_date: "2026-11-22", kind: "hide" }]);
});

test("sync stays off until a project url and public key are set", () => {
  assert.equal(isSyncConfigured({ enabled: false, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "k" }), false);
  assert.equal(isSyncConfigured({ enabled: true, supabaseUrl: "", supabaseAnonKey: "" }), false);
  assert.equal(isSyncConfigured({ enabled: true, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon" }), true);
});

test("the InfoBox file lists pins and hides without secrets", () => {
  const document = buildMustWatchDocument({
    source: "supabase",
    updatedAt: "2026-11-21T16:00:00Z",
    rows: [
      { event_id: "b", event_date: "2026-11-22", kind: "pin" },
      { event_id: "a", event_date: "2026-11-21", kind: "hide" },
    ],
  });
  assert.equal(document.source, "supabase");
  assert.deepEqual(document.hidden, [{ id: "a", date: "2026-11-21" }]);
  assert.deepEqual(document.pinned, [{ id: "b", date: "2026-11-22" }]);
  assert.equal(JSON.stringify(document).includes("service"), false);
});
