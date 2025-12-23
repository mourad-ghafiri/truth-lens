/**
 * Page Content Extraction
 * Extracts content from regular web pages
 */

// Find main content using common selectors
function findMainContent() {
    const selectors = [
        'article', '[role="main"]', 'main', '.post-content',
        '.article-content', '.article-body', '.entry-content',
        '.post-body', '.story-body', '#content', '.content',
        '[itemprop="articleBody"]'
    ];

    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
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

// Clean text from an element
function cleanElementText(element) {
    const clone = element.cloneNode(true);
    const unwanted = [
        'script', 'style', 'nav', 'footer', 'header', 'aside',
        'noscript', 'iframe', 'form', 'button', 'input',
        '.ad', '.ads', '.advertisement', '.social-share',
        '.comments', '.sidebar', '.related-posts'
    ];

    unwanted.forEach(sel => {
        clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    return (clone.innerText || clone.textContent || '').trim();
}

// Fallback: get cleaned body text
function getCleanedBodyText() {
    const clone = document.body.cloneNode(true);
    const toRemove = clone.querySelectorAll(
        'script, style, nav, footer, header, aside, noscript, iframe, form'
    );
    toRemove.forEach(el => el.remove());
    return clone.innerText || '';
}

// Extract metadata from the page
function extractMetadata() {
    const metadata = { title: null, description: null, author: null, publishDate: null };

    const ogTitle = document.querySelector('meta[property="og:title"]');
    metadata.title = ogTitle?.content || document.title || null;

    const ogDesc = document.querySelector('meta[property="og:description"]');
    const metaDesc = document.querySelector('meta[name="description"]');
    metadata.description = ogDesc?.content || metaDesc?.content || null;

    const authorMeta = document.querySelector('meta[name="author"]');
    metadata.author = authorMeta?.content || null;

    const timeMeta = document.querySelector('meta[property="article:published_time"]');
    const timeElement = document.querySelector('time[datetime]');
    metadata.publishDate = timeMeta?.content || timeElement?.getAttribute('datetime') || null;

    return metadata;
}

// Main page extraction function
function extractPageContent() {
    let content = '';
    const mainContent = findMainContent();

    if (mainContent && mainContent.length > 200) {
        content = mainContent;
    } else {
        content = getCleanedBodyText();
    }

    const metadata = extractMetadata();
    let result = '';

    if (metadata.title) result += `Title: ${metadata.title}\n`;
    if (metadata.description) result += `Description: ${metadata.description}\n`;
    if (metadata.author) result += `Author: ${metadata.author}\n`;
    if (metadata.publishDate) result += `Published: ${metadata.publishDate}\n`;

    result += '\n--- Content ---\n\n';
    result += content;

    return result.replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').trim();
}
