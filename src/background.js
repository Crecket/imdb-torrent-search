const axios = require("axios");
const Logger = require("./Helpers/Logger");

const getShow = (id, page) => {
    return new Promise((resolve, reject) => {
        axios
            .get(`https://eztv.re/api/get-torrents?limit=100&imdb_id=${id}&page=${page}`)
            .then((result) => {
                resolve(result.data.torrents);
            })
            .catch((error) => {
                Logger.error(error);
                reject(error);
            });
    });
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    Logger.debug("Received request", request);

    if (request.type === "movie")
        axios
            .get(`https://yts.mx/api/v2/list_movies.json?query_term=${request.imdbID}`)
            .then((result) => sendResponse({ data: result.data }))
            .catch((error) => Logger.error(error));
    else {
        let imdbID = request.imdbID.replace(/[a-z]+/i, "");
        let allShows = [];
        let pagination = 1;

        const getShows = () => {
            if (pagination === false) {
                sendResponse({ data: allShows });
                return;
            }

            getShow(imdbID, pagination)
                .then((shows) => {
                    // Combine the show list
                    allShows = [...allShows, ...shows];

                    // if 100 were returned, more pages are available
                    if (shows.length === 100) {
                        pagination += 1;
                    } else {
                        pagination = false;
                    }

                    // go again
                    getShows();
                })
                .catch((error) => {
                    Logger.error(error);
                });
        };

        // Do initial fetch
        getShows();
    }

    return true; // async response
});
