import { LLMService } from './llm_service.js';
import { parseMarkdown } from './utils.js';
import * as i18n from './i18n.js';

const DOM = {
    tabs: document.querySelectorAll('.tab-btn'),
    contents: document.querySelectorAll('.tab-content'),
    settingsForm: document.getElementById('settings-form'),
    checkPageBtn: document.getElementById('check-page-btn'),
    resultContainer: document.getElementById('result-container'),
    reportSections: document.getElementById('report-sections'),
    scoreText: document.getElementById('score-text'),
    circle: document.querySelector('.circle'),
    verdictTitle: document.getElementById('verdict-title'),
    verdictSubtitle: document.getElementById('verdict-subtitle'),
    historyList: document.getElementById('history-list'),

    // Progress elements
    progressContainer: document.getElementById('progress-container'),
    progressTimer: document.getElementById('progress-timer'),
    stepExtract: document.getElementById('step-extract'),
    stepPrompt: document.getElementById('step-prompt'),
    stepAnalyze: document.getElementById('step-analyze'),
    stepComplete: document.getElementById('step-complete'),
    contentPreviewSection: document.getElementById('content-preview-section'),
    contentPreviewText: document.getElementById('content-preview-text'),
    promptPreviewSection: document.getElementById('prompt-preview-section'),
    promptPreviewText: document.getElementById('prompt-preview-text'),

    // Result expandables


    // Cache notice
    cachedNotice: document.getElementById('cached-notice'),
    refreshCheckBtn: document.getElementById('refresh-check-btn'),
    newCheckBtn: document.getElementById('new-check-btn'),

    // History actions
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    clearCacheBtn: document.getElementById('clear-cache-btn'),

    // Settings inputs
    providerUrl: document.getElementById('provider-url'),
    modelName: document.getElementById('model-name'),
    apiKey: document.getElementById('api-key'),
    reportLanguage: document.getElementById('report-language'),
    settingsStatus: document.getElementById('settings-status')
};

const DEFAULT_SYSTEM_PROMPT = `You are a neutral, objective fact-checker. Your goal is to analyze the provided content and determine its accuracy.
1. Assign a "Truth Score" from 0 to 100%. 
   - 100% = Completely True / Verified
   - 0% = Complete Falsehood / Fabrication
2. Be rigorous but fair. Check for logical fallacies, unsupported claims, and bias.
3. Provide a structured report:
   - **Verdict**: A short summary (Truthful, Misleading, False, Satire, etc.)
   - **Key Findings**: Bullet points of what is right and what is wrong.
   - **Context**: Missing context that changes the meaning.
   - **Sources**: If you know of specific debunking of these claims, mention them.
4. **Language Matching**: Always respond in the same language as the content you are analyzing. If the content is in French, the report (including headers like "Verdict") must be in French.
   
Format your response in Markdown. Start with the score in a specific format: "SCORE: {number}" on the first line, then the report.`;

const llmService = new LLMService();

// State
let currentContent = '';
let currentPrompt = '';
let timerInterval = null;
let startTime = null;

// Per-tab state management
// State can be: 'idle', 'progress', 'result'
const tabStates = new Map();
let currentTabId = null;
let isRestoringState = false; // Prevent double-updates during restore

// Save current state for the current tab
function saveTabState(tabId, state) {
    if (!tabId) return;
    console.log('[Truth Lens] Saving tab state:', tabId, state.status);
    tabStates.set(tabId, {
        ...state,
        timestamp: Date.now()
    });
}

// Get state for a specific tab
function getTabState(tabId) {
    return tabStates.get(tabId) || null;
}

// Update tab state to show progress started
function setTabProgress(tabId) {
    saveTabState(tabId, { status: 'progress' });
}

// Update tab state to show result
function setTabResult(tabId, score, report, content, prompt, isYouTube) {
    saveTabState(tabId, {
        status: 'result',
        score,
        report,
        content,
        prompt,
        isYouTube
    });
}

// Update tab state to idle (no result)
function setTabIdle(tabId) {
    saveTabState(tabId, { status: 'idle' });
}

