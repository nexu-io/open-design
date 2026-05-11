// @ts-nocheck
// Tests for `apps/daemon/src/finalize-design.ts` — fills in across phases
// D-I. Phase D adds the truncation helper tests; phases E-I extend.
//
// Per memory `project_open_design_493_merged.md`: this file uses
// `import fs from 'node:fs'` (default import) so `vi.spyOn(fs, '<fn>')`
// can redefine properties on the underlying CJS exports object. ESM
// namespace import (`import * as fs from 'node:fs'`) gives a frozen
// Module Namespace Object that `vi.spyOn` cannot mutate.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  closeDatabase,
  insertConversation,
  insertProject,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import { isSafeId, writeProjectFile } from '../src/projects.js';
import {
  appendVersionedApiPath,
  buildSynthesisPrompt,
  callAnthropicWithRetry,
  extractDesignMd,
  finalizeDesignPackage,
  FinalizePackageLockedError,
  FinalizeUpstreamError,
  resolveCurrentArtifact,
  truncateTranscriptForPrompt,
} from '../src/finalize-design.js';

void appendVersionedApiPath;

// Touch the imports so the unused-import linter stays quiet on the scaffold.
void finalizeDesignPackage;
void FinalizePackageLockedError;
void FinalizeUpstreamError;

const PROJECT_ID = 'project-1';
let tempDir: string | null = null;
let projectsRoot: string | null = null;

afterEach(() => {
  closeDatabase();
  vi.restoreAllMocks();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  projectsRoot = null;
});

function setupResolverFixture(): { db: any; projectsRoot: string } {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-finalize-'));
  const db = openDatabase(tempDir);
  insertProject(db, {
    id: PROJECT_ID,
    name: 'Project',
    createdAt: 1,
    updatedAt: 1,
  });
  projectsRoot = path.join(tempDir, 'projects');
  fs.mkdirSync(path.join(projectsRoot, PROJECT_ID), { recursive: true });
  return { db, projectsRoot };
}

function setActiveTab(db: any, name: string) {
  db.prepare(
    `INSERT INTO tabs (project_id, name, position, is_active) VALUES (?, ?, ?, 1)`,
  ).run(PROJECT_ID, name, 0);
}

const HEADER = JSON.stringify({
  kind: 'header',
  schemaVersion: 2,
  projectId: 'proj-1',
  exportedAt: '2026-05-07T14:00:00.000Z',
  conversationCount: 1,
  messageCount: 100,
});

function buildSyntheticJsonl(messageCount: number, perMessageBytes: number): string {
  // Each message line is roughly `perMessageBytes` long after stringify.
  const lines = [HEADER, JSON.stringify({ kind: 'conversation', id: 'c1', title: 't', createdAt: 1, updatedAt: 1 })];
  const padBytes = Math.max(0, perMessageBytes - 80);
  const filler = 'x'.repeat(padBytes);
  for (let i = 0; i < messageCount; i += 1) {
    lines.push(JSON.stringify({
      kind: 'message',
      id: `m${i}`,
      role: 'user',
      position: i,
      blocks: [{ type: 'text', text: `msg-${i}-${filler}` }],
    }));
  }
  return lines.join('\n') + '\n';
}

