import { useEffect, useRef, useState } from 'react';
import type { DesignSystemDetail } from '../types';
import {
  beginWorkspaceResourceScopedRead,
  workspaceResourceReadIdentityKey,
  type WorkspaceResourceReadIdentity,
} from '../collab/workspace-identity';
import { designSystemStaticUrl, fetchProjectFileText } from '../providers/registry';
import type { DesignKit } from '../runtime/design-kit';

export interface DesignSystemToken {
  name: string;
  value: string;
  type: string;
  /** True only for bindings with original-source evidence, not schema defaults. */
  sourceBacked?: boolean;
}

interface UseDesignSystemTokensOptions {
  kit: DesignKit | null;
  packageInfo?: DesignSystemDetail['packageInfo'];
  resourceReadIdentity: WorkspaceResourceReadIdentity | null;
  enabled?: boolean;
}

const EMPTY_TOKENS: readonly DesignSystemToken[] = [];

function tokenFile(packageInfo: DesignSystemDetail['packageInfo']): string | null {
  if (!packageInfo) return null;
  const declared = packageInfo.manifest?.files?.designTokens;
  const path = declared || 'design-tokens.json';
  // A known file list is authoritative; a manifest declaration is enough only
  // for older packages that do not supply that list.
  if (packageInfo.availableFiles) return packageInfo.availableFiles.includes(path) ? path : null;
  return declared || null;
}

function parseTokens(value: unknown): DesignSystemToken[] {
  if (!value || typeof value !== 'object' || !('tokens' in value) || !Array.isArray(value.tokens)) return [];
  const fixtureScope = 'sourceScope' in value && value.sourceScope === 'open-design-bundled-fixture';
  return value.tokens.flatMap((token: unknown) => {
    if (!token || typeof token !== 'object') return [];
    const record = token as Record<string, unknown>;
    if (typeof record.type !== 'string' || !record.type.trim()
      || typeof record.name !== 'string' || !record.name.trim()
      || typeof record.value !== 'string' || !record.value.trim()) return [];
    const sources = Array.isArray(record.sources) ? record.sources.filter((source) => typeof source === 'string' && source.trim()) : [];
    // Older bundled backfills label curated fixture declarations as "high".
    // Their explicit no-recrawl provenance must not be presented as live-site data.
    const fixtureBackfill = typeof record.reason === 'string'
      && /Bundled tokens\.css declares|no upstream recrawl|using .*fallback|importer default/i.test(record.reason);
    const sourceBacked = (record.confidence === 'high' || record.confidence === 'medium')
      && sources.length > 0 && !fixtureBackfill && !fixtureScope;
    return [{ name: record.name, value: record.value, type: record.type, sourceBacked }];
  });
}

/** Read a package's advertised token source once for its shared detail view. */
export function useDesignSystemTokens({
  kit, packageInfo, resourceReadIdentity, enabled = true,
}: UseDesignSystemTokensOptions): readonly DesignSystemToken[] {
  const identityKey = workspaceResourceReadIdentityKey(resourceReadIdentity);
  const identityRef = useRef(resourceReadIdentity);
  identityRef.current = resourceReadIdentity;
  const path = tokenFile(packageInfo);
  const designSystemId = kit?.designSystemId;
  const projectId = kit?.projectId;
  const editable = kit?.editable;
  const sourceKey = JSON.stringify([identityKey, designSystemId, projectId, editable, path]);
  const [loaded, setLoaded] = useState<{ sourceKey: string; tokens: readonly DesignSystemToken[] } | null>(null);

  useEffect(() => {
    if (!enabled || !path || (!projectId && !designSystemId)) return;
    const abort = new AbortController();
    const read = beginWorkspaceResourceScopedRead(identityRef.current);
    void (async () => {
      try {
        let raw: unknown;
        if (projectId) {
          const text = await fetchProjectFileText(projectId, path, {
            cache: 'no-store', signal: abort.signal, workspaceContext: read.context,
          });
          raw = text ? JSON.parse(text) : null;
        } else if (designSystemId) {
          const response = await fetch(designSystemStaticUrl(designSystemId, path, read.context), {
            cache: 'no-store', signal: abort.signal,
          });
          raw = response.ok ? await response.json() : null;
        }
        if (!abort.signal.aborted && read.isStillCurrent(identityRef.current)) {
          setLoaded({ sourceKey, tokens: parseTokens(raw) });
        }
      } catch {
        // Missing/invalid optional data leaves callers' existing kit fallback.
      }
    })();
    return () => abort.abort();
  }, [enabled, sourceKey, path, designSystemId, projectId]);

  return enabled && loaded?.sourceKey === sourceKey ? loaded.tokens : EMPTY_TOKENS;
}
