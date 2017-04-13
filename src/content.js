"use strict";

// styles
require('./scss/content.scss');

// libraries
require("babel-core/register");
require("babel-polyfill");
const Url = require('url');
const $ = require('jquery');
const axios = require('axios');

// extension files
const Logger = require('./Helpers/Logger');
const Templates = require('./Helpers/Templates');

// whether the inline element is visible
let isVisible = false;

// magnet image
const logoImageUrl = chrome.extension.getURL("img/logo-16x16.png");

/**
 * Do a lookup tp the yts api using a title
 *
 * @param title
 * @returns {Promise.<*>}
 */
const start = async () => {
    let movieTorrents = [];
    let title = "";

    // remove /title/ and trailing slash from pathname
    const imdbID = location.pathname.replace(/(\/title\/)|\//g, '');

    // get the title from html and parse it, use the originalTitle if one is present
    const originalTitle = $('.originalTitle').text();
    if (!originalTitle || originalTitle.length <= 0) {
        // fall back to the default title
        title = $('.title_wrapper h1').text();
        if (!title || title.length <= 0) {
            throw new Error('Couldn\'t find the title from the page');
        }
    } else {
        // we have a original title, use that instead
        title = originalTitle;
    }

    // split the year/extra info from the title and trim spaces
    const titleParsed = title.split('(')[0].trim();

    // do lookup to the yts api
    const result = await checkApi(imdbID);

    if (result.length < 1) {
        // imdb ID not found
        return false;
    }

    // check if we got enough results
    if (Object.keys(result.torrents).length > 0) {
        // prefer en language but fallback to the first key in the list
        const lang = result.torrents.en ? "en" : (Object.keys(result.torrents).shift());

        // get torrent list
        const torrents = result.torrents[lang];

        // loop through available torrents
        Object.keys(torrents).map((quality) => {
            // get torrent info
            const torrent = torrents[quality];

            console.log(torrents, torrent);

            // create a list
            movieTorrents.push({
                peers: torrent.peer,
                seeds: torrent.seed,
                quality: quality,
                size: torrent.filesize,
                size_bytes: torrent.size,
                magnet_url: torrent.url
            });
        });
    }

    // update the inline result
    displayInline(titleParsed, movieTorrents, isVisible);

    // startup was successful
    return true;
}

/**
 * Displays the inline div based on lookup results
 *
 * @param title
 * @param movieTorrents
 * @param isVisible
 * @returns {*|jQuery}
 */
const displayInline = (title, movieTorrents, isVisible) => {
    // if not visible, remove and don't do anything else
    if (!isVisible) return $('#imdb-torrent-search-inline').html("");

    // generate templates
    const table = Templates.table(movieTorrents);
    const links = Templates.links(title);

    // render the results
    $('#imdb-torrent-search-inline').html(`
        <hr/>
        ${table}
        <hr/>
        ${links}
    `);
}

/**
 * Does lookup to the popcorntime API
 *
 * @param imdbID
 * @returns {Promise.<void>}
 */
const checkApi = async (imdbID, type = "movie") => {
    // do the api call
    const apiResult = await axios.get(`https://tv-v2.api-fetch.website/${type}/${imdbID}`);

    // return the result data
    return apiResult.data;
}

// create image for click event and other interactions
$('.title_wrapper h1').append(`<img id="imdb-torrent-search-icon" src="${logoImageUrl}">`);

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