describe('truncateTranscriptForPrompt', () => {
  it('returns the input verbatim when the JSONL fits under the 384 KiB cap', () => {
    // 50 messages at ~100 bytes each = ~5 KB total; well under the cap.
    const jsonl = buildSyntheticJsonl(50, 100);
    expect(Buffer.byteLength(jsonl, 'utf8')).toBeLessThan(384 * 1024);

    const out = truncateTranscriptForPrompt(jsonl);

    expect(out).toBe(jsonl);
    expect(out).not.toContain('"kind":"truncated"');
    // Every message line round-trips.
    for (let i = 0; i < 50; i += 1) {
      expect(out).toContain(`"id":"m${i}"`);
    }
  });

  it('head+tail truncates with a single marker line when the JSONL exceeds the 384 KiB cap', () => {
    // 800 messages at ~1 KB each = ~800 KB total; comfortably above the cap.
    const jsonl = buildSyntheticJsonl(800, 1024);
    expect(Buffer.byteLength(jsonl, 'utf8')).toBeGreaterThan(384 * 1024);

    const out = truncateTranscriptForPrompt(jsonl);

    // Output is bounded by the cap (allow a small tolerance for the
    // marker + reservation slack).
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(384 * 1024);

    // Header line survives.
    expect(out.split('\n')[0]).toBe(HEADER);

    // Exactly one truncation marker present, with a non-zero omittedBytes.
    const markerMatches = out.match(/\{"kind":"truncated","reason":"size","omittedBytes":\d+\}/g);
    expect(markerMatches).not.toBeNull();
    expect(markerMatches).toHaveLength(1);
    const omittedBytes = Number(markerMatches![0].match(/"omittedBytes":(\d+)/)![1]);
    expect(omittedBytes).toBeGreaterThan(0);

    // Both ends preserved: first message after header survives; last
    // message before the trailing newline survives.
    expect(out).toContain('"id":"m0"');
    expect(out).toContain('"id":"m799"');

    // Middle messages (e.g. m400) should NOT all survive — at least one
    // must be omitted; otherwise we wouldn't have needed the marker.
    const surviving = (out.match(/"id":"m\d+"/g) || []).map((s) => Number(s.match(/m(\d+)/)![1]));
    expect(surviving.length).toBeLessThan(800);
    expect(surviving).toContain(0);
    expect(surviving).toContain(799);
  });
});

describe('resolveCurrentArtifact', () => {
  it('returns the active-tab artifact when its sidecar is present, even if a newer artifact exists elsewhere', async () => {
    const { db, projectsRoot } = setupResolverFixture();

    // Older artifact - active tab points here.
    await writeProjectFile(projectsRoot, PROJECT_ID, 'pinned.html', '<p>pinned body</p>', {
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Pinned',
        entry: 'pinned.html',
        renderer: 'html',
        exports: ['html'],
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    });
    // Newer artifact - NOT in the active tab.
    await writeProjectFile(projectsRoot, PROJECT_ID, 'newer.html', '<p>newer body</p>', {
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Newer',
        entry: 'newer.html',
        renderer: 'html',
        exports: ['html'],
        updatedAt: '2026-05-07T00:00:00.000Z',
      },
    });
    setActiveTab(db, 'pinned.html');

    const out = await resolveCurrentArtifact(db, projectsRoot, PROJECT_ID);
    expect(out).not.toBeNull();
    expect(out!.name).toBe('pinned.html');
    expect(out!.body).toBe('<p>pinned body</p>');
  });

  it('falls through to newest .artifact.json when active tab points at a non-artifact file', async () => {
    const { db, projectsRoot } = setupResolverFixture();

    // README.md - no artifact sidecar - active tab points here.
    await writeProjectFile(projectsRoot, PROJECT_ID, 'README.md', '# notes\n');
    // The actual artifact - NOT in active tab.
    await writeProjectFile(projectsRoot, PROJECT_ID, 'design.html', '<p>design</p>', {
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Design',
        entry: 'design.html',
        renderer: 'html',
        exports: ['html'],
        updatedAt: '2026-05-07T00:00:00.000Z',
      },
    });
    setActiveTab(db, 'README.md');

    const out = await resolveCurrentArtifact(db, projectsRoot, PROJECT_ID);
    expect(out).not.toBeNull();
    expect(out!.name).toBe('design.html');
    expect(out!.body).toBe('<p>design</p>');
  });

  it('returns null when no active tab and no .artifact.json sidecars exist', async () => {
    const { db, projectsRoot } = setupResolverFixture();

    // README.md only - no artifact sidecars anywhere.
    await writeProjectFile(projectsRoot, PROJECT_ID, 'README.md', '# notes\n');

    const out = await resolveCurrentArtifact(db, projectsRoot, PROJECT_ID);
    expect(out).toBeNull();
  });

  // PR #832 P3 fix from @lefarcen: a malformed tabs row (e.g. an
  // attacker with DB write access setting tabs.name = `../../../etc/passwd`)
  // would otherwise cause path.join to compose a probe URL outside the
  // project dir before readProjectFile's path-safety check kicked in.
  // Post-fix: the resolver runs the tab name through validateProjectPath
  // first; an invalid name falls through to the newest-artifact branch.
  it('falls through (does not throw) when active tab name contains traversal segments', async () => {
    const { db, projectsRoot } = setupResolverFixture();

    // A real artifact exists.
    await writeProjectFile(projectsRoot, PROJECT_ID, 'design.html', '<p>real</p>', {
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Design',
        entry: 'design.html',
        renderer: 'html',
        exports: ['html'],
        updatedAt: '2026-05-07T00:00:00.000Z',
      },
    });
    // Inject a malformed tabs row directly via SQL — bypasses the
    // production tab-creation code path which would normally validate.
    db.prepare(
      `INSERT INTO tabs (project_id, name, position, is_active) VALUES (?, ?, 0, 1)`,
    ).run(PROJECT_ID, '../../../etc/passwd');

    const out = await resolveCurrentArtifact(db, projectsRoot, PROJECT_ID);
    // The resolver must NOT throw and must NOT return the malformed name.
    // It falls through to the newest-artifact branch and returns the
    // real artifact instead.
    expect(out).not.toBeNull();
    expect(out!.name).toBe('design.html');
  });
});

