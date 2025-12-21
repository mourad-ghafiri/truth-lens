/**
 * Settings Module
 * Handles settings form and persistence
 */

import { DOM } from './dom.js';
import * as i18n from '../i18n/i18n.js';
import { clearCache } from './storage.js';

const SETTINGS_KEY = 'truthLensSettings';

// Load settings from storage
export async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(SETTINGS_KEY);
        const settings = result[SETTINGS_KEY] || {};

        // Apply to form
        if (DOM.providerUrl && settings.providerUrl) {
            DOM.providerUrl.value = settings.providerUrl;
        }
        if (DOM.modelName && settings.modelName) {
            DOM.modelName.value = settings.modelName;
        }
        if (DOM.apiKey && settings.apiKey) {
            DOM.apiKey.value = settings.apiKey;
        }
        if (DOM.reportLanguage && settings.language) {
            DOM.reportLanguage.value = settings.language;
            i18n.setLanguage(settings.language);
            applyTranslations();
        }

        return settings;
    } catch (e) {
        console.error('[Truth Lens] Settings load error:', e);
        return {};
    }
}

// Save settings to storage
export async function saveSettings() {
    const settings = {
        providerUrl: DOM.providerUrl?.value || 'https://openrouter.ai/api/v1',
        modelName: DOM.modelName?.value || 'nex-agi/deepseek-v3.1-nex-n1:free',
        apiKey: DOM.apiKey?.value || '',
        language: DOM.reportLanguage?.value || 'en'
    };

    console.log('[Truth Lens] Saving settings...', { ...settings, apiKey: settings.apiKey ? '***' : '(empty)' });

    try {
        await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });

        // Verify save
        const verify = await chrome.storage.sync.get(SETTINGS_KEY);
        console.log('[Truth Lens] Settings verified in storage:', verify[SETTINGS_KEY] ? 'Found' : 'Missing');

        // Apply language change
        i18n.setLanguage(settings.language);
        applyTranslations();

        showStatus(i18n.getTranslation('statusSaved'));
        return true;
    } catch (e) {
        console.error('[Truth Lens] Settings save error:', e);
        showStatus('Error saving settings', true);
        return false;
    }
}

// Get current settings
export async function getSettings() {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    return result[SETTINGS_KEY] || {};
}

// Show status message
function showStatus(message, isError = false) {
    if (!DOM.settingsStatus) return;

    DOM.settingsStatus.textContent = message;
    DOM.settingsStatus.style.color = isError ? 'var(--danger-color)' : 'var(--primary-color)';

    setTimeout(() => {
        DOM.settingsStatus.textContent = '';
    }, 3000);
}

// Apply i18n translations to page
export function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        const translated = i18n.getTranslation(key);
        if (translated && translated !== key) {
            el.textContent = translated;
        }
    });
}

// Initialize settings
export function initSettings() {
    // Load settings on startup
    loadSettings();

    // Form submit handler
    DOM.settingsForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveSettings();
    });

    // Clear cache button
    DOM.clearCacheBtn?.addEventListener('click', async () => {
        await clearCache();
        showStatus('Cache cleared');
    });
}