// Restore UI state for a tab
// Restore UI state for a tab
async function restoreTabState(tabId) {
    if (isRestoringState || !tabId) return;
    isRestoringState = true;

    try {
        let state = getTabState(tabId);

        // If no in-memory state, try to recover from history
        if (!state) {
            try {
                const tab = await chrome.tabs.get(tabId);
                if (tab && tab.url) {
                    const history = await loadHistory();
                    console.log('[Truth Lens] Checking history for URL:', tab.url);
                    console.log('[Truth Lens] History entries:', history.length, history.map(h => h.url));

                    // Find most recent matching URL independent of hash/params order
                    const currentNormalized = normalizeUrl(tab.url);
                    const match = history.find(h => normalizeUrl(h.url) === currentNormalized);
                    if (match && match.report) {
                        console.log('[Truth Lens] Found history match for:', tab.url);
                        state = {
                            status: 'result',
                            score: match.score,
                            report: match.report,
                            content: match.content,
                            prompt: buildPrompt(match.content),
                            isYouTube: match.isYouTube
                        };
                        // Save to memory so we don't query every time
                        saveTabState(tabId, state);
                    } else {
                        console.log('[Truth Lens] No history match found for:', tab.url);
                    }
                }
            } catch (e) {
                console.log('[Truth Lens] Could not check history for tab:', e);
            }
        }

        console.log('[Truth Lens] Restoring tab state for tabId:', tabId);
        console.log('[Truth Lens] State found:', state);

        // Hide everything first
        DOM.resultContainer.classList.add('hidden');
        DOM.progressContainer?.classList.add('hidden');
        DOM.cachedNotice?.classList.add('hidden');

        if (!state || state.status === 'idle') {
            // No state or idle - show the Fact Check button
            console.log('[Truth Lens] Showing Fact Check button (no state or idle)');
            DOM.checkPageBtn.classList.remove('hidden');
            DOM.checkPageBtn.disabled = false;
            currentContent = '';
            currentPrompt = '';
        } else if (state.status === 'progress') {
            // Tab has fact check in progress - show progress UI
            console.log('[Truth Lens] Showing progress (fact check in progress)');
            DOM.checkPageBtn.classList.add('hidden');
            DOM.progressContainer?.classList.remove('hidden');
        } else if (state.status === 'progress') {
            // Tab has fact check in progress - show progress UI
            console.log('[Truth Lens] Showing progress (fact check in progress)');
            DOM.checkPageBtn.classList.add('hidden');
            DOM.progressContainer?.classList.remove('hidden');

            // Restore visual progress state if available
            resetSteps();
            if (state.progressStep) {
                restoreProgressVisuals(state.progressStep);
            }
        } else if (state.status === 'result') {
            // Tab has a result - show it
            console.log('[Truth Lens] Restoring result with score:', state.score);
            try {
                currentContent = state.content || '';
                currentPrompt = state.prompt || '';
                DOM.checkPageBtn.classList.add('hidden');
                DOM.resultContainer.classList.remove('hidden');
                displayResult(state.score, state.report, state.content, state.prompt);
                console.log('[Truth Lens] displayResult completed successfully');
            } catch (err) {
                console.error('[Truth Lens] Error restoring result:', err);
                DOM.checkPageBtn.classList.remove('hidden');
            }
        }
    } finally {
        isRestoringState = false;
    }
}

// Helper to visually restore progress up to a certain point
function restoreProgressVisuals(currentStep) {
    if (!currentStep) return;

    const steps = ['extract', 'prompt', 'analyze', 'complete'];
    const idx = steps.indexOf(currentStep);

    if (idx === -1) return;

    // Mark previous steps as complete
    for (let i = 0; i < idx; i++) {
        updateStep(steps[i], 'complete');
    }

    // Mark current step as active
    updateStep(currentStep, 'active');
}

// Listen for tab changes (switching between tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log('[Truth Lens] Tab activated event - tabId:', activeInfo.tabId, 'windowId:', activeInfo.windowId);
    currentTabId = activeInfo.tabId;
    restoreTabState(currentTabId);
});

// Listen for URL changes within the same tab (navigation)
let lastKnownUrl = '';
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only care about the current tab and URL changes
    if (tabId !== currentTabId) return;

    // Check if URL changed (status 'complete' ensures page loaded)
    // Use normalized URL to avoid clearing state on hash changes
    const currentUrl = normalizeUrl(tab.url);
    const prevUrl = normalizeUrl(lastKnownUrl);

    if (changeInfo.status === 'complete' && tab.url && currentUrl !== prevUrl) {
        console.log('[Truth Lens] URL changed in current tab:', tab.url);
        lastKnownUrl = tab.url;

        // Clear the in-memory state for this tab since URL changed
        // The old state was for the previous URL
        tabStates.delete(tabId);

        // Restore state (will check history for the new URL)
        await restoreTabState(tabId);
    }
});

// Get current tab on startup and restore state
chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
    if (tab) {
        currentTabId = tab.id;
        lastKnownUrl = tab.url || '';
        console.log('[Truth Lens] Initial tab:', currentTabId, 'URL:', tab.url);
        // Restore state for the initial tab (this will check history)
        await restoreTabState(currentTabId);
    }
});


// --- Core Logic ---

