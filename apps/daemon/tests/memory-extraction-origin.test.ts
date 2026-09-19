import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractWithLLM, distillAnnotationsToMemory, __resetMemoryTurnDedupeForTests } from '../src/memory-llm.js';
import { writeMemoryConfig, memoryEvents } from '../src/memory.js';
import { listExtractions, __resetExtractionsForTests } from '../src/memory-extractions.js';

let dataDir = '';
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'od-extraction-origin-'));
  __resetExtractionsForTests();
  __resetMemoryTurnDedupeForTests();
  await writeMemoryConfig(dataDir, {
    enabled: true, chatExtractionEnabled: true,
    extraction: { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' },
  });
  globalThis.fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ entries: [{
    type: 'rule', name: 'Origin fixture headings', description: 'Consistent heading colors',
    body: 'Use cobalt blue for headings in this project.',
  }] }) } }] })) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  __resetExtractionsForTests();
  await rm(dataDir, { recursive: true, force: true });
});

describe('memory extractor origin survives async provider selection', () => {
  it.each(['llm', 'annotation'] as const)('retains the captured run owner through the real %s writer', async kind => {
    const extractionOrigin = { projectId: 'project-a', conversationId: 'conversation-a', runId: 'run-a', assistantMessageId: 'draft-a' };
    const expectedOrigin = { ...extractionOrigin };
    const options = { projectRoot: process.cwd(), conversationId: 'conversation-a', extractionOrigin };
    const changes: unknown[] = [];
    const onChange = (event: unknown) => { changes.push(event); };
    memoryEvents.on('change', onChange);
    try {
      const pending = kind === 'llm'
        ? extractWithLLM(dataDir, { userMessage: 'Prefer blue headings', assistantMessage: 'Noted.' }, options)
        : distillAnnotationsToMemory(dataDir, {
          annotations: [{ comment: 'Keep blue headings', label: 'Title' }], userMessage: 'Update headings', assistantMessage: 'Noted.',
        }, options);
      // readMemoryConfig/provider selection yields before the record is made.
      // The producing identity must already be captured, not read from this
      // mutable options object after some other turn changes the caller state.
      Object.assign(extractionOrigin, { projectId: 'project-b', conversationId: 'conversation-b', runId: 'run-b', assistantMessageId: 'draft-b' });
      const written = await pending;
      expect(written).toHaveLength(1);
      const records = listExtractions();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ phase: 'success', writtenCount: 1, kind, extractionOrigin: expectedOrigin });
      // `options.source` already means llm/annotation; adding ownership must
      // not replace that existing classification or alter persisted memory.
      expect(changes).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'extract', source: kind, count: 1 })]));
    } finally {
      memoryEvents.off('change', onChange);
    }
  });

  it('keeps an existing source-less caller source-less while still writing memory', async () => {
    const written = await extractWithLLM(dataDir,
      { userMessage: 'Prefer blue headings', assistantMessage: 'Noted.' }, { projectRoot: process.cwd() });
    expect(written).toHaveLength(1);
    expect(listExtractions()).toHaveLength(1);
    expect(listExtractions()[0]).not.toHaveProperty('extractionOrigin');
  });
});
