/**
 * LLM Service Core Module
 * Handles communication with AI providers
 */

import { generateUserPrompt, getDefaultSystemPrompt } from './prompt.js';
import { webSearchToolDefinition, executeWebSearchTool } from '../tools/web.js';

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

    /**
     * Analyze text with streaming response
     * @param {string} text - The content to analyze
     * @param {function} onChunk - Callback for each streamed chunk
     * @returns {Promise<object>} The parsed result
     */
    async analyzeTextStream(text, onChunk) {
        await this.loadConfig();

        let endpoint = this.providerUrl;
        if (!endpoint.endsWith('/chat/completions')) {
            if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
            endpoint += '/chat/completions';
        }

        const langName = this.getLanguageName(this.reportLanguage);
        const userPrompt = generateUserPrompt(text, langName);
        const systemPrompt = this.systemPrompt || getDefaultSystemPrompt();

        const payload = {
            model: this.modelName,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.1,
            stream: true,
            tools: [webSearchToolDefinition],
            tool_choice: 'auto'
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

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';
            let toolCalls = [];
            let currentToolCall = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta;

                            // Handle regular content
                            if (delta?.content) {
                                fullContent += delta.content;
                                if (onChunk) onChunk(delta.content, fullContent, 'thinking', null);
                            }

                            // Handle tool calls
                            if (delta?.tool_calls) {
                                for (const tc of delta.tool_calls) {
                                    if (tc.index !== undefined) {
                                        if (!toolCalls[tc.index]) {
                                            toolCalls[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                                        }
                                        if (tc.id) toolCalls[tc.index].id = tc.id;
                                        if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                                        if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
                                    }
                                }
                            }
                        } catch (e) {
                            // Ignore parse errors for incomplete JSON
                        }
                    }
                }
            }

            // If there are tool calls, execute them and continue
            if (toolCalls.length > 0 && toolCalls.some(tc => tc.function.name)) {
                console.log('[Truth Lens] Tool calls detected:', toolCalls.map(tc => tc.function.name));

                const toolResults = [];
                for (const toolCall of toolCalls) {
                    if (toolCall.function.name === 'web_search') {
                        try {
                            const args = JSON.parse(toolCall.function.arguments);
                            // Emit search_start event
                            if (onChunk) onChunk('', fullContent, 'search_start', { query: args.query });

                            const result = await executeWebSearchTool(args);

                            // Parse results for UI display (extract from formatted string)
                            const resultsMatch = result.match(/### \d+\. (.+?)\n\*\*URL:\*\* (.+?)\n/g) || [];
                            const parsedResults = resultsMatch.map(r => {
                                const titleMatch = r.match(/### \d+\. (.+?)\n/);
                                const urlMatch = r.match(/\*\*URL:\*\* (.+?)\n/);
                                return { title: titleMatch?.[1] || '', url: urlMatch?.[1] || '' };
                            });

                            // Emit search_complete event
                            if (onChunk) onChunk('', fullContent, 'search_complete', { results: parsedResults });

                            toolResults.push({
                                tool_call_id: toolCall.id,
                                role: 'tool',
                                content: result
                            });
                        } catch (e) {
                            console.error('[Truth Lens] Tool execution error:', e);
                            if (onChunk) onChunk('', fullContent, 'search_complete', { error: e.message, results: [] });
                            toolResults.push({
                                tool_call_id: toolCall.id,
                                role: 'tool',
                                content: JSON.stringify({ error: e.message })
                            });
                        }
                    }
                }

                // Continue conversation with tool results
                if (toolResults.length > 0) {
                    try {
                        return await this.continueWithToolResults(text, toolCalls, toolResults, onChunk);
                    } catch (contError) {
                        console.error('[Truth Lens] Error continuing with tool results:', contError);
                        // Return fallback based on what we have so far
                        return {
                            score: 50,
                            verdict: 'ANALYSIS_ERROR',
                            summary: 'Analysis encountered an API error during web search processing. Partial results may be available.',
                            claims: [],
                            context: 'Web search was performed but follow-up analysis failed.',
                            sources: '',
                            bias: '',
                            raw: fullContent
                        };
                    }
                }
            }

            return this.parseResponse(fullContent);

        } catch (error) {
            console.error("LLM Stream Request Failed:", error);
            throw error;
        }
    }

    /**
     * Continue conversation after tool execution
     * @param {string} originalText - Original text being analyzed
     * @param {Array} toolCalls - Tool calls from the assistant
     * @param {Array} toolResults - Results from tool execution
     * @param {Function} onChunk - Callback for streaming updates
     * @param {number} depth - Recursion depth
     * @param {Array} existingMessages - Accumulated message history for recursion
     */
    async continueWithToolResults(originalText, toolCalls, toolResults, onChunk, depth = 0, existingMessages = null) {
        const MAX_TOOL_DEPTH = 100;
        if (depth >= MAX_TOOL_DEPTH) {
            console.warn('[Truth Lens] Max tool call depth reached, returning fallback response');
            return {
                score: 50,
                verdict: 'UNVERIFIABLE',
                summary: 'Analysis could not be completed - too many search iterations required.',
                claims: [],
                context: '',
                sources: '',
                bias: '',
                raw: ''
            };
        }

        let endpoint = this.providerUrl;
        if (!endpoint.endsWith('/chat/completions')) {
            if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
            endpoint += '/chat/completions';
        }

        // Build messages - either from existing or fresh
        let messages;
        if (existingMessages) {
            // Append new tool call and results to existing messages
            messages = [
                ...existingMessages,
                { role: "assistant", content: null, tool_calls: toolCalls },
                ...toolResults
            ];
        } else {
            // First continuation - build from scratch
            const langName = this.getLanguageName(this.reportLanguage);
            const userPrompt = generateUserPrompt(originalText, langName);
            const systemPrompt = this.systemPrompt || getDefaultSystemPrompt();
            messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
                { role: "assistant", content: null, tool_calls: toolCalls },
                ...toolResults
            ];
        }

        // Include tools to allow model to request more searches if needed
        const payload = {
            model: this.modelName,
            messages,
            tools: [webSearchToolDefinition],
            tool_choice: 'auto',
            temperature: 0.1,
            stream: true
        };

        console.log('[Truth Lens] continueWithToolResults depth:', depth);

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

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let emittedResponseStart = false;
        let newToolCalls = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta;

                        // Handle regular content
                        if (delta?.content) {
                            if (!emittedResponseStart) {
                                if (onChunk) onChunk('', '', 'response_start', null);
                                emittedResponseStart = true;
                            }
                            fullContent += delta.content;
                            if (onChunk) onChunk(delta.content, fullContent, 'thinking', null);
                        }

                        // Handle tool calls in continuation
                        if (delta?.tool_calls) {
                            for (const tc of delta.tool_calls) {
                                if (tc.index !== undefined) {
                                    if (!newToolCalls[tc.index]) {
                                        newToolCalls[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                                    }
                                    if (tc.id) newToolCalls[tc.index].id = tc.id;
                                    if (tc.function?.name) newToolCalls[tc.index].function.name = tc.function.name;
                                    if (tc.function?.arguments) newToolCalls[tc.index].function.arguments += tc.function.arguments;
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        }

        // Check if model requested more tool calls
        if (newToolCalls.length > 0 && newToolCalls.some(tc => tc.function.name)) {
            console.log('[Truth Lens] Continuation has more tool calls:', newToolCalls.map(tc => tc.function.name));

            const newToolResults = [];
            for (const toolCall of newToolCalls) {
                if (toolCall.function.name === 'web_search') {
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        if (onChunk) onChunk('', fullContent, 'search_start', { query: args.query });

                        const result = await executeWebSearchTool(args);

                        const resultsMatch = result.match(/### \d+\. (.+?)\n\*\*URL:\*\* (.+?)\n/g) || [];
                        const parsedResults = resultsMatch.map(r => {
                            const titleMatch = r.match(/### \d+\. (.+?)\n/);
                            const urlMatch = r.match(/\*\*URL:\*\* (.+?)\n/);
                            return { title: titleMatch?.[1] || '', url: urlMatch?.[1] || '' };
                        });

                        if (onChunk) onChunk('', fullContent, 'search_complete', { results: parsedResults });

                        newToolResults.push({
                            tool_call_id: toolCall.id,
                            role: 'tool',
                            content: result
                        });
                    } catch (e) {
                        console.error('[Truth Lens] Tool execution error:', e);
                        newToolResults.push({
                            tool_call_id: toolCall.id,
                            role: 'tool',
                            content: JSON.stringify({ error: e.message })
                        });
                    }
                }
            }

            if (newToolResults.length > 0) {
                // Recursively continue with new tool results, passing accumulated messages
                return await this.continueWithToolResults(originalText, newToolCalls, newToolResults, onChunk, depth + 1, messages);
            }
        }

        return this.parseResponse(fullContent);
    }

    parseResponse(content) {
        console.log('[Truth Lens] parseResponse called with content length:', content?.length || 0);
        console.log('[Truth Lens] Content preview (first 500 chars):', content?.substring(0, 500));

        try {
            let jsonStr = content;

            // Handle markdown code blocks
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                console.log('[Truth Lens] Found markdown code block, extracting JSON');
                jsonStr = jsonMatch[1].trim();
            }

            // Remove any XML-like tool_call tags that some models produce
            const beforeClean = jsonStr.length;
            jsonStr = jsonStr.replace(/<\/?tool_call[^>]*>/g, '');
            if (jsonStr.length !== beforeClean) {
                console.log('[Truth Lens] Removed tool_call tags');
            }

            // Try to find JSON object
            const jsonStartIndex = jsonStr.indexOf('{');
            const jsonEndIndex = jsonStr.lastIndexOf('}');
            console.log('[Truth Lens] JSON brackets found: start=', jsonStartIndex, 'end=', jsonEndIndex);

            if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
                jsonStr = jsonStr.substring(jsonStartIndex, jsonEndIndex + 1);
                console.log('[Truth Lens] Extracted JSON length:', jsonStr.length);
            } else {
                console.error('[Truth Lens] No JSON found in response. Full content:\n', content);
                throw new Error('No JSON object found in response');
            }

            const parsed = JSON.parse(jsonStr);
            console.log('[Truth Lens] Successfully parsed JSON. Score:', parsed.score, 'Verdict:', parsed.verdict);

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
            console.error('[Truth Lens] Parse error:', e.message);
            console.error('[Truth Lens] Failed content (full):\n', content);

            const scoreMatch = content.match(/SCORE:\s*(\d+)/i) || content.match(/"score":\s*(\d+)/i);
            const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 50;
            console.log('[Truth Lens] Fallback score extraction:', score);

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

    /**
     * Generate an educational summary of the content
     * @param {string} content - The original content being fact-checked
     * @param {Array} searchResults - Search results gathered during analysis
     * @returns {string} Educational summary
     */
    async generateSummary(content, searchResults = []) {
        await this.loadConfig();

        const langName = this.getLanguageName(this.reportLanguage);

        // Build context from search results
        const searchContext = searchResults.length > 0
            ? `\n\nRelevant sources found:\n${searchResults.map(r => `- ${r.title}: ${r.url}`).join('\n')}`
            : '';

        const summaryPrompt = `You are an educational content summarizer. Your goal is to help users learn and remember the key facts from content they're consuming.

Given the following content${searchContext}, provide a visually engaging educational summary using this format:

📌 **Key Takeaways**
- List the 3-5 most important points with bullet points

💡 **Key Concepts Explained**
- Explain any complex concepts in simple terms

📝 **Facts to Remember**
- List specific facts, numbers, or quotes worth remembering

🔍 **Context & Background**
- Provide relevant context if helpful

IMPORTANT FORMATTING RULES:
- Respond in ${langName}
- Use emojis at the start of each section header
- Use **bold** for important terms
- Keep it concise and scannable
- Use bullet points for easy reading
- Make it memorable and educational

Content to summarize:
---
${content.substring(0, 3000)}
---

Provide the educational summary:`;

        try {
            const response = await fetch(`${this.providerUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.modelName,
                    messages: [
                        { role: 'user', content: summaryPrompt }
                    ],
                    temperature: 0.7,
                    max_tokens: 1000
                })
            });

            if (!response.ok) {
                console.warn('[Truth Lens] Summary API error:', response.status);
                return null;
            }

            const data = await response.json();
            const summary = data.choices?.[0]?.message?.content?.trim();

            console.log('[Truth Lens] Educational summary generated');
            return summary || null;
        } catch (error) {
            console.warn('[Truth Lens] Summary generation error:', error);
            return null;
        }
    }
}

export const llmService = new LLMService();
