/**
 * Highest episode number a season lists, which stands in for its episode count.
 *
 * Torrentio reports one episode's size for a season pack, so the pack's real
 * size can only be estimated from how many episodes the season has. EZTV's
 * episode list is the closest thing to that count we already have on hand.
 */
export function episodesInSeason(torrents, season) {
    if (!Array.isArray(torrents) || !Number.isFinite(season)) return undefined;

    let highest = 0;
    for (const torrent of torrents) {
        if (Number(torrent?.season) !== season) continue;
        highest = Math.max(highest, Number(torrent?.episode) || 0);
    }
    return highest > 0 ? highest : undefined;
}
