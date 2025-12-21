
export class LLMService {
    constructor() {
        this.providerUrl = '';
        this.modelName = '';
        this.apiKey = '';
        this.systemPrompt = '';
        this.reportLanguage = 'en';
    }

    async loadConfig() {
        const data = await chrome.storage.sync.get(['providerUrl', 'modelName', 'apiKey', 'systemPrompt', 'reportLanguage']);
        this.providerUrl = data.providerUrl || 'https://openrouter.ai/api/v1';
        this.modelName = data.modelName || 'nex-agi/deepseek-v3.1-nex-n1:free';
        this.apiKey = data.apiKey;
        this.systemPrompt = data.systemPrompt;
        this.reportLanguage = data.reportLanguage || 'en';

        if (!this.apiKey) {
            throw new Error("API Key is missing. Please configure it in Settings.");
        }
    }

    async analyzeText(text) {
        await this.loadConfig();

        let endpoint = this.providerUrl;
        if (!endpoint.endsWith('/chat/completions')) {
            if (endpoint.endsWith('/')) endpoint = endpoint.slice(0, -1);
            endpoint += '/chat/completions';
        }

        // Get native language name for the prompt
        // We need to import getNativeName or just pass it in. 
        // Since LLMService is a class, we can just use a map here or pass it from sidepanel.
        // But for simplicity, let's stick to the plan: "Respond in the SAME LANGUAGE as the content" is already there.
        // The user specifically asked: "adapt the prompt to use the language selected from settings to force llm to give report in the selected language."

        // We will add an explicit instruction.
        // First, let's get the native name. Since we can't easily import i18n here without circular deps or making it a module (which it is), 
        // let's just use the code or a simple map if needed. But we can import `getNativeName` from i18n.js if it's an ES module.
        // Let's rely on the fact that sidepanel.js calls this.
        // Wait, `llm_service.js` imports nothing. Let's dynamically import or just duplicate the map for safety/speed?
        // Actually, importing is fine since `i18n.js` is pure.

        // Let's add the import at the top first (in a separate chunk or this one if I can edit top).
        // I will assume I can add import at the top.

        const langName = this.getLanguageName(this.reportLanguage);

        // Advanced neutral fact-checking prompt
        const userPrompt = `You are conducting a rigorous, objective fact-check. Analyze the following content using evidence-based methodology.

IMPORTANT: You MUST provide the report (including the "verdict", "summary", and "explanation" fields) in ${langName}.

CONTENT TO ANALYZE:
"""
${text}
"""

FACT-CHECKING METHODOLOGY:
1. IDENTIFY CLAIMS: Extract only verifiable factual claims. Ignore opinions, predictions, and subjective statements.
2. VERIFY EACH CLAIM: For each claim, determine if it can be verified against known facts, official records, scientific consensus, or reliable primary sources.
3. AVOID ASSUMPTIONS: Do not make assumptions about intent, do not infer meanings not explicitly stated, and do not apply modern standards to historical events without context.
4. POLITICAL NEUTRALITY: Do not favor any political ideology, party, or viewpoint. Evaluate all claims by the same standard regardless of source.
5. DISTINGUISH: Clearly separate verified facts from analysis, and analysis from speculation.
6. UNCERTAINTY: If a claim cannot be definitively verified or debunked, mark it as UNVERIFIABLE rather than guessing.

Provide your analysis in JSON format:
{
  "score": <number 0-100>,
  "verdict": "<VERIFIED | MOSTLY_TRUE | MIXED | MISLEADING | FALSE | SATIRE | UNVERIFIABLE | OPINION>",
  "summary": "<objective 2-3 sentence summary of findings>",
  "claims": [
    {
      "claim": "<exact claim as stated in content>",
      "verdict": "<TRUE | FALSE | MISLEADING | UNVERIFIABLE | OPINION>",
      "explanation": "<factual basis for verdict, citing type of evidence if applicable>",
      "confidence": "<HIGH | MEDIUM | LOW>"
    }
  ],
  "context": "<relevant context that may affect interpretation, if any>",
  "sources": "<types of sources that could verify these claims, or known references>",
  "bias": "<only factual observations about framing or language, not speculation about motives>",
  "limitations": "<any limitations in verifying this content>"
}

SCORING CRITERIA (apply consistently):
- 90-100: All major claims verified against reliable sources
- 70-89: Most claims verified, minor inaccuracies or missing context
- 50-69: Mixed accuracy, some true and some false/misleading claims
- 30-49: Significant inaccuracies or misleading framing
- 0-29: Predominantly false, fabricated, or severely misleading


IMPORTANT:
- Respond in ${langName} (Native Name: ${langName})
- Do NOT inject personal opinions or political viewpoints
- Do NOT assume bad faith without evidence
- If content is clearly satire or parody, identify it as such
- Respond ONLY with valid JSON`;

        // Neutral, professional system prompt
        const systemPrompt = this.systemPrompt || `You are a professional fact-checker following the standards of the International Fact-Checking Network (IFCN). Your role is to:

1. Be NONPARTISAN: You do not take sides. You evaluate claims from all perspectives using the same rigorous standards.
2. Be TRANSPARENT: You explain your methodology and reasoning clearly.
3. Focus on FACTS: You verify factual claims, not opinions or predictions.
4. Acknowledge UNCERTAINTY: When evidence is insufficient, you say so rather than speculating.
5. Provide CONTEXT: You include relevant context that helps understand the claim.
6. AVOID BIAS: You do not let personal beliefs, cultural assumptions, or political preferences influence your analysis.

You are not an advocate or critic. You are an impartial analyst presenting evidence-based findings.`;

        const payload = {
            model: this.modelName,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.0
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
            // Try to extract JSON from the response
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

            // Fallback to old format
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
