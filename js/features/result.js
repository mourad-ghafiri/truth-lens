/**
 * Result Module
 * Handles displaying fact-check results
 */

import { DOM } from './dom.js';
import * as i18n from '../i18n/i18n.js';
import { parseMarkdown } from '../utils.js';

// Detect text direction (RTL/LTR)
export function detectTextDirection(text) {
    if (!text) return 'ltr';
    const sample = text.substring(0, 200);
    const rtlPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0590-\u05FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const rtlMatches = sample.match(new RegExp(rtlPattern.source, 'g')) || [];
    const rtlRatio = rtlMatches.length / sample.replace(/\s/g, '').length;
    return rtlRatio > 0.3 ? 'rtl' : 'ltr';
}

// Get score color based on value
export function getScoreColor(score) {
    if (score >= 70) return 'var(--score-high)';
    if (score >= 40) return 'var(--score-medium)';
    return 'var(--score-low)';
}

// Get verdict info based on score
export function getVerdictInfo(score) {
    if (score >= 70) {
        return {
            title: i18n.getTranslation('verdictTitleHigh'),
            subtitle: i18n.getTranslation('verdictSubtitleHigh'),
            class: 'high'
        };
    } else if (score >= 40) {
        return {
            title: i18n.getTranslation('verdictTitleMixed'),
            subtitle: i18n.getTranslation('verdictSubtitleMixed'),
            class: 'mixed'
        };
    } else {
        return {
            title: i18n.getTranslation('verdictTitleLow'),
            subtitle: i18n.getTranslation('verdictSubtitleLow'),
            class: 'low'
        };
    }
}

// Display result in the Fact Check tab
export function displayResult(score, report, content, prompt) {
    const direction = detectTextDirection(content);

    // Update score circle
    DOM.circle.style.strokeDasharray = `${score}, 100`;
    DOM.circle.style.stroke = getScoreColor(score);
    DOM.scoreText.textContent = `${score}%`;

    // Update verdict
    const verdict = getVerdictInfo(score);
    DOM.verdictTitle.textContent = verdict.title;
    DOM.verdictSubtitle.textContent = verdict.subtitle;

    // Render report sections
    renderReportSections(report, direction);

    // Show result container
    DOM.resultContainer.classList.remove('hidden');
}

// Display result in History detail view
export function displayHistoryResult(score, report, content) {
    const direction = detectTextDirection(content);

    // Update score circle
    if (DOM.historyDetailCircle) {
        DOM.historyDetailCircle.style.strokeDasharray = `${score}, 100`;
        DOM.historyDetailCircle.style.stroke = getScoreColor(score);
    }
    if (DOM.historyDetailScore) {
        DOM.historyDetailScore.textContent = `${score}%`;
    }

    // Update verdict
    const verdict = getVerdictInfo(score);
    if (DOM.historyDetailVerdict) {
        DOM.historyDetailVerdict.textContent = verdict.title;
    }

    // Render report sections
    renderHistoryReportSections(report, direction);
}

// Render report sections in Fact Check tab
function renderReportSections(report, direction = 'ltr') {
    const textAlign = direction === 'rtl' ? 'right' : 'left';
    const dirAttr = `dir="${direction}"`;

    DOM.reportSections.dir = direction;
    DOM.reportSections.style.textAlign = textAlign;

    if (typeof report === 'object' && report.summary) {
        DOM.reportSections.innerHTML = buildReportHTML(report, direction, textAlign, dirAttr);
    } else {
        DOM.reportSections.innerHTML = `<div class="report-section" ${dirAttr}><p>${parseMarkdown(String(report))}</p></div>`;
    }
}

// Render report sections in History detail view
function renderHistoryReportSections(report, direction = 'ltr') {
    const textAlign = direction === 'rtl' ? 'right' : 'left';
    const dirAttr = `dir="${direction}"`;

    if (!DOM.historyDetailSections) return;

    DOM.historyDetailSections.dir = direction;
    DOM.historyDetailSections.style.textAlign = textAlign;

    if (typeof report === 'object' && report.summary) {
        DOM.historyDetailSections.innerHTML = buildReportHTML(report, direction, textAlign, dirAttr);
    } else {
        DOM.historyDetailSections.innerHTML = `<div class="report-section" ${dirAttr}><p>${parseMarkdown(String(report))}</p></div>`;
    }
}

