const axios = require("axios");
const Logger = require("./Helpers/Logger");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    Logger.debug("Received request", request);

    axios
        .get(`https://tv-v2.api-fetch.sh/${request.type}/${request.imdbID}`)
        .then(result => sendResponse({ data: result.data }))
        .catch(error => Logger.error(error));

    return true; // async response
});
