
export function parseMarkdown(markdown) {
    if (!markdown) return '';

    let html = markdown;

    // Escape HTML
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // Blockquote
    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Unordered Lists
    html = html.replace(/^\s*[-*] (.*$)/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\s*<ul>/gim, ''); // Merge adjacent lists

    // Line breaks
    html = html.replace(/\n$/gim, '<br>');
    // Paragraphs (double newlines)
    html = html.replace(/\n\n/gim, '<p></p>');

    return html;
}