describe('buildSynthesisPrompt', () => {
  const FIXED_NOW = new Date('2026-05-07T14:00:00.000Z');
  const TRANSCRIPT_FIXTURE =
    JSON.stringify({ kind: 'header', schemaVersion: 2, projectId: 'p1', messageCount: 2 }) +
    '\n' +
    JSON.stringify({ kind: 'message', id: 'm1', role: 'user', blocks: [{ type: 'text', text: 'hi' }] }) +
    '\n' +
    JSON.stringify({ kind: 'message', id: 'm2', role: 'assistant', blocks: [{ type: 'text', text: 'hello' }] }) +
    '\n';

  it('includes the transcript JSONL verbatim and the generation context', () => {
    const out = buildSynthesisPrompt({
      projectId: 'p1',
      transcriptJsonl: TRANSCRIPT_FIXTURE,
      transcriptMessageCount: 2,
      designSystemId: 'shadcn',
      designSystemBody: '# shadcn\nminimal\n',
      artifact: { name: 'design.html', body: '<p>artifact</p>', manifest: null },
      now: FIXED_NOW,
    });

    expect(out.systemPrompt).toContain('# DESIGN.md');
    expect(out.systemPrompt).toContain('## Provenance');

    expect(out.userPrompt).toContain('## Transcript (JSONL)');
    expect(out.userPrompt).toContain(TRANSCRIPT_FIXTURE);
    expect(out.userPrompt).toContain('## Active design system: shadcn');
    expect(out.userPrompt).toContain('# shadcn\nminimal\n');
    expect(out.userPrompt).toContain('## Current artifact: design.html');
    expect(out.userPrompt).toContain('<p>artifact</p>');
    expect(out.userPrompt).toContain('Generated at: 2026-05-07T14:00:00.000Z');
    expect(out.userPrompt).toContain('Project ID: p1');
    expect(out.userPrompt).toContain('Transcript message count: 2');
    expect(out.userPrompt).toContain('Synthesize DESIGN.md per the system instructions.');
  });

  it('falls back to "none" + parenthetical when no design system is selected', () => {
    const out = buildSynthesisPrompt({
      projectId: 'p1',
      transcriptJsonl: TRANSCRIPT_FIXTURE,
      transcriptMessageCount: 2,
      designSystemId: null,
      designSystemBody: null,
      artifact: { name: 'design.html', body: '<p>artifact</p>', manifest: null },
      now: FIXED_NOW,
    });

    expect(out.userPrompt).toContain('## Active design system: none');
    expect(out.userPrompt).toContain('(no design system selected for this project)');
  });

  it('falls back to "none" + parenthetical when no artifact is in scope', () => {
    const out = buildSynthesisPrompt({
      projectId: 'p1',
      transcriptJsonl: TRANSCRIPT_FIXTURE,
      transcriptMessageCount: 2,
      designSystemId: 'shadcn',
      designSystemBody: '# shadcn\n',
      artifact: null,
      now: FIXED_NOW,
    });

    expect(out.userPrompt).toContain('## Current artifact: none');
    expect(out.userPrompt).toContain('(no artifact in scope for this finalize)');
  });
});

