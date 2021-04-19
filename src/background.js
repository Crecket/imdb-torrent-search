const axios = require("axios");
const Logger = require("./Helpers/Logger");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    Logger.debug("Received request", request);

    if(request.type === 'movie')
        axios
            .get(`https://yts.mx/api/v2/list_movies.json?query_term=${request.imdbID}`)
            .then((result) => sendResponse({ data: result.data }))
            .catch((error) => Logger.error(error));
    else {
        let imdbID = request.imdbID.replace(/[a-z]+/i, '');
        axios
            .get(`https://eztv.re/api/get-torrents?limit=100&imdb_id=${imdbID}`)
            .then((result) => sendResponse({data: result.data}))
            .catch((error) => Logger.error(error));
    }

    return true; // async response
});