// Build HTML for structured report
function buildReportHTML(report, direction, textAlign, dirAttr) {
    let html = '';

    // Summary
    if (report.summary) {
        html += `
            <div class="report-section" ${dirAttr} style="text-align: ${textAlign}">
                <div class="report-section-header">
                    <span class="report-section-icon">📋</span>
                    <span class="report-section-title">${i18n.getTranslation('reportSummary')}</span>
                </div>
                <div class="report-section-content">${parseMarkdown(report.summary)}</div>
            </div>
        `;
    }

    // Claims
    if (report.claims && report.claims.length > 0) {
        const claimsClass = direction === 'rtl' ? 'claims-list rtl-claims' : 'claims-list';
        html += `
            <div class="report-section" ${dirAttr} style="text-align: ${textAlign}">
                <div class="report-section-header">
                    <span class="report-section-icon">🔍</span>
                    <span class="report-section-title">${i18n.getTranslation('reportClaims')}</span>
                </div>
                <div class="${claimsClass}">
                    ${report.claims.map(claim => renderClaim(claim, direction)).join('')}
                </div>
            </div>
        `;
    }

    // Missing Context
    if (report.missingContext) {
        html += `
            <div class="report-section" ${dirAttr} style="text-align: ${textAlign}">
                <div class="report-section-header">
                    <span class="report-section-icon">⚠️</span>
                    <span class="report-section-title">${i18n.getTranslation('reportContext')}</span>
                </div>
                <div class="report-section-content">${parseMarkdown(report.missingContext)}</div>
            </div>
        `;
    }

    // Bias
    if (report.bias) {
        html += `
            <div class="report-section" ${dirAttr} style="text-align: ${textAlign}">
                <div class="report-section-header">
                    <span class="report-section-icon">⚖️</span>
                    <span class="report-section-title">${i18n.getTranslation('reportBias')}</span>
                </div>
                <div class="report-section-content">${parseMarkdown(report.bias)}</div>
            </div>
        `;
    }

    // Sources
    if (report.sources) {
        html += `
            <div class="report-section" ${dirAttr} style="text-align: ${textAlign}">
                <div class="report-section-header">
                    <span class="report-section-icon">📚</span>
                    <span class="report-section-title">${i18n.getTranslation('reportSources')}</span>
                </div>
                <div class="report-section-content">${parseMarkdown(report.sources)}</div>
            </div>
        `;
    }

    return html;
}

// Render single claim
function renderClaim(claim, direction) {
    const verdictKey = `verdict_${claim.verdict?.toUpperCase().replace(/\s+/g, '_')}`;
    const verdictText = i18n.getTranslation(verdictKey) || claim.verdict || 'Unknown';
    const verdictClass = getVerdictClass(claim.verdict);

    return `
        <div class="claim-item" dir="${direction}">
            <span class="claim-verdict ${verdictClass}">${verdictText}</span>
            <span class="claim-text">${parseMarkdown(claim.claim || '')}</span>
        </div>
    `;
}

// Get CSS class for verdict
function getVerdictClass(verdict) {
    if (!verdict) return '';
    const v = verdict.toUpperCase();
    if (['VERIFIED', 'TRUE', 'MOSTLY_TRUE'].includes(v)) return 'verdict-high';
    if (['MIXED', 'MISLEADING'].includes(v)) return 'verdict-mixed';
    return 'verdict-low';
}

// Show error in result container
export function showError(message) {
    DOM.resultContainer.classList.remove('hidden');
    DOM.reportSections.innerHTML = `<div class="report-section"><p style="color: var(--danger-color)">Error: ${message}</p></div>`;
    DOM.scoreText.textContent = '?';
    DOM.circle.style.stroke = 'var(--text-secondary)';
    DOM.verdictTitle.textContent = 'Error';
    DOM.verdictSubtitle.textContent = '';
}
