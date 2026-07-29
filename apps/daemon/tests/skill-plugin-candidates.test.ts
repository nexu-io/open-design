import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  closeDatabase,
  insertConversation,
  insertProject,
  listMessages,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import {
  detectSkillPluginCandidate,
  dismissSkillPluginCandidate,
  generateSkillPluginDraft,
  insertSkillPluginCandidate,
  listSkillPluginCandidates,
} from '../src/plugins/skill-candidates.js';
import { upsertSkillPluginCandidateAssistantMessage } from '../src/server.js';

let tmpDir: string;
let projectRoot: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-skill-plugin-candidates-'));
  projectRoot = path.join(tmpDir, 'project');
  await mkdir(projectRoot, { recursive: true });
});

afterEach(async () => {
  closeDatabase();
  await rm(tmpDir, { recursive: true, force: true });
});

describe('skill plugin candidates', () => {
  it('detects an explicit SKILL.md and generates a valid draft', async () => {
    await writeFile(
      path.join(projectRoot, 'SKILL.md'),
      [
        '# Research brief skill',
        '',
        'Use this skill when a reusable research workflow should collect sources, compare claims, and produce a concise brief.',
        '',
        '## Workflow',
        '',
        '- Read the supplied source material.',
        '- Extract durable steps.',
        '- Return a structured brief.',
        '',
      ].join('\n'),
      'utf8',
    );

    const db = openDatabase(tmpDir, { dataDir: path.join(tmpDir, 'data') });
    insertProject(db, {
      id: 'proj_1',
      name: 'Candidate project',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
      createdAt: 1,
      updatedAt: 1,
    });

    const detected = await detectSkillPluginCandidate({
      projectId: 'proj_1',
      runId: 'run_1',
      conversationId: 'conv_1',
      message: 'Please use @SKILL.md for this run.',
      projectRoot,
      now: 10,
    });
    expect(detected?.title).toBe('Research brief skill');

    const candidate = insertSkillPluginCandidate(db, detected!);
    expect(candidate?.sourceRefs[0]?.value).toBe('SKILL.md');
    expect(listSkillPluginCandidates(db, 'proj_1')).toHaveLength(1);

    const result = await generateSkillPluginDraft(db, projectRoot, 'proj_1', candidate!.id, 20);
    expect(result?.ok).toBe(true);
    expect(result?.draftPath).toMatch(/^plugin-source\/research-brief-skill-/);
    const manifest = JSON.parse(await readFile(path.join(result!.folder, 'open-design.json'), 'utf8'));
    expect(manifest.od.kind).toBe('skill');
    await expect(readFile(path.join(result!.folder, 'references', 'provenance.json'), 'utf8'))
      .resolves.toContain(candidate!.id);
  });

  it('does not detect generic prompt heading blocks', async () => {
    const detected = await detectSkillPluginCandidate({
      projectId: 'proj_1',
      message: [
        '## Instructions',
        'Follow these steps.',
        '## Workflow',
        'Make a page.',
        '## Constraints',
        'Keep it simple.',
      ].join('\n'),
      projectRoot,
    });
    expect(detected).toBeNull();
  });

  it('only detects GitHub URLs that point at explicit skill artifacts', async () => {
    await expect(detectSkillPluginCandidate({
      projectId: 'proj_1',
      message: 'Look at https://github.com/foo/bar for context.',
      projectRoot,
    })).resolves.toBeNull();

    await expect(detectSkillPluginCandidate({
      projectId: 'proj_1',
      message: 'The implementation is discussed at https://github.com/foo/bar/pull/123.',
      projectRoot,
    })).resolves.toBeNull();

    const detected = await detectSkillPluginCandidate({
      projectId: 'proj_1',
      message: 'Use https://github.com/foo/bar/blob/main/SKILL.md for this run.',
      projectRoot,
    });
    expect(detected?.sourceRefs[0]?.value).toBe('https://github.com/foo/bar/blob/main/SKILL.md');
  });

  it('dismisses only the matching project candidate', async () => {
    const db = openDatabase(tmpDir, { dataDir: path.join(tmpDir, 'data') });
    for (const id of ['proj_1', 'proj_2']) {
      insertProject(db, {
        id,
        name: id,
        skillId: null,
        designSystemId: null,
        pendingPrompt: null,
        metadata: { kind: 'prototype' },
        createdAt: 1,
        updatedAt: 1,
      });
    }
    const base = {
      runId: null,
      conversationId: null,
      assistantMessageId: null,
      title: 'Reusable Skill',
      description: 'A reusable skill.',
      confidence: 0.9,
      sourceRefs: [{ kind: 'url' as const, value: 'https://github.com/acme/skill' }],
      provenance: { summary: 'test', detectedAt: 1 },
      draftPath: null,
    };
    const a = insertSkillPluginCandidate(db, { ...base, projectId: 'proj_1', fingerprint: 'a' })!;
    insertSkillPluginCandidate(db, { ...base, projectId: 'proj_2', fingerprint: 'b' });

    dismissSkillPluginCandidate(db, 'proj_1', a.id, 30);

    expect(listSkillPluginCandidates(db, 'proj_1')).toHaveLength(0);
    expect(listSkillPluginCandidates(db, 'proj_2')).toHaveLength(1);
    expect(listSkillPluginCandidates(db, 'proj_1', true)[0]?.status).toBe('dismissed');
  });

  it('does not dismiss or expose a candidate from another project', () => {
    const db = openDatabase(tmpDir, { dataDir: path.join(tmpDir, 'data') });
    for (const id of ['proj_1', 'proj_2']) {
      insertProject(db, {
        id,
        name: id,
        skillId: null,
        designSystemId: null,
        pendingPrompt: null,
        metadata: { kind: 'prototype' },
        createdAt: 1,
        updatedAt: 1,
      });
    }
    insertConversation(db, {
      id: 'conv_1',
      projectId: 'proj_1',
      title: 'Candidate conversation',
      createdAt: 1,
      updatedAt: 1,
    });
    upsertMessage(db, 'conv_1', {
      id: 'assistant_card_1',
      role: 'assistant',
      content: 'plugin candidate',
      createdAt: 1,
      endedAt: 1,
    });
    const candidate = insertSkillPluginCandidate(db, {
      projectId: 'proj_1',
      runId: null,
      conversationId: 'conv_1',
      assistantMessageId: 'assistant_card_1',
      title: 'Reusable Skill',
      description: 'A reusable skill.',
      confidence: 0.9,
      sourceRefs: [{ kind: 'file', value: 'SKILL.md' }],
      provenance: { summary: 'test', detectedAt: 1 },
      fingerprint: 'fingerprint_1',
      draftPath: null,
    })!;

    const dismissed = dismissSkillPluginCandidate(db, 'proj_2', candidate.id, 30);

    expect(dismissed).toBeNull();
    expect(listSkillPluginCandidates(db, 'proj_1')).toHaveLength(1);
    expect(listSkillPluginCandidates(db, 'proj_1', true)[0]?.status).toBe('active');
    expect(listMessages(db, 'conv_1').map((message) => message.id)).toContain('assistant_card_1');
  });

  it('reuses and reanchors an existing candidate assistant message', () => {
    const db = openDatabase(tmpDir, { dataDir: path.join(tmpDir, 'data') });
    insertProject(db, {
      id: 'proj_1',
      name: 'Candidate project',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
      createdAt: 1,
      updatedAt: 1,
    });
    insertConversation(db, {
      id: 'conv_1',
      projectId: 'proj_1',
      title: 'Candidate conversation',
      createdAt: 1,
      updatedAt: 1,
    });
    upsertMessage(db, 'conv_1', {
      id: 'assistant_1',
      role: 'assistant',
      content: 'first run',
      createdAt: 1,
      endedAt: 1,
    });

    const candidate = insertSkillPluginCandidate(db, {
      projectId: 'proj_1',
      runId: 'run_1',
      conversationId: 'conv_1',
      assistantMessageId: null,
      title: 'Reusable Skill',
      description: 'A reusable skill.',
      confidence: 0.9,
      sourceRefs: [{ kind: 'file', value: 'SKILL.md' }],
      provenance: { summary: 'test', detectedAt: 1 },
      fingerprint: 'fingerprint_1',
      draftPath: null,
    })!;

    const firstCardId = upsertSkillPluginCandidateAssistantMessage(db, {
      id: 'run_1',
      conversationId: 'conv_1',
      assistantMessageId: 'assistant_1',
      agentId: 'agent_1',
    }, candidate);
    upsertMessage(db, 'conv_1', {
      id: 'assistant_2',
      role: 'assistant',
      content: 'second run',
      createdAt: 2,
      endedAt: 2,
    });

    const reloadedCandidate = listSkillPluginCandidates(db, 'proj_1')[0]!;
    const secondCardId = upsertSkillPluginCandidateAssistantMessage(db, {
      id: 'run_2',
      conversationId: 'conv_1',
      assistantMessageId: 'assistant_2',
      agentId: 'agent_1',
    }, reloadedCandidate);

    expect(secondCardId).toBe(firstCardId);
    expect(listMessages(db, 'conv_1').filter((message) =>
      message.events?.some((event: { kind?: string }) => event.kind === 'plugin_candidate'),
    )).toHaveLength(1);
    expect(listSkillPluginCandidates(db, 'proj_1')[0]?.assistantMessageId).toBe(firstCardId);
  });
});
