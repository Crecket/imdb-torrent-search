const fs = require("fs");
const archiver = require("archiver");
const package_json = require("./package.json");

// create output stream
let output = fs.createWriteStream(
    __dirname + "/releases/extension_v" + package_json.version + ".zip"
);
// create new zip file
let archive = archiver("zip");

output.on("close", () => {
    console.log(archive.pointer() + " total bytes");
});
archive.on("error", err => {
    throw err;
});

// pipe all output into the writestream
archive.pipe(output);

// add files from extension folder to the zip
archive.glob("**/*", {
    cwd: "extension"
});

// finalize the zip file and write it
archive.finalize();
