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

// URL-based Result Persistence
const URL_CACHE_KEY = 'fc_url_cache';

export async function saveUrlResult(url, result) {
    try {
        const storage = await chrome.storage.local.get(URL_CACHE_KEY);
        const urlCache = storage[URL_CACHE_KEY] || {};

        // Normalize URL (remove query params except for v= on YouTube)
        const normalizedUrl = normalizeUrl(url);
        if (!normalizedUrl) return;

        urlCache[normalizedUrl] = {
            ...result,
            timestamp: Date.now()
        };

        await chrome.storage.local.set({ [URL_CACHE_KEY]: urlCache });
    } catch (e) {
        console.error('[Truth Lens] URL cache save error:', e);
    }
}

export async function getUrlResult(url) {
    try {
        const storage = await chrome.storage.local.get(URL_CACHE_KEY);
        const urlCache = storage[URL_CACHE_KEY] || {};

        const normalizedUrl = normalizeUrl(url);
        if (!normalizedUrl) return null;

        const cached = urlCache[normalizedUrl];
        // Expire after 24 hours
        if (cached && (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000)) {
            return cached;
        }
        return null;
    } catch (e) {
        console.error('[Truth Lens] URL cache get error:', e);
        return null;
    }
}

function normalizeUrl(url) {
    try {
        const urlObj = new URL(url);
        // Special handling for YouTube
        if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
            const v = urlObj.searchParams.get('v');
            if (v) return `https://www.youtube.com/watch?v=${v}`;
        }
        // For others, strip query params and hash
        return `${urlObj.origin}${urlObj.pathname}`;
    } catch (e) {
        return null;
    }
}
