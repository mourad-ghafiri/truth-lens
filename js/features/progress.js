/**
 * Progress Module
 * Handles progress indicators and timer during fact-checking
 */

import { DOM } from '../core/dom.js';
import * as state from '../core/state.js';

// Start the timer
export function startTimer() {
    state.setStartTime(Date.now());
    state.setTimerInterval(setInterval(updateTimer, 100));
}

// Stop the timer
export function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.setTimerInterval(null);
    }
}

// Update timer display
function updateTimer() {
    if (!state.startTime || !DOM.progressTimer) return;

    const elapsed = Date.now() - state.startTime;
    const seconds = Math.floor(elapsed / 1000);
    const ms = Math.floor((elapsed % 1000) / 100);
    DOM.progressTimer.textContent = `${seconds}.${ms}s`;
}

// Show progress container
export function showProgress(showButton = false) {
    DOM.progressContainer?.classList.remove('hidden');
    DOM.checkPageBtn?.classList.add('hidden');
    DOM.resultContainer?.classList.add('hidden');
    resetSteps();
}

// Hide progress container
export function hideProgress(showButton = false) {
    DOM.progressContainer?.classList.add('hidden');
    if (showButton) {
        DOM.checkPageBtn?.classList.remove('hidden');
    }
}

// Reset all steps to pending state
export function resetSteps() {
    const steps = [DOM.stepExtract, DOM.stepPrompt, DOM.stepAnalyze, DOM.stepComplete];
    steps.forEach(step => {
        if (step) {
            step.classList.remove('active', 'complete', 'error');
        }
    });
    DOM.contentPreviewSection?.classList.add('hidden');
    DOM.promptPreviewSection?.classList.add('hidden');
}

// Update step state
export function updateStep(stepId, status) {
    const stepElement = document.getElementById(`step-${stepId}`);
    if (!stepElement) return;

    stepElement.classList.remove('active', 'complete', 'error');

    if (status === 'active') {
        stepElement.classList.add('active');
    } else if (status === 'complete') {
        stepElement.classList.add('complete');
    } else if (status === 'error') {
        stepElement.classList.add('error');
    }
}

// Update step text
export function updateStepText(stepId, title, description) {
    const stepElement = document.getElementById(`step-${stepId}`);
    if (!stepElement) return;

    const titleEl = stepElement.querySelector('.step-title');
    const descEl = stepElement.querySelector('.step-description');

    if (titleEl && title) titleEl.textContent = title;
    if (descEl && description) descEl.textContent = description;
}

// Delay helper
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
