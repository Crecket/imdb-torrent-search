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

// global settings for caching
let isVisible = false;
let showTorrents = {};
let movieTorrents = [];

// magnet image
const logoImageUrl = chrome.extension.getURL("img/logo-16x16.png");

// remove /title/ and trailing slash from pathname
const imdbID = location.pathname.replace(/(\/title\/)|\//g, '');

/**
 * Check the imdb info for this page and do a corresponding api call to fetch the results
 *
 * @returns {Promise.<*>}
 */
const start = async () => {
    // reset info
    showTorrents = {};
    movieTorrents = [];

    // get the info for this movie/series so we have to parse less html
    const imdbInfo = await getImdbInfo();

    Logger.debug("Start ", imdbInfo);

    // check which type of call we have to do
    let htmlOutput = "";
    switch (imdbInfo.Type) {
        case "movie":
            // this page contains a movie
            htmlOutput = await getMovie();
            break;
        case "series":
            // this page contains a movie
            htmlOutput = await getSeries();
    }

    Logger.debug("Start end", htmlOutput);

    // update the inline result
    displayInline(imdbInfo, htmlOutput, isVisible);

    // startup was successful
    return true;
}

/**
 * Do a lookup to the popcorntime api for the imdb id
 *
 * @returns {Promise.<*>}
 */
const getSeries = async () => {
    // do lookup to the yts api
    const result = await checkPPTApi(imdbID, "show");

    Logger.debug("Show", result);

    // require atleast one result
    if (!result) return "";

    // loop through episodes and generated a sorted/formatted object
    result.episodes.map(episode => {
        // if doesn't exist yet create empty object slot
        if (!showTorrents[episode.season]) showTorrents[episode.season] = {};
        // add episode to this season
        showTorrents[episode.season][episode.episode] = {
            episode: episode.episode,
            season: episode.season,
            title: episode.title,
            torrents: episode.torrents
        };
    });

    Logger.debug("Show result", showTorrents);

    return Templates.showTable(showTorrents);
}

/**
 * Fetches torrent information for a given imdbID
 * @returns {Promise.<*>}
 */
const getMovie = async () => {
    // do lookup to the yts api
    const result = await checkPPTApi(imdbID, "movie");

    Logger.debug("Movie", result);

    // require atleast one result
    if (!result) return "";

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

    Logger.debug("Movie result", movieTorrents);

    return Templates.movieTable(movieTorrents);
};

/**
 * Displays the inline div based on lookup results
 *
 * @param imdbInfo
 * @param htmlOutput
 * @param isVisible
 * @returns {*|jQuery}
 */
const displayInline = (imdbInfo, htmlOutput, isVisible) => {
    // if not visible, remove and don't do anything else
    if (!isVisible) return $('#imdb-torrent-search-inline').html("");

    // generate templates
    const links = Templates.links(imdbInfo.Title);

    // render the results
    $('#imdb-torrent-search-inline').html(`
        <hr/>
        ${htmlOutput}
        <hr/>
        ${links}
    `);
}

/**
 * Does lookup to the popcorntime API
 *
 * @param imdbID
 * @param type
 * @returns {Promise.<*|Promise.<TResult>>}
 */
const checkPPTApi = async (imdbID, type = "movie") => {
    // do the api call and return the result
    return await axios.get(`https://tv-v2.api-fetch.website/${type}/${imdbID}`).then(result => result.data);
}

/**
 * Get info from the unofficial imdb api for this imdbID
 *
 * @returns {Promise.<*|Promise.<TResult>>}
 */
const getImdbInfo = async () => {
    // do the api call
    return await axios.get(`http://www.omdbapi.com/?i=${imdbID}`).then(result => result.data);
};

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
