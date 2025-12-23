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

// Reset all sub-steps to initial state
export function resetSubsteps() {
    // Hide all substep containers
    DOM.extractSubsteps?.classList.add('hidden');
    DOM.promptSubsteps?.classList.add('hidden');
    DOM.analysisSubsteps?.classList.add('hidden');
    DOM.completeSubsteps?.classList.add('hidden');

    // Reset all substeps (remove active/complete classes)
    const substeps = document.querySelectorAll('.substep');
    substeps.forEach(s => {
        s.classList.remove('active', 'complete');
    });

    // Clear all status badges
    const statuses = document.querySelectorAll('.substep-status');
    statuses.forEach(s => {
        s.textContent = '';
        s.className = 'substep-status';
    });

    // Hide and clear all content sections
    const contents = document.querySelectorAll('.substep-content');
    contents.forEach(c => {
        c.classList.add('hidden');
        // Reset toggle button
        const toggle = c.previousElementSibling?.querySelector('.substep-toggle');
        if (toggle) {
            toggle.textContent = '▼';
            toggle.setAttribute('aria-expanded', 'false');
        }
    });

    // Clear specific content containers
    if (DOM.contentPreviewText) DOM.contentPreviewText.textContent = '';
    if (DOM.promptPreviewText) DOM.promptPreviewText.textContent = '';
    if (DOM.searchQueries) DOM.searchQueries.innerHTML = '';
    if (DOM.searchResults) DOM.searchResults.innerHTML = '';
    // Step 4 sub-step containers
    if (DOM.processingStream) DOM.processingStream.innerHTML = '';
    if (DOM.reportPreview) DOM.reportPreview.innerHTML = '';
    if (DOM.summaryPreview) DOM.summaryPreview.innerHTML = '';
}

// Reset all steps to pending state
export function resetSteps() {
    // Reset sub-steps first
    resetSubsteps();

    const stepIds = ['extract', 'prompt', 'analyze', 'complete'];
    stepIds.forEach(stepId => {
        const stepElement = document.getElementById(`step-${stepId}`);
        if (stepElement) {
            stepElement.classList.remove('active', 'complete', 'error');
            // Reset icon to number
            resetStepIcon(stepElement, stepId);
        }
    });
}

// Update step state
export function updateStep(stepId, status) {
    const stepElement = document.getElementById(`step-${stepId}`);
    if (!stepElement) return;

    stepElement.classList.remove('active', 'complete', 'error');

    if (status === 'active') {
        stepElement.classList.add('active');
        resetStepIcon(stepElement, stepId); // Ensure number is shown
    } else if (status === 'complete') {
        stepElement.classList.add('complete');
        setStepIconCheck(stepElement); // Show checkmark
    } else if (status === 'error') {
        stepElement.classList.add('error');
    } else {
        resetStepIcon(stepElement, stepId); // Pending state
    }
}

// Helper to set checkmark icon
function setStepIconCheck(stepElement) {
    const iconContainer = stepElement.querySelector('.step-icon');
    if (iconContainer) {
        iconContainer.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    }
}