async function handleCheck(text, source = 'Page', forceRefresh = false, isYouTube = false) {
    if (!text) {
        showError(i18n.getTranslation('errorNoContent'));
        return;
    }

    currentContent = text;

    // Check cache first (unless forcing refresh)
    const cacheKey = generateCacheKey(text);
    if (!forceRefresh) {
        const cached = await getFromCache(cacheKey);
        if (cached) {
            displayCachedResult(cached, text);
            return;
        }
    }

    try {
        // Hide cache notice if showing
        DOM.cachedNotice?.classList.add('hidden');

        // Show progress with appropriate text for YouTube
        showProgress(isYouTube);
        startTimer();

        // Step 1: Extract content / Get Transcription
        updateStep('extract', 'active');
        updateStepText('extract',
            isYouTube ? i18n.getTranslation('stepExtractYT') : i18n.getTranslation('stepExtract'),
            isYouTube ? i18n.getTranslation('stepExtractYTDesc') : i18n.getTranslation('stepExtractDesc')
        );
        DOM.contentPreviewText.textContent = text.substring(0, 5000) + (text.length > 5000 ? '\n\n... [truncated for preview]' : '');
        DOM.contentPreviewSection?.classList.remove('hidden');
        await delay(300);
        updateStep('extract', 'complete');

        // Step 2: Prepare prompt
        updateStep('prompt', 'active');
        const prompt = buildPrompt(text);
        currentPrompt = prompt;
        DOM.promptPreviewText.textContent = prompt.substring(0, 3000) + (prompt.length > 3000 ? '\n\n... [truncated for preview]' : '');
        DOM.promptPreviewSection?.classList.remove('hidden');
        await delay(200);
        updateStep('prompt', 'complete');

        // Step 3: AI Analysis
        updateStep('analyze', 'active');
        const { score, report } = await llmService.analyzeText(text);
        updateStep('analyze', 'complete');

        // Step 4: Complete
        updateStep('complete', 'active');
        await delay(200);
        updateStep('complete', 'complete');

        stopTimer();
        hideProgress();

        // Save to cache
        await saveToCache(cacheKey, { score, report, source, timestamp: Date.now() });

        displayResult(score, report, text, prompt);
        saveHistory(source, score, new Date().toLocaleString(), text.substring(0, 100));

    } catch (error) {
        stopTimer();
        updateStep('analyze', 'error');
        showError(error.message);
    }
}

function buildPrompt(text) {
    const langCode = i18n.getCurrentLanguage();
    const nativeLang = i18n.getNativeName(langCode);

    return `Please fact-check this content. IMPORTANT: Respond in ${nativeLang}.\n\n${text}`;
}

async function getPageContent(specificTabId = null) {
    let tab;
    if (specificTabId) {
        try {
            tab = await chrome.tabs.get(specificTabId);
        } catch (e) {
            throw new Error("Target tab is no longer available.");
        }
    } else {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        tab = tabs[0];
    }

    if (!tab) throw new Error("No active tab found.");

    if (!tab.url) {
        throw new Error("Cannot access page URL. Please reload and try again.");
    }

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        throw new Error("Cannot fact check browser system pages.");
    }

    // Check if it's a YouTube page based on URL
    const isYouTube = tab.url.includes('youtube.com/watch') || tab.url.includes('youtu.be/');

    try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: "getPageContent" });
        return {
            content: response.content,
            url: tab.url,
            title: tab.title,
            isYouTube: response.isYouTube || isYouTube
        };
    } catch (e) {
        console.error('Content script not available, injecting...', e);

        // Inject content script if not already loaded
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            // Wait a bit for script to initialize
            await new Promise(resolve => setTimeout(resolve, 500));

            // Try again
            const response = await chrome.tabs.sendMessage(tab.id, { action: "getPageContent" });
            return {
                content: response.content,
                url: tab.url,
                title: tab.title,
                isYouTube: response.isYouTube || isYouTube
            };
        } catch (e2) {
            console.error('Failed to inject or communicate with content script:', e2);
            // Last resort fallback
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.body.innerText
            });
            return { content: results[0].result, url: tab.url, title: tab.title, isYouTube };
        }
    }
}

function displayResult(score, report, content, prompt) {
    DOM.resultContainer.classList.remove('hidden');

    // Ensure score is a valid number
    const displayScore = typeof score === 'number' ? score : parseInt(score) || 0;
    DOM.scoreText.textContent = `${displayScore}%`;

    // Detect text direction from content
    const direction = detectTextDirection(content);

    // Parse and render report in sections with correct direction
    renderReportSections(report, direction);



    // Update Verdict Titles based on Language
    updateVerdictText(score);

    // Update Circle
    DOM.circle.style.strokeDasharray = `${score}, 100`;

    // Color logic
    let color = '#ef4444';
    let title = 'Potentially False or Misleading';
    let subtitle = 'This content contains significant inaccuracies';

    if (score >= 80) {
        color = '#10b981';
        title = 'High Credibility';
        subtitle = 'This content appears to be accurate';
    } else if (score >= 50) {
        color = '#f59e0b';
        title = 'Mixed / Needs Context';
        subtitle = 'Some claims need verification';
    }

    DOM.circle.style.stroke = color;
    // Verdict text is now updated via updateVerdictText helper to support i18n
}

function updateVerdictText(score) {
    let titleKey = 'verdictTitleLow';
    let subtitleKey = 'verdictSubtitleLow';
    let color = '#ef4444';

    if (score >= 80) {
        color = '#10b981';
        titleKey = 'verdictTitleHigh';
        subtitleKey = 'verdictSubtitleHigh';
    } else if (score >= 50) {
        color = '#f59e0b';
        titleKey = 'verdictTitleMixed';
        subtitleKey = 'verdictSubtitleMixed';
    }

    DOM.verdictTitle.textContent = i18n.getTranslation(titleKey);
    DOM.verdictTitle.style.color = color;
    DOM.verdictSubtitle.textContent = i18n.getTranslation(subtitleKey);
}

