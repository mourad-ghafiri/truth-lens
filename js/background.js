/**
 * Background Script
 * Handles context menu and side panel behavior
 */

// Setup context menu
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "check-selection",
        title: "Fact Check with Truth Lens",
        contexts: ["selection"]
    });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "check-selection") {
        // Open the side panel
        // As of Chrome 116+, we can open side panel programmatically on user gesture
        await chrome.sidePanel.open({ windowId: tab.windowId });

        // Wait a small moment for side panel to initialize if it wasn't open
        setTimeout(() => {
            chrome.runtime.sendMessage({
                action: "checkSelection", // Matches handler in js/sidepanel/main.js
                text: info.selectionText
            }).catch(err => {
                console.log("Could not send immediate message to side panel", err);
            });
        }, 500);
    }
});

// Enable side panel on action click (toolbar icon)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
