import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { distillAnnotationsToMemory } from '../src/memory-llm.js';
import {
  memoryDir,
  readMemoryEntry,
  readMemoryIndex,
  writeMemoryConfig,
  memoryEvents,
} from '../src/memory.js';
import { __resetExtractionsForTests } from '../src/memory-extractions.js';

const dataDir = path.join(
  process.env.OD_DATA_DIR ?? process.cwd(),
  'memory-annotations-test',
);
const originalFetch = globalThis.fetch;

// Helper: stub the OpenAI chat-completions response the distiller's provider
// path will hit (the extraction override below routes through callOpenAI).
function mockOpenAiEntries(entries: unknown[]): void {
  globalThis.fetch = vi.fn(async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ entries }) } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  ) as typeof fetch;
}

describe('annotation → memory distillation', () => {
  beforeEach(async () => {
    await fsp.rm(memoryDir(dataDir), { recursive: true, force: true });
    __resetExtractionsForTests();
    await writeMemoryConfig(dataDir, {
      // Chat auto-extraction defaults OFF product-wide; these specs cover
      // the distillation mechanics themselves, so opt in explicitly.
      chatExtractionEnabled: true,
      extraction: { provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('auto-keeps feedback + rule memory from preview comments, no manual Keep', async () => {
    mockOpenAiEntries([
      {
        type: 'rule',
        name: 'Primary buttons use brand green',
        description: 'Standing colour rule for primary actions',
        body: 'Assertion: Primary action buttons use the brand green.\nCheck: Inspect primary buttons and confirm their background is the brand green token.',
      },
      {
        type: 'feedback',
        name: 'Minimal decoration',
        description: 'Keep visuals calm',
        body: 'The user dislikes busy, over-decorated layouts and prefers at most two accent colors.',
      },
    ]);

    const events: Array<{ kind?: string; source?: string; count?: number }> = [];
    const onChange = (e: { kind?: string; source?: string; count?: number }) =>
      events.push(e);
    memoryEvents.on('change', onChange);

    let written;
    try {
      written = await distillAnnotationsToMemory(
        dataDir,
        {
          annotations: [
            {
              comment: '这个按钮太花了，主按钮应该用品牌绿',
              label: 'Hero CTA button',
              currentText: 'Get started',
              selectionKind: 'element',
            },
          ],
          userMessage: '调整一下首屏',
        },
        { projectRoot: process.cwd() },
      );
    } finally {
      memoryEvents.off('change', onChange);
    }

    expect(written).toHaveLength(2);

    // Both entries land on disk (auto-keep) — no Keep round-trip.
    const rule = await readMemoryEntry(dataDir, 'rule_primary_buttons_use_brand_green');
    const feedback = await readMemoryEntry(dataDir, 'feedback_minimal_decoration');
    expect(rule?.type).toBe('rule');
    expect(rule?.body).toContain('Assertion:');
    expect(feedback?.type).toBe('feedback');

    // Linked into MEMORY.md so they actually get injected / enforced.
    const index = await readMemoryIndex(dataDir);
    expect(index).toContain('rule_primary_buttons_use_brand_green.md');
    expect(index).toContain('feedback_minimal_decoration.md');

    // The non-blocking toast signal carries the annotation source.
    const extract = events.find((e) => e.kind === 'extract');
    expect(extract).toMatchObject({ source: 'annotation', count: 2 });

    // The model saw the distiller system prompt and the user's comment.
    const fetchMock = vi.mocked(globalThis.fetch);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit)?.body));
    expect(body.messages[0].content).toContain('memory distiller');
    expect(body.messages[1].content).toContain('主按钮应该用品牌绿');
  });

  it('skips annotations that carry no comment (no provider call)', async () => {
    mockOpenAiEntries([]);
    const written = await distillAnnotationsToMemory(
      dataDir,
      { annotations: [{ comment: '', label: 'A card', selectionKind: 'element' }] },
      { projectRoot: process.cwd() },
    );
    expect(written).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('drops non-feedback/rule candidates the model returns from a critique', async () => {
    mockOpenAiEntries([
      {
        type: 'project',
        name: 'Redesign sprint',
        description: 'transient',
        body: 'A one-off project note that should not come from a design critique.',
      },
      {
        type: 'feedback',
        name: 'Denser hierarchy',
        description: 'prefers density',
        body: 'The user prefers higher information density with a clear visual hierarchy.',
      },
    ]);

    const written = await distillAnnotationsToMemory(
      dataDir,
      {
        annotations: [
          { comment: 'too sparse, pack more in', label: 'Section', selectionKind: 'element' },
        ],
      },
      { projectRoot: process.cwd() },
    );

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ type: 'feedback', name: 'Denser hierarchy' });
    await expect(readMemoryEntry(dataDir, 'project_redesign_sprint')).resolves.toBeNull();
  });
});
