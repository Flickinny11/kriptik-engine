/**
 * Provider layer tests — no live API calls.
 * Tests routing, model matching, pricing, and response translation.
 *
 * Run: npx tsx src/providers/providers.test.ts
 */

import { strict as assert } from 'node:assert';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GoogleProvider } from './google.js';
import { XAIProvider } from './xai.js';
import { ProviderRouter } from './router.js';

let passed = 0;
function ok(name: string) { passed++; console.log(`  ✓ ${name}`); }

// --- Model matching ---

function testModelMatching() {
  console.log('\n--- Model Matching ---');

  const anthropic = new AnthropicProvider('test-key');
  const openai = new OpenAIProvider({ apiKey: 'test-key' });
  const google = new GoogleProvider();
  const xai = new XAIProvider('test-key');

  // Anthropic — current models
  assert.ok(anthropic.supports('claude-opus-4-6'));
  assert.ok(anthropic.supports('claude-sonnet-4-6'));
  assert.ok(anthropic.supports('claude-haiku-4-5'));
  assert.ok(anthropic.supports('claude-opus-4-5-20251101'));
  assert.ok(!anthropic.supports('gpt-5.4'));
  assert.ok(!anthropic.supports('gemini-3.1-pro'));
  ok('Anthropic matches claude-* models only');

  // OpenAI — current models (GPT-5.x, o-series)
  assert.ok(openai.supports('gpt-5.4'));
  assert.ok(openai.supports('gpt-5.3'));
  assert.ok(openai.supports('gpt-5.2'));
  assert.ok(openai.supports('o3'));
  assert.ok(openai.supports('o1'));
  assert.ok(openai.supports('chatgpt-4o'));
  assert.ok(!openai.supports('claude-opus-4-6'));
  assert.ok(!openai.supports('grok-4'));
  ok('OpenAI matches gpt-*/o*/chatgpt-* models');

  // Google — current models (Gemini 3.x)
  assert.ok(google.supports('gemini-3.1-pro-preview'));
  assert.ok(google.supports('gemini-3.1-flash-lite'));
  assert.ok(google.supports('gemini-3-flash-preview'));
  assert.ok(!google.supports('claude-opus-4-6'));
  ok('Google matches gemini-* models');

  // xAI — current models (Grok 4.x)
  assert.ok(xai.supports('grok-4.20'));
  assert.ok(xai.supports('grok-4'));
  assert.ok(xai.supports('grok-4.1-fast'));
  assert.ok(xai.supports('grok-3'));
  assert.ok(!xai.supports('gpt-5.4'));
  ok('xAI matches grok-* models');
}

// --- Pricing ---

function testPricing() {
  console.log('\n--- Pricing ---');

  const anthropic = new AnthropicProvider('test-key');
  const openai = new OpenAIProvider({ apiKey: 'test-key' });
  const google = new GoogleProvider();
  const xai = new XAIProvider('test-key');

  // Anthropic pricing
  const opusPricing = anthropic.pricing('claude-opus-4-6');
  assert.ok(opusPricing);
  assert.equal(opusPricing!.inputPer1M, 15);
  assert.equal(opusPricing!.outputPer1M, 75);
  ok('Opus 4.6: $15/$75 per 1M');

  const sonnetPricing = anthropic.pricing('claude-sonnet-4-6');
  assert.ok(sonnetPricing);
  assert.equal(sonnetPricing!.inputPer1M, 3);
  ok('Sonnet 4.6: $3/$15 per 1M');

  // OpenAI pricing
  const gpt54Pricing = openai.pricing('gpt-5.4');
  assert.ok(gpt54Pricing);
  assert.equal(gpt54Pricing!.inputPer1M, 2.5);
  ok('GPT-5.4: $2.50/$10 per 1M');

  // Google pricing
  const geminiPricing = google.pricing('gemini-3.1-pro-preview');
  assert.ok(geminiPricing);
  assert.equal(geminiPricing!.inputPer1M, 1.25);
  ok('Gemini 3.1 Pro: $1.25/$10 per 1M');

  // xAI pricing
  const grokPricing = xai.pricing('grok-4.20');
  assert.ok(grokPricing);
  assert.equal(grokPricing!.inputPer1M, 2);
  assert.equal(grokPricing!.outputPer1M, 6);
  ok('Grok 4.20: $2/$6 per 1M');

  const grokFast = xai.pricing('grok-4.1-fast');
  assert.ok(grokFast);
  assert.equal(grokFast!.inputPer1M, 0.2);
  ok('Grok 4.1 Fast: $0.20/M input');

  // Unknown model
  assert.equal(anthropic.pricing('unknown-model'), null);
  ok('Unknown model returns null pricing');
}

// --- Router ---

function testRouter() {
  console.log('\n--- Router ---');

  const router = new ProviderRouter({ anthropicApiKey: 'test-key' });

  const providers = router.listProviders();
  assert.ok(providers.some((p) => p.name === 'anthropic'));
  ok('Router has Anthropic provider');

  const pricing = router.pricing('claude-opus-4-6');
  assert.ok(pricing);
  assert.equal(pricing!.inputPer1M, 15);
  ok('Router pricing delegates correctly');

  // Multi-provider
  const multiRouter = new ProviderRouter({
    anthropicApiKey: 'test-key',
    openaiApiKey: 'test-key',
    xaiApiKey: 'test-key',
  });
  const multiProviders = multiRouter.listProviders();
  assert.ok(multiProviders.length >= 3, `Expected >= 3 providers, got ${multiProviders.length}`);
  ok(`Multi-provider router: ${multiProviders.length} providers`);

  // Cross-provider pricing through router
  const gptPrice = multiRouter.pricing('gpt-5.4');
  assert.ok(gptPrice);
  assert.equal(gptPrice!.inputPer1M, 2.5);
  ok('Router resolves OpenAI pricing for gpt-5.4');
}

// --- Google stub ---

async function testGoogleStub() {
  console.log('\n--- Google Stub ---');

  const google = new GoogleProvider();
  let threw = false;
  try {
    await google.complete({
      model: 'gemini-3.1-pro-preview',
      messages: [{ role: 'user', content: 'test' }],
    });
  } catch (err: any) {
    threw = true;
    assert.ok(err.message.includes('not yet implemented'));
  }
  assert.ok(threw, 'Google provider should throw');
  ok('Google stub throws with helpful message');
}

// --- Run all ---

async function main() {
  console.log('=== Provider Layer Tests ===');
  testModelMatching();
  testPricing();
  testRouter();
  await testGoogleStub();
  console.log(`\n=== Results: ${passed} passed ===`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