/**
 * Detects if text is RTL (Arabic, Hebrew, Persian, Urdu, etc.)
 */
function detectTextDirection(text) {
    if (!text) return 'ltr';

    // Get first 200 chars for detection
    const sample = text.substring(0, 200);

    // RTL Unicode ranges:
    // Arabic: \u0600-\u06FF, \u0750-\u077F, \u08A0-\u08FF
    // Hebrew: \u0590-\u05FF
    // Persian/Urdu extensions: \uFB50-\uFDFF, \uFE70-\uFEFF
    const rtlPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0590-\u05FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

    // Count RTL characters
    const rtlMatches = sample.match(new RegExp(rtlPattern.source, 'g')) || [];
    const rtlRatio = rtlMatches.length / sample.replace(/\s/g, '').length;

    // If more than 30% RTL characters, use RTL
    return rtlRatio > 0.3 ? 'rtl' : 'ltr';
}

function displayCachedResult(cached, content) {
    DOM.cachedNotice?.classList.remove('hidden');
    displayResult(cached.score, cached, content, buildPrompt(content));
}

function renderReportSections(report, direction = 'ltr') {
    const textAlign = direction === 'rtl' ? 'right' : 'left';
    const dirAttr = `dir="${direction}"`;

    // Set direction on the container
    DOM.reportSections.dir = direction;
    DOM.reportSections.style.textAlign = textAlign;

    // Check if report is structured (object) or raw text
    if (typeof report === 'object' && report.summary) {
        // Render structured report
        let html = '';

        // Summary Section
        if (report.summary) {
            html += `
                <div class="report-section" ${dirAttr} style="text-align: ${textAlign}">
                    <div class="report-section-header">
                        <span class="report-section-icon">📋</span>
                        <span class="report-section-title">${i18n.getTranslation('reportSummary')}</span>
                    </div>
                    <div class="report-section-content">${escapeHtml(report.summary)}</div>
                </div>
            `;
        }

        // Claims Section
        if (report.claims && report.claims.length > 0) {
            html += `
                <div class="report-section" ${dirAttr} style="text-align: ${textAlign}">
                    <div class="report-section-header">
                        <span class="report-section-icon">🔍</span>
                        <span class="report-section-title">${i18n.getTranslation('reportClaims')}</span>
                    </div>
                    <div class="report-section-content">
                        <div class="claims-list">
            `;

            report.claims.forEach(claim => {
                const verdictClass = getVerdictClass(claim.verdict);
                const verdictIcon = getVerdictIcon(claim.verdict);
                html += `
                    <div class="claim-item ${verdictClass}" ${dirAttr}>
                        <div class="claim-header">
                            <span class="claim-verdict-icon">${verdictIcon}</span>
                            <span class="claim-verdict">${getTranslatedVerdict(claim.verdict)}</span>
                        </div>
                        <div class="claim-text">"${escapeHtml(claim.claim)}"</div>
                        <div class="claim-explanation">${escapeHtml(claim.explanation)}</div>
                    </div>
                `;
            });

            html += `</div></div></div>`;
        }

        // Context Section
        if (report.context) {
            html += `
                <div class="report-section" ${dirAttr} style="text-align: ${textAlign}">
                    <div class="report-section-header">
                        <span class="report-section-icon">📌</span>
                        <span class="report-section-title">${i18n.getTranslation('reportContext')}</span>
                    </div>
                    <div class="report-section-content">${escapeHtml(report.context)}</div>
                </div>
            `;
        }

        // Bias Section
        if (report.bias) {
            html += `
                <div class="report-section" ${dirAttr} style="text-align: ${textAlign}">
                    <div class="report-section-header">
                        <span class="report-section-icon">⚖️</span>
                        <span class="report-section-title">${i18n.getTranslation('reportBias')}</span>
                    </div>
                    <div class="report-section-content">${escapeHtml(report.bias)}</div>
                </div>
            `;
        }

        // Sources Section
        if (report.sources) {
            html += `
                <div class="report-section" ${dirAttr} style="text-align: ${textAlign}">
                    <div class="report-section-header">
                        <span class="report-section-icon">📚</span>
                        <span class="report-section-title">${i18n.getTranslation('reportSources')}</span>
                    </div>
                    <div class="report-section-content">${escapeHtml(report.sources)}</div>
                </div>
            `;
        }

        DOM.reportSections.innerHTML = html;
    } else {
        // Fallback to markdown for raw text
        const rawText = typeof report === 'object' ? (report.raw || report.summary || JSON.stringify(report)) : report;
        DOM.reportSections.innerHTML = `
            <div class="report-section" dir="${direction}" style="text-align: ${textAlign}">
                <div class="report-section-content markdown-body">
                    ${parseMarkdown(rawText)}
                </div>
            </div>
        `;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getVerdictClass(verdict) {
    if (!verdict) return '';
    const v = verdict.toUpperCase();
    if (v === 'TRUE' || v === 'VERIFIED') return 'verdict-true';
    if (v === 'MOSTLY_TRUE') return 'verdict-mostly-true';
    if (v === 'FALSE' || v === 'FABRICATED') return 'verdict-false';
    if (v === 'MISLEADING') return 'verdict-misleading';
    if (v === 'MIXED') return 'verdict-mixed';
    if (v === 'SATIRE') return 'verdict-satire';
    if (v === 'OPINION') return 'verdict-opinion';
    if (v === 'UNVERIFIABLE') return 'verdict-unverifiable';
    return 'verdict-unknown';
}

function getVerdictIcon(verdict) {
    if (!verdict) return '❓';
    const v = verdict.toUpperCase();
    if (v === 'TRUE' || v === 'VERIFIED') return '✅';
    if (v === 'MOSTLY_TRUE') return '☑️';
    if (v === 'FALSE' || v === 'FABRICATED') return '❌';
    if (v === 'MISLEADING') return '⚠️';
    if (v === 'MIXED') return '⚖️';
    if (v === 'SATIRE') return '🎭';
    if (v === 'OPINION') return '💭';
    if (v === 'UNVERIFIABLE') return '🤷';
    return '❓';
}

function getTranslatedVerdict(verdictKey) {
    if (!verdictKey) return '';
    // Normalize key: remove spaces, uppercase
    const key = String(verdictKey).toUpperCase().replace(/\s+/g, '_');

    // Try to find translation for "verdict_KEY"
    const lookupKey = `verdict_${key}`;
    const translated = i18n.getTranslation(lookupKey);

    // If translation is same as key (not found default), return original title-cased or whatever comes in
    // But i18n.getTranslation returns key if not found.
    if (translated === lookupKey) {
        return verdictKey;
    }
    return translated;
}

// --- Progress Functions ---

function showProgress() {
    DOM.progressContainer?.classList.remove('hidden');
    DOM.resultContainer?.classList.add('hidden');
    DOM.checkPageBtn.classList.add('hidden'); // Hide button during analysis
    resetSteps();
}

function hideProgress(showButton = false) {
    DOM.progressContainer?.classList.add('hidden');
    // Only show button if explicitly requested (e.g. on error)
    if (showButton) {
        DOM.checkPageBtn.classList.remove('hidden');
        DOM.checkPageBtn.disabled = false;
    }
}

function updateStep(stepName, status) {
    const stepEl = document.getElementById(`step-${stepName}`);
    if (!stepEl) return;

    const icon = stepEl.querySelector('.step-icon');
    icon.className = `step-icon ${status}`;

    if (status === 'complete') {
        icon.querySelector('.icon-content').textContent = '';
    }
}

function updateStepText(stepName, title, description) {
    const stepEl = document.getElementById(`step-${stepName}`);
    if (!stepEl) return;

    const titleEl = stepEl.querySelector('.step-title');
    const descEl = stepEl.querySelector('.step-description');

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = description;
}

function resetSteps() {
    ['extract', 'prompt', 'analyze', 'complete'].forEach((step, i) => {
        const stepEl = document.getElementById(`step-${step}`);
        if (stepEl) {
            const icon = stepEl.querySelector('.step-icon');
            icon.className = 'step-icon pending';
            icon.querySelector('.icon-content').textContent = i + 1;
        }
    });
    DOM.contentPreviewSection?.classList.add('hidden');
    DOM.promptPreviewSection?.classList.add('hidden');
}

function startTimer() {
    stopTimer();
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        if (DOM.progressTimer) DOM.progressTimer.textContent = `${elapsed}s`;
    }, 100);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// --- Cache Functions ---

function generateCacheKey(content) {
    // Simple hash based on content length and first/last chars
    const sample = content.substring(0, 500) + content.substring(content.length - 500);
    let hash = 0;
    for (let i = 0; i < sample.length; i++) {
        hash = ((hash << 5) - hash) + sample.charCodeAt(i);
        hash = hash & hash;
    }
    return `cache_${hash}`;
}

async function getFromCache(key) {
    const data = await chrome.storage.local.get(key);
    if (data[key] && Date.now() - data[key].timestamp < 24 * 60 * 60 * 1000) { // 24hr expiry
        return data[key];
    }
    return null;
}

async function saveToCache(key, value) {
    await chrome.storage.local.set({ [key]: value });
}

async function clearCache() {
    const all = await chrome.storage.local.get(null);
    const cacheKeys = Object.keys(all).filter(k => k.startsWith('cache_'));
    await chrome.storage.local.remove(cacheKeys);
}



function normalizeUrl(url) {
    if (!url) return '';
    try {
        const u = new URL(url);
        u.hash = ''; // Ignore fragment identifier
        // We could also sort query params if needed, but hash removal is most critical
        return u.toString();
    } catch (e) {
        return url;
    }
}

// --- Utility ---

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function setLoading(isLoading) {
    // Legacy function - kept for compatibility
    DOM.checkPageBtn.disabled = isLoading;
}

function showError(msg) {
    hideProgress(true); // Show button on error
    DOM.resultContainer.classList.remove('hidden');
    DOM.reportSections.innerHTML = `<div class="report-section"><p style="color: var(--danger-color)">Error: ${msg}</p></div>`;
    DOM.scoreText.textContent = '?';
    DOM.circle.style.stroke = 'var(--text-secondary)';
    DOM.verdictTitle.textContent = 'Error';
}

async function saveHistory(historyData) {
    // historyData: { source, title, url, score, date, content, report, isYouTube }
    try {
        const { factCheckHistory = [] } = await chrome.storage.local.get('factCheckHistory');

        // Add new item at the beginning
        factCheckHistory.unshift({
            id: Date.now(),
            ...historyData
        });

        // Keep only last 50 items
        if (factCheckHistory.length > 50) {
            factCheckHistory.splice(50);
        }

        await chrome.storage.local.set({ factCheckHistory });
        renderHistoryList();
    } catch (e) {
        console.error('Error saving history:', e);
    }
}

async function loadHistory() {
    try {
        const { factCheckHistory = [] } = await chrome.storage.local.get('factCheckHistory');
        return factCheckHistory;
    } catch (e) {
        console.error('Error loading history:', e);
        return [];
    }
}

async function clearHistoryStorage() {
    // Clear history
    await chrome.storage.local.remove('factCheckHistory');
    // Clear cache
    await clearCache();
    // Clear tab states
    tabStates.clear();
    // Re-render history list
    renderHistoryList();
}

async function deleteHistoryItem(itemId) {
    try {
        const { factCheckHistory = [] } = await chrome.storage.local.get('factCheckHistory');
        const updatedHistory = factCheckHistory.filter(item => item.id !== itemId);
        await chrome.storage.local.set({ factCheckHistory: updatedHistory });
        renderHistoryList();
    } catch (e) {
        console.error('Error deleting history item:', e);
    }
}

async function removeHistoryForUrl(url) {
    if (!url) return;
    try {
        const { factCheckHistory = [] } = await chrome.storage.local.get('factCheckHistory');
        const normalizedUrl = normalizeUrl(url);
        // Remove all entries matching this URL
        const updatedHistory = factCheckHistory.filter(item => normalizeUrl(item.url) !== normalizedUrl);

        if (updatedHistory.length !== factCheckHistory.length) {
            await chrome.storage.local.set({ factCheckHistory: updatedHistory });
            renderHistoryList();
        }
    } catch (e) {
        console.error('Error removing history for URL:', e);
    }
}

async function renderHistoryList() {
    const history = await loadHistory();

    if (history.length === 0) {
        DOM.historyList.innerHTML = `<p class="placeholder-text">${i18n.getTranslation('historyEmpty')}</p>`;
        return;
    }

    DOM.historyList.innerHTML = '';

    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.dataset.id = item.id;

        let scoreColor = '#ef4444';
        if (item.score >= 80) scoreColor = '#10b981';
        else if (item.score >= 50) scoreColor = '#f59e0b';

        const icon = item.isYouTube ? '🎬' : '📄';
        const titlePreview = (item.title || 'Untitled').substring(0, 60) + (item.title?.length > 60 ? '...' : '');

        // Format date to be shorter if possible, or just use as is
        let dateStr = item.date;
        try {
            // Try to make it just date if it's old, or time if today? 
            // For simplicity, keep it but ensure CSS handles overflow
            // dateStr = new Date(item.date).toLocaleDateString(); // if item.date is parseable
        } catch (e) { }

        div.innerHTML = `
            <div class="history-item-left">
                <div class="history-score-badge" style="background: ${scoreColor}">${item.score}%</div>
            </div>
            <div class="history-item-content">
                <div class="history-item-title" title="${item.title || ''}">${titlePreview}</div>
                <div class="history-item-meta">
                    <span class="history-meta-icon">${icon}</span>
                    <span class="history-meta-date">${dateStr}</span>
                </div>
            </div>
            <button class="history-item-delete" title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        `;

        // Click on item to view details
        div.addEventListener('click', (e) => {
            if (!e.target.classList.contains('history-item-delete')) {
                showHistoryDetail(item);
            }
        });

        // Click on delete button
        const deleteBtn = div.querySelector('.history-item-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteHistoryItem(item.id);
        });

        DOM.historyList.appendChild(div);
    });
}

