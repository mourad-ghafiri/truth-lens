
// Listen for messages from the side panel or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageContent") {
        const isYT = isYouTubePage();
        // Handle async extraction for YouTube
        extractRelevantContent().then(content => {
            sendResponse({ content, isYouTube: isYT });
        }).catch(err => {
            console.error('Content extraction error:', err);
            sendResponse({ content: 'Error extracting content: ' + err.message, isYouTube: isYT });
        });
        return true; // Keep the message channel open for async response
    }
    return true;
});

/**
 * Extracts the most relevant content from a page using multiple strategies.
 * Prioritizes article content, main content areas, and structured data.
 * Special handling for YouTube videos.
 */
async function extractRelevantContent() {
    // Special handling for YouTube
    if (isYouTubePage()) {
        return await extractYouTubeContent();
    }

    let content = '';

    // Strategy 1: Look for article/main content containers (most reliable)
    const mainContent = findMainContent();
    if (mainContent && mainContent.length > 200) {
        content = mainContent;
    } else {
        // Strategy 2: Fallback to cleaned body text
        content = getCleanedBodyText();
    }

    // Add page metadata for context
    const metadata = extractMetadata();

    // Combine metadata and content
    let result = '';
    if (metadata.title) {
        result += `Title: ${metadata.title}\n`;
    }
    if (metadata.description) {
        result += `Description: ${metadata.description}\n`;
    }
    if (metadata.author) {
        result += `Author: ${metadata.author}\n`;
    }
    if (metadata.publishDate) {
        result += `Published: ${metadata.publishDate}\n`;
    }

    result += '\n--- Content ---\n\n';
    result += content;

    // Normalize whitespace
    result = result.replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').trim();

    return result;
}

/**
 * Finds the main content area using common selectors and heuristics.
 */
function findMainContent() {
    // Priority list of selectors commonly used for main article content
    const contentSelectors = [
        'article',
        '[role="main"]',
        'main',
        '.post-content',
        '.article-content',
        '.article-body',
        '.entry-content',
        '.post-body',
        '.story-body',
        '.content-body',
        '#article-body',
        '#content',
        '.content',
        '[itemprop="articleBody"]'
    ];

    for (const selector of contentSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            // Get the element with the most text content
            let bestElement = null;
            let maxLength = 0;

            elements.forEach(el => {
                const text = cleanElementText(el);
                if (text.length > maxLength) {
                    maxLength = text.length;
                    bestElement = el;
                }
            });

            if (bestElement && maxLength > 200) {
                return cleanElementText(bestElement);
            }
        }
    }

    return null;
}

/**
 * Cleans text from an element by removing unwanted children.
 */
function cleanElementText(element) {
    const clone = element.cloneNode(true);

    // Remove non-content elements
    const unwantedSelectors = [
        'script', 'style', 'nav', 'footer', 'header', 'aside',
        'noscript', 'iframe', 'form', 'button', 'input',
        '.ad', '.ads', '.advertisement', '.social-share',
        '.comments', '.sidebar', '.related-posts', '.newsletter',
        '.subscription', '.promo', '[role="navigation"]',
        '[role="complementary"]', '[aria-hidden="true"]'
    ];

    unwantedSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Get text and clean it up
    let text = clone.innerText || clone.textContent || '';

    // Remove common noise patterns
    text = text.replace(/Share this article/gi, '');
    text = text.replace(/Follow us on/gi, '');
    text = text.replace(/Subscribe to/gi, '');
    text = text.replace(/Sign up for/gi, '');
    text = text.replace(/Advertisement/gi, '');
    text = text.replace(/Sponsored/gi, '');

    return text.trim();
}

/**
 * Fallback: Get cleaned body text when no main content is found.
 */
function getCleanedBodyText() {
    const clone = document.body.cloneNode(true);

    // Aggressive removal of non-content elements
    const toRemove = clone.querySelectorAll(`
        script, style, nav, footer, header, aside, noscript, iframe,
        form, button, input, select, textarea, svg, canvas,
        .ad, .ads, .advertisement, .banner, .popup, .modal,
        .sidebar, .menu, .navigation, .nav, .comments, .social,
        .share, .related, .recommended, .newsletter, .subscribe,
        [role="navigation"], [role="banner"], [role="complementary"],
        [aria-hidden="true"], [hidden]
    `);
    toRemove.forEach(el => el.remove());

    return clone.innerText || '';
}

/**
 * Extracts useful metadata from the page.
 */
