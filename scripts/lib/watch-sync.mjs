export function storeToRows(store) {
  const rows = [];
  for (const [eventId, eventDate] of Object.entries(store?.hidden ?? {})) {
    rows.push({ event_id: eventId, event_date: eventDate, kind: "hide" });
  }
  for (const [eventId, eventDate] of Object.entries(store?.pinned ?? {})) {
    if (store?.hidden?.[eventId]) continue;
    rows.push({ event_id: eventId, event_date: eventDate, kind: "pin" });
  }
  rows.sort((a, b) => a.event_id.localeCompare(b.event_id));
  return rows;
}

export function rowsToStore(rows) {
  const pinned = {};
  const hidden = {};
  for (const row of rows ?? []) {
    const id = String(row.event_id);
    const date = String(row.event_date).slice(0, 10);
    if (row.kind === "hide") hidden[id] = date;
    else if (row.kind === "pin") pinned[id] = date;
  }
  for (const id of Object.keys(pinned)) {
    if (hidden[id]) delete pinned[id];
  }
  return { pinned, hidden };
}

export function mergeOnSignIn(local, remoteRows) {
  const remote = rowsToStore(remoteRows);
  const remoteEmpty = (remoteRows ?? []).length === 0;
  if (remoteEmpty) {
    const store = rowsToStore(storeToRows(local));
    return { store, uploads: storeToRows(store) };
  }
  const hidden = { ...remote.hidden };
  const pinned = { ...remote.pinned };
  const uploads = [];
  for (const [id, date] of Object.entries(local?.hidden ?? {})) {
    if (hidden[id] || pinned[id]) continue;
    hidden[id] = date;
    uploads.push({ event_id: id, event_date: date, kind: "hide" });
  }
  for (const [id, date] of Object.entries(local?.pinned ?? {})) {
    if (hidden[id] || pinned[id]) continue;
    pinned[id] = date;
    uploads.push({ event_id: id, event_date: date, kind: "pin" });
  }
  for (const id of Object.keys(pinned)) {
    if (hidden[id]) delete pinned[id];
  }
  return { store: { pinned, hidden }, uploads };
}

export function normalizeSupabaseUrl(url) {
  return String(url ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/, "");
}

export function supabaseHeaders(apiKey) {
  const headers = {
    apikey: apiKey,
    accept: "application/json",
  };
  const isNewKey = apiKey.startsWith("sb_publishable_") || apiKey.startsWith("sb_secret_");
  if (!isNewKey) headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

export function isSyncConfigured(config) {
  return Boolean(config?.enabled && config?.supabaseUrl && config?.supabaseAnonKey);
}

export function buildMustWatchDocument({ source, rows, updatedAt = null }) {
  const store = rowsToStore(rows);
  const toList = (entries) =>
    Object.entries(entries)
      .map(([id, date]) => ({ id, date }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return {
    schemaVersion: 1,
    source,
    updatedAt,
    pinned: toList(store.pinned),
    hidden: toList(store.hidden),
  };
}
