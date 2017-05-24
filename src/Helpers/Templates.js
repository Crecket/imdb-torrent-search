/**
 *
 * @param movieTorrents
 * @returns {string}
 */
const createMovieTable = movieTorrents => {
    if (movieTorrents.length < 1) {
        return `<p>No direct torrents were found.</p>`;
    }

    // magnet image
    const magnetImageUrl = chrome.extension.getURL("img/icon-magnet.gif");

    let torrentList = "";
    //generate a list of torrents
    movieTorrents.map(torrent => {
        torrentList += `<tr>
            <td class="download-icon">
                <a href="${torrent.magnet_url}">
                    <img id="imdb-torrent-search-icon" src="${magnetImageUrl}">
                </a>
            </td>
            <td>${torrent.quality}</td>
            <td>${torrent.size}</td>
            <td>
                <span class="imdb-torrent-search-seeds">${torrent.seeds}</span> /
                <span class="imdb-torrent-search-peers">${torrent.peers}</span>
            </td>
        </tr>`;
    });

    // return a table with the torrent list
    return `
        <table class="cast_list imdb-torrent-search-table">
            <thead>
                <tr>
                    <th></th>
                    <th>Quality</th>
                    <th>Size</th>
                    <th>Seeds / Peers</th>
                </tr>
            </thead>
            <tbody>
                ${torrentList}
            </tbody>
        </table>
    `;
};

/**
 *
 * @param showEpisodes
 * @returns {string}
 */
const createShowTable = showTorrents => {
    if (Object.keys(showTorrents).length < 1) {
        return `<p>No direct torrents were found.</p>`;
    }
    let htmlOutput = "";

    // magnet image
    const magnetImageUrl = chrome.extension.getURL("img/icon-magnet.gif");

    // loop through generated object
    Object.keys(showTorrents).map(season => {
        // get info for this season
        const seasonList = showTorrents[season];

        // ignore seasons with no episodes
        if (Object.keys(seasonList).length < 1) return;

        // add season header
        htmlOutput += `<tr><th colspan="3">Season ${season}</th></tr>
        <tr><th>Ep</th><th>Title</th><th>Quality</th></tr>`;

        // loop through episodes for this season
        Object.keys(seasonList).map(episode => {
            // get info for this episode
            const episodeInfo = seasonList[episode];

            // ignore episodes without a title
            if (!episodeInfo.title) return;

            // loop through torrents and return a html string
            let qualityList = [];
            Object.keys(episodeInfo.torrents).map(quality => {
                // get info for this quality type
                const qualityInfo = episodeInfo.torrents[quality];

                // ignore quality 0
                if (quality === "0") return;
                qualityList.push(
                    `
                    <a href="${qualityInfo.url}">
                        <img id="imdb-torrent-search-icon" src="${magnetImageUrl}"> ${quality} 
                    </a>
                `
                );
            });

            htmlOutput += `<tr>
                <td>${episode}</td>
                <td>${episodeInfo.title}</td>
                <td>${qualityList.join(", ")}</td>
            </tr>`;
        });
    });

    // return a table with the torrent list
    return `
        <table class="cast_list imdb-torrent-search-table">
            <tbody>
                ${htmlOutput}
            </tbody>
        </table>
    `;
};

/**
 *
 * @param title
 * @returns {string}
 */
const createLinks = title => {
    // encode the title without non alphanumeric
    const encodedTitle = encodeURIComponent(
        title.replace(/[^0-9a-z ]/gi, "").trim()
    );

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
};

module.exports = {
    movieTable: createMovieTable,
    showTable: createShowTable,
    links: createLinks
};
