import { describe, expect, it } from 'vitest';
import { amrArtifactUpgradeHomeMockOffer } from '../../src/runtime/amr-artifact-upgrade';

describe('amrArtifactUpgradeHomeMockOffer', () => {
  it('returns null when the Home offer mock is disabled', () => {
    expect(amrArtifactUpgradeHomeMockOffer('')).toBeNull();
  });

  it('keeps the existing source-less mock fallback', () => {
    expect(amrArtifactUpgradeHomeMockOffer('?mock-amr-artifact-upgrade-home=1')).toEqual({
      sessionKey: 'local-ui-mock',
      projectId: '',
      conversationId: '',
      fileName: null,
    });
  });

  it('binds the mock to an exact project, conversation, and artifact', () => {
    expect(amrArtifactUpgradeHomeMockOffer([
      '?mock-amr-artifact-upgrade-home=1',
      'mock-amr-artifact-upgrade-project=project-1',
      'mock-amr-artifact-upgrade-conversation=conversation-1',
      'mock-amr-artifact-upgrade-file=artifacts%2Findex.html',
    ].join('&'))).toEqual({
      sessionKey: JSON.stringify(['project-1', 'conversation-1']),
      projectId: 'project-1',
      conversationId: 'conversation-1',
      fileName: 'artifacts/index.html',
    });
  });
});
