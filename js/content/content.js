/**
 * Main Content Script Interface
 * Orchestrates content extraction for both pages and video transcripts
 */

// Listen for messages from the side panel or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageContent") {
        handleContentRequest(sendResponse);
        return true; // Keep channel open for async response
    }
    return true;
});

/**
 * Handles the content request by determining the type and delegating to specific extractors
 */
async function handleContentRequest(sendResponse) {
    try {
        const isYT = isYouTubePage();
        let content = '';

        if (isYT) {
            console.log('[Truth Lens] Detected YouTube content');
            content = await extractYouTubeTranscript();

            // Fallback to page content if transcript fails completely
            if (!content || content.startsWith('[Error')) {
                console.log('[Truth Lens] Transcript failed, falling back to page description');
                // We might want to construct a fallback here using page metadata
                // But extractYouTubeTranscript already tries to get title/desc
            }
        } else {
            console.log('[Truth Lens] Detected standard page content');
            content = extractPageContent();
        }

        sendResponse({
            content: content || 'No content could be extracted.',
            isYouTube: isYT
        });

    } catch (error) {
        console.error('[Truth Lens] Extraction error:', error);
        sendResponse({
            content: `Error extracting content: ${error.message}`,
            isYouTube: false
        });
    }
}
