// Unit coverage for the plugin-preview manifest diff guard. Run with:
//   node --test scripts/plugin-previews-diff.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewsChanged } from './plugin-previews-diff.mjs';

test('timestamp-only delta is NOT a change (the #4261 noise case)', () => {
  const a = { generatedAt: '2026-01-01T00:00:00Z', previews: { x: { hash: 'h1' } } };
  const b = { generatedAt: '2026-02-02T00:00:00Z', previews: { x: { hash: 'h1' } } };
  assert.equal(previewsChanged(a, b), false);
});

test('a changed previews entry IS a change', () => {
  const a = { generatedAt: 't', previews: { x: { hash: 'h1' } } };
  const b = { generatedAt: 't', previews: { x: { hash: 'h2' } } };
  assert.equal(previewsChanged(a, b), true);
});

test('an added or removed entry IS a change', () => {
  assert.equal(previewsChanged({ previews: {} }, { previews: { y: { hash: 'h' } } }), true);
  assert.equal(previewsChanged({ previews: { y: { hash: 'h' } } }, { previews: {} }), true);
});

test('reordering keys within an entry is NOT a change', () => {
  const a = { previews: { x: { hash: 'h', video: 'v', poster: 'p' } } };
  const b = { previews: { x: { poster: 'p', video: 'v', hash: 'h' } } };
  assert.equal(previewsChanged(a, b), false);
});

test('a missing/empty old manifest makes any new entry a change', () => {
  assert.equal(previewsChanged({}, { previews: { y: { hash: 'h' } } }), true);
  assert.equal(previewsChanged({}, { previews: {} }), false);
});