function extractMetadata() {
    const metadata = {
        title: null,
        description: null,
        author: null,
        publishDate: null
    };

    // Title
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    metadata.title = ogTitle?.content || twitterTitle?.content || document.title || null;

    // Description
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const metaDesc = document.querySelector('meta[name="description"]');
    metadata.description = ogDesc?.content || metaDesc?.content || null;

    // Author
    const authorMeta = document.querySelector('meta[name="author"]');
    const authorLink = document.querySelector('[rel="author"]');
    const authorSpan = document.querySelector('[itemprop="author"]');
    metadata.author = authorMeta?.content || authorLink?.textContent || authorSpan?.textContent || null;

    // Publish Date
    const timeMeta = document.querySelector('meta[property="article:published_time"]');
    const timeElement = document.querySelector('time[datetime]');
    const datePublished = document.querySelector('[itemprop="datePublished"]');
    metadata.publishDate = timeMeta?.content || timeElement?.getAttribute('datetime') || datePublished?.content || null;

    // Format date if found
    if (metadata.publishDate) {
        try {
            const date = new Date(metadata.publishDate);
            metadata.publishDate = date.toLocaleDateString();
        } catch (e) {
            // Keep original if parsing fails
        }
    }

    return metadata;
}

// ==================== YOUTUBE SUPPORT ====================

/**
 * Checks if the current page is a YouTube video page.
 */
function isYouTubePage() {
    const isYT = (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) &&
        (window.location.pathname.startsWith('/watch') || window.location.pathname.startsWith('/v/'));
    console.log('[Truth Lens] Is YouTube page:', isYT, 'URL:', window.location.href);
    return isYT;
}

/**
 * Extracts YouTube video content: title, channel, description, and transcript.
 */
async function extractYouTubeContent() {
    console.log('[Truth Lens] Extracting YouTube content...');
    let result = '[YouTube Video Analysis]\n\n';

    // Get video title
    const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ||
        document.querySelector('h1.title') ||
        document.querySelector('meta[name="title"]');
    const title = titleElement?.textContent || titleElement?.content || document.title;
    result += `Video Title: ${title}\n`;
    console.log('[Truth Lens] Video title:', title);

    // Get channel name
    const channelElement = document.querySelector('#channel-name a') ||
        document.querySelector('ytd-channel-name yt-formatted-string a') ||
        document.querySelector('.ytd-channel-name a');
    if (channelElement) {
        result += `Channel: ${channelElement.textContent.trim()}\n`;
    }

    // Get video description
    const descriptionElement = document.querySelector('#description-inline-expander yt-attributed-string') ||
        document.querySelector('#description yt-formatted-string') ||
        document.querySelector('meta[name="description"]');
    const description = descriptionElement?.textContent || descriptionElement?.content || '';
    if (description) {
        result += `\nDescription:\n${description}\n`;
    }

    // Get view count and date
    const viewCount = document.querySelector('#info-strings yt-formatted-string')?.textContent ||
        document.querySelector('.view-count')?.textContent;
    if (viewCount) {
        result += `Views/Date: ${viewCount}\n`;
    }

    // Try to get transcript (async) via API
    console.log('[Truth Lens] Fetching transcript from API...');
    result += '\n--- Transcript ---\n\n';
    try {
        const transcript = await extractYouTubeTranscript();
        if (transcript) {
            console.log('[Truth Lens] Transcript fetched successfully, length:', transcript.length);
            result += transcript;
        } else {
            console.log('[Truth Lens] No transcript returned from API');
            result += '[Transcript not available - the video may not have captions enabled]\n';
        }
    } catch (e) {
        console.error('[Truth Lens] Error extracting transcript:', e);
        result += '[Error extracting transcript]\n';
    }

    console.log('[Truth Lens] YouTube content extraction complete, total length:', result.length);
    return result;
}

/**
 * Attempts to extract the YouTube transcript using multiple APIs.
 * Tries NoteGPT first, then falls back to yt-to-text.com
 */
async function extractYouTubeTranscript() {
    const videoId = getYouTubeVideoId();
    console.log('[Truth Lens] Video ID:', videoId);

    if (!videoId) {
        console.log('[Truth Lens] Could not extract YouTube video ID');
        return null;
    }

    // Try NoteGPT API first
    let transcript = await tryNoteGPTAPI(videoId);
    if (transcript) {
        return transcript;
    }

    // Fallback to yt-to-text API
    console.log('[Truth Lens] NoteGPT failed, trying yt-to-text API...');
    transcript = await tryYtToTextAPI(videoId);
    if (transcript) {
        return transcript;
    }

    console.log('[Truth Lens] All transcript APIs failed');
    return null;
}

