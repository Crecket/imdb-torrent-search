/** Public trackers attached to generated magnet links so clients can find peers. */
export const TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://tracker.torrent.eu.org:451/announce",
];

/** Build a magnet URI from a BitTorrent info hash. */
export function toMagnet(hash, displayName) {
    if (typeof hash !== "string" || !/^[0-9a-f]{40}$/i.test(hash.trim())) return null;
    const name = encodeURIComponent(displayName ?? "");
    const trackers = TRACKERS.map((tracker) => `tr=${encodeURIComponent(tracker)}`).join("&");
    return `magnet:?xt=urn:btih:${hash.trim().toLowerCase()}&dn=${name}&${trackers}`;
}
