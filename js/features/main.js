/**
 * Main Entry Point
 * Initializes all modules and sets up event listeners
 */

import { DOM } from '../core/dom.js';
import * as state from '../core/state.js';
import * as storage from '../core/storage.js';
import { initTabs, switchTab } from './tabs.js';
import { initHistory } from './history.js';
import { initSettings, loadSettings, applyTranslations } from './settings.js';
import { handleCheckWithProgress } from './check.js';
import { handleSelectionCheck, closeSelectionResult } from './selection.js';
import { displayResult, showError } from './result.js';
import * as progress from './progress.js';

// Initialize application
async function init() {
    console.log('[Truth Lens] Initializing sidepanel...');

    // Load settings and apply translations
    await loadSettings();
    applyTranslations();

    // Initialize modules
    initTabs();
    initHistory({
        onDelete: (url) => handleHistoryDeletion(url),
        onClear: () => handleHistoryClear()
    });
    initSettings();

    // Setup event listeners
    setupEventListeners();

    // Track current tab
    await trackCurrentTab();

    // Listen for tab changes
    chrome.tabs.onActivated.addListener(handleTabChange);

    // Listen for URL changes/navigation within same tab
    chrome.tabs.onUpdated.addListener(handleTabUpdate);

    // Listen for messages from background
    chrome.runtime.onMessage.addListener(handleMessage);

    console.log('[Truth Lens] Sidepanel initialized');
}

// Setup main event listeners
function setupEventListeners() {
    // Check page button
    DOM.checkPageBtn?.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                state.setCurrentTabId(tab.id);
            }

            const isYouTube = tab?.url?.includes('youtube.com/watch') || tab?.url?.includes('youtu.be/');
            state.setCurrentIsYouTube(isYouTube);
            state.setCurrentSource(isYouTube ? 'video' : 'page');

            await handleCheckWithProgress(isYouTube);
        } catch (e) {
            showError(e.message);
        }
    });

    // Recheck button
    DOM.newCheckBtn?.addEventListener('click', async () => {
        DOM.cachedNotice?.classList.add('hidden');

        if (state.currentSource === 'selection' && state.currentContent) {
            await handleSelectionCheck(state.currentContent);
        } else {
            await handleCheckWithProgress(state.currentIsYouTube, true);
        }
    });

    // Refresh button (from cache notice)
    DOM.refreshCheckBtn?.addEventListener('click', async () => {
        DOM.cachedNotice?.classList.add('hidden');
        await handleCheckWithProgress(state.currentIsYouTube, true);
    });

    // Close selection buttons
    DOM.closeSelectionBtn?.addEventListener('click', closeSelectionResult);
    const closeTopBtn = document.getElementById('close-selection-top-btn');
    closeTopBtn?.addEventListener('click', closeSelectionResult);

    // Preview Toggles
    document.querySelectorAll('.preview-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const content = e.target.nextElementSibling;
            if (content) {
                const isHidden = content.style.display === 'none' || content.classList.contains('hidden');

                if (content.classList.contains('hidden')) {
                    // Start expanded (hidden class removal logic might be controlled elsewhere, but this ensures content visibility)
                    content.classList.remove('hidden');
                    content.style.display = 'block';
                    updateToggleText(e.target, true);
                } else if (content.style.display === 'none') {
                    content.style.display = 'block';
                    updateToggleText(e.target, true);
                } else {
                    content.style.display = 'none';
                    updateToggleText(e.target, false);
                }
            }
        });
    });

    // Sub-step toggle handlers
    document.querySelectorAll('.substep-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const substep = btn.closest('.substep');
            const content = substep?.querySelector('.substep-content');
            if (content) {
                const isExpanded = btn.getAttribute('aria-expanded') === 'true';
                btn.setAttribute('aria-expanded', !isExpanded);
                content.classList.toggle('hidden');
            }
        });
    });

    // Also allow clicking substep header to toggle
    document.querySelectorAll('.substep-header').forEach(header => {
        header.addEventListener('click', () => {
            const toggle = header.querySelector('.substep-toggle');
            if (toggle) toggle.click();
        });
    });
}

// Update toggle button text with i18n
function updateToggleText(button, isExpanded) {
    // Determine type based on sibling ID
    const contentId = button.nextElementSibling?.id;
    let type = 'Content';
    if (contentId && contentId.includes('prompt')) type = 'Prompt';
    if (contentId && contentId.includes('thinking')) type = 'Thinking';

    // Get translation
    import('../i18n/i18n.js').then(i18n => {
        const key = isExpanded ? `btnHide${type}` : `btnView${type}`;
        const arrow = isExpanded ? '▲' : '▼';
        button.textContent = `${arrow} ${i18n.getTranslation(key) || (isExpanded ? `Hide ${type}` : `View ${type}`)}`;
    });
}

// Track current tab
async function trackCurrentTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            state.setCurrentTabId(tab.id);
            await restoreTabState(tab.id);
        }
    } catch (e) {
        console.error('[Truth Lens] Error tracking tab:', e);
    }
}

// Handle tab change (switching tabs)
async function handleTabChange(activeInfo) {
    const { tabId } = activeInfo;
    state.setCurrentTabId(tabId);
    await restoreTabState(tabId);
}

