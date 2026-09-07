import { describe, expect, it } from 'vitest';
import type {
  Scene3dCompileResponse,
  Scene3dIssue,
  Scene3dManifestResponse,
} from '@open-design/contracts';
import {
  displayFrames,
  scene3dScenePathForFile,
  sortIssuesBySeverity,
} from '../src/hooks/useScene3dCompile';

function issue(code: string, severity: Scene3dIssue['severity']): Scene3dIssue {
  return { code, severity, message: code };
}

describe('sortIssuesBySeverity', () => {
  it('puts errors first, then warnings, then info', () => {
    const sorted = sortIssuesBySeverity([
      issue('S3D-W-341', 'warning'),
      issue('S3D-I-501', 'info'),
      issue('S3D-E-324', 'error'),
    ]);
    expect(sorted.map((i) => i.code)).toEqual(['S3D-E-324', 'S3D-W-341', 'S3D-I-501']);
  });

  it('keeps the linter rule order inside a severity', () => {
    const sorted = sortIssuesBySeverity([
      issue('S3D-E-321', 'error'),
      issue('S3D-E-301', 'error'),
      issue('S3D-E-381', 'error'),
    ]);
    expect(sorted.map((i) => i.code)).toEqual(['S3D-E-321', 'S3D-E-301', 'S3D-E-381']);
  });

  it('does not mutate the input', () => {
    const input = [issue('S3D-W-341', 'warning'), issue('S3D-E-324', 'error')];
    sortIssuesBySeverity(input);
    expect(input.map((i) => i.code)).toEqual(['S3D-W-341', 'S3D-E-324']);
  });

  it('tolerates an unrecognised severity by sorting it last', () => {
    const sorted = sortIssuesBySeverity([
      { code: 'S3D-X-999', severity: 'critical' as Scene3dIssue['severity'], message: 'x' },
      issue('S3D-E-324', 'error'),
    ]);
    expect(sorted.map((i) => i.code)).toEqual(['S3D-E-324', 'S3D-X-999']);
  });
});

describe('scene3dScenePathForFile', () => {
  it('claims authored scene sources', () => {
    expect(scene3dScenePathForFile('scenes/crate/build.py')).toBe('scenes/crate');
    expect(scene3dScenePathForFile('scenes/crate/stage.usda')).toBe('scenes/crate');
    expect(scene3dScenePathForFile('scenes/crate/stage.USDZ')).toBe('scenes/crate');
    expect(scene3dScenePathForFile('scenes/pavilion/scene.json')).toBe('scenes/pavilion');
  });

  it('does not claim the conventions contract, only the spec', () => {
    // scene3d.json configures the linter; it is not a scene source and must
    // not open the compile panel.
    expect(scene3dScenePathForFile('scenes/crate/scene3d.json')).toBeNull();
  });

  it('maps generated deliverables back to their scene, not to the out dir', () => {
    expect(scene3dScenePathForFile('scenes/crate/out/scene.glb')).toBe('scenes/crate');
    expect(scene3dScenePathForFile('out/scene.usda')).toBe('.');
  });

  it('still resolves scenes compiled before deliverables left .scene3d', () => {
    expect(scene3dScenePathForFile('scenes/crate/.scene3d/work/scene.glb')).toBe('scenes/crate');
  });

  it('treats a root-level scene as the project root', () => {
    expect(scene3dScenePathForFile('build.py')).toBe('.');
    expect(scene3dScenePathForFile('./build.py')).toBe('.');
  });

  it('normalises windows separators', () => {
    expect(scene3dScenePathForFile('scenes\\crate\\build.py')).toBe('scenes/crate');
  });

  it('ignores files that are not part of a 3D scene', () => {
    expect(scene3dScenePathForFile('index.html')).toBeNull();
    expect(scene3dScenePathForFile('scripts/setup.py')).toBeNull();
    expect(scene3dScenePathForFile('notes/build.pyc')).toBeNull();
    expect(scene3dScenePathForFile('deck.gltf')).toBeNull();
    // Any bare model at the project root is an asset in a mixed project,
    // not a root-scene claim — only build.py / scene.json claim the root.
    expect(scene3dScenePathForFile('stage.usda')).toBeNull();
    expect(scene3dScenePathForFile('prop.fbx')).toBeNull();
  });
});

describe('displayFrames', () => {
  const stored = {
    scenePath: '.',
    manifest: null,
    proofImages: [{ path: 'a.png', url: '/api/a.png' }],
    exportedAssets: [],
  } as unknown as Scene3dManifestResponse;

  const result = {
    proofImages: [
      { path: 'f0.png', url: '/api/f0.png' },
      { path: 'f1.png', url: '/api/f1.png' },
    ],
  } as unknown as Scene3dCompileResponse;

  it('shows the stored manifest frames before any compile', () => {
    expect(displayFrames(null, stored)).toEqual(['/api/a.png']);
  });

  it('shows only the fresh frames once a compile has run', () => {
    // Never a mix: a half-stale turntable would show a scene that no
    // longer exists alongside one that does.
    expect(displayFrames(result, stored)).toEqual(['/api/f0.png', '/api/f1.png']);
  });

  it('returns nothing when neither source has frames', () => {
    expect(displayFrames(null, null)).toEqual([]);
  });
});