function showHistoryDetail(item) {
    // Switch to check tab and display the result
    switchTab('check');

    // Hide the fact check button
    DOM.checkPageBtn.classList.add('hidden');

    // Display the result
    displayResult(item.score, item.report, item.content, buildPrompt(item.content));

    // Update title and show cached notice
    DOM.verdictSubtitle.textContent = `From: ${item.url || 'Unknown'}`;
}

// Load history on startup
renderHistoryList();

// --- Event Listeners ---

// Store isYouTube for refresh
let currentIsYouTube = false;

DOM.checkPageBtn.addEventListener('click', async () => {
    try {
        // First detect if it's YouTube from URL
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Set currentTabId for state tracking
        if (tab?.id) {
            currentTabId = tab.id;
            console.log('[Truth Lens] Starting fact check for tab:', currentTabId);
        }

        const isYouTube = tab?.url?.includes('youtube.com/watch') || tab?.url?.includes('youtu.be/');
        currentIsYouTube = isYouTube;

        // Start the check process with progress
        await handleCheckWithProgress(isYouTube);
    } catch (e) {
        showError(e.message);
    }
});


// New function that shows progress first, then fetches content
async function handleCheckWithProgress(isYouTube, forceRefresh = false) {
    // Capture the tab ID at the START - this won't change even if user switches tabs
    const factCheckTabId = currentTabId;
    console.log('[Truth Lens] handleCheckWithProgress started for tab:', factCheckTabId);

    // Helpers to guard UI updates
    const isCurrent = () => currentTabId === factCheckTabId;
    const updateUI = (fn) => { if (isCurrent()) fn(); };

    try {
        // Mark this tab as having progress in progress
        setTabProgress(factCheckTabId); // Default start state
        // Helper to update state and UI together
        const setProgressStep = (step) => {
            saveTabState(factCheckTabId, { status: 'progress', progressStep: step });
            updateUI(() => updateStep(step, 'active'));
        };

        // Show progress FIRST
        updateUI(() => {
            DOM.cachedNotice?.classList.add('hidden');
            showProgress(isYouTube);
            startTimer();
        });

        // Step 1: Fetch content/transcript
        setProgressStep('extract');
        updateUI(() => {
            updateStepText('extract',
                isYouTube ? i18n.getTranslation('stepExtractYT') : i18n.getTranslation('stepExtract'),
                isYouTube ? i18n.getTranslation('stepExtractYTDesc') : i18n.getTranslation('stepExtractDesc')
            );
        });

        // NOW fetch the content using the specific tab ID
        const { content } = await getPageContent(factCheckTabId);

        // Use local variable for content, only update global if active
        // currentContent = content; // Don't wipe global immediately
        if (isCurrent()) currentContent = content;

        // Detect text direction
        const direction = detectTextDirection(content);
        const textAlign = direction === 'rtl' ? 'right' : 'left';

        // Show what we got with correct direction
        updateUI(() => {
            DOM.contentPreviewText.textContent = content;
            DOM.contentPreviewText.dir = direction;
            DOM.contentPreviewText.style.textAlign = textAlign;
            DOM.contentPreviewSection?.classList.remove('hidden');
        });

        // Check if content is empty or invalid
        if (!content || content.trim().length === 0 || (isYouTube && content.includes('[Transcript not available'))) {
            const errorMsg = (isYouTube && content.includes('[Transcript not available'))
                ? i18n.getTranslation('errorNoTranscript') || 'Transcript not available'
                : i18n.getTranslation('errorNoContent');

            updateUI(() => {
                updateStep('extract', 'error');
                updateStepText('extract', isYouTube ? 'Transcription Failed' : 'Extraction Failed', errorMsg);
                stopTimer();
                DOM.checkPageBtn.classList.remove('hidden'); // allow retry
            });
            // Treat as idle/error state for tab
            setTabIdle(factCheckTabId);
            return;
        }

        updateUI(() => updateStep('extract', 'complete'));

        // Check cache (unless forcing refresh)
        const cacheKey = generateCacheKey(content);
        if (!forceRefresh) {
            const cached = await getFromCache(cacheKey);
            if (cached) {
                // Also save to tab state so it persists across tab switches
                const prompt = buildPrompt(content);
                console.log('[Truth Lens] Saving cached result for tab:', factCheckTabId);
                setTabResult(factCheckTabId, cached.score, cached, content, prompt, isYouTube);

                updateUI(() => {
                    stopTimer();
                    hideProgress();
                    DOM.cachedNotice?.classList.remove('hidden');
                    displayResult(cached.score, cached, content, prompt);
                    currentContent = content; // Ensure global is consistent
                    currentPrompt = prompt;
                });
                return;
            }
        }

        // Step 2: Prepare prompt
        setProgressStep('prompt');
        const prompt = buildPrompt(content);
        if (isCurrent()) currentPrompt = prompt;

        updateUI(() => {
            DOM.promptPreviewText.textContent = prompt;
            DOM.promptPreviewSection?.classList.remove('hidden');
        });

        await delay(200);
        updateUI(() => updateStep('prompt', 'complete'));

        // Step 3: AI Analysis
        setProgressStep('analyze');
        const analysisResult = await llmService.analyzeText(content);
        updateUI(() => updateStep('analyze', 'complete'));

        // Step 4: Complete
        setProgressStep('complete');
        await delay(200);
        updateUI(() => updateStep('complete', 'complete'));

        // Get fresh title/url from the specific tab we processed
        let finalTitle = 'Untitled';
        let finalUrl = '';

        try {
            const freshTab = await chrome.tabs.get(factCheckTabId);
            finalTitle = freshTab.title;
            finalUrl = freshTab.url;
        } catch (e) {
            console.log('Tab closed before saving history details');
        }

        // Save to cache - store the full analysis result
        const source = isYouTube ? 'YouTube Video' : 'Current Page';
        await saveToCache(cacheKey, { ...analysisResult, source, timestamp: Date.now() });

        // Save tab state for per-tab persistence
        console.log('[Truth Lens] Saving result for tab:', factCheckTabId);
        setTabResult(factCheckTabId, analysisResult.score, analysisResult, content, prompt, isYouTube);

        // Update UI only if strictly current
        updateUI(() => {
            stopTimer();
            hideProgress();
            displayResult(analysisResult.score, analysisResult, content, prompt);
        });

        // Save to history with full details
        await saveHistory({
            source,
            title: finalTitle,
            url: finalUrl,
            score: analysisResult.score,
            date: new Date().toLocaleString(),
            content,
            report: analysisResult,
            isYouTube
        });

    } catch (error) {
        updateUI(() => {
            stopTimer();
            updateStep('analyze', 'error');
            showError(error.message);
        });
        // Reset state so it doesn't get stuck in 'progress' forever
        setTabIdle(factCheckTabId);
    }
}

