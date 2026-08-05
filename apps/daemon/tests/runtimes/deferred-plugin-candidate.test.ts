import { describe, expect, it, vi } from 'vitest';
import { deferredSkillPluginCandidateForRun } from '../../src/runtimes/deferred-plugin-candidate.js';

const candidate = {
  id: 'candidate-1',
  projectId: 'project-1',
  conversationId: 'conversation-1',
  assistantMessageId: null,
  status: 'active' as const,
  title: 'Reusable skill',
  description: 'A skill',
  confidence: 0.9,
  draftPath: null,
  sourceRefs: [],
  provenance: { summary: 'test', detectedAt: 1 },
  createdAt: 1,
  updatedAt: 1,
};

describe('deferredSkillPluginCandidateForRun', () => {
  it('selects an active unshown candidate for the same project and conversation', () => {
    const list = vi.fn(() => [
      { ...candidate, id: 'dismissed', status: 'dismissed' as const },
      { ...candidate, id: 'shown', assistantMessageId: 'message-1' },
      candidate,
    ]);

    expect(deferredSkillPluginCandidateForRun({ list }, {
      projectId: 'project-1',
      conversationId: 'conversation-1',
    })).toEqual(candidate);
    expect(list).toHaveBeenCalledWith('project-1');
  });

  it('returns null without the run context or an eligible candidate', () => {
    const list = vi.fn(() => [candidate]);
    const reader = { list };

    expect(deferredSkillPluginCandidateForRun(reader, {})).toBeNull();
    expect(deferredSkillPluginCandidateForRun(reader, { projectId: 'project-1' })).toBeNull();
    expect(deferredSkillPluginCandidateForRun(reader, {
      projectId: 'project-1',
      conversationId: 'conversation-2',
    })).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });
});
