import { describe, expect, it } from 'vitest';
import { isEditorStateSidecarPath } from '../../src/components/ProjectView';

/**
 * Editor-state sidecar writes must not tear down the keep-alive iframe
 * pool. The concrete regression this guards: the scene3d kit viewer saves
 * its tweaks through the daemon, the write echoes back as a file-changed
 * project event, and the eviction reloaded the very srcdoc iframe that
 * asked for the save — camera, selection and undo history gone the moment
 * the user pressed Save.
 */
describe('isEditorStateSidecarPath', () => {
  it('matches scene3d tweaks files at any depth', () => {
    expect(isEditorStateSidecarPath('tweaks.json')).toBe(true);
    expect(isEditorStateSidecarPath('scenes/atelier/tweaks.json')).toBe(true);
    expect(isEditorStateSidecarPath('a/b/c/tweaks.json')).toBe(true);
  });

  it('matches scene3d compiler scratch — a running compile must not evict its own viewer', () => {
    expect(isEditorStateSidecarPath('scenes/atelier/.scene3d/work/job.json')).toBe(true);
    expect(isEditorStateSidecarPath('scenes/atelier/.scene3d/proof/proof-abc-000.png')).toBe(true);
    expect(isEditorStateSidecarPath('.scene3d/spec.build.py')).toBe(true);
    // The deliverables that END a compile still reload the viewer.
    expect(isEditorStateSidecarPath('scenes/atelier/out/scene.glb')).toBe(false);
    expect(isEditorStateSidecarPath('kit.html')).toBe(false);
    // A directory merely containing the token inside a segment stays live.
    expect(isEditorStateSidecarPath('my.scene3d.html')).toBe(false);
  });

  it('does not match rendered or source content', () => {
    expect(isEditorStateSidecarPath('kit.html')).toBe(false);
    expect(isEditorStateSidecarPath('scenes/atelier/scene.json')).toBe(false);
    expect(isEditorStateSidecarPath('scenes/atelier/out/scene.glb')).toBe(false);
    // A file merely NAMED like the sidecar inside another name stays live.
    expect(isEditorStateSidecarPath('my-tweaks.json.html')).toBe(false);
    expect(isEditorStateSidecarPath('nottweaks.json')).toBe(false);
  });

  it('fails closed on non-strings', () => {
    expect(isEditorStateSidecarPath(undefined)).toBe(false);
    expect(isEditorStateSidecarPath(null)).toBe(false);
    expect(isEditorStateSidecarPath(42)).toBe(false);
  });
});
