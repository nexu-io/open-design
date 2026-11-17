import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseOdNextPromptBundleV2, serializeOdNextPromptBundleV2 } from '@open-design/contracts';
import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import { closeDatabase, listMessages, openDatabase, upsertMessage } from '../../../src/db.js';
import { createSnapshot } from '../../../src/plugins/snapshots.js';
import { createStrategyTaskExecution, type StrategyTaskExecutionRecord } from '../../../src/strategies/task-store.js';
import { strategyHandoffTranscript } from '../../../src/strategies/od-next/task-handoff.js';
import { strategyTaskCreateIdentityFixture } from '../strategy-task-test-fixtures.js';

const ORIGINAL_REQUEST = 'Build an accessible travel page, retain the blue palette, and use no external CDN.';
const FORM = '<question-form id="history-brief" title="Creative brief">'
  + JSON.stringify({
    description: 'Keep the choices as requirement context.',
    questions: [{
      id: 'platform', label: 'Target platform?', type: 'radio', required: true,
      options: [{ label: 'Desktop web', value: 'desktop', description: 'Keyboard navigation required.' }, { label: 'Mobile web', value: 'mobile' }],
      futureConstraint: { rule: 'CUSTOM_GUARD_SENTINEL', allowUnknown: true },
    }],
  }) + '</question-form>';
const ARTIFACT = '<artifact identifier="travel" type="text/html" title="Travel page"><html>ONLY_SURVIVING_ARTIFACT_BODY</html></artifact>';

