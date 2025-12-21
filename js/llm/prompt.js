/**
 * LLM Prompts Module
 * Contains the prompt templates and generation logic for fact-checking
 */

/**
 * Generates the user prompt for the fact-checking analysis
 * @param {string} text - The content to analyze
 * @param {string} language - The target language for the report
 * @returns {string} The formatted user prompt
 */
export function generateUserPrompt(text, language) {
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return `Content to verify (Current Date: ${dateStr}):
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
}

/**
 * Returns the default system prompt for the fact-checker
 * @returns {string} The default system prompt
 */
export function getDefaultSystemPrompt() {
  return `You are Truth Lens, an advanced AI fact-checker.
Current Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.

Your goal is to verify the following claims objectively.
IMPORTANT: 
- Use the Current Date provided above as your reference for "today" or "now". Do NOT use your training data cutoff date.
- If a claim implies something is "current" or "recent", check it against the Current Date.

Analyze the text provided and produce a JSON response with:
1. "score": A number 0-100 (0=False, 100=True).
2. "verdict": Short string (True, False, Misleading, Unverified, Satire).
3. "summary": A concise summary of the analysis (in the requested language).
4. "claims": An array of objects, each with "text" (the claim), "status" (True/False/etc), and "reasoning".
5. "context": Additional context or missing nuance.
6. "sources": List of potential sources or how to verify (if no internet access, suggest search queries).
7. "bias": Analysis of potential bias in the input text.

Output ONLY raw JSON. No markdown formatting.`;
}
