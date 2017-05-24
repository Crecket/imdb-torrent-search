"use strict";

// load the styles
require("materialize-css/sass/materialize.scss");
require("./scss/popup.scss");

// click events for checkboxes
$(".autoshow-torrents-checkbox").on("click", event => {
    // get new checked state
    const isChecked = $(event.target).prop("checked");
    // store it in localstorage
    chrome.storage.local.set({ autoShow: isChecked });
});
$(".autoshow-links-checkbox").on("click", event => {
    // get new checked state
    const isChecked = $(event.target).prop("checked");
    // store it in localstorage
    chrome.storage.local.set({ displayLinks: isChecked });
});

// set default state for the checkbox
chrome.storage.local.get(["autoShow", "displayLinks"], function(result) {
    // set the checkbox state
    $(".autoshow-torrents-checkbox").prop("checked", !!result.autoShow);

    // default this setting to true
    if (typeof result.displayLinks === "undefined") {
        chrome.storage.local.set({ displayLinks: true });
        result.displayLinks = true;
    }
    // set the checkbox state
    $(".autoshow-links-checkbox").prop("checked", !!result.displayLinks);
});
