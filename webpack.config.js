"use strict";

// dependencies
const path = require("path");
const webpack = require("webpack");
const ExtractTextPlugin = require("extract-text-webpack-plugin");

// src and build dirs
const SRC_DIR = path.resolve(__dirname, "src");
const BUILD_DIR = path.resolve(__dirname, "extension");
const OUTPUT_DIR = "build";

// env variable check
const DEV = process.env.NODE_ENV !== "production";

let config = {
    entry: {
        popup: `${SRC_DIR}/popup.js`,
        content: `${SRC_DIR}/content.js`
    },
    output: {
        path: BUILD_DIR,
        filename: `${OUTPUT_DIR}/[name].js`,
        publicPath: "/",
        chunkFilename: `${OUTPUT_DIR}/[chunkhash].bundle.js`
    },
    resolve: {
        extensions: [".jsx", ".scss", ".js", ".json", ".css"],
        modules: [
            "node_modules",
            path.resolve(__dirname, "/node_modules"),
            path.resolve(__dirname, "/src")
        ]
    },
    // devtool for source maps
    devtool: DEV ? "source-map" : false,
    plugins: [
        // stop emit if we get errors
        new webpack.NoEmitOnErrorsPlugin(),
        //extract any css files
        new ExtractTextPlugin({
            filename: OUTPUT_DIR + "/[name].css",
            disable: false,
            allChunks: true
        }),
        // SwPrecachePlugin,
        new webpack.DefinePlugin({
            PRODUCTION_MODE: JSON.stringify(!DEV),
            DEVELOPMENT_MODE: JSON.stringify(DEV),
            "process.env.DEBUG": JSON.stringify(DEV),
            "process.env.NODE_ENV": JSON.stringify(
                process.env.NODE_ENV || "development"
            ),
            "process.env.WEBPACK_MODE": JSON.stringify(true)
        }),
        new webpack.ProvidePlugin({
            $: "jquery",
            jQuery: "jquery"
        })
    ],
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                exclude: /(node_modules|bower_components)/,
                use: [
                    {
                        loader: "babel-loader"
                    }
                ]
            },
            {
                test: /\.css$/,
                use: ExtractTextPlugin.extract({
                    fallback: "style-loader!css-loader",
                    use: "css-loader"
                })
            },
            {
                test: /\.scss$/,
                use: ExtractTextPlugin.extract({
                    fallback: "style-loader!css-loader!sass-loader",
                    use: "css-loader!sass-loader"
                })
            },
            {
                test: /\.(ttf|eot|svg|woff|woff2)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
                use: [
                    {
                        loader: "file-loader?name=build/fonts/[name].[ext]"
                    }
                ]
            }
        ]
    }
};

if (!DEV) {
    // production only plugins

    // uglify plugin
    config.plugins.push(
        new webpack.optimize.UglifyJsPlugin({
            sourceMap: true,
            minimize: true,
            comments: false,
            compress: {
                warnings: false,
                drop_console: true
            }
        })
    );
} else {
    // development only plugins
}

module.exports = config;
