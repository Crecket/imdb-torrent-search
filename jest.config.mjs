export default {
    testEnvironment: "jsdom",
    testMatch: ["**/tests/**/*.test.js"],
    transform: {},
    collectCoverageFrom: ["src/**/*.js", "!src/**/index.js", "!src/background/service-worker.js"],
};
