/**
 * Storage Module
 * Handles cache and history persistence using chrome.storage
 */

const CACHE_KEY = 'factCheckCache';
const HISTORY_KEY = 'factCheckHistory';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Generate cache key from content
export function generateCacheKey(content) {
    let hash = 0;
    const str = content.substring(0, 5000); // Limit for performance
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return `fc_${hash}`;
}

// Get item from cache
export async function getFromCache(key) {
    try {
        const result = await chrome.storage.local.get(CACHE_KEY);
        const cache = result[CACHE_KEY] || {};
        const item = cache[key];

        if (item && (Date.now() - item.timestamp) < CACHE_DURATION) {
            return item;
        }
        return null;
    } catch (e) {
        console.error('[Truth Lens] Cache read error:', e);
        return null;
    }
}

// Save item to cache
export async function saveToCache(key, data) {
    try {
        const result = await chrome.storage.local.get(CACHE_KEY);
        const cache = result[CACHE_KEY] || {};
        cache[key] = { ...data, timestamp: Date.now() };
        await chrome.storage.local.set({ [CACHE_KEY]: cache });
    } catch (e) {
        console.error('[Truth Lens] Cache write error:', e);
    }
}

// Clear entire cache
export async function clearCache() {
    try {
        await chrome.storage.local.remove(CACHE_KEY);
        console.log('[Truth Lens] Cache cleared');
    } catch (e) {
        console.error('[Truth Lens] Cache clear error:', e);
    }
}

// Clear specific cache entry
export async function clearCacheEntry(key) {
    try {
        const result = await chrome.storage.local.get(CACHE_KEY);
        const cache = result[CACHE_KEY] || {};
        delete cache[key];
        await chrome.storage.local.set({ [CACHE_KEY]: cache });
    } catch (e) {
        console.error('[Truth Lens] Cache entry clear error:', e);
    }
}

// Get history
export async function getHistory() {
    try {
        const result = await chrome.storage.local.get(HISTORY_KEY);
        return result[HISTORY_KEY] || [];
    } catch (e) {
        console.error('[Truth Lens] History read error:', e);
        return [];
    }
}

// Save history item
export async function saveHistory(item) {
    try {
        const history = await getHistory();
        const newItem = {
            id: Date.now(),
            ...item,
            timestamp: Date.now()
        };
        history.unshift(newItem);

        // Keep only last 50 items
        if (history.length > 50) {
            history.pop();
        }

        await chrome.storage.local.set({ [HISTORY_KEY]: history });
        return newItem;
    } catch (e) {
        console.error('[Truth Lens] History write error:', e);
    }
}

// Delete history item
export async function deleteHistoryItem(id) {
    try {
        const history = await getHistory();
        const filtered = history.filter(item => item.id !== id);
        await chrome.storage.local.set({ [HISTORY_KEY]: filtered });
        return filtered;
    } catch (e) {
        console.error('[Truth Lens] History delete error:', e);
        return [];
    }
}

// Clear all history
export async function clearHistory() {
    try {
        await chrome.storage.local.remove(HISTORY_KEY);
        console.log('[Truth Lens] History cleared');
    } catch (e) {
        console.error('[Truth Lens] History clear error:', e);
    }
}

// URL-based Result Auto-Restore (from History)

/**
 * Searches the history for a report matching the given URL.
 * Checks for exact URL match or YouTube video ID match.
 * @param {string} url - The URL to check
 * @returns {object|null} The saved result or null
 */
export async function getUrlResult(url) {
    try {
        const history = await getHistory();
        const normalizedTarget = normalizeUrl(url);

        console.log('[Truth Lens] Checking history for URL:', url, 'Normalized:', normalizedTarget);
        if (!normalizedTarget) return null;

        // Find the most recent history item matching this URL
        // History is already sorted new-to-old
        const match = history.find(item => {
            if (!item.url) return false;

            // Compare normalized URLs
            const itemUrl = normalizeUrl(item.url);
            if (itemUrl === normalizedTarget) return true;

            return false;
        });

        if (match) {
            console.log('[Truth Lens] History Hit for:', normalizedTarget);
            // Reconstruct the result object format expected by state
            return {
                score: match.score,
                report: match.report,
                content: match.content,
                prompt: match.prompt || '', // Backwards compatibility
                isYouTube: match.isYouTube,
                source: match.source,
                timestamp: match.timestamp
            };
        }

        console.log('[Truth Lens] History Miss');
        return null;
    } catch (e) {
        console.error('[Truth Lens] auto-restore error:', e);
        return null;
    }
}

/**
 * Normalizes a URL for comparison.
 * - YouTube: Extracts Video ID and standardizes to https://www.youtube.com/watch?v=ID
 * - Others: Removes query parameters (params often denote session state, not content)
 */
function normalizeUrl(url) {
    try {
        const urlObj = new URL(url);

        // YouTube Handling
        if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
            let videoId = null;
            if (urlObj.searchParams.has('v')) {
                videoId = urlObj.searchParams.get('v');
            } else if (urlObj.pathname.startsWith('/embed/')) {
                videoId = urlObj.pathname.split('/')[2];
            } else if (urlObj.pathname.startsWith('/v/')) {
                videoId = urlObj.pathname.split('/')[2];
            } else if (urlObj.hostname === 'youtu.be') {
                videoId = urlObj.pathname.slice(1);
            }

            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
        }

        // General Page Handling - Strip query params and hash for stable comparison
        return `${urlObj.origin}${urlObj.pathname}`;
    } catch (e) {
        return null;
    }
}
