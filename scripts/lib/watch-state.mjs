export function emptyWatch() {
  return { pinned: {}, hidden: {} };
}

export function pruneWatch(store, today) {
  const keep = (entries) => {
    const next = {};
    for (const [id, date] of Object.entries(entries ?? {})) {
      if (typeof date === "string" && date >= today) next[id] = date;
    }
    return next;
  };
  return { pinned: keep(store?.pinned), hidden: keep(store?.hidden) };
}

export function isAutoWatch(event) {
  return event.mustWatch === true || event.favorite === true;
}

export function isWatched(event, store) {
  if (store?.hidden?.[event.id]) return false;
  if (store?.pinned?.[event.id]) return true;
  return isAutoWatch(event);
}

export function toggleWatch(event, store, today) {
  const current = pruneWatch(store ?? emptyWatch(), today);
  const pinned = { ...current.pinned };
  const hidden = { ...current.hidden };
  if (isWatched(event, current)) {
    delete pinned[event.id];
    if (isAutoWatch(event)) hidden[event.id] = event.date;
  } else {
    delete hidden[event.id];
    if (!isAutoWatch(event)) pinned[event.id] = event.date;
  }
  return pruneWatch({ pinned, hidden }, today);
}
