import test from 'node:test';
import assert from 'node:assert/strict';
import { listSupportedModels, buildSystemInstruction } from './aiService';

test('listSupportedModels returns all 4 supported models with metadata and logos', () => {
  const models = listSupportedModels();
  assert.equal(models.length, 4);

  const ids = models.map((m) => m.id);
  assert.ok(ids.includes('gemini-3.5-flash-lite'));
  assert.ok(ids.includes('deepseek-chat'));
  assert.ok(ids.includes('gpt-4o-mini'));
  assert.ok(ids.includes('claude-3-5-sonnet'));

  for (const m of models) {
    assert.ok(m.name.length > 0, 'Model name must not be empty');
    assert.ok(m.providerName.length > 0, 'Provider name must not be empty');
    assert.ok(m.logo.startsWith('/models/'), 'Logo must point to /models/ path');
    assert.ok(['active', 'quota_needed', 'unconfigured'].includes(m.status));
  }
});

test('buildSystemInstruction formats prompt guidance for specific modes and dialects', () => {
  const instruction = buildSystemInstruction('text-to-query', 'postgresql');
  assert.ok(instruction.includes('POSTGRESQL'));
  assert.ok(instruction.includes('NOVA AGENT'));
  assert.ok(instruction.includes('primaryCode'));
});
