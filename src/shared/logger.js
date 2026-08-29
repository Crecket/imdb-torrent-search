const enabled = process.env.NODE_ENV === "development";
const noop = () => {};
const prefix = "[imdb-torrent-search]";

export const logger = {
    debug: enabled ? console.debug.bind(console, prefix) : noop,
    warn: console.warn.bind(console, prefix),
    error: console.error.bind(console, prefix),
};

export default logger;
