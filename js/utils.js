/**
 * Utility Functions
 */

// Parse basic markdown to HTML
export function parseMarkdown(text) {
    if (!text) return '';
    // Ensure text is a string
    if (typeof text !== 'string') {
        text = String(text);
    }

    return text
        // Headings (must come before bold to avoid conflicts, order matters: most specific first)
        .replace(/^#### (.+)$/gm, '<h5>$1</h5>')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h3>$1</h3>')
        // Bold (handle both **text** and __text__)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.*?)__/g, '<strong>$1</strong>')
        // Italic (handle both *text* and _text_)
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        // Numbered lists (1. item)
        .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
        // Bullet lists (- item or * item at start of line)
        .replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>')
        // Wrap consecutive <li> in <ul>
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
        // Line breaks (but not after block elements)
        .replace(/\n(?!<)/g, '<br>');
}

// Delay helper
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Debounce function
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Truncate text
export function truncate(text, maxLength = 100) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
