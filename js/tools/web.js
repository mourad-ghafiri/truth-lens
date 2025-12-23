/**
 * Web Search Tool - DuckDuckGo Scraping & Browsing
 * Provides web search capabilities for AI fact-checking
 * 
 * Uses DuckDuckGo Lite HTML version for scraping search results
 * Fetches and aggregates content from top results
 */

/**
 * Main search function - scrapes DuckDuckGo Lite
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum results to return (default: 5)
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<object>} Search results object
 */
export async function search(query, maxResults = 5, signal = null) {
    if (!query || typeof query !== 'string') {
        return {
            success: false,
            query: '',
            error: 'Invalid search query',
            results: [],
            timestamp: new Date().toISOString()
        };
    }

    const cleanQuery = query.trim();
    console.log('[Web Search] Searching for:', cleanQuery);

    try {
        const results = await scrapeDuckDuckGoLite(cleanQuery, maxResults, signal);

        return {
            success: true,
            query: cleanQuery,
            results: results,
            resultsCount: results.length,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('[Web Search] Search failed:', error);
        return {
            success: false,
            query: cleanQuery,
            error: error.message,
            results: [],
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Scrape DuckDuckGo Lite HTML version
 * Uses lite.duckduckgo.com which has simpler HTML structure
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum results
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Array>} Array of search results
 */
async function scrapeDuckDuckGoLite(query, maxResults, signal = null) {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://lite.duckduckgo.com/lite/?q=${encodedQuery}`;

    console.log('[Web Search] Fetching:', url);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
        },
        signal: signal
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return parseLiteResults(html, maxResults);
}

/**
 * Parse DuckDuckGo Lite HTML results with robust regex
 * @param {string} html - Raw HTML
 * @param {number} maxResults - Max results to extract
 * @returns {Array} Parsed results
 */
function parseLiteResults(html, maxResults) {
    const results = [];

    // DDG Lite structure: <a rel="nofollow" href="..." class='result-link'>Title</a>
    // Note: rel comes first, class uses SINGLE quotes
    const linkRegex = /<a\s+rel="nofollow"\s+href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi;

    // Snippet: <td class='result-snippet'>...</td> (single quotes)
    const snippetRegex = /<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;

    let linkMatch;
    const items = [];

    // Extract Links & Titles
    while ((linkMatch = linkRegex.exec(html)) !== null) {
        const rawUrl = linkMatch[1] || '';
        const rawTitle = linkMatch[2] || '';

        // Decoding
        const url = decodeUrl(rawUrl);
        const title = cleanText(rawTitle);

        if (url && title && !url.includes('duckduckgo.com/')) {
            items.push({ url, title });
        }
    }

    // Extract Snippets
    // Note: Snippets usually map 1:1 to links in order on the Lite page
    let snippetMatch;
    let idx = 0;
    while ((snippetMatch = snippetRegex.exec(html)) !== null && idx < items.length) {
        items[idx].snippet = cleanText(snippetMatch[1]);
        idx++;
    }

    // Return capped results
    return items.slice(0, maxResults);
}

/**
 * Fetch and extract text content from a URL
 * This allows the tool to "browse" the page
 * @param {string} url - URL to browse
 * @returns {Promise<string>} Extracted content
 */
async function browsePage(url) {
    try {
        console.log('[Web Search] Browsing:', url);

        // Timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout (was 10s)

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TruthLens/1.0; +https://github.com/mourad-ghafiri/truth-lens)'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) return '';

        const html = await response.text();

        // Use a simple text extraction since we are likely in a Service Worker
        // where full DOM API might be limited, but basic Regex/String ops work.
        // If DOMParser is available (it is in SW usually), utilise it.
        try {
            // Check if we can parse
            if (typeof DOMParser !== 'undefined') {
                const doc = new DOMParser().parseFromString(html, 'text/html');

                // Remove scripts, styles, navs
                const toRemove = doc.querySelectorAll('script, style, nav, footer, header, aside, noscript, iframe, svg');
                toRemove.forEach(el => el.remove());

                // Extract text from paragraphs and headings mainly
                const ContentSelectors = 'p, h1, h2, h3, h4, h5, h6, li, article';
                const elements = doc.querySelectorAll(ContentSelectors);

                let text = '';
                elements.forEach(el => {
                    const t = el.textContent.trim();
                    if (t.length > 20) text += t + '\n\n';
                });

                return text.substring(0, 1500); // Cap content
            }
        } catch (e) {
            // Fallback to regex extraction
        }

        const text = cleanText(html);
        return text.substring(0, 1500);

    } catch (e) {
        console.warn(`[Web Search] Failed to browse ${url}:`, e);
        return '';
    }
}

/**
 * Decode DuckDuckGo redirect URL
 * @param {string} url - Possibly encoded URL
 * @returns {string} Decoded URL
 */
function decodeUrl(url) {
    if (!url) return '';
    if (url.includes('uddg=')) {
        const match = url.match(/uddg=([^&]+)/);
        if (match) return decodeURIComponent(match[1]);
    }
    return url;
}

/**
 * Clean HTML and whitespace from text
 * @param {string} text - Raw text with possible HTML
 * @returns {string} Clean text
 */
function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&[a-z]+;/g, ' ') // Remove entities roughly
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Tool definition for LLM function calling
 */
export const webSearchToolDefinition = {
    type: 'function',
    function: {
        name: 'web_search',
        description: 'Search the web using DuckDuckGo. This tool performs a search AND automatically browses the top results to provide detailed context. Use this for verifying claims with up-to-date sources.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query.'
                }
            },
            required: ['query']
        }
    }
};

/**
 * Execute the web search tool (for LLM function calling)
 * @param {object} args - Tool arguments containing query
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<string>} Formatted search results + browsed content
 */
export async function executeWebSearchTool(args, signal = null) {
    const { query } = args;
    if (!query) return 'Error: Search query is required';

    const searchResult = await search(query, 5, signal);

    if (!searchResult.success || searchResult.results.length === 0) {
        return `No results found for: "${query}"`;
    }

    let response = `**Web Search Results for "${query}":**\n\n`;

    // Browse top result only for speed (was 3)
    const topResults = searchResult.results.slice(0, 1);
    const browsePromises = topResults.map(async (result) => {
        const content = await browsePage(result.url);
        return { ...result, content };
    });

    const detailedResults = await Promise.all(browsePromises);

    detailedResults.forEach((result, index) => {
        response += `### ${index + 1}. ${result.title}\n`;
        response += `**URL:** ${result.url}\n`;
        if (result.snippet) response += `**Snippet:** ${result.snippet}\n`;
        if (result.content) {
            response += `**Extracted Content:**\n${result.content}\n`;
        } else {
            response += `(Could not extract content)\n`;
        }
        response += `\n---\n\n`;
    });

    // Add remaining results as simple links
    const otherResults = searchResult.results.slice(3);
    if (otherResults.length > 0) {
        response += `**More results:**\n`;
        otherResults.forEach(r => response += `- [${r.title}](${r.url})\n`);
    }

    return response;
}

export default {
    search,
    executeWebSearchTool,
    webSearchToolDefinition
};