// Refresh button (force re-check ignoring cache)
DOM.refreshCheckBtn?.addEventListener('click', async () => {
    if (currentContent) {
        await handleCheckWithProgress(currentIsYouTube, true);
    }
});

// Clear cache button
DOM.clearCacheBtn?.addEventListener('click', async () => {
    await clearCache();
    alert('Cache cleared!');
});

// Clear history button
DOM.clearHistoryBtn?.addEventListener('click', async () => {
    await clearHistoryStorage();
});

// Recheck button - start a new fact check
DOM.newCheckBtn?.addEventListener('click', async () => {
    DOM.resultContainer.classList.add('hidden');
    DOM.cachedNotice?.classList.add('hidden');
    currentContent = '';
    currentPrompt = '';

    // Start new fact check like clicking Fact Check button
    // Start new fact check like clicking Fact Check button
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Remove history/cache for this URL first if requested
        if (tab?.url) {
            await removeHistoryForUrl(tab.url);
        }

        const isYouTube = tab?.url?.includes('youtube.com/watch') || tab?.url?.includes('youtu.be/');
        currentIsYouTube = isYouTube;
        // Pass forceRefresh = true to ignore and overwrite cache
        await handleCheckWithProgress(isYouTube, true);
    } catch (e) {
        showError(e.message);
    }
});

