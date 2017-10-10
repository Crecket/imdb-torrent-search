"use strict";

// load the styles
require("materialize-css/sass/materialize.scss");
require("./scss/popup.scss");

const renderPopupSettings = () => {
    // set default state for the checkbox
    chrome.storage.local.get(
        ["autoShow", "displayLinks", "customUrls"],
        result => {
            // set the checkbox state
            $(".autoshow-torrents-checkbox").prop("checked", !!result.autoShow);

            // default this setting to true
            if (typeof result.displayLinks === "undefined") {
                chrome.storage.local.set({ displayLinks: true });
                result.displayLinks = true;
            }
            // set the checkbox state
            $(".autoshow-links-checkbox").prop(
                "checked",
                !!result.displayLinks
            );

            // default to empty array
            let customUrls =
                result.customUrls !== undefined ? result.customUrls : [];

            $("#custom-links-list").html("");
            customUrls.map((customUrl, customUrlKey) => {
                if (customUrl === null) return;
                $("#custom-links-list").append(`
<li class="collection-item">
    <div>
        ${customUrl.urlTemplate}
        <div class="secondary-content">
            <a class="remove-custom-link" data-url-key="${customUrlKey}" >
                <i class="material-icons">delete</i>        
            </a>
        </div>
    </div>
</li>`);
            });
        }
    );
};

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

// handle click event for custom site removal
$(document.body).on("click", ".remove-custom-link", event => {
    // fetch the latest customUrls
    chrome.storage.local.get(["customUrls"], result => {
        // default to empty array
        let customUrls =
            result.customUrls !== undefined ? result.customUrls : [];

        const urlKey = $(event.target).data("url-key");
        // delete customUrls[urlKey];
        customUrls.splice(parseInt(urlKey), 1);

        // store the new list
        chrome.storage.local.set({ customUrls: customUrls });

        Materialize.toast(
            "Removed your custom site successfully!",
            3000,
            "blue darken-1 white-text"
        );

        renderPopupSettings();
    });
});

// handle form for new custom torrent sites
$("#custom_torrent_form").on("submit", event => {
    event.preventDefault();

    const iconInput = $("#icon_url_custom")
        .val()
        .trim();
    const urlTemplate = $("#url_template_custom")
        .val()
        .trim();

    // fallback to google's favicon lookup
    const iconUrl =
        iconInput.length <= 0
            ? `https://www.google.com/s2/favicons?domain=${urlTemplate}`
            : iconInput;

    const templateTest = urlTemplate.replace(/\$\{name\}/, "abcd :(");
    if (templateTest === urlTemplate) {
        // nothing was replaced, the template seems to be broken
        Materialize.toast(
            "It looks like your template isn't correct!",
            3000,
            "red white-text"
        );
        return false;
    }

    // fetch the latest customUrls
    chrome.storage.local.get(["customUrls"], result => {
        // default to empty array
        let customUrls =
            result.customUrls !== undefined ? result.customUrls : [];

        customUrls.push({
            iconUrl: iconUrl,
            urlTemplate: urlTemplate
        });

        // store the new list
        chrome.storage.local.set({ customUrls: customUrls });

        Materialize.toast(
            "Added your template successfully!",
            3000,
            "blue darken-1 white-text"
        );

        renderPopupSettings();

        // reset inputs
        $("#icon_url_custom").val("");
        $("#url_template_custom").val("");
    });
});

renderPopupSettings();
