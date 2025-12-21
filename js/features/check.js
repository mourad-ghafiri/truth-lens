/**
 * Check Module
 * Handles page, video, and selection fact-checking
 */

import { DOM } from './dom.js';
import * as state from './state.js';
import * as storage from './storage.js';
import * as progress from './progress.js';
import { displayResult, showError } from './result.js';
import { renderHistoryList } from './history.js';
import * as i18n from '../i18n/i18n.js';
import { llmService } from '../llm/llm.js';

// Build prompt for LLM
function buildPrompt(text) {
    const langCode = i18n.getCurrentLanguage();
    const nativeLang = i18n.getNativeName(langCode);
    return `Please fact-check this content. IMPORTANT: Respond in ${nativeLang}.\n\n${text}`;
}

// Main fact-check with progress
export async function handleCheckWithProgress(isYouTube, forceRefresh = false) {
    const factCheckTabId = state.currentTabId;

    // Guard for UI updates
    const isCurrent = () => state.currentTabId === factCheckTabId;
    const updateUI = (fn) => { if (isCurrent()) fn(); };

    // Clear selection state
    state.clearSelectionState();
    DOM.closeButtonRow?.classList.add('hidden');
    DOM.closeSelectionBtn?.classList.add('hidden');

    // Show progress
    updateUI(() => {
        progress.showProgress(false);
        progress.startTimer();
        progress.updateStep('extract', 'active');
    });

    state.setTabProgress(factCheckTabId);

    try {
        // Step 1: Extract content
        const content = await extractContent(isYouTube);
        state.setCurrentContent(content);

        if (!content || content.trim().length === 0) {
            throw new Error(i18n.getTranslation('errorNoContent'));
        }

        updateUI(() => {
            progress.updateStep('extract', 'complete');
            DOM.contentPreviewText.textContent = content; // Removed truncation
            DOM.contentPreviewSection?.classList.remove('hidden');
            // Hide content by default, user can toggle
            const contentDiv = DOM.contentPreviewText;
            contentDiv.style.display = 'none';
            // Find the button and reset text
            const toggleBtn = DOM.contentPreviewSection.querySelector('.preview-toggle');
            if (toggleBtn) toggleBtn.textContent = '▼ View Content';
        });

        // Check cache
        const cacheKey = storage.generateCacheKey(content);
        if (!forceRefresh) {
            const cached = await storage.getFromCache(cacheKey);
            if (cached) {
                return handleCachedResult(cached, content, isYouTube, factCheckTabId, updateUI);
            }
        }

        // Step 2: Prepare prompt
        updateUI(() => progress.updateStep('prompt', 'active'));
        const prompt = buildPrompt(content);
        state.setCurrentPrompt(prompt);

        updateUI(() => {
            DOM.promptPreviewText.textContent = prompt;
            DOM.promptPreviewSection?.classList.remove('hidden');
            progress.updateStep('prompt', 'complete');

            // Hide content by default
            const promptDiv = DOM.promptPreviewText;
            promptDiv.style.display = 'none';
            // Find the button and reset text
            const toggleBtn = DOM.promptPreviewSection.querySelector('.preview-toggle');
            if (toggleBtn) toggleBtn.textContent = '▼ View Prompt';
        });

        await progress.delay(200);

        // Step 3: Analyze
        updateUI(() => progress.updateStep('analyze', 'active'));
        const analysisResult = await llmService.analyzeText(content);
        updateUI(() => progress.updateStep('analyze', 'complete'));

        // Step 4: Complete
        updateUI(() => progress.updateStep('complete', 'active'));
        await progress.delay(200);
        updateUI(() => progress.updateStep('complete', 'complete'));

        // Get tab info
        let tabTitle = 'Untitled', tabUrl = '';
        try {
            const tab = await chrome.tabs.get(factCheckTabId);
            tabTitle = tab.title;
            tabUrl = tab.url;
        } catch (e) { }

        // Save to cache
        const source = isYouTube ? 'YouTube Video' : 'Current Page';
        await storage.saveToCache(cacheKey, { ...analysisResult, source, timestamp: Date.now() });

        // Save tab state
        state.setTabResult(factCheckTabId, analysisResult.score, analysisResult, content, prompt, isYouTube);

        // Update UI
        updateUI(() => {
            progress.stopTimer();
            progress.hideProgress();
            displayResult(analysisResult.score, analysisResult, content, prompt);
            updateReportInfo(tabTitle, source, isYouTube, tabUrl);
            showButtonsForCurrentTab();
        });

        // Save to history
        await storage.saveHistory({
            source,
            title: tabTitle,
            url: tabUrl,
            score: analysisResult.score,
            date: new Date().toLocaleString(),
            content,
            report: analysisResult,
            isYouTube
        });
        renderHistoryList();

    } catch (error) {
        progress.stopTimer();
        updateUI(() => {
            progress.updateStep('analyze', 'error');
            showError(error.message);
        });
    }
}

// Handle cached result
async function handleCachedResult(cached, content, isYouTube, factCheckTabId, updateUI) {
    const prompt = buildPrompt(content);
    state.setCurrentPrompt(prompt);
    state.setTabResult(factCheckTabId, cached.score, cached, content, prompt, isYouTube);

    let tabTitle = 'Untitled', tabUrl = '';
    try {
        const tab = await chrome.tabs.get(factCheckTabId);
        tabTitle = tab.title;
        tabUrl = tab.url;
    } catch (e) { }

    updateUI(() => {
        progress.stopTimer();
        progress.hideProgress();
        DOM.cachedNotice?.classList.remove('hidden');
        displayResult(cached.score, cached, content, prompt);
        updateReportInfo(tabTitle, cached.source || 'Current Page', isYouTube, tabUrl);
        showButtonsForCurrentTab();
    });
}

// Extract content from page or YouTube
async function extractContent(isYouTube) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (isYouTube) {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => window.__ytTranscript || null
        });

        let transcript = results?.[0]?.result;
        if (!transcript) {
            // Try to extract from page
            const extractResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['js/content/content.js']
            });
            transcript = extractResults?.[0]?.result;
        }
        return transcript || '[Transcript not available]';
    } else {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.body.innerText
        });
        return results?.[0]?.result || '';
    }
}

// Update report info header
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

// Show buttons for current tab result
function showButtonsForCurrentTab() {
    DOM.newCheckBtn?.classList.remove('hidden');
    DOM.closeSelectionBtn?.classList.add('hidden');
    DOM.closeButtonRow?.classList.add('hidden');
}

// Export for main.js
export { buildPrompt };