// Helper to reset icon to number
function resetStepIcon(stepElement, stepId) {
    const iconContainer = stepElement.querySelector('.step-icon');
    if (iconContainer) {
        // Map step string IDs to numbers if needed, or just hardcode base on ID
        const stepNumbers = {
            'extract': '1',
            'prompt': '2',
            'analyze': '3',
            'complete': '4'
        };
        iconContainer.textContent = stepNumbers[stepId] || '?';
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

// Restore progress state
export function restoreProgress(savedState) {
    if (!savedState) return;

    // Show container
    showProgress(false);

    // Restore timer
    if (savedState.startTime) {
        state.setStartTime(savedState.startTime);
        if (!state.timerInterval) {
            state.setTimerInterval(setInterval(updateTimer, 100));
        }
    }

    // Restore steps
    const steps = ['extract', 'prompt', 'analyze', 'complete'];
    const currentStepIndex = steps.indexOf(savedState.step || 'extract');

    steps.forEach((step, index) => {
        if (index < currentStepIndex) {
            updateStep(step, 'complete');
        } else if (index === currentStepIndex) {
            updateStep(step, 'active');
        } else {
            updateStep(step, 'pending');
        }
    });

    // Restore sub-steps visibility based on current step
    const currentStep = savedState.step || 'extract';

    // Restore sub-steps from saved state
    const substeps = savedState.substeps || {};

    // Step 1: Extract sub-steps
    if (currentStepIndex >= 0) {
        DOM.extractSubsteps?.classList.remove('hidden');
        // Detect sub-step
        if (substeps.detect?.status === 'complete') {
            DOM.substepDetect?.classList.add('complete');
            if (DOM.detectStatus) DOM.detectStatus.textContent = substeps.detect.text || '✓';
        }
        // Extract sub-step
        if (substeps.extract?.status === 'complete') {
            DOM.substepExtract?.classList.add('complete');
            if (DOM.extractStatus) {
                DOM.extractStatus.textContent = substeps.extract.text || '✓';
                DOM.extractStatus.className = 'substep-status done';
            }
        } else if (substeps.extract?.status === 'active') {
            DOM.substepExtract?.classList.add('active');
            if (DOM.extractStatus) {
                DOM.extractStatus.textContent = substeps.extract.text || 'Extracting...';
                DOM.extractStatus.className = 'substep-status searching';
            }
        }
    }

    // Step 2: Prompt sub-step
    if (currentStepIndex >= 1) {
        DOM.promptSubsteps?.classList.remove('hidden');
        if (substeps.prompt?.status === 'complete') {
            DOM.substepPrompt?.classList.add('complete');
            if (DOM.promptStatus) {
                DOM.promptStatus.textContent = substeps.prompt.text || '✓';
                DOM.promptStatus.className = 'substep-status done';
            }
        } else if (substeps.prompt?.status === 'active') {
            DOM.substepPrompt?.classList.add('active');
            if (DOM.promptStatus) {
                DOM.promptStatus.textContent = substeps.prompt.text || 'Building...';
                DOM.promptStatus.className = 'substep-status searching';
            }
        }
    }

    // Step 3: Analysis sub-steps (Web Search only)
    if (currentStepIndex >= 2) {
        DOM.analysisSubsteps?.classList.remove('hidden');
        // Search sub-step (only sub-step in Step 3 now)
        if (substeps.search?.status === 'complete') {
            DOM.substepSearch?.classList.add('complete');
            if (DOM.searchStatus) {
                DOM.searchStatus.textContent = substeps.search.text || 'Done';
                DOM.searchStatus.className = 'substep-status done';
            }
        } else if (substeps.search?.status === 'active') {
            DOM.substepSearch?.classList.add('active');
            if (DOM.searchStatus) {
                DOM.searchStatus.textContent = substeps.search.text || 'Searching...';
                DOM.searchStatus.className = 'substep-status searching';
            }
        }
        // Rebuild search queries from saved state
        if (substeps.search?.queries && DOM.searchQueries) {
            DOM.searchQueries.innerHTML = '';
            substeps.search.queries.forEach(q => {
                const queryItem = document.createElement('div');
                queryItem.className = 'search-query-item';
                queryItem.innerHTML = `
                    <span class="query-icon">🔍</span>
                    <span class="query-text">${q.query || ''}</span>
                    <span class="query-status">${q.status === 'complete' ? '✓' : '⏳'}</span>
                `;
                DOM.searchQueries.appendChild(queryItem);
            });
        }
        // Rebuild search results from saved state
        if (substeps.search?.results && DOM.searchResults) {
            DOM.searchResults.innerHTML = '';
            substeps.search.results.forEach(r => {
                const resultItem = document.createElement('div');
                resultItem.className = 'search-result-item';
                resultItem.innerHTML = `
                    <div class="result-title">${r.title || 'Result'}</div>
                    <div class="result-url">${r.url || ''}</div>
                `;
                DOM.searchResults.appendChild(resultItem);
            });
        }
    }

    // Step 4: Complete sub-steps (Processing, Report, Summary)
    if (currentStepIndex >= 3) {
        DOM.completeSubsteps?.classList.remove('hidden');

        // Processing sub-step
        if (substeps.processing?.status === 'complete') {
            DOM.substepProcessing?.classList.add('complete');
            if (DOM.processingStatus) {
                DOM.processingStatus.textContent = substeps.processing.text || 'Done';
                DOM.processingStatus.className = 'substep-status done';
            }
        } else if (substeps.processing?.status === 'active') {
            DOM.substepProcessing?.classList.add('active');
            if (DOM.processingStatus) {
                DOM.processingStatus.textContent = substeps.processing.text || 'Analyzing...';
                DOM.processingStatus.className = 'substep-status searching';
            }
            // Restore processing content
            if (DOM.processingStream && substeps.processing.content) {
                DOM.processingStream.textContent = substeps.processing.content;
            }
        }

        // Report sub-step
        if (substeps.report?.status === 'complete') {
            DOM.substepReport?.classList.add('complete');
            if (DOM.reportStatus) {
                DOM.reportStatus.textContent = substeps.report.text || 'Done';
                DOM.reportStatus.className = 'substep-status done';
            }
        } else if (substeps.report?.status === 'active') {
            DOM.substepReport?.classList.add('active');
            if (DOM.reportStatus) {
                DOM.reportStatus.textContent = substeps.report.text || 'Generating...';
                DOM.reportStatus.className = 'substep-status searching';
            }
        }

        // Summary sub-step
        if (substeps.summary?.status === 'complete') {
            DOM.substepSummary?.classList.add('complete');
            if (DOM.summaryStatus) {
                DOM.summaryStatus.textContent = substeps.summary.text || 'Done';
                DOM.summaryStatus.className = 'substep-status done';
            }
            // Restore summary content
            if (DOM.summaryPreview && substeps.summary.content) {
                DOM.summaryPreview.textContent = substeps.summary.content;
            }
        } else if (substeps.summary?.status === 'active') {
            DOM.substepSummary?.classList.add('active');
            if (DOM.summaryStatus) {
                DOM.summaryStatus.textContent = substeps.summary.text || 'Generating...';
                DOM.summaryStatus.className = 'substep-status searching';
            }
        }
    }

    // Restore content and prompt previews in the new sub-step structure
    if (savedState.content && DOM.contentPreviewText) {
        DOM.contentPreviewText.textContent = savedState.content;
    }

    if (savedState.prompt && DOM.promptPreviewText) {
        DOM.promptPreviewText.textContent = savedState.prompt;
    }
}

// Delay helper
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
