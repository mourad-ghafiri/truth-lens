/**
 * Main Entry Point
 * Initializes all modules and sets up event listeners
 */

import { DOM } from '../core/dom.js';
import * as state from '../core/state.js';
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
    initHistory();
    initSettings();

    // Setup event listeners
    setupEventListeners();

    // Track current tab
    await trackCurrentTab();

    // Listen for tab changes
    chrome.tabs.onActivated.addListener(handleTabChange);

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
                    e.target.textContent = '▲ Hide';
                } else if (content.style.display === 'none') {
                    content.style.display = 'block';
                    e.target.textContent = '▲ Hide';
                } else {
                    content.style.display = 'none';
                    e.target.textContent = '▼ View';
                }
            }
        });
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

// Handle tab change
async function handleTabChange(activeInfo) {
    const { tabId } = activeInfo;
    state.setCurrentTabId(tabId);
    await restoreTabState(tabId);
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

        if (!tabState || tabState.status === 'idle') {
            // Show idle state
            DOM.checkPageBtn?.classList.remove('hidden');
            DOM.resultContainer?.classList.add('hidden');
            progress.hideProgress();
            DOM.reportInfo?.classList.add('hidden');
        } else if (tabState.status === 'progress') {
            // Show progress state
            DOM.checkPageBtn?.classList.add('hidden');
            progress.showProgress(false);
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

// Start the app
init();
