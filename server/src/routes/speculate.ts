import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth as any);

/**
 * Speculative prompt analysis — real AI inference, not regex or pattern matching.
 *
 * Called while the user types (debounced). Uses a fast, cheap model (Haiku)
 * to classify intent, suggest architecture, and identify likely dependencies.
 * The result helps the UI show a speculative plan and prewarm the sandbox.
 *
 * This is NOT mechanical. The AI genuinely reads the partial prompt and
 * reasons about what kind of app the user is describing.
 */
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const { text, projectId } = req.body;

  if (!text || text.trim().length < 10) {
    res.json({ speculation: null, reason: 'Prompt too short for meaningful analysis' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.json({ speculation: null, reason: 'AI not configured' });
    return;
  }

  try {
    // Use Claude Haiku for fast, cheap classification (< 500ms typical)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are an expert software architect analyzing a user's app description. Based on this partial prompt, provide a JSON analysis. Be concise and accurate. If the prompt is too vague, say so.

User's prompt (may be partial/incomplete):
"${text.trim()}"

Respond with ONLY valid JSON:
{
  "appType": "string — what kind of app this is (e.g. 'SaaS dashboard', 'e-commerce store', 'AI tool', 'social platform', 'portfolio site')",
  "confidence": "number 0-1 — how confident you are in the classification",
  "suggestedStack": {
    "framework": "string — React/Next.js/Vite+React/etc",
    "styling": "string — Tailwind/CSS Modules/etc",
    "database": "string or null — Supabase/Firebase/PostgreSQL/etc",
    "auth": "string or null — if auth is needed",
    "apis": ["array of external APIs/services likely needed"]
  },
  "estimatedComponents": ["array of 3-8 key components/pages the app likely needs"],
  "estimatedComplexity": "string — simple/moderate/complex/enterprise",
  "keyConsiderations": ["array of 1-3 important things the builder should think about"],
  "suggestedQuestions": ["array of 1-2 clarifying questions the user might want to answer"]
}`
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Speculation API error:', response.status, err);
      res.json({ speculation: null, reason: 'AI analysis failed' });
      return;
    }

    const data = await response.json() as any;
    const content = data.content?.[0]?.text || '';

    // Parse the JSON response from Claude
    try {
      const speculation = JSON.parse(content);
      res.json({
        speculation,
        model: 'claude-haiku-4-5-20251001',
        promptLength: text.trim().length,
      });
    } catch {
      // Claude didn't return valid JSON — return raw analysis
      res.json({
        speculation: { rawAnalysis: content, confidence: 0.3 },
        model: 'claude-haiku-4-5-20251001',
        promptLength: text.trim().length,
      });
    }
  } catch (err: any) {
    console.error('Speculation error:', err.message);
    res.json({ speculation: null, reason: err.message || 'Analysis failed' });
  }
});

export default router;
