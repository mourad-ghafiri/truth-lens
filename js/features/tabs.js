/**
 * Tabs Module
 * Handles tab switching and related UI updates
 */

import { DOM } from './dom.js';

// Switch to a specific tab
export function switchTab(tabId) {
    // Update tab buttons
    DOM.tabs.forEach(tab => {
        if (tab.dataset.tab === tabId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update tab content
    DOM.contents.forEach(content => {
        if (content.id === tabId) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
}

// Initialize tab click handlers
export function initTabs() {
    DOM.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            switchTab(tabId);
        });
    });
}

// Get current active tab
export function getCurrentTab() {
    const activeTab = document.querySelector('.tab-btn.active');
    return activeTab?.dataset.tab || 'check';
}
