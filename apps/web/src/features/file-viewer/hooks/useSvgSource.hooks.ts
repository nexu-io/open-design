// Feature-local hook for the SVG viewer's preview/source toggle: loads the
// raw source text lazily (only entering "source" mode triggers a fetch) and
// supports a disk-reload button.
import { useEffect, useState } from 'react';
import { fileTextPort } from '../dependencies';
import type { FileTextPort } from '../ports';
import type { SvgViewerMode } from '../types';

export interface SvgSourceController {
  mode: SvgViewerMode;
  setMode: (mode: SvgViewerMode) => void;
  source: string | null;
  loadingSource: boolean;
  sourceError: boolean;
  reloadKey: number;
  reload: () => void;
}

export function useSvgSource(
  port: FileTextPort,
  projectId: string,
  fileName: string,
  fileMtime: number,
  initialMode: SvgViewerMode,
  initialSource: string | null | undefined,
): SvgSourceController {
  const [mode, setMode] = useState<SvgViewerMode>(initialMode);
  const [source, setSource] = useState<string | null>(initialSource ?? null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (mode !== 'source') return;
    if (initialSource !== undefined && reloadKey === 0) return;
    let cancelled = false;
    setLoadingSource(true);
    setSourceError(false);
    void port
      .fetchProjectFileText(projectId, fileName, {
        cache: 'no-store',
        cacheBustKey: `${Math.round(fileMtime)}-${reloadKey}`,
      })
      .then((next) => {
        if (cancelled) return;
        if (next === null) {
          setSource('');
          setSourceError(true);
        } else {
          setSource(next);
        }
        setLoadingSource(false);
      });
    return () => {
      cancelled = true;
    };
  }, [port, projectId, fileName, fileMtime, initialSource, mode, reloadKey]);

  return {
    mode,
    setMode,
    source,
    loadingSource,
    sourceError,
    reloadKey,
    reload: () => setReloadKey((n) => n + 1),
  };
}

export function useWiredSvgSource(
  projectId: string,
  fileName: string,
  fileMtime: number,
  initialMode: SvgViewerMode,
  initialSource: string | null | undefined,
): SvgSourceController {
  return useSvgSource(fileTextPort, projectId, fileName, fileMtime, initialMode, initialSource);
}
