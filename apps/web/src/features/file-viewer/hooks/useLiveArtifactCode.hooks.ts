// Feature-local hook for the live-artifact code panel: loads the
// template/rendered-source variant text and toggles between them.
import { useEffect, useState } from 'react';
import { liveArtifactPort as realLiveArtifactPort } from '../dependencies';
import type { LiveArtifactPort } from '../ports';
import type { LiveArtifactCodeVariant } from '../types';

export interface LiveArtifactCodeController {
  variant: LiveArtifactCodeVariant;
  setVariant: (variant: LiveArtifactCodeVariant) => void;
  code: string | null;
  loading: boolean;
  failed: boolean;
}

export function useLiveArtifactCode(
  port: LiveArtifactPort,
  projectId: string,
  artifactId: string,
  reloadKey: number,
): LiveArtifactCodeController {
  const [variant, setVariant] = useState<LiveArtifactCodeVariant>('template');
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setCode(null);
    void port.fetchLiveArtifactCode(projectId, artifactId, variant).then((next) => {
      if (cancelled) return;
      setCode(next);
      setFailed(next == null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [port, artifactId, projectId, reloadKey, variant]);

  return { variant, setVariant, code, loading, failed };
}

export function useWiredLiveArtifactCode(
  projectId: string,
  artifactId: string,
  reloadKey: number,
): LiveArtifactCodeController {
  return useLiveArtifactCode(realLiveArtifactPort, projectId, artifactId, reloadKey);
}
