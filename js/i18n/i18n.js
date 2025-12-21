/**
 * Internationalization (i18n) Module Main Entry Point
 */

import { en } from './languages/en.js';
import { ar } from './languages/ar.js';
import { fr } from './languages/fr.js';
import { ru } from './languages/ru.js';
import { zh } from './languages/zh.js';
import { pt } from './languages/pt.js';
import { ja } from './languages/ja.js';
import { es } from './languages/es.js';
import { de } from './languages/de.js';
import { it } from './languages/it.js';

const LANGUAGES = {
    en: { name: 'English', native: 'English', rtl: false, translations: en },
    ar: { name: 'Arabic', native: 'العربية', rtl: true, translations: ar },
    zh: { name: 'Chinese', native: '简体中文', rtl: false, translations: zh },
    ru: { name: 'Russian', native: 'Русский', rtl: false, translations: ru },
    fr: { name: 'French', native: 'Français', rtl: false, translations: fr },
    it: { name: 'Italian', native: 'Italiano', rtl: false, translations: it },
    es: { name: 'Spanish', native: 'Español', rtl: false, translations: es },
    de: { name: 'German', native: 'Deutsch', rtl: false, translations: de },
    pt: { name: 'Portuguese', native: 'Português', rtl: false, translations: pt },
    ja: { name: 'Japanese', native: '日本語', rtl: false, translations: ja }
};

let currentLanguage = 'en';

export function setLanguage(langCode) {
    if (LANGUAGES[langCode]) {
        currentLanguage = langCode;
        return true;
    }
    return false;
}

export function getCurrentLanguage() {
    return currentLanguage;
}

export function isRTL(langCode = currentLanguage) {
    return LANGUAGES[langCode]?.rtl || false;
}

export function getTranslation(key) {
    const lang = LANGUAGES[currentLanguage]?.translations || LANGUAGES['en'].translations;
    return lang[key] || LANGUAGES['en'].translations[key] || key;
}

export function getNativeName(langCode) {
    return LANGUAGES[langCode]?.native || langCode;
}
