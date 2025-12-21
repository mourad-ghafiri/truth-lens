/**
 * State Management
 * Central state for the sidepanel application
 */

// Current content being analyzed
export let currentContent = '';
export let currentPrompt = '';
export let currentSource = 'page'; // 'page', 'video', or 'selection'
export let currentIsYouTube = false;

// Timer state
export let timerInterval = null;
export let startTime = null;

// Selection state (for context menu selections)
export let isViewingSelection = false;
export let selectionResult = null;

// Per-tab state management (pages/videos only)
export const tabStates = new Map();
export let currentTabId = null;
export let isRestoringState = false;

// Setters for state that needs to be modified from other modules
export function setCurrentContent(content) {
    currentContent = content;
}

export function setCurrentPrompt(prompt) {
    currentPrompt = prompt;
}

export function setCurrentSource(source) {
    currentSource = source;
}

export function setCurrentIsYouTube(isYT) {
    currentIsYouTube = isYT;
}

export function setTimerInterval(interval) {
    timerInterval = interval;
}

export function setStartTime(time) {
    startTime = time;
}

export function setIsViewingSelection(viewing) {
    isViewingSelection = viewing;
}

export function setSelectionResult(result) {
    selectionResult = result;
}

export function setCurrentTabId(tabId) {
    currentTabId = tabId;
}

export function setIsRestoringState(restoring) {
    isRestoringState = restoring;
}

// Tab state helpers
export function saveTabState(tabId, state) {
    if (!tabId) return;
    console.log('[Truth Lens] Saving tab state:', tabId, state.status);
    tabStates.set(tabId, {
        ...state,
        timestamp: Date.now()
    });
}

export function getTabState(tabId) {
    return tabStates.get(tabId) || null;
}

export function setTabProgress(tabId) {
    saveTabState(tabId, { status: 'progress' });
}

export function setTabResult(tabId, score, report, content, prompt, isYouTube) {
    saveTabState(tabId, {
        status: 'result',
        score,
        report,
        content,
        prompt,
        isYouTube
    });
}

export function setTabIdle(tabId) {
    saveTabState(tabId, { status: 'idle' });
}

// Reset selection state
export function clearSelectionState() {
    isViewingSelection = false;
    selectionResult = null;
}
