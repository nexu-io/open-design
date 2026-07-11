// Feature-local hook for the design-system project tab's `_ds_manifest.json`
// cluster: fetches and parses the card manifest whenever the manifest file's
// identity/mtime changes, and clears it when the file disappears (or the
// system isn't yet persisted).
//
// Same paradigm as useDesignSystemInlinePreview: transport is INJECTED as the
// slice port; the parse itself is the pure `parseDesignSystemCardManifest`
// rule. `manifestReadFailedLabel` is a plain string the orchestrator computes
// once per render (`t('ds.manifestReadFailed')`) — never `t` itself — so this
// hook's effect never carries the useT() infinite-loop footgun.
import { useEffect, useState } from 'react';
import { designSystemPreviewPort } from '../dependencies';
import type { DesignSystemPreviewPort } from '../ports';
import { parseDesignSystemCardManifest } from '../rules';
import type { DesignSystemCardManifestMap } from '../types';

export interface DesignSystemCardManifestController {
  cardManifest: DesignSystemCardManifestMap;
  cardManifestError: string | null;
}

export function useDesignSystemCardManifest(
  port: DesignSystemPreviewPort,
  projectId: string,
  systemId: string,
  manifestFileName: string | null,
  manifestCacheBustKey: number | null,
  manifestReadFailedLabel: string,
): DesignSystemCardManifestController {
  const [cardManifest, setCardManifest] = useState<DesignSystemCardManifestMap>(() => new Map());
  const [cardManifestError, setCardManifestError] = useState<string | null>(null);

  useEffect(() => {
    if (!systemId || !manifestFileName || manifestCacheBustKey === null) {
      setCardManifest((current) => (current.size === 0 ? current : new Map()));
      setCardManifestError((current) => (current === null ? current : null));
      return undefined;
    }
    let cancelled = false;
    void port.fetchProjectFileText(projectId, manifestFileName, {
      cache: 'no-store',
      cacheBustKey: manifestCacheBustKey,
    }).then((text) => {
      if (cancelled) return;
      setCardManifest(parseDesignSystemCardManifest(text));
      setCardManifestError(null);
    }).catch((err: unknown) => {
      if (cancelled) return;
      setCardManifest(new Map());
      setCardManifestError(err instanceof Error ? err.message : manifestReadFailedLabel);
    });
    return () => {
      cancelled = true;
    };
  }, [port, manifestCacheBustKey, manifestFileName, manifestReadFailedLabel, projectId, systemId]);

  return { cardManifest, cardManifestError };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This
 * is the default the orchestrator injects; swap it via the component prop in
 * tests.
 */
export function useWiredDesignSystemCardManifest(
  projectId: string,
  systemId: string,
  manifestFileName: string | null,
  manifestCacheBustKey: number | null,
  manifestReadFailedLabel: string,
): DesignSystemCardManifestController {
  return useDesignSystemCardManifest(
    designSystemPreviewPort,
    projectId,
    systemId,
    manifestFileName,
    manifestCacheBustKey,
    manifestReadFailedLabel,
  );
}
