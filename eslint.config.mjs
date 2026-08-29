import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,
    {
        files: ["src/**/*.js"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            // `process.env.NODE_ENV` is substituted by esbuild's define at build
            // time; it never reaches the browser.
            globals: {
                ...globals.browser,
                ...globals.serviceworker,
                chrome: "readonly",
                process: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            eqeqeq: ["error", "smart"],
            "no-var": "error",
            "prefer-const": "error",
            "no-console": ["warn", { allow: ["warn", "error", "debug", "log", "table"] }],
        },
    },
    {
        files: ["tests/**/*.js"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: { ...globals.node, ...globals.jest, ...globals.browser, chrome: "writable" },
        },
    },
    {
        files: ["scripts/**/*.mjs"],
        languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: globals.node },
    },
];