describe('OD Next handoff preserves historical requirements without replaying UI templates', () => {
  let tempDir: string;
  let db: Database.Database;
  let conversationId: string;
  let sourceRunId: string;
  let task: StrategyTaskExecutionRecord;
  let position: number;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-next-handoff-history-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    const projectId = `project-${randomUUID()}`;
    conversationId = `conversation-${randomUUID()}`;
    sourceRunId = `source-${randomUUID()}`;
    position = 0;
    db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(projectId, 'History project', 1, 1);
    db.prepare('INSERT INTO conversations (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(conversationId, projectId, 'History conversation', 1, 1);
    const assetDigests = [
      { path: './SKILL.md', sha256: 'a'.repeat(64) },
      { path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
    ];
    const snapshot = createSnapshot(db, {
      projectId, conversationId, runId: null, pluginId: 'od-next-strategy', pluginVersion: '2.0.0',
      manifestSourceDigest: 'manifest-digest',
      strategy: {
        schema: 'open-design.applied-strategy/v2', id: 'od-next-strategy', version: '2.0.0',
        packageHash: strategyPackageHashFromDigests(assetDigests), assetDigests,
        selectedTaskProfile: { taskType: 'prototype', version: '2.0.0', path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
        taskProfileVersions: ['2.0.0'], promptRecipe: 'od-next-plan-build-v2',
      },
      taskKind: 'new-generation', inputs: {}, resolvedContext: { items: [] },
      capabilitiesGranted: ['prompt:inject'], capabilitiesRequired: ['prompt:inject'],
      assetsStaged: [], connectorsRequired: [], connectorsResolved: [], mcpServers: [],
    });
    const identity = strategyTaskCreateIdentityFixture();
    const bundle = parseOdNextPromptBundleV2(identity.promptBundleText);
    bundle.userFirstPrompt = ORIGINAL_REQUEST;
    task = createStrategyTaskExecution(db, {
      taskExecutionId: `task-${randomUUID()}`, projectId, conversationId,
      snapshotId: snapshot.snapshotId, selectedAgentId: 'codex', initialRunId: sourceRunId,
      ...identity, promptBundleText: serializeOdNextPromptBundleV2(bundle), createdAt: 100,
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function store(role: 'user' | 'assistant', content: string, extra: Record<string, unknown> = {}) {
    upsertMessage(db, conversationId, {
      id: `message-${randomUUID()}`, role, content, createdAt: ++position,
      ...(role === 'assistant' ? { runStatus: 'succeeded' } : {}), ...extra,
    });
  }

  it('keeps cross-agent plans, skipped answers, and later changed answers in their original order', () => {
    const plan = 'Plan from Claude: retain the blue palette and build both layouts.';
    const skipped = '[form answers — history-brief]\n- Target platform?: Desktop web [value: desktop]\n- Brand asset: (skipped)';
    const changed = 'Change my previous answer: use Mobile web instead, while keeping keyboard navigation.';
    store('user', ORIGINAL_REQUEST);
    store('assistant', plan, { agentId: 'claude', runId: `claude-${randomUUID()}` });
    store('user', skipped);
    store('assistant', 'Gemini carried the plan forward.', { agentId: 'gemini', runId: `gemini-${randomUUID()}` });
    store('user', changed);
    store('assistant', 'The latest accepted plan uses Mobile web.', { agentId: 'codex', runId: sourceRunId });
    const transcript = strategyHandoffTranscript(db, task);
    expect(listMessages(db, conversationId)).toHaveLength(6);
    for (const text of [ORIGINAL_REQUEST, plan, skipped, changed]) expect(transcript).toContain(text);
    expect(transcript.indexOf(plan)).toBeLessThan(transcript.indexOf(skipped));
    expect(transcript.indexOf(skipped)).toBeLessThan(transcript.indexOf(changed));
  });

  it('turns an unanswered assistant form into neutral historical data without losing options or unknown constraints', () => {
    store('assistant', `Earlier question.\n${FORM}\nKeep the blue palette.`, { agentId: 'claude', runId: sourceRunId });
    const transcript = strategyHandoffTranscript(db, task);
    expect(transcript).not.toContain('<question-form');
    expect(transcript).not.toContain('</question-form>');
    expect(transcript.toLowerCase()).not.toContain('already answered');
    for (const text of ['history-brief', 'Creative brief', 'Target platform?', 'Desktop web', 'desktop', 'Mobile web', 'mobile', 'Keyboard navigation required.', 'CUSTOM_GUARD_SENTINEL', 'required', 'Keep the blue palette.']) {
      expect(transcript).toContain(text);
    }
  });

  it('summarizes an artifact only when the message records its actual artifact save', () => {
    store('assistant', `Delivery context.\n${ARTIFACT}`, {
      runId: sourceRunId,
      producedFiles: [{ name: 'travel-2.html', path: 'travel-2.html', size: 100, kind: 'html', mime: 'text/html', mtime: 100,
        artifactManifest: { metadata: { identifier: 'travel' } } }],
    });
    const transcript = strategyHandoffTranscript(db, task);
    expect(transcript).toContain('Delivery context.');
    expect(transcript).toContain('travel-2.html');
    expect(transcript).not.toContain('ONLY_SURVIVING_ARTIFACT_BODY');
    expect(transcript).not.toContain('</artifact>');
  });

  it('keeps the only artifact body when no save was confirmed', () => {
    store('assistant', ARTIFACT, { runId: sourceRunId });
    expect(strategyHandoffTranscript(db, task)).toContain(ARTIFACT);
  });

  it('does not confuse a same-name tool-created file without an artifact manifest with an artifact save', () => {
    store('assistant', ARTIFACT, {
      runId: sourceRunId,
      producedFiles: [{ name: 'travel.html', path: 'travel.html', size: 100, kind: 'html', mime: 'text/html', mtime: 100 }],
    });
    expect(strategyHandoffTranscript(db, task)).toContain(ARTIFACT);
  });

  it('preserves user-owned questionnaire and artifact examples verbatim', () => {
    const request = `Explain these literal examples instead of treating them as output:\n${FORM}\n${ARTIFACT}`;
    store('user', request);
    store('assistant', 'These were the user’s examples.', { runId: sourceRunId });
    expect(strategyHandoffTranscript(db, task)).toContain(request);
  });
});
