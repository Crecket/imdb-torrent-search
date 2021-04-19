const Logger = require("./Logger");

/**
 *
 * @param movieTorrents
 * @returns {string}
 */
const createMovieTable = (movieTorrents) => {
    if (movieTorrents.length < 1) {
        return `<p>No direct torrents were found.</p>`;
    }

    // magnet image
    const magnetImageUrl = chrome.extension.getURL("img/icon-magnet.gif");

    let torrentList = "";
    //generate a list of torrents
    movieTorrents.map((torrent) => {
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
const createShowTable = (showTorrents) => {
    if (Object.keys(showTorrents).length < 1) {
        return `<p>No direct torrents were found.</p>`;
    }
    let htmlOutput = "";

    // magnet image
    const magnetImageUrl = chrome.extension.getURL("img/icon-magnet.gif");

    // loop through generated object
    Object.keys(showTorrents).map((season) => {
        // get info for this season
        const seasonList = showTorrents[season];

        // ignore seasons with no episodes
        if (Object.keys(seasonList).length < 1) return;

        // add season header
        htmlOutput += `<tr><th colspan="3">Season ${season}</th></tr>
        <tr><th>Ep</th><th>Title</th><th>Quality</th></tr>`;

        // loop through episodes for this season
        Object.keys(seasonList).map((episode) => {
            // get info for this episode
            const episodeInfo = seasonList[episode];

            // ignore episodes without a title
            if (!episodeInfo.title) return;

            // loop through torrents and return a html string
            let qualityList = [];
            Object.keys(episodeInfo.torrents).map((i) => {
                const torrent = episodeInfo.torrents[i];

                // get info for this quality type
                let match = /(240p|360p|480p|720p|1080p|1440p|2160p|4k|8k)/ig.exec(torrent.title);
                if(!match || match.length < 2) return;
                let quality = match[1]

                qualityList.push(
                    `
                    <a href="${torrent.magnet_url}">
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
 * @param imdbID
 * @param imdbInfo
 * @returns {string}
 */
const createLinks = async (imdbID, imdbInfo) => {
    return new Promise((resolve, reject) => {
        // encode the title without non alphanumeric
        const encodedTitle = encodeURIComponent(imdbInfo.Title.replace(/[^0-9a-z ]/gi, "").trim());

        // fetch the latest customUrls
        chrome.storage.local.get(["customUrls"], (result) => {
            let customUrls = result.customUrls !== undefined ? result.customUrls : [];

            Logger.debug("customUrls", customUrls);

            // generate a list of urls and icons for the template
            let customUrlsResult = "";
            customUrls.map((customUrl, key) => {
                const urlTemplate = customUrl.urlTemplate.replace(/\$\{name\}/, encodedTitle)
                    .replace(/\$\{year\}/, imdbInfo.Year)
                    .replace(/\$\{imdbID\}/, imdbID);

                customUrlsResult += `
<a href="${urlTemplate}" target="_blank">
    <img src="${customUrl.iconUrl}"/>
</a>`;
            });

            // return the list of links to search pages for
            resolve(`<div class="imdb-torrent-search-links">
    <b>Search links:<p/>
    <a href="https://thepiratebay.org/search/${imdbID}/0/99/0" target="_blank">
        <img src="${chrome.extension.getURL("img/tpb-favicon.png")}"/>
    </a>
    <a href="https://1337x.to/search/${encodedTitle}+${imdbInfo.Year}/1/" target="_blank">
        <img src="${chrome.extension.getURL("img/1337x-favicon.png")}"/>
    </a>
    <a href="https://rarbg.to/torrents.php?search=${imdbID}" target="_blank">
        <img src="${chrome.extension.getURL("img/rargb-favicon.png")}"/>
    </a>
    <a href="https://ibit.to/torrent-search/${imdbID}/" target="_blank">
        <img src="${chrome.extension.getURL("img/ibit-favicon.png")}"/>
    </a>
    <a href="https://www.aiosearch.com/search/4/Torrents/${encodedTitle}%20${imdbInfo.Year}/" target="_blank">
        <img src="${chrome.extension.getURL("img/aiosearch-favicon.png")}"/>
    </a>
    ${customUrlsResult}
</div>`);
        });
    });
};

module.exports = {
    movieTable: createMovieTable,
    showTable: createShowTable,
    links: createLinks,
};