/**
 * Try NoteGPT API
 */
async function tryNoteGPTAPI(videoId) {
    try {
        const apiUrl = `https://notegpt.io/api/v2/video-transcript?platform=youtube&video_id=${videoId}`;
        console.log('[Truth Lens] Calling NoteGPT API:', apiUrl);

        const response = await fetch(apiUrl);
        console.log('[Truth Lens] NoteGPT response status:', response.status);

        if (!response.ok) {
            console.log('[Truth Lens] NoteGPT API request failed:', response.status);
            return null;
        }

        const data = await response.json();

        if (data.code !== 100000 || !data.data) {
            console.log('[Truth Lens] NoteGPT API returned error:', data.message || data.code);
            return null;
        }

        const transcripts = data.data.transcripts;
        if (!transcripts || Object.keys(transcripts).length === 0) {
            console.log('[Truth Lens] NoteGPT: No transcripts available');
            return null;
        }

        const languageCode = Object.keys(transcripts)[0];
        const transcriptData = transcripts[languageCode];

        let segments = null;
        if (transcriptData) {
            segments = transcriptData.custom || transcriptData.default || transcriptData.auto || transcriptData.lines;
            if (!segments && Array.isArray(transcriptData)) {
                segments = transcriptData;
            }
        }

        if (!segments || segments.length === 0) {
            console.log('[Truth Lens] NoteGPT: No transcript segments found');
            return null;
        }

        let transcript = segments.map(seg => seg.text || seg.content || seg.transcript || '').filter(t => t).join(' ');
        transcript = transcript.replace(/\s+/g, ' ').trim();

        if (transcript.length < 50) {
            console.log('[Truth Lens] NoteGPT: Transcript too short');
            return null;
        }

        const languageInfo = data.data.language_code?.find(l => l.code === languageCode);
        const languageName = languageInfo?.name || languageCode;

        console.log('[Truth Lens] NoteGPT: Got transcript, length:', transcript.length);
        return `[Transcript (${languageName})]:\n\n${transcript}`;

    } catch (e) {
        console.error('[Truth Lens] NoteGPT API error:', e);
        return null;
    }
}

/**
 * Try yt-to-text.com API (fallback)
 */
async function tryYtToTextAPI(videoId) {
    try {
        const apiUrl = 'https://yt-to-text.com/api/v1/Subtitles';
        console.log('[Truth Lens] Calling yt-to-text API for video:', videoId);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ video_id: videoId })
        });

        console.log('[Truth Lens] yt-to-text response status:', response.status);

        if (!response.ok) {
            console.log('[Truth Lens] yt-to-text API request failed:', response.status);
            return null;
        }

        const data = await response.json();
        console.log('[Truth Lens] yt-to-text response status field:', data.status);

        if (data.status !== 'READY' || !data.data?.transcripts) {
            console.log('[Truth Lens] yt-to-text: Not ready or no transcripts');
            return null;
        }

        const segments = data.data.transcripts;
        if (!segments || segments.length === 0) {
            console.log('[Truth Lens] yt-to-text: No transcript segments');
            return null;
        }

        // yt-to-text format: { t: "text", s: "start", e: "end" }
        let transcript = segments.map(seg => seg.t || '').filter(t => t).join(' ');
        transcript = transcript.replace(/\s+/g, ' ').trim();

        if (transcript.length < 50) {
            console.log('[Truth Lens] yt-to-text: Transcript too short');
            return null;
        }

        console.log('[Truth Lens] yt-to-text: Got transcript, length:', transcript.length);
        return `[Transcript]:\n\n${transcript}`;

    } catch (e) {
        console.error('[Truth Lens] yt-to-text API error:', e);
        return null;
    }
}


/**
 * Extracts the YouTube video ID from the current URL.
 */
function getYouTubeVideoId() {
    try {
        const url = new URL(window.location.href);

        // Handle youtube.com/watch?v=VIDEO_ID
        if (url.searchParams.has('v')) {
            return url.searchParams.get('v');
        }

        // Handle youtu.be/VIDEO_ID
        if (url.hostname === 'youtu.be') {
            return url.pathname.slice(1);
        }

        // Handle youtube.com/embed/VIDEO_ID
        if (url.pathname.startsWith('/embed/')) {
            return url.pathname.split('/')[2];
        }

        // Handle youtube.com/v/VIDEO_ID
        if (url.pathname.startsWith('/v/')) {
            return url.pathname.split('/')[2];
        }

    } catch (e) {
        console.log('Error extracting video ID:', e);
    }
    return null;
}

