/**
 * Check Module
 * Handles page, video, and selection fact-checking
 */

import { DOM } from '../core/dom.js';
import * as state from '../core/state.js';
import * as storage from '../core/storage.js';
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

    // Track substeps state for restoration
    const substeps = {
        detect: { status: 'complete', text: isYouTube ? 'YouTube' : 'Page' },
        extract: { status: 'active', text: 'Extracting...' },
        prompt: { status: 'pending', text: '' },
        // Step 3: Web Search only
        search: { status: 'pending', text: '', queries: [], results: [] },
        // Step 4: Processing, Report, Summary
        processing: { status: 'pending', text: '', content: '' },
        report: { status: 'pending', text: '' },
        summary: { status: 'pending', text: '', content: '' }
    };

    // Clear selection state
    state.clearSelectionState();
    DOM.closeButtonRow?.classList.add('hidden');
    DOM.closeSelectionBtn?.classList.add('hidden');

    // Show progress
    updateUI(() => {
        progress.showProgress(false);
        progress.startTimer();
        progress.updateStep('extract', 'active');

        // Show Step 1 sub-steps
        DOM.extractSubsteps?.classList.remove('hidden');
        DOM.substepDetect?.classList.add('active');
        if (DOM.detectStatus) {
            DOM.detectStatus.textContent = substeps.detect.text;
            DOM.detectStatus.className = 'substep-status done';
        }
        DOM.substepDetect?.classList.remove('active');
        DOM.substepDetect?.classList.add('complete');

        DOM.substepExtract?.classList.add('active');
        if (DOM.extractStatus) {
            DOM.extractStatus.textContent = substeps.extract.text;
            DOM.extractStatus.className = 'substep-status searching';
        }
    });

    state.setTabProgress(factCheckTabId, { substeps, isYouTube });

    try {
        // Step 1: Extract content
        const content = await extractContent(isYouTube);
        state.setCurrentContent(content);

        // Update substeps
        substeps.extract.status = 'complete';
        substeps.extract.text = 'Done';
        // Persist content
        state.updateTabProgress(factCheckTabId, { content, step: 'extract', substeps });

        if (!content || content.trim().length === 0) {
            throw new Error(i18n.getTranslation('errorNoContent'));
        }

        updateUI(() => {
            // Mark extract sub-step complete
            DOM.substepExtract?.classList.remove('active');
            DOM.substepExtract?.classList.add('complete');
            if (DOM.extractStatus) {
                DOM.extractStatus.textContent = 'Done';
                DOM.extractStatus.className = 'substep-status done';
            }

            DOM.contentPreviewText.textContent = content;
            progress.updateStep('extract', 'complete');
        });

        // Step 2: Prepare prompt
        substeps.prompt.status = 'active';
        substeps.prompt.text = 'Building...';
        state.updateTabProgress(factCheckTabId, { step: 'prompt', substeps });
        updateUI(() => {
            progress.updateStep('prompt', 'active');

            // Show prompt sub-steps
            DOM.promptSubsteps?.classList.remove('hidden');
            DOM.substepPrompt?.classList.add('active');
            if (DOM.promptStatus) {
                DOM.promptStatus.textContent = substeps.prompt.text;
                DOM.promptStatus.className = 'substep-status searching';
            }
        });

        const prompt = buildPrompt(content);
        state.setCurrentPrompt(prompt);

        // Update substeps and persist prompt
        substeps.prompt.status = 'complete';
        substeps.prompt.text = 'Done';
        state.updateTabProgress(factCheckTabId, { prompt, substeps });

        updateUI(() => {
            DOM.promptPreviewText.textContent = prompt;

            // Mark prompt sub-step complete
            DOM.substepPrompt?.classList.remove('active');
            DOM.substepPrompt?.classList.add('complete');
            if (DOM.promptStatus) {
                DOM.promptStatus.textContent = 'Done';
                DOM.promptStatus.className = 'substep-status done';
            }

            progress.updateStep('prompt', 'complete');
        });

        await progress.delay(200);

        // Step 3: Web Search only (Thinking moves to Step 4)
        substeps.search.status = 'active';
        substeps.search.text = 'Searching...';
        state.updateTabProgress(factCheckTabId, { step: 'analyze', substeps });
        updateUI(() => {
            progress.updateStep('analyze', 'active');

            // Show analysis sub-steps container (Web Search only)
            DOM.analysisSubsteps?.classList.remove('hidden');

            // Reset sub-steps
            DOM.substepSearch?.classList.add('active');
            DOM.substepSearch?.classList.remove('complete');

            // Clear content
            if (DOM.searchQueries) DOM.searchQueries.innerHTML = '';
            if (DOM.searchResults) DOM.searchResults.innerHTML = '';

            // Set initial status
            if (DOM.searchStatus) {
                DOM.searchStatus.textContent = 'Waiting...';
                DOM.searchStatus.className = 'substep-status searching';
            }
        });

        // Throttle state saves during streaming (save at most once per 2 seconds)
        let lastStateSave = 0;
        const throttledStateSave = () => {
            const now = Date.now();
            if (now - lastStateSave > 2000) {
                lastStateSave = now;
                state.updateTabProgress(factCheckTabId, { substeps });
            }
        };

        const analysisResult = await llmService.analyzeTextStream(content, (chunk, fullText, eventType, eventData) => {
            updateUI(() => {
                if (eventType === 'thinking') {
                    // Thinking now goes to Step 4 Processing sub-step
                    // But we're still in Step 3 (search), so just save for later
                    substeps.processing.content = fullText;
                    throttledStateSave(); // Throttled to reduce log spam
                } else if (eventType === 'search_start') {
                    // Activate search sub-step in Step 3
                    substeps.search.status = 'active';
                    substeps.search.text = 'Searching...';
                    if (!substeps.search.queries) substeps.search.queries = [];
                    substeps.search.queries.push({ query: eventData?.query, status: 'pending' });

                    DOM.substepSearch?.classList.add('active');
                    if (DOM.searchStatus) {
                        DOM.searchStatus.textContent = 'Searching...';
                        DOM.searchStatus.className = 'substep-status searching';
                    }
                    // Add query to list
                    if (DOM.searchQueries && eventData?.query) {
                        const queryItem = document.createElement('div');
                        queryItem.className = 'search-query-item';
                        queryItem.innerHTML = `
                            <span class="query-icon">🔍</span>
                            <span class="query-text">${eventData.query}</span>
                            <span class="query-status">⏳</span>
                        `;
                        DOM.searchQueries.appendChild(queryItem);
                    }
                    state.updateTabProgress(factCheckTabId, { substeps });
                } else if (eventType === 'search_complete') {
                    // Mark query as complete in saved state
                    if (substeps.search.queries?.length > 0) {
                        substeps.search.queries[substeps.search.queries.length - 1].status = 'complete';
                    }
                    // Save results
                    if (!substeps.search.results) substeps.search.results = [];
                    if (eventData?.results) {
                        substeps.search.results.push(...eventData.results.slice(0, 3).map(r => ({
                            title: r.title || 'Result',
                            url: r.url || ''
                        })));
                    }

                    // Mark query as complete in UI
                    const queryItems = DOM.searchQueries?.querySelectorAll('.search-query-item');
                    if (queryItems?.length > 0) {
                        const lastItem = queryItems[queryItems.length - 1];
                        const statusEl = lastItem.querySelector('.query-status');
                        if (statusEl) statusEl.textContent = '✓';
                    }
                    // Add results to UI
                    if (DOM.searchResults && eventData?.results) {
                        eventData.results.slice(0, 3).forEach(result => {
                            const resultItem = document.createElement('div');
                            resultItem.className = 'search-result-item';
                            resultItem.innerHTML = `
                                <div class="result-title">${result.title || 'Result'}</div>
                                <div class="result-url">${result.url || ''}</div>
                            `;
                            DOM.searchResults.appendChild(resultItem);
                        });
                    }
                    state.updateTabProgress(factCheckTabId, { substeps });
                } else if (eventType === 'response_start') {
                    // === TRANSITION TO STEP 4 ===
                    // Mark Step 3 (Search) as complete
                    substeps.search.status = 'complete';
                    substeps.search.text = 'Done';

                    // Activate Step 4 Processing sub-step (show thinking content)
                    substeps.processing.status = 'active';
                    substeps.processing.text = 'Analyzing...';

                    // Update step state
                    state.updateTabProgress(factCheckTabId, { step: 'complete', substeps });

                    // Complete Step 3 UI
                    progress.updateStep('analyze', 'complete');
                    DOM.substepSearch?.classList.remove('active');
                    DOM.substepSearch?.classList.add('complete');
                    if (DOM.searchStatus) {
                        DOM.searchStatus.textContent = 'Done';
                        DOM.searchStatus.className = 'substep-status done';
                    }

                    // Start Step 4 UI
                    progress.updateStep('complete', 'active');
                    DOM.completeSubsteps?.classList.remove('hidden');
                    DOM.substepProcessing?.classList.add('active');
                    if (DOM.processingStatus) {
                        DOM.processingStatus.textContent = 'Analyzing...';
                        DOM.processingStatus.className = 'substep-status searching';
                    }
                    // Show accumulated thinking content
                    if (DOM.processingStream && substeps.processing.content) {
                        DOM.processingStream.textContent = substeps.processing.content;
                    }
                } else {
                    // Default: update processing stream (thinking content) in Step 4
                    if (DOM.processingStream) {
                        DOM.processingStream.textContent = fullText;
                        DOM.processingStream.scrollTop = DOM.processingStream.scrollHeight;
                    }
                    substeps.processing.content = fullText;
                }
            });
        });

        // Mark Step 3 Search as complete (if not already done)
        updateUI(() => {
            DOM.substepSearch?.classList.remove('active');
            DOM.substepSearch?.classList.add('complete');
            if (DOM.searchStatus) {
                DOM.searchStatus.textContent = 'Done';
                DOM.searchStatus.className = 'substep-status done';
            }
            progress.updateStep('analyze', 'complete');
        });

        // === STEP 4: Processing → Report → Summary ===

        // Processing sub-step: Mark complete (thinking was shown during streaming)
        substeps.processing.status = 'complete';
        substeps.processing.text = 'Done';
        substeps.report.status = 'active';
        substeps.report.text = 'Generating...';
        state.updateTabProgress(factCheckTabId, { step: 'complete', substeps });

        updateUI(() => {
            progress.updateStep('complete', 'active');
            DOM.completeSubsteps?.classList.remove('hidden');

            // Complete processing sub-step
            DOM.substepProcessing?.classList.remove('active');
            DOM.substepProcessing?.classList.add('complete');
            if (DOM.processingStatus) {
                DOM.processingStatus.textContent = 'Done';
                DOM.processingStatus.className = 'substep-status done';
            }

            // Activate report generation sub-step
            DOM.substepReport?.classList.add('active');
            if (DOM.reportStatus) {
                DOM.reportStatus.textContent = 'Generating...';
                DOM.reportStatus.className = 'substep-status searching';
            }
            if (DOM.reportPreview) {
                DOM.reportPreview.innerHTML = `<strong>Score:</strong> ${analysisResult.score}/100<br><strong>Verdict:</strong> ${analysisResult.verdict}`;
            }
        });

        await progress.delay(150);

        // Report Generation complete, start Summary
        substeps.report.status = 'complete';
        substeps.report.text = 'Done';
        substeps.summary.status = 'active';
        substeps.summary.text = 'Generating...';
        state.updateTabProgress(factCheckTabId, { substeps });

        updateUI(() => {
            DOM.substepReport?.classList.remove('active');
            DOM.substepReport?.classList.add('complete');
            if (DOM.reportStatus) {
                DOM.reportStatus.textContent = 'Done';
                DOM.reportStatus.className = 'substep-status done';
            }

            // Activate summary sub-step
            DOM.substepSummary?.classList.add('active');
            if (DOM.summaryStatus) {
                DOM.summaryStatus.textContent = 'Generating...';
                DOM.summaryStatus.className = 'substep-status searching';
            }
            if (DOM.summaryPreview) {
                DOM.summaryPreview.textContent = 'Creating educational summary...';
            }
        });

        // Generate educational summary using LLM
        try {
            const summaryResult = await llmService.generateSummary(content, substeps.search.results || []);
            substeps.summary.content = summaryResult;
            substeps.summary.status = 'complete';
            substeps.summary.text = 'Done';

            // Add summary and search sources to analysisResult for display
            analysisResult.educationalSummary = summaryResult;
            analysisResult.searchSources = substeps.search.results || [];
            analysisResult.searchQueries = substeps.search.queries || [];

            updateUI(() => {
                if (DOM.summaryPreview) {
                    DOM.summaryPreview.textContent = summaryResult || 'Summary generated';
                }
            });
        } catch (summaryError) {
            console.warn('[Truth Lens] Summary generation failed:', summaryError);
            substeps.summary.status = 'complete';
            substeps.summary.text = 'Skipped';
            // Still add search sources even if summary failed
            analysisResult.searchSources = substeps.search.results || [];
            analysisResult.searchQueries = substeps.search.queries || [];
        }

        state.updateTabProgress(factCheckTabId, { substeps });

        // Get tab info
        let tabTitle = 'Untitled', tabUrl = '';
        try {
            const tab = await chrome.tabs.get(factCheckTabId);
            tabTitle = tab.title;
            tabUrl = tab.url;
        } catch (e) { }

        const source = isYouTube ? 'YouTube Video' : 'Current Page';

        // Save tab state
        state.setTabResult(factCheckTabId, analysisResult.score, analysisResult, content, prompt, isYouTube);

        // Complete Step 4 and show results
        updateUI(() => {
            // Mark summary complete
            DOM.substepSummary?.classList.remove('active');
            DOM.substepSummary?.classList.add('complete');
            if (DOM.summaryStatus) {
                DOM.summaryStatus.textContent = 'Done';
                DOM.summaryStatus.className = 'substep-status done';
            }

            progress.updateStep('complete', 'complete');
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
            prompt: prompt,
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

    // Helper: Send message with retry using injection
    const attemptExtraction = async () => {
        try {
            return await chrome.tabs.sendMessage(tab.id, { action: "getPageContent" });
        } catch (e) {
            console.log('[Truth Lens] Message failed, injecting script and retrying...', e);

            // Inject content script if not ready
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['js/content/content.js']
            });

            // Wait a moment for script to initialize listener
            await new Promise(resolve => setTimeout(resolve, 100));

            // Retry message
            return await chrome.tabs.sendMessage(tab.id, { action: "getPageContent" });
        }
    };

    try {
        const response = await attemptExtraction();
        if (response && response.content) {
            return response.content;
        }
        throw new Error("Empty response from content script");
    } catch (error) {
        console.error('[Truth Lens] Extraction failed:', error);
        return isYouTube ? '[Error extracting YouTube transcript]' : '[Error extracting page content]';
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
