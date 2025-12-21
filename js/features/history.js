/**
 * History Module
 * Handles history list and detail views (stays in History tab)
 */

import { DOM } from '../core/dom.js';
import * as storage from '../core/storage.js';
import { displayHistoryResult, getScoreColor } from './result.js';

let historyCallbacks = {};

// Show history list view, hide detail view
export function showHistoryList() {
    DOM.historyListView?.classList.remove('hidden');
    DOM.historyDetailView?.classList.add('hidden');
}

// Show history detail view, hide list view
export function showHistoryDetail(item) {
    DOM.historyListView?.classList.add('hidden');
    DOM.historyDetailView?.classList.remove('hidden');

    // Update info header
    updateDetailInfo(item);

    // Display the result
    displayHistoryResult(item.score, item.report, item.content);
}

// Update detail info header
function updateDetailInfo(item) {
    // Title
    if (DOM.historyDetailTitle) {
        DOM.historyDetailTitle.textContent = item.title || 'Untitled';
    }

    // Type with icon
    if (DOM.historyDetailType) {
        let icon = '📄';
        let label = 'Page';
        if (item.source === 'Selection') {
            icon = '✂️';
            label = 'Selection';
        } else if (item.isYouTube) {
            icon = '🎬';
            label = 'Video';
        }
        DOM.historyDetailType.textContent = `${icon} ${label}`;
    }

    // Date
    if (DOM.historyDetailDate) {
        DOM.historyDetailDate.textContent = item.date || '';
    }

    // URL
    if (DOM.historyDetailUrl) {
        DOM.historyDetailUrl.textContent = item.url || '';
        DOM.historyDetailUrl.title = item.url || '';
    }
}

// Render history list
export async function renderHistoryList() {
    const history = await storage.getHistory();

    if (!DOM.historyList) return;

    if (history.length === 0) {
        DOM.historyList.innerHTML = '<p class="placeholder-text">No checks yet.</p>';
        return;
    }

    DOM.historyList.innerHTML = '';

    history.forEach(item => {
        const div = createHistoryItem(item);
        DOM.historyList.appendChild(div);
    });
}

// Create history item element
function createHistoryItem(item) {
    const div = document.createElement('div');
    div.className = 'history-item';

    const scoreColor = getScoreColor(item.score);
    const typeIcon = getTypeIcon(item);
    const typeLabel = getTypeLabel(item);

    div.innerHTML = `
        <div class="history-item-left">
            <div class="history-score-badge" style="background: ${scoreColor}">${item.score}%</div>
        </div>
        <div class="history-item-content">
            <div class="history-item-title">${item.title || 'Untitled'}</div>
            <div class="history-item-meta">
                <span class="history-meta-type">${typeIcon} ${typeLabel}</span>
                <span class="history-meta-separator">•</span>
                <span>${item.date || ''}</span>
            </div>
            <div class="history-item-url">${item.url || ''}</div>
        </div>
        <button class="history-item-delete" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
        </button>
    `;

    // Click to view detail
    div.addEventListener('click', (e) => {
        if (!e.target.closest('.history-item-delete')) {
            showHistoryDetail(item);
        }
    });

    // Delete button
    const deleteBtn = div.querySelector('.history-item-delete');
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteHistoryItem(item.id, item);
    });

    return div;
}

// Delete history item
async function deleteHistoryItem(id, item) {
    await storage.deleteHistoryItem(id);
    renderHistoryList();

    // Notify main.js to check if UI needs reset
    if (historyCallbacks.onDelete && item && item.url) {
        historyCallbacks.onDelete(item.url);
    }
}

// Get type icon
function getTypeIcon(item) {
    if (item.source === 'Selection') return '✂️';
    if (item.isYouTube) return '🎬';
    return '📄';
}

// Get type label
function getTypeLabel(item) {
    if (item.source === 'Selection') return 'Selection';
    if (item.isYouTube) return 'Video';
    return 'Page';
}

// Initialize history event listeners
export function initHistory(callbacks = {}) {
    // Back button
    DOM.historyBackBtn?.addEventListener('click', showHistoryList);

    // Clear history button
    DOM.clearHistoryBtn?.addEventListener('click', async () => {
        await storage.clearHistory();
        renderHistoryList();

        // Notify main.js via callback
        if (callbacks.onClear) callbacks.onClear();
    });

    // Store callbacks
    historyCallbacks = callbacks;

    // Initial render
    renderHistoryList();
}
