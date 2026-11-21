export function matchingFavorites(team, league, favorites) {
  const hits = [];
  for (const favorite of favorites) {
    if (favorite.sport && favorite.sport !== league.sport) continue;
    const leagues = favorite.leagues ?? [];
    if (leagues.length > 0 && !leagues.includes(league.slug)) continue;
    const idHit = (favorite.teamIds ?? []).some((id) => String(id) === String(team.id));
    const nameHit = (favorite.names ?? []).some(
      (name) => name.toLowerCase() === String(team.name ?? "").toLowerCase(),
    );
    if (idHit || nameHit) hits.push(favorite);
  }
  return hits;
}