// Expandable section toggles
document.querySelectorAll('.expandable-header').forEach(header => {
    header.addEventListener('click', () => {
        const targetId = header.dataset.target;
        const target = document.getElementById(targetId);
        if (target) {
            target.classList.toggle('hidden');
            header.classList.toggle('expanded');
        }
    });
});

// Listen for external messages (e.g. from context menu)
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'checkSelection') {
        switchTab('check');
        handleCheck(request.text, 'Selection');
    }
});


// --- UI Logic ---

function switchTab(tabId) {
    DOM.tabs.forEach(btn => {
        if (btn.dataset.tab === tabId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    DOM.contents.forEach(content => {
        if (content.id === tabId) content.classList.add('active');
        else content.classList.remove('active');
    });
}

DOM.tabs.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// --- Settings Logic ---

async function loadSettings() {
    const data = await chrome.storage.sync.get(['providerUrl', 'modelName', 'apiKey', 'systemPrompt', 'reportLanguage']);
    DOM.providerUrl.value = data.providerUrl || 'https://api.openai.com/v1';
    DOM.modelName.value = data.modelName || 'gpt-4o';
    DOM.apiKey.value = data.apiKey || '';

    // Set language
    if (data.reportLanguage) {
        DOM.reportLanguage.value = data.reportLanguage;
        i18n.setLanguage(data.reportLanguage);
    }

    // Apply translations on load
    applyTranslations();
}

function applyTranslations() {
    // Translate all elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = i18n.getTranslation(key);
    });

    // Handle RTL
    const isRtl = i18n.isRTL();
    document.body.dir = isRtl ? 'rtl' : 'ltr';
    document.body.style.textAlign = isRtl ? 'right' : 'left';

    // Specific updates for dynamic content if needed
    // e.g. placeholder text (though better to use data-i18n-placeholder if many)
}

async function saveSettings(e) {
    e.preventDefault();
    const settings = {
        providerUrl: DOM.providerUrl.value,
        modelName: DOM.modelName.value,
        apiKey: DOM.apiKey.value,
        reportLanguage: DOM.reportLanguage.value
    };

    // Update language immediately
    if (i18n.setLanguage(DOM.reportLanguage.value)) {
        applyTranslations();
    }

    await chrome.storage.sync.set(settings);

    DOM.settingsStatus.textContent = i18n.getTranslation('statusSaved');
    DOM.settingsStatus.style.color = 'var(--primary-color)';
    setTimeout(() => {
        DOM.settingsStatus.textContent = '';
    }, 2000);
}

DOM.settingsForm.addEventListener('submit', saveSettings);

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    checkPendingTask();
});

// Check for pending tasks from background script (context menu)
async function checkPendingTask() {
    const data = await chrome.storage.local.get('pendingCheck');
    if (data.pendingCheck) {
        // Only process if recent (within 1 minute) to avoid stale checks reopening
        if (Date.now() - data.pendingCheck.timestamp < 60000) {
            switchTab('check');
            handleCheck(data.pendingCheck.text, 'Selection');
        }
        // Clear it
        await chrome.storage.local.remove('pendingCheck');
    }
}

// Also listen for storage changes in case panel is already open
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.pendingCheck && changes.pendingCheck.newValue) {
        checkPendingTask();
    }
});
