
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
        // Note: As of Chrome 116+, we can open side panel programmatically on user gesture
        await chrome.sidePanel.open({ windowId: tab.windowId });

        // Wait a small moment for side panel to initialize if it wasn't open
        setTimeout(() => {
            chrome.runtime.sendMessage({
                action: "checkSelection",
                text: info.selectionText
            }).catch(err => {
                // If side panel is not fully ready or message fails, we might want to retry or store it
                console.log("Could not send immediate message to side panel", err);
            });
        }, 500);
    }
});

// Optional: Enable side panel on action click (toolbar icon)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
