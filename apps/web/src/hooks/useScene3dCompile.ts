// Client half of the scene3d compile surface.
//
// The daemon owns the whole pipeline behind ONE call, so this hook is
// deliberately thin: it POSTs the compile, holds the last report, and
// hydrates from the stored manifest on open so a panel that has never
// compiled in this session still shows the scene's last known state
// instead of an empty box.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Scene3dCompileRequest,
  Scene3dCompileResponse,
  Scene3dIssue,
  Scene3dManifestResponse,
  Scene3dProofOptions,
} from '@open-design/contracts';

export interface Scene3dCompileState {
  /** The last compile report, or null before the first compile. */
  result: Scene3dCompileResponse | null;
  /** Hydrated from `.scene3d/manifest.json` before any compile runs. */
  stored: Scene3dManifestResponse | null;
  compiling: boolean;
  loading: boolean;
  error: Error | null;
  compile: (options?: Scene3dCompileOptions) => Promise<void>;
}

export interface Scene3dCompileOptions {
  proof?: Scene3dProofOptions;
  noCache?: boolean;
  stages?: Scene3dCompileRequest['stages'];
}

/** Errors first, then warnings, then info — the order you fix them in. */
export const SEVERITY_ORDER = ['error', 'warning', 'info'] as const;

export function sortIssuesBySeverity(issues: readonly Scene3dIssue[]): Scene3dIssue[] {
  const rank = (issue: Scene3dIssue) => {
    const index = SEVERITY_ORDER.indexOf(issue.severity as (typeof SEVERITY_ORDER)[number]);
    return index === -1 ? SEVERITY_ORDER.length : index;
  };
  // Stable within a severity so the linter's own rule order survives.
  return [...issues].sort((a, b) => rank(a) - rank(b));
}

/**
 * Proof frames to display: the fresh compile's frames when there is one,
 * otherwise whatever the stored manifest recorded. Mixing the two would
 * show a turntable that half-belongs to a scene that no longer exists.
 */
export function displayFrames(
  result: Scene3dCompileResponse | null,
  stored: Scene3dManifestResponse | null,
): string[] {
  if (result) return result.proofImages.map((image) => image.url);
  return (stored?.proofImages ?? []).map((image) => image.url);
}

/** Scene source and deliverable extensions the panel claims in the viewer. */
const SCENE3D_FILE = /\.(usda|usdc|usdz|glb|gltf|obj|fbx)$/i;

/** Generated directories that sit under a scene rather than beside it. */
const GENERATED_DIRS = new Set(['out', '.scene3d']);

/**
 * The scene directory a project file belongs to, or null when the file is
 * not part of a 3D scene.
 *
 * Both the authored sources and the compiler's own deliverables map back to
 * the same scene, so opening `scenes/crate/out/scene.glb` shows the compile
 * report for `scenes/crate` rather than treating the generated directory as
 * a scene of its own. `.scene3d` is still recognised so scenes compiled
 * before deliverables moved out of the dot-directory keep resolving.
 */
export function scene3dScenePathForFile(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = normalized.split('/').filter(Boolean);
  const name = segments[segments.length - 1] ?? '';
  // 'scene.json' is the declarative spec entry point; 'scene3d.json' is the
  // conventions contract and deliberately does NOT open the panel.
  if (name !== 'build.py' && name !== 'scene.json' && !SCENE3D_FILE.test(name)) return null;

  let dirSegments = segments.slice(0, -1);
  const generated = dirSegments.findIndex((segment) => GENERATED_DIRS.has(segment));
  if (generated !== -1) {
    dirSegments = dirSegments.slice(0, generated);
  } else if (dirSegments.length === 0 && name !== 'build.py' && name !== 'scene.json') {
    // A bare model file at the project ROOT is an asset in a mixed project
    // (a deck's glb, an imported reference), not a claim that the whole
    // project is a 3D scene. Only the authored entry points claim the root;
    // deliverables under out/ still map back because the generated dir is
    // itself the evidence a root scene exists.
    return null;
  }
  return dirSegments.length === 0 ? '.' : dirSegments.join('/');
}

export function useScene3dCompile(
  projectId: string,
  scenePath = '.',
): Scene3dCompileState {
  const [result, setResult] = useState<Scene3dCompileResponse | null>(null);
  const [stored, setStored] = useState<Scene3dManifestResponse | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // A compile can outlive the panel; the guard keeps a late response from
  // writing into an unmounted tree.
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    (async () => {
      try {
        const query = `?scenePath=${encodeURIComponent(scenePath)}`;
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/scene3d/manifest${query}`,
          { signal: controller.signal },
        );
        if (!resp.ok) throw new Error(`scene3d manifest → HTTP ${resp.status}`);
        const body = (await resp.json()) as Scene3dManifestResponse;
        if (controller.signal.aborted) return;
        setStored(body);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [projectId, scenePath]);

  const compile = useCallback(
    async (options: Scene3dCompileOptions = {}) => {
      setCompiling(true);
      setError(null);
      try {
        const body: Scene3dCompileRequest = { scenePath, ...options };
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/scene3d/compile`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        if (!resp.ok) {
          const detail = (await resp.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(detail?.error?.message ?? `scene3d compile → HTTP ${resp.status}`);
        }
        const report = (await resp.json()) as Scene3dCompileResponse;
        if (!aliveRef.current) return;
        setResult(report);
      } catch (err) {
        if (!aliveRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (aliveRef.current) setCompiling(false);
      }
    },
    [projectId, scenePath],
  );

  return { result, stored, compiling, loading, error, compile };
}
