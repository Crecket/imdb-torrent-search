"use strict";

// styles
require('./scss/content.scss');

// libraries
require("babel-core/register");
require("babel-polyfill");
const Logger = require('./Helpers/Logger');
const Url = require('url');
const $ = require('jquery');
const axios = require('axios');

// constants
const magnetImageUrl = chrome.extension.getURL("img/icon-magnet.gif");

// whether the inline element is visible
let isVisible = false;

/**
 * Do a lookup tp the yts api using a title
 *
 * @param title
 * @returns {Promise.<*>}
 */
const start = async () => {
    // the movie info
    let movieTorrents = [];
    let movieInfo = {};

    // get the title from html and parse it
    const title = $('.title_wrapper h1').text();
    if (!title || title.length <= 0) {
        throw new Error('Couldn\'t find the title from the page');
    }
    // split the year from the title and trim space away
    const titleParsed = title.split('(')[0].trim();

    // do lookup to the yts api
    const result = await checkApi(titleParsed);

    // check if we got enough results
    if (result.data.movie_count > 0) {
        // only the first movie since we do a lookup through the imdb ID
        movieInfo = result.data.movies.shift();

        // map the torrents
        const torrents = movieInfo.torrents;
        torrents.map(torrent => {

            Logger.debug(torrent);

            // the full magnet url
            const magneturl = 'magnet:?' +
                `xt=urn:btih:${torrent.hash}&` +
                `dn=${encodeURIComponent(movieInfo.title_long)}&` +
                'tr=http://track.one:1234/announce&' +
                'tr=udp://open.demonii.com:1337/announce&' +
                'tr=udp://tracker.openbittorrent.com:80&' +
                'tr=udp://tracker.coppersurfer.tk:6969&' +
                'tr=udp://glotorrents.pw:6969/announce&' +
                'tr=udp://tracker.opentrackr.org:1337/announce&' +
                'tr=udp://torrent.gresille.org:80/announce&' +
                'tr=udp://p4p.arenabg.com:1337&' +
                'tr=udp://tracker.leechers-paradise.org:6969&' +
                'tr=udp://track.two:80';

            // create a list
            movieTorrents.push({
                hash: torrent.hash,
                peers: torrent.peers,
                seeds: torrent.seeds,
                quality: torrent.quality,
                size: torrent.size,
                size_bytes: torrent.size_bytes,
                url: torrent.url,
                magnet_url: magneturl
            });
        });
    }

    // update the inline result
    displayInline(movieInfo, movieTorrents, isVisible);

    // startup was successful
    return true;
}

/**
 * Displays the inline div based on lookup results
 *
 * @param movieInfo
 * @param movieTorrents
 * @param isVisible
 * @returns {*|jQuery}
 */
const displayInline = (movieInfo, movieTorrents, isVisible) => {
    // if not visible, remove and don't do anything else
    if (!isVisible) return $('#imdb-torrent-search-inline').html("");

    // encode the title without non alphanumeric
    const encodedTitle = encodeURIComponent(movieInfo.title.replace(/[^0-9a-z ]/gi, ''));

    let torrentList = "";
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

    // render the results
    $('#imdb-torrent-search-inline').html(`
        <br/>
        <table class="cast_list imdb-torrent-search">
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
            <tr>
                <td rowspan="5">
                    <p>Search links:<p/>
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
                </td>
            </tr>
        </tbody></table>
    `);
}

/**
 * Does lookup to the yts api
 *
 * @param query
 * @param params
 * @returns {Promise.<void>}
 */
const checkApi = async (query, params = {}) => {
    // combine parameters
    const finalParams = Object.assign({}, {
        query_term: query,
        limit: 10,
    }, params);

    // do the api call
    const ytsResult = await axios.get('https://yts.ag/api/v2/list_movies.json', {
        params: finalParams
    });

    // return the results
    return ytsResult.data;
}

// create image for click event and other interactions
$('.title_wrapper h1').append(`<img id="imdb-torrent-search-icon" src="${magnetImageUrl}">`);

// append the inline block so we can modify it more easily
$('.title_block').append(`<div id="imdb-torrent-search-inline"></div>`)

// attach click listener
$('#imdb-torrent-search-icon').on('click', () => {
    // toggle show inline state
    isVisible = !isVisible;

    // show loader if we're showing the inline result
    if (isVisible) $('#imdb-torrent-search-inline').html('<p>Loading</p>');

    // start the extension content script
    start().then(_ => {
    }).catch(Logger.error);
});

// axios.get('https://torrentapi.org/pubapi_v2.php?mode=search&search_imdb=tt0944947&token=wv5plcyxjs').then(console.log).catch(console.log);
// axios.get('https://extratorrent.cc/rss.xml?type=today&cid=8').then(console.log).catch(console.log);
// axios.get('https://api.trakt.tv/search/movie?query=game%20of%20thrones',{
//     headers:{
//         "Content-Type": "application/json",
//         "trakt-api-verison": 2,
//         "trakt-api-key": "ec8d479365b089d5baf2180349bb3f4c2df640da93ec862f9dc15445f26f2e1e"
//     }
// }).then(console.log).catch(console.log);
