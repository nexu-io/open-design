import { describe, expect, it } from 'vitest';
import type { ChatRunStatusResponse } from '@open-design/contracts';

import { buildPetTaskCenter } from '../../src/components/pet/taskCenter';
import type { Project } from '../../src/types';

const projects: Project[] = [
  { id: 'p1', name: 'Landing Page', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1 },
  { id: 'p2', name: 'Brand Deck', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1 },
  { id: 'p3', name: 'Ignored', skillId: null, designSystemId: null, createdAt: 1, updatedAt: 1 },
];

function run(
  id: string,
  projectId: string | null,
  status: ChatRunStatusResponse['status'],
  updatedAt: number,
  extra: Partial<ChatRunStatusResponse> = {},
): ChatRunStatusResponse {
  return {
    id,
    projectId,
    conversationId: null,
    assistantMessageId: null,
    agentId: null,
    status,
    createdAt: updatedAt - 10,
    updatedAt,
    ...extra,
  };
}

describe('buildPetTaskCenter', () => {
  it('groups active runs and hides recent completions for active projects', () => {
    const center = buildPetTaskCenter(projects, [
      run('r1', 'p1', 'running', 10),
      run('r2', 'p1', 'running', 12),
      run('q1', 'p2', 'queued', 11),
      run('done-old', 'p1', 'succeeded', 8),
      run('done-new', 'p2', 'failed', 20),
      run('no-project', null, 'running', 30),
      run('missing-project', 'missing', 'running', 31),
    ]);

    expect(center.running).toEqual([
      { projectId: 'p1', projectName: 'Landing Page', status: 'running', count: 2 },
    ]);
    expect(center.queued).toEqual([
      { projectId: 'p2', projectName: 'Brand Deck', status: 'queued', count: 1 },
    ]);
    expect(center.recent).toEqual([]);
  });

  it('keeps only the latest completed run per inactive project', () => {
    const center = buildPetTaskCenter(projects, [
      run('old-success', 'p1', 'succeeded', 10),
      run('new-failure', 'p1', 'failed', 20),
      run('brand-success', 'p2', 'succeeded', 15),
    ]);

    expect(center.recent).toEqual([
      { projectId: 'p1', projectName: 'Landing Page', status: 'failed', updatedAt: 20 },
      { projectId: 'p2', projectName: 'Brand Deck', status: 'succeeded', updatedAt: 15 },
    ]);
  });

  // #1247 / #1060 — a succeeded run that ended with unfinished declared work
  // must NOT read as plain "recently completed"; it files as `incomplete` so its
  // dot never renders the success color.
  it('files a succeeded-but-unfinished run as incomplete, never succeeded', () => {
    const center = buildPetTaskCenter(projects, [
      run('unfinished', 'p1', 'succeeded', 10, { endedWithUnfinishedWork: true }),
      run('finished', 'p2', 'succeeded', 12, { endedWithUnfinishedWork: false }),
    ]);

    expect(center.recent).toEqual([
      { projectId: 'p2', projectName: 'Brand Deck', status: 'succeeded', updatedAt: 12 },
      { projectId: 'p1', projectName: 'Landing Page', status: 'incomplete', updatedAt: 10 },
    ]);
  });

  it('leaves a genuinely completed run (flag absent) as succeeded', () => {
    const center = buildPetTaskCenter(projects, [
      run('finished', 'p1', 'succeeded', 10),
    ]);

    expect(center.recent).toEqual([
      { projectId: 'p1', projectName: 'Landing Page', status: 'succeeded', updatedAt: 10 },
    ]);
  });
});
