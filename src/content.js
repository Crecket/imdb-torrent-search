"use strict";

// styles
require("./scss/content.scss");

// libraries
require("babel-core/register");
require("babel-polyfill");
const Url = require("url");
const $ = require("jquery");
const axios = require("axios");

// extension files
const Logger = require("./Helpers/Logger");
const Templates = require("./Helpers/Templates");

// global settings for caching
let isVisible = false;
let displayLinks = false;
let autoShow = false;
let showTorrents = {};
let movieTorrents = [];

// magnet image
const logoImageUrl = chrome.extension.getURL("img/logo-16x16.png");

// get the imdb id from the pathname
const imdbIDmatches = location.pathname.match(/(tt[0-9]{5,8})/);
const imdbID = imdbIDmatches[0];

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

    // prepare div
    $("#imdb-torrent-search-inline")
        .html("<hr/><div id=\"imdb-torrent-links\"></div><hr/><div id=\"imdb-torrent-magnets\">Loading...</div>");

    // generate templates
    const links = displayLinks ? await Templates.links(imdbID, imdbInfo) : "";
    // update the links
    $("#imdb-torrent-links").html(links);

    // check which type of call we have to do
    let htmlOutput = "";
    switch (imdbInfo.Type) {
        case "movie":
            // this page contains a movie
            htmlOutput = await getMovie();
            break;
        case "series":
            // this page contains a series
            htmlOutput = await getSeries();
    }

    Logger.debug("Start end", {html: htmlOutput});

    // update the magnets
    $("#imdb-torrent-magnets").html(htmlOutput);

    // startup was successful
    return true;
};

/**
 * Toggle the current output state
 */
const toggleOutput = () => {
    // toggle show inline state
    isVisible = !isVisible;

    // show loader if we're showing the inline result
    if (isVisible) $("#imdb-torrent-search-inline").html("<p>Loading</p>");

    // start the extension content script
    start()
        .then((_) => {
        })
        .catch(Logger.error);
};

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
    if (!result || !result.torrents) return "No download results";

    let jsonTorrents = result.torrents

    // loop through episodes and generated a sorted/formatted object
    jsonTorrents.map((torrent) => {
        // if doesn't exist yet create empty object slot
        if (!showTorrents[torrent.season]) showTorrents[torrent.season] = {};
        // add episode to this season
        if (showTorrents[torrent.season][torrent.episode])
            showTorrents[torrent.season][torrent.episode].torrents.push(torrent)
        else
            showTorrents[torrent.season][torrent.episode] = {
                episode: torrent.episode,
                season: torrent.season,
                title: torrent.title,
                torrents: [torrent],
            };
    });

    Logger.debug("Show result", showTorrents);

    return Templates.showTable(showTorrents);
};

/**
 * Fetches torrent information for a given imdbID
 * @returns {Promise.<*>}
 */
const getMovie = async () => {
    // do lookup to the yts api
    const result = await checkPPTApi(imdbID, "movie");

    Logger.debug("Movie", result);

    // require atleast one result
    if (!result) return "No download results";

    let jsonTorrents = result.data.movies[0].torrents

    // check if we got enough results
    if (Object.keys(jsonTorrents).length > 0) {
        // loop through available torrents
        Object.keys(jsonTorrents).map((quality) => {
            // get torrent info
            const torrent = jsonTorrents[quality];

            // create a list
            movieTorrents.push({
                peers: torrent.peers,
                seeds: torrent.seeds,
                quality: torrent.quality,
                size: torrent.size,
                size_bytes: torrent.size_bytes,
                magnet_url: torrent.url,
            });
        });
    }

    Logger.debug("Movie result", movieTorrents);

    return Templates.movieTable(movieTorrents);
};

/**
 * Does lookup to the popcorntime API
 *
 * @param imdbID
 * @param type
 * @returns {Promise.<*|Promise.<TResult>>}
 */
const checkPPTApi = async (imdbID, type = "movie") => {
    // do the api call and return the result
    return new Promise(async (resolve, reject) => {
        chrome.runtime.sendMessage({type: type, imdbID: imdbID}, (response) => {
            resolve(response.data);
        });
    }).catch(Logger.error);
};

/**
 * Get info from the unofficial imdb api for this imdbID
 * @returns {Promise.<*|Promise.<TResult>>}
 */
const getImdbInfo = async () => {
    // extract title
    const imdbTitle = $(".ipc-page-section h1").text();
    // extract secondary text
    const subheader = $(".ipc-inline-list li.ipc-inline-list__item")
    const typeHtml = subheader.first().text();
    // check if the secondary text contains "Series"
    const typeMatches = typeHtml.match(/(Series|Episode)/i);
    const type = typeMatches && typeMatches.length > 0 ? "series" : "movie";

    // remove year from title
    const imdbTitleText = imdbTitle.replace(/\([0-9]*\)/, "").trim();


    // Get year
    const year = type === "series" ? subheader.first().next().find('span').text() : subheader.first().find('span').text();

    // do the api call
    return {
        Title: imdbTitleText,
        Year: year.replace(/[^0-9]+/, "").trim(),
        Type: type,
    };
};

// create image for click event and other interactions
$(".ipc-page-section h1").append(`<img id="imdb-torrent-search-icon" src="${logoImageUrl}">`);

// append the inline block so we can modify it more easily
$(".ipc-page-section").append(`<div id="imdb-torrent-search-inline"></div>`);

// attach click listener
$("#imdb-torrent-search-icon").on("click", () => {
    toggleOutput();
});

chrome.storage.local.get(["autoShow", "displayLinks"], function (res) {
    autoShow = !!res.autoShow;
    displayLinks = !!res.displayLinks;

    if (autoShow) {
        // show the torrent resutls by default
        toggleOutput();
    }
});
