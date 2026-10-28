import { describe, expect, it } from 'vitest';
import { liveArtifactDeliveries, withLiveArtifactDeliveries } from '../../src/runtime/live-artifact-delivery';
import type { AgentEvent } from '../../src/types';

const created: AgentEvent = { kind: 'live_artifact', action: 'created', projectId: 'p', artifactId: 'la-board', title: '任务看板' };
describe('registered live delivery replaces its raw template in presentation', () => {
  it('opens the registered preview, retaining independent deliverables', () => {
    expect(withLiveArtifactDeliveries({ open: ['template.html', 'slides.html'], focused: 'template.html' }, [created]))
      .toEqual({ open: ['slides.html', 'live:la-board'], focused: 'live:la-board' });
  });
  it('supports a registration without a filesystem candidate and removes deleted deliveries', () => {
    expect(withLiveArtifactDeliveries({ open: [], focused: null }, [created]).focused).toBe('live:la-board');
    expect(liveArtifactDeliveries([created, { ...created, action: 'deleted' }])).toEqual([]);
  });
  it('does not treat an ordinary HTML template or a refresh failure as registered delivery', () => {
    const selection = { open: ['template.html'], focused: 'template.html' };
    expect(withLiveArtifactDeliveries(selection, [])).toEqual(selection);
    expect(liveArtifactDeliveries([{ kind: 'live_artifact_refresh', projectId: 'p', artifactId: 'la-x', phase: 'failed' }])).toEqual([]);
  });
});