// Handle tab update (navigation/URL change)
async function handleTabUpdate(tabId, changeInfo, tab) {
    // Only react if URL changed or page reloaded (status=loading)
    // We wait for 'complete' or check if URL definitely changed to avoid intermediate states
    if (changeInfo.status === 'loading' && changeInfo.url) {
        console.log('[Truth Lens] Tab updated (URL change):', tabId, changeInfo.url);

        // If it's the currently active tab in logic, update it
        if (tabId === state.currentTabId) {
            // Reset state for this tab since it's a new page
            state.setTabIdle(tabId);
            state.clearSelectionState();

            // Trigger restore (which will check for cached result for the NEW url)
            await restoreTabState(tabId);
        } else {
            // Just reset the background tab state
            state.setTabIdle(tabId);
        }
    }
}

// Restore UI state for a tab
async function restoreTabState(tabId) {
    if (state.isRestoringState || !tabId) return;
    state.setIsRestoringState(true);

    try {
        const tabState = state.getTabState(tabId);

        // Clear selection state when switching tabs
        state.clearSelectionState();
        DOM.closeSelectionBtn?.classList.add('hidden');
        DOM.closeButtonRow?.classList.add('hidden');

        // FORCE RESET UI FIRST to avoid stale state lingering
        DOM.checkPageBtn?.classList.remove('hidden');
        DOM.resultContainer?.classList.add('hidden');
        progress.hideProgress();
        DOM.reportInfo?.classList.add('hidden');

        if (!tabState || tabState.status === 'idle') {
            // Check if we have a saved result for this URL
            // ... (rest of function logic)
            const tab = await chrome.tabs.get(tabId);
            console.log('[Truth Lens] checking auto-restore for URL:', tab.url);

            const savedResult = await storage.getUrlResult(tab.url);
            console.log('[Truth Lens] savedResult found:', !!savedResult);

            if (savedResult) {
                console.log('[Truth Lens] Restoring result from URL cache');
                // Auto-restore the result
                state.setTabResult(tabId, savedResult.score, savedResult.report, savedResult.content, savedResult.prompt, savedResult.isYouTube);

                // Recursively call restore to update UI
                state.setIsRestoringState(false); // Reset lock temporarily
                return restoreTabState(tabId);
            }

            // Show idle state (already reset above)
            console.log('[Truth Lens] No cached result found, staying in idle state');
        } else if (tabState.status === 'progress') {
            // Show progress state with detailed steps
            DOM.checkPageBtn?.classList.add('hidden');
            progress.restoreProgress(tabState);
        } else if (tabState.status === 'result') {
            // Show result state
            state.setCurrentContent(tabState.content);
            state.setCurrentPrompt(tabState.prompt);
            state.setCurrentSource(tabState.isYouTube ? 'video' : 'page');
            state.setCurrentIsYouTube(tabState.isYouTube);

            DOM.checkPageBtn?.classList.add('hidden');
            DOM.resultContainer?.classList.remove('hidden');
            displayResult(tabState.score, tabState.report, tabState.content, tabState.prompt);
            DOM.newCheckBtn?.classList.remove('hidden');

            // Get tab info for report header
            try {
                const tab = await chrome.tabs.get(tabId);
                updateReportInfo(tab.title, tabState.isYouTube ? 'video' : 'page', tabState.isYouTube, tab.url);
            } catch (e) {
                DOM.reportInfo?.classList.add('hidden');
            }
        }
    } finally {
        state.setIsRestoringState(false);
    }
}

// Update report info
function updateReportInfo(title, source, isYouTube, url) {
    if (DOM.reportInfoTitle) DOM.reportInfoTitle.textContent = title;
    if (DOM.reportInfoType) {
        const icon = isYouTube ? '🎬' : '📄';
        const label = isYouTube ? 'Video' : 'Page';
        DOM.reportInfoType.textContent = `${icon} ${label}`;
    }
    if (DOM.reportInfoDate) DOM.reportInfoDate.textContent = new Date().toLocaleString();
    if (DOM.reportInfoUrl) {
        DOM.reportInfoUrl.textContent = url;
        DOM.reportInfoUrl.title = url;
    }
    DOM.reportInfo?.classList.remove('hidden');
}

// Handle messages from background script
function handleMessage(message, sender, sendResponse) {
    if (message.action === 'checkSelection' && message.text) {
        switchTab('check');
        handleSelectionCheck(message.text);
    }
}

// Handle single history item deletion
async function handleHistoryDeletion(deletedUrl) {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        // Simple URL match - could be improved with normalization if storage.normalizeUrl was exported
        // But exact match should catch most cases
        if (tab.url === deletedUrl || tab.url?.includes(deletedUrl)) {
            resetTabStateIfActive(tab.id);
        }
    }
}

// Handle full history clear
async function handleHistoryClear() {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        resetTabStateIfActive(tab.id);
    }
}

// Helper to reset tab state and UI
async function resetTabStateIfActive(tabId) {
    const tabState = state.getTabState(tabId);
    if (tabState && tabState.status === 'result') {
        state.setTabIdle(tabId);
        // If this is the current active tab in the sidepanel, refresh UI
        if (state.currentTabId === tabId) {
            await restoreTabState(tabId);
        }
    }
}

// Start the app
init();
