/**
 *
 * @param movieTorrents
 * @returns {string}
 */
const createTable = (movieTorrents) => {
    if (movieTorrents.length < 1) {
        return `<p>No direct torrents were found.</p>`;
    }

    // magnet image
    const magnetImageUrl = chrome.extension.getURL("img/icon-magnet.gif");

    let torrentList = "";
    //generate a list of torrents
    movieTorrents.map(torrent => {
        torrentList += `<tr>
            <td>${torrent.quality}</td>
            <td>${torrent.size}</td>
            <td>
                <span class="imdb-torrent-search-seeds">${torrent.seeds}</span> /
                <span class="imdb-torrent-search-peers">${torrent.peers}</span>
            </td>
            <td>
                <a href="${torrent.magnet_url}">
                    <img id="imdb-torrent-search-icon" src="${magnetImageUrl}">
                </a>
            </td>
        </tr>`;
    });

    // return a table with the torrent list
    return `
        <table class="cast_list imdb-torrent-search-table">
            <thead>
                <tr>
                    <th>Quality</th>
                    <th>Size</th>
                    <th>Seeds / Peers</th>
                    <th>DL</th>
                </tr>
            </thead>
            <tbody>
                ${torrentList}
            </tbody>
        </table>
    `;
}

/**
 *
 * @param title
 * @returns {string}
 */
const createLinks = (title) => {
    // encode the title without non alphanumeric
    const encodedTitle = encodeURIComponent(title.replace(/[^0-9a-z ]/gi, '').trim());

    // return the list of links to search pages for
    return `
     <div class="imdb-torrent-search-links">
        <b>Search links:<p/>
        <a href="https://thepiratebay.org/search/${encodedTitle}/0/99/0" target="_blank">
            <img src="${chrome.extension.getURL("img/tpb-favicon.png")}"/>
        </a>
        <a href="https://1337x.to/search/${encodedTitle}/seeders/desc/1/" target="_blank">
            <img src="${chrome.extension.getURL("img/1337x-favicon.png")}"/>
        </a>
        <a href="https://extratorrent.cc/search/?search=${encodedTitle}&s_cat=&pp=&srt=seeds&order=desc" target="_blank">
            <img src="${chrome.extension.getURL("img/extratorrent-favicon.png")}"/>
        </a>
        <a href="https://torrents.me/search/${encodedTitle}/" target="_blank">
            <img src="${chrome.extension.getURL("img/torrents-favicon.png")}"/>
        </a>
        <a href="https://rarbg.to/torrents.php?search=${encodedTitle}/" target="_blank">
            <img src="${chrome.extension.getURL("img/rargb-favicon.png")}"/>
        </a>
    </div>
    `;
}

module.exports = {
    table: createTable,
    links: createLinks,
}
