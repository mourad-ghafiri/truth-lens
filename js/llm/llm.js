/**
 * LLM Service Core Module
 * Handles communication with AI providers
 */

import { generateUserPrompt, getDefaultSystemPrompt } from './prompt.js';

export class LLMService {
    constructor() {
        this.providerUrl = '';
        this.modelName = '';
        this.apiKey = '';
        this.systemPrompt = '';
        this.reportLanguage = 'en';
    }

    async loadConfig() {
        try {
            // Need to match how settings.js saves it: wrapped in SETTINGS_KEY
            const SETTINGS_KEY = 'truthLensSettings';
            const data = await chrome.storage.sync.get([SETTINGS_KEY, 'providerUrl', 'modelName', 'apiKey', 'systemPrompt', 'reportLanguage']);

            // Handle both flat structure (legacy) and nested structure (new settings.js)
            const settings = data[SETTINGS_KEY] || data;

            console.log('[Truth Lens] LLM loading config. Raw data keys:', Object.keys(data));
            console.log('[Truth Lens] Resolved settings:', {
                ...settings,
                apiKey: settings.apiKey ? '***Present***' : '***MISSING***'
            });

            this.providerUrl = settings.providerUrl || 'https://openrouter.ai/api/v1';
            this.modelName = settings.modelName || 'nex-agi/deepseek-v3.1-nex-n1:free';
            this.apiKey = settings.apiKey;
            this.systemPrompt = settings.systemPrompt;
            this.reportLanguage = settings.reportLanguage || settings.language || 'en';

            if (!this.apiKey) {
                console.error('[Truth Lens] API Key is missing in LLM config');
                throw new Error("API Key is missing. Please configure it in Settings.");
            }
        } catch (e) {
            console.error('[Truth Lens] Error loading LLM config:', e);
            throw e;
        }
    }

    async analyzeText(text) {
        await this.loadConfig();

        let endpoint = this.providerUrl;
        if (!endpoint.endsWith('/chat/completions')) {
            if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
            endpoint += '/chat/completions';
        }

        const langName = this.getLanguageName(this.reportLanguage);

        // Generate prompts using the prompt module
        const userPrompt = generateUserPrompt(text, langName);
        const systemPrompt = this.systemPrompt || getDefaultSystemPrompt();

        const payload = {
            model: this.modelName,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.1
        };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error("Invalid response format from LLM provider.");
            }

            return this.parseResponse(content);

        } catch (error) {
            console.error("LLM Request Failed:", error);
            throw error;
        }
    }

    parseResponse(content) {
        try {
            let jsonStr = content;

            // Handle markdown code blocks
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            // Try to find JSON object
            const jsonStartIndex = jsonStr.indexOf('{');
            const jsonEndIndex = jsonStr.lastIndexOf('}');
            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                jsonStr = jsonStr.substring(jsonStartIndex, jsonEndIndex + 1);
            }

            const parsed = JSON.parse(jsonStr);

            return {
                score: Math.min(100, Math.max(0, parseInt(parsed.score) || 0)),
                verdict: parsed.verdict || 'UNKNOWN',
                summary: parsed.summary || '',
                claims: parsed.claims || [],
                context: parsed.context || '',
                sources: parsed.sources || '',
                bias: parsed.bias || '',
                raw: content
            };
        } catch (e) {
            console.error('Failed to parse structured response, falling back:', e);

            const scoreMatch = content.match(/SCORE:\s*(\d+)/i) || content.match(/"score":\s*(\d+)/i);
            const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 50;

            return {
                score,
                verdict: 'UNKNOWN',
                summary: content.substring(0, 500),
                claims: [],
                context: '',
                sources: '',
                bias: '',
                raw: content
            };
        }
    }

    getLanguageName(code) {
        const languages = {
            en: 'English',
            ar: 'Arabic',
            zh: 'Chinese',
            ru: 'Russian',
            fr: 'French',
            it: 'Italian',
            es: 'Spanish',
            de: 'German',
            pt: 'Portuguese',
            ja: 'Japanese'
        };
        return languages[code] || 'English';
    }
}

export const llmService = new LLMService();
