/**
 * DOM Element References
 * Central location for all DOM element references in the sidepanel
 */

export const DOM = {
    // Tabs
    tabs: document.querySelectorAll('.tab-btn'),
    contents: document.querySelectorAll('.tab-content'),

    // Fact Check Tab
    checkPageBtn: document.getElementById('check-page-btn'),
    resultContainer: document.getElementById('result-container'),
    reportSections: document.getElementById('report-sections'),
    scoreText: document.getElementById('score-text'),
    circle: document.querySelector('.circle'),
    verdictTitle: document.getElementById('verdict-title'),
    verdictSubtitle: document.getElementById('verdict-subtitle'),

    // Progress Elements
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

    // Result Actions
    cachedNotice: document.getElementById('cached-notice'),
    refreshCheckBtn: document.getElementById('refresh-check-btn'),
    newCheckBtn: document.getElementById('new-check-btn'),
    closeSelectionBtn: document.getElementById('close-selection-btn'),
    closeButtonRow: document.getElementById('close-button-row'),

    // Report Info (for current fact check)
    reportInfo: document.getElementById('report-info'),
    reportInfoTitle: document.getElementById('report-info-title'),
    reportInfoType: document.getElementById('report-info-type'),
    reportInfoDate: document.getElementById('report-info-date'),
    reportInfoUrl: document.getElementById('report-info-url'),

    // History Tab - List View
    historyListView: document.getElementById('history-list-view'),
    historyList: document.getElementById('history-list'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),

    // History Tab - Detail View
    historyDetailView: document.getElementById('history-detail-view'),
    historyBackBtn: document.getElementById('history-back-btn'),
    historyDetailTitle: document.getElementById('history-detail-title'),
    historyDetailType: document.getElementById('history-detail-type'),
    historyDetailDate: document.getElementById('history-detail-date'),
    historyDetailUrl: document.getElementById('history-detail-url'),
    historyDetailScore: document.getElementById('history-detail-score'),
    historyDetailCircle: document.getElementById('history-detail-circle'),
    historyDetailVerdict: document.getElementById('history-detail-verdict'),
    historyDetailSections: document.getElementById('history-detail-sections'),

    // Settings Tab
    settingsForm: document.getElementById('settings-form'),
    providerUrl: document.getElementById('provider-url'),
    modelName: document.getElementById('model-name'),
    apiKey: document.getElementById('api-key'),
    reportLanguage: document.getElementById('report-language'),
    settingsStatus: document.getElementById('settings-status'),
    clearCacheBtn: document.getElementById('clear-cache-btn')
};
