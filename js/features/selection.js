/**
 * Selection Module
 * Handles text selection fact-checking (via context menu)
 */

import { DOM } from '../core/dom.js';
import * as state from '../core/state.js';
import * as storage from '../core/storage.js';
import * as progress from './progress.js';
import { displayResult, showError } from './result.js';
import { renderHistoryList } from './history.js';
import * as i18n from '../i18n/i18n.js';
import { llmService } from '../llm/llm.js';
import { buildPrompt } from './check.js';

// Handle selection fact-check (from context menu)
export async function handleSelectionCheck(text) {
    const factCheckTabId = state.currentTabId;

    // Set selection state
    state.setIsViewingSelection(true);
    state.setCurrentSource('selection');
    state.setCurrentContent(text);

    // Show close buttons for selection
    DOM.closeButtonRow?.classList.remove('hidden');
    DOM.closeSelectionBtn?.classList.remove('hidden');

    // Show progress
    progress.showProgress(false);
    progress.startTimer();
    progress.updateStep('extract', 'complete');

    try {
        // Get tab info
        let tabTitle = 'Selection', tabUrl = '';
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            tabTitle = tab?.title || 'Selection';
            tabUrl = tab?.url || '';
        } catch (e) { }

        // Check cache
        const cacheKey = storage.generateCacheKey(text);
        const cached = await storage.getFromCache(cacheKey);

        if (cached) {
            return handleCachedSelection(cached, text, tabTitle, tabUrl);
        }

        // Prepare prompt
        progress.updateStep('prompt', 'active');
        const prompt = buildPrompt(text);
        state.setCurrentPrompt(prompt);

        DOM.promptPreviewText.textContent = prompt;
        DOM.promptPreviewSection?.classList.remove('hidden');
        progress.updateStep('prompt', 'complete');

        await progress.delay(200);

        // Analyze
        progress.updateStep('analyze', 'active');
        const analysisResult = await llmService.analyzeText(text);
        progress.updateStep('analyze', 'complete');

        // Complete
        progress.updateStep('complete', 'active');
        await progress.delay(200);
        progress.updateStep('complete', 'complete');

        // Save to cache
        await storage.saveToCache(cacheKey, { ...analysisResult, source: 'Selection', timestamp: Date.now() });

        // Store selection result for restoration
        state.setSelectionResult({
            score: analysisResult.score,
            report: analysisResult,
            content: text,
            prompt
        });

        // Update UI
        progress.stopTimer();
        progress.hideProgress();
        displayResult(analysisResult.score, analysisResult, text, prompt);
        updateSelectionInfo(tabTitle, tabUrl);
        showButtonsForSelection();

        // Save to history
        await storage.saveHistory({
            source: 'Selection',
            title: tabTitle,
            url: tabUrl,
            score: analysisResult.score,
            date: new Date().toLocaleString(),
            content: text,
            report: analysisResult,
            isYouTube: false
        });
        renderHistoryList();

    } catch (error) {
        progress.stopTimer();
        progress.updateStep('analyze', 'error');
        showError(error.message);
    }
}

// Handle cached selection result
function handleCachedSelection(cached, text, tabTitle, tabUrl) {
    const prompt = buildPrompt(text);
    state.setCurrentPrompt(prompt);

    state.setSelectionResult({
        score: cached.score,
        report: cached,
        content: text,
        prompt
    });

    progress.stopTimer();
    progress.hideProgress();
    DOM.cachedNotice?.classList.remove('hidden');
    displayResult(cached.score, cached, text, prompt);
    updateSelectionInfo(tabTitle, tabUrl);
    showButtonsForSelection();
}

// Update report info for selection
function updateSelectionInfo(title, url) {
    if (DOM.reportInfoTitle) DOM.reportInfoTitle.textContent = title;
    if (DOM.reportInfoType) DOM.reportInfoType.textContent = '✂️ Selection';
    if (DOM.reportInfoDate) DOM.reportInfoDate.textContent = new Date().toLocaleString();
    if (DOM.reportInfoUrl) {
        DOM.reportInfoUrl.textContent = url;
        DOM.reportInfoUrl.title = url;
    }
    DOM.reportInfo?.classList.remove('hidden');
}

// Show buttons for selection
function showButtonsForSelection() {
    DOM.newCheckBtn?.classList.remove('hidden');
    DOM.closeSelectionBtn?.classList.remove('hidden');
    DOM.closeButtonRow?.classList.remove('hidden');
}

// Close selection result and restore previous state
export async function closeSelectionResult() {
    state.clearSelectionState();
    DOM.closeSelectionBtn?.classList.add('hidden');
    DOM.closeButtonRow?.classList.add('hidden');
    DOM.reportInfo?.classList.add('hidden');

    // Try to restore previous page/video state
    const tabState = state.getTabState(state.currentTabId);
    if (tabState && tabState.status === 'result') {
        state.setCurrentContent(tabState.content);
        state.setCurrentPrompt(tabState.prompt);
        state.setCurrentSource(tabState.isYouTube ? 'video' : 'page');
        displayResult(tabState.score, tabState.report, tabState.content, tabState.prompt);
        DOM.newCheckBtn?.classList.remove('hidden');
    } else {
        // No previous state, show idle
        DOM.resultContainer?.classList.add('hidden');
        DOM.checkPageBtn?.classList.remove('hidden');
    }
}