describe('callAnthropicWithRetry', () => {
  const baseParams = {
    apiKey: 'sk-test-key',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-4-7',
    maxTokens: 16000,
    systemPrompt: 'sys',
    userPrompt: 'usr',
    _sleepMs: async () => {},
  };

  function jsonResponse(status: number, body: any): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
  function textResponse(status: number, body: string): Response {
    return new Response(body, { status });
  }

  it('throws FinalizeUpstreamError(401) on auth failure (no retry on 4xx non-429)', async () => {
    const fetchImpl = vi.fn(async () => textResponse(401, '{"error":{"type":"authentication_error","message":"invalid x-api-key"}}'));
    await expect(callAnthropicWithRetry({ ...baseParams, fetchImpl })).rejects.toMatchObject({
      name: 'FinalizeUpstreamError',
      status: 401,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries once on 429 and resolves when the second response succeeds', async () => {
    const ok = jsonResponse(200, { content: [{ type: 'text', text: 'DESIGN.md body' }], usage: { input_tokens: 1, output_tokens: 1 } });
    const fetchImpl = vi
      .fn<any, any>()
      .mockResolvedValueOnce(textResponse(429, '{"error":"rate limited"}'))
      .mockResolvedValueOnce(ok);

    const response = await callAnthropicWithRetry({ ...baseParams, fetchImpl });
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws FinalizeUpstreamError(503) when both attempts return 5xx', async () => {
    const fetchImpl = vi
      .fn<any, any>()
      .mockResolvedValueOnce(textResponse(503, 'service unavailable'))
      .mockResolvedValueOnce(textResponse(503, 'service unavailable'));

    await expect(callAnthropicWithRetry({ ...baseParams, fetchImpl })).rejects.toMatchObject({
      name: 'FinalizeUpstreamError',
      status: 503,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('propagates AbortError from fetch when the signal is aborted', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      // Mirror native fetch's behavior: throw AbortError when init.signal is aborted.
      if (init?.signal?.aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
      throw new Error('fetch should never be called with non-aborted signal in this test');
    });
    controller.abort();

    await expect(
      callAnthropicWithRetry({ ...baseParams, fetchImpl, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('extractDesignMd', () => {
  it('concatenates text blocks in order', () => {
    const payload = {
      content: [
        { type: 'text', text: '# DESIGN.md\n## Summary\n' },
        { type: 'text', text: 'body continues here.\n' },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    expect(extractDesignMd(payload)).toBe('# DESIGN.md\n## Summary\nbody continues here.\n');
  });

  it('throws FinalizeUpstreamError(502) when the response shape has no content array', () => {
    expect(() => extractDesignMd({ unexpected: true })).toThrow(FinalizeUpstreamError);
    try {
      extractDesignMd({ unexpected: true });
    } catch (err: any) {
      expect(err.status).toBe(502);
    }
  });

  it('throws FinalizeUpstreamError(502) when content array has zero text blocks', () => {
    expect(() => extractDesignMd({ content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }] })).toThrow(FinalizeUpstreamError);
  });
});

describe('finalizeDesignPackage (pipeline integration)', () => {
  function setupPipeline(
    opts: { designSystemId?: string | null; designSystemBody?: string | null } = {},
  ): { db: any; projectsRoot: string; designSystemsRoot: string } {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-finalize-pipe-'));
    const designSystemsRoot = path.join(tempDir, 'design-systems');
    fs.mkdirSync(designSystemsRoot, { recursive: true });
    if (opts.designSystemId && opts.designSystemBody !== null) {
      fs.mkdirSync(path.join(designSystemsRoot, opts.designSystemId), { recursive: true });
      fs.writeFileSync(
        path.join(designSystemsRoot, opts.designSystemId, 'DESIGN.md'),
        opts.designSystemBody ?? '# default DESIGN.md\n',
      );
    }

    const db = openDatabase(tempDir);
    insertProject(db, {
      id: PROJECT_ID,
      name: 'Project',
      designSystemId: opts.designSystemId === undefined ? 'shadcn' : opts.designSystemId,
      createdAt: 1,
      updatedAt: 1,
    });
    projectsRoot = path.join(tempDir, 'projects');
    fs.mkdirSync(path.join(projectsRoot, PROJECT_ID), { recursive: true });

    insertConversation(db, {
      id: 'c1',
      projectId: PROJECT_ID,
      title: 'Greeting',
      createdAt: 100,
      updatedAt: 100,
    });
    upsertMessage(db, 'c1', {
      id: 'm1',
      role: 'user',
      content: '',
      events: [{ kind: 'text', text: 'design me a landing page' }],
    });
    upsertMessage(db, 'c1', {
      id: 'm2',
      role: 'assistant',
      content: '',
      events: [{ kind: 'text', text: 'here is the html' }],
    });

    return { db, projectsRoot, designSystemsRoot };
  }

  function happyFetch(designMd: string): typeof globalThis.fetch {
    return vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: designMd }],
          usage: { input_tokens: 1234, output_tokens: 567 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as any;
  }

  it('writes DESIGN.md atomically on the happy path', async () => {
    const { db, projectsRoot, designSystemsRoot } = setupPipeline({
      designSystemId: 'shadcn',
      designSystemBody: '# shadcn\n## tone\nminimal, opinionated.\n',
    });

    const fetchImpl = happyFetch('# DESIGN.md\n## Summary\nA landing page.\n');
    const result = await finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-7',
      fetchImpl,
    } as any);

    expect(result.designMdPath).toBe(path.join(projectsRoot, PROJECT_ID, 'DESIGN.md'));
    expect(fs.existsSync(result.designMdPath)).toBe(true);
    expect(fs.readFileSync(result.designMdPath, 'utf8')).toBe(
      '# DESIGN.md\n## Summary\nA landing page.\n',
    );
    // No leftover .tmp files.
    const dirEntries = fs.readdirSync(path.join(projectsRoot, PROJECT_ID));
    expect(dirEntries.filter((n) => n.startsWith('DESIGN.md.tmp.'))).toEqual([]);
    // Lock is released.
    expect(dirEntries).not.toContain('.finalize.lock');
  });

  it('response carries every documented field with correct types', async () => {
    const { db, projectsRoot, designSystemsRoot } = setupPipeline({
      designSystemId: 'shadcn',
      designSystemBody: '# shadcn\n',
    });
    const fetchImpl = happyFetch('# DESIGN.md\nbody\n');
    const result = await finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-7',
      fetchImpl,
    } as any);

    expect(typeof result.designMdPath).toBe('string');
    expect(typeof result.bytesWritten).toBe('number');
    expect(result.bytesWritten).toBeGreaterThan(0);
    expect(result.model).toBe('claude-opus-4-7');
    expect(result.inputTokens).toBe(1234);
    expect(result.outputTokens).toBe(567);
    expect(result.artifact).toBeNull(); // no artifact seeded
    expect(result.transcriptMessageCount).toBe(2);
    expect(result.designSystemId).toBe('shadcn');
  });

  it('emits design system "none" in the prompt when no design_system_id is set', async () => {
    const { db, projectsRoot, designSystemsRoot } = setupPipeline({
      designSystemId: null,
    });
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      // Capture the body for assertion.
      const body = JSON.parse(init.body as string);
      expect(body.system).toContain('# DESIGN.md');
      expect(body.messages[0].content).toContain('## Active design system: none');
      expect(body.messages[0].content).toContain(
        '(no design system selected for this project)',
      );
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '# DESIGN.md\nbody\n' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const result = await finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-7',
      fetchImpl: fetchImpl as any,
    } as any);
    expect(result.designSystemId).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws FinalizePackageLockedError when .finalize.lock is already held', async () => {
    const { db, projectsRoot, designSystemsRoot } = setupPipeline();
    const lockPath = path.join(projectsRoot, PROJECT_ID, '.finalize.lock');
    fs.writeFileSync(lockPath, '');
    const fetchImpl = happyFetch('# DESIGN.md\nbody\n');

    await expect(
      finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
        apiKey: 'sk-test',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-opus-4-7',
        fetchImpl,
      } as any),
    ).rejects.toBeInstanceOf(FinalizePackageLockedError);

    // DESIGN.md must NOT have been written; the pre-existing lock prevented it.
    expect(fs.existsSync(path.join(projectsRoot, PROJECT_ID, 'DESIGN.md'))).toBe(false);

    // The pre-existing lock must remain — we did not own it, so we must not unlink.
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it('replaces an existing DESIGN.md atomically on a second finalize', async () => {
    const { db, projectsRoot, designSystemsRoot } = setupPipeline();
    const finalPath = path.join(projectsRoot, PROJECT_ID, 'DESIGN.md');

    await finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-7',
      fetchImpl: happyFetch('# DESIGN.md\nfirst run\n'),
    } as any);
    expect(fs.readFileSync(finalPath, 'utf8')).toBe('# DESIGN.md\nfirst run\n');

    // Inject a sentinel between finalize calls.
    fs.writeFileSync(finalPath, 'sentinel\n');
    expect(fs.readFileSync(finalPath, 'utf8')).toBe('sentinel\n');

    await finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-7',
      fetchImpl: happyFetch('# DESIGN.md\nsecond run\n'),
    } as any);
    expect(fs.readFileSync(finalPath, 'utf8')).toBe('# DESIGN.md\nsecond run\n');
  });

  it('cleans up tmp file AND lock file on every error path', async () => {
    const { db, projectsRoot, designSystemsRoot } = setupPipeline();

    // Force a crash mid-write: spy on writeFileSync and throw on the
    // DESIGN.md.tmp.* path. Other writeFileSync usages (e.g. transcript-
    // export within this same call) must continue to work.
    const realWrite = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((p: any, ...rest: any[]) => {
      if (typeof p === 'string' && p.includes('DESIGN.md.tmp.')) {
        throw new Error('disk full');
      }
      return (realWrite as any)(p, ...rest);
    });

    await expect(
      finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
        apiKey: 'sk-test',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-opus-4-7',
        fetchImpl: happyFetch('# DESIGN.md\nbody\n'),
      } as any),
    ).rejects.toThrow(/disk full/);

    const dirEntries = fs.readdirSync(path.join(projectsRoot, PROJECT_ID));
    expect(dirEntries.filter((n) => n.startsWith('DESIGN.md.tmp.'))).toEqual([]);
    expect(dirEntries).not.toContain('DESIGN.md');
    expect(dirEntries).not.toContain('.finalize.lock');
  });

  it('uses the default https://api.anthropic.com baseUrl when baseUrl is omitted', async () => {
    const { db, projectsRoot, designSystemsRoot } = setupPipeline();
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url.startsWith('https://api.anthropic.com/v1/messages')).toBe(true);
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '# DESIGN.md\n' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    await finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
      apiKey: 'sk-test',
      // baseUrl deliberately omitted
      model: 'claude-opus-4-7',
      fetchImpl: fetchImpl as any,
    } as any);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // PR #832 P1 fix from @lefarcen: imported-folder projects (created via
  // /api/import/folder) carry metadata.baseDir which redirects file IO to
  // the user's actual folder. Pre-fix, the pipeline called projectDir()
  // unconditionally so DESIGN.md landed in the hidden .od/projects/<id>
  // dir instead of metadata.baseDir; the resolver also missed the user's
  // real artifacts. Post-fix, both call sites use resolveProjectDir.
  it('writes DESIGN.md under metadata.baseDir for imported-folder projects', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-finalize-imported-'));
    const designSystemsRoot = path.join(tempDir, 'design-systems');
    fs.mkdirSync(designSystemsRoot, { recursive: true });
    fs.mkdirSync(path.join(designSystemsRoot, 'shadcn'), { recursive: true });
    fs.writeFileSync(path.join(designSystemsRoot, 'shadcn', 'DESIGN.md'), '# shadcn\n');

    // The user's actual folder lives outside .od/projects/.
    const userFolder = path.join(tempDir, 'user-imported-folder');
    fs.mkdirSync(userFolder, { recursive: true });

    const db = openDatabase(tempDir);
    insertProject(db, {
      id: PROJECT_ID,
      name: 'Imported',
      designSystemId: 'shadcn',
      metadata: { baseDir: userFolder },
      createdAt: 1,
      updatedAt: 1,
    });
    projectsRoot = path.join(tempDir, 'projects');
    fs.mkdirSync(path.join(projectsRoot, PROJECT_ID), { recursive: true });

    insertConversation(db, {
      id: 'c1',
      projectId: PROJECT_ID,
      title: 't',
      createdAt: 100,
      updatedAt: 100,
    });
    upsertMessage(db, 'c1', {
      id: 'm1',
      role: 'user',
      content: '',
      events: [{ kind: 'text', text: 'hi' }],
    });

    const result = await finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-7',
      fetchImpl: happyFetch('# DESIGN.md\nimported folder body\n'),
    } as any);

    // DESIGN.md must land in the user's actual folder, NOT the hidden
    // `.od/projects/<id>` dir.
    expect(result.designMdPath).toBe(path.join(userFolder, 'DESIGN.md'));
    expect(fs.existsSync(result.designMdPath)).toBe(true);
    expect(fs.readFileSync(result.designMdPath, 'utf8')).toBe(
      '# DESIGN.md\nimported folder body\n',
    );
    // The hidden daemon data dir should NOT have a DESIGN.md.
    expect(fs.existsSync(path.join(projectsRoot, PROJECT_ID, 'DESIGN.md'))).toBe(false);
  });

  // PR #832 P1 fix from @lefarcen: network failures (DNS, ECONNREFUSED,
  // fetch TypeError) used to fall through the route's catch-all and surface
  // as 500 INTERNAL. Post-fix they are rewrapped as
  // FinalizeUpstreamError(502, ...) inside the function so the route maps
  // to 502 UPSTREAM_UNAVAILABLE with redacted details.
  it('rewraps fetch network rejection as FinalizeUpstreamError(502)', async () => {
    const { db, projectsRoot, designSystemsRoot } = setupPipeline();

    const networkError = new TypeError('fetch failed');
    (networkError as any).cause = { code: 'ENOTFOUND' };
    const fetchImpl = vi.fn(async () => {
      throw networkError;
    });

    await expect(
      finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
        apiKey: 'sk-test',
        baseUrl: 'https://nonexistent.invalid',
        model: 'claude-opus-4-7',
        fetchImpl: fetchImpl as any,
      } as any),
    ).rejects.toMatchObject({
      name: 'FinalizeUpstreamError',
      status: 502,
    });
  });

  it('rewraps 200 with non-JSON body as FinalizeUpstreamError(502)', async () => {
    const { db, projectsRoot, designSystemsRoot } = setupPipeline();

    // 200 OK with text/html body — response.json() will throw SyntaxError.
    const fetchImpl = vi.fn(async () =>
      new Response('<html>upstream proxy error</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    await expect(
      finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
        apiKey: 'sk-test',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-opus-4-7',
        fetchImpl: fetchImpl as any,
      } as any),
    ).rejects.toMatchObject({
      name: 'FinalizeUpstreamError',
      status: 502,
    });
  });

  // PR #974 round 7 (lefarcen P1): the helper used to disable its own
  // timeout when the caller passed a request-abort signal. These two tests
  // pin the AbortSignal.any combination so neither cancel path replaces the
  // other. The `timeoutMs` option exists solely so these tests can exercise
  // the abort path without a 120 s real-time wait or fake-timer chains.
  it('aborts after the helper timeout fires even when caller signal never aborts', async () => {
    const { db, projectsRoot, designSystemsRoot } = setupPipeline({
      designSystemId: 'shadcn',
      designSystemBody: '# shadcn\n',
    });

    let capturedSignal: AbortSignal | undefined;
    const hangingFetch = vi.fn((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as unknown as typeof globalThis.fetch;

    const callerController = new AbortController();
    await expect(
      finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
        apiKey: 'sk-test',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-opus-4-7',
        fetchImpl: hangingFetch as any,
        signal: callerController.signal,
        timeoutMs: 50,
      } as any),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(callerController.signal.aborted).toBe(false);
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('aborts immediately when caller signal aborts before fetch settles', async () => {
    const { db, projectsRoot, designSystemsRoot } = setupPipeline({
      designSystemId: 'shadcn',
      designSystemBody: '# shadcn\n',
    });

    const callerController = new AbortController();
    callerController.abort();

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
      throw new Error('fetch should not see a non-aborted signal when caller aborted pre-flight');
    }) as unknown as typeof globalThis.fetch;

    await expect(
      finalizeDesignPackage(db, projectsRoot, designSystemsRoot, PROJECT_ID, {
        apiKey: 'sk-test',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-opus-4-7',
        fetchImpl: fetchImpl as any,
        signal: callerController.signal,
      } as any),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

// HTTP-layer tests for the route handler's validation. Boot the daemon
// once via startServer({ port: 0, returnServer: true }) and send real
// HTTP POSTs. These tests exercise the validation branches the function-
// level tests above cannot reach (validateExternalApiBaseUrl is a
// closure inside startServer, not exported).
describe('POST /api/projects/:id/finalize/anthropic — HTTP-layer validation', () => {
  let server: http.Server;
  let serverBaseUrl: string;

  beforeAll(async () => {
    const { startServer } = await import('../src/server.js');
    const started = (await startServer({ port: 0, returnServer: true })) as unknown as {
      url: string;
      server: http.Server;
    };
    serverBaseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function postJson(id: string, body: unknown): Promise<Response> {
    return fetch(`${serverBaseUrl}/api/projects/${id}/finalize/anthropic`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('400 BAD_REQUEST when baseUrl is not a valid URL (test #13)', async () => {
    const res = await postJson('p1', {
      apiKey: 'sk-test',
      baseUrl: 'not-a-url',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('403 FORBIDDEN when baseUrl points at a private internal IP (test #14)', async () => {
    // validateBaseUrl explicitly allows loopback (for local OpenAI-compatible
    // servers) but blocks private internal IPs (10/8, 172.16/12, 192.168/16,
    // fc00::/7, fe80::/10) — see apps/daemon/src/connectionTest.ts:158-185.
    const res = await postJson('p1', {
      apiKey: 'sk-test',
      baseUrl: 'http://10.0.0.1',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('400 BAD_REQUEST when apiKey is missing (test #15)', async () => {
    const res = await postJson('p1', {
      // apiKey deliberately omitted
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message.toLowerCase()).toContain('apikey');
  });

  it('400 BAD_REQUEST when :id contains characters outside the safe-id regex (test #16)', async () => {
    // isSafeId allows only [A-Za-z0-9._-]{1,128}. An id like `bad!id`
    // contains `!` and must be rejected before any DB or filesystem work.
    const res = await postJson('bad!id', {
      apiKey: 'sk-test',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-7',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message.toLowerCase()).toContain('project id');
  });

});

// Path-traversal regression coverage flagged by @lefarcen on PR #832.
//
// The threat: pre-fix `isSafeId` regex `/^[A-Za-z0-9._-]{1,128}$/` allowed
// pure-dot ids (`.`, `..`, `...`) because `.` is in the character class.
// `projectDir` and `resolveProjectDir` both delegated to `isSafeId` so they
// inherited the hole; an id of `..` would resolve to the PARENT of
// `.od/projects/` via `path.join`. The HTTP layer happens to reject this
// today because Express normalizes `%2e%2e` to `..` and collapses the
// path before the route handler sees it (yielding 404), but a direct CLI
// or scripted caller would still reach the function and trigger the
// traversal — and a stored project row whose id is `..` would also slip
// past `isSafeId` checks downstream of the handler.
//
// Unit-test isSafeId directly so the hole stays closed regardless of
// which call site is exercised.
describe('isSafeId — path-traversal regression', () => {
  it('rejects a single dot', () => {
    expect(isSafeId('.')).toBe(false);
  });
  it('rejects a double dot (parent-traversal)', () => {
    expect(isSafeId('..')).toBe(false);
  });
  it('rejects three or more dots', () => {
    expect(isSafeId('...')).toBe(false);
    expect(isSafeId('....')).toBe(false);
  });
  it('rejects characters outside [A-Za-z0-9._-]', () => {
    expect(isSafeId('bad!id')).toBe(false);
    expect(isSafeId('a/b')).toBe(false);
    expect(isSafeId('a\\b')).toBe(false);
    expect(isSafeId(' leading-space')).toBe(false);
  });
  it('rejects empty string and >128 chars', () => {
    expect(isSafeId('')).toBe(false);
    expect(isSafeId('a'.repeat(129))).toBe(false);
  });
  it('rejects non-string inputs', () => {
    expect(isSafeId(null as any)).toBe(false);
    expect(isSafeId(undefined as any)).toBe(false);
    expect(isSafeId(42 as any)).toBe(false);
  });
  it('accepts valid ids including dots in the middle', () => {
    expect(isSafeId('project-1')).toBe(true);
    expect(isSafeId('my-project.v2')).toBe(true);
    expect(isSafeId('818cf7a8-8399-4220-a507-07802d8842a8')).toBe(true);
    expect(isSafeId('a')).toBe(true);
    expect(isSafeId('a.b.c')).toBe(true); // mixed-content with dots is fine
  });
});
