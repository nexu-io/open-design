import { useEffect, useRef, useState } from 'react';
import { beginWorkspaceResourceScopedRead, workspaceResourceReadIdentityKey, type WorkspaceResourceReadIdentity } from '../collab/workspace-identity';
import { fetchProjectFileText, projectRawUrl } from '../providers/registry';
import type { DesignSystemSummary } from '../types';
import { designSystemLogoHost, isUserSystem } from './design-system-metadata';
import { Icon } from './Icon';
import styles from './DesignSystemsTab.module.css';

interface Props {
  system: DesignSystemSummary;
  resourceReadIdentity: WorkspaceResourceReadIdentity | null;
  enabled: boolean;
}

export function DesignSystemLogo(props: Props) {
  // Drop both resolved assets and failed-image state when their authority or
  // source changes, before an old workspace's logo can render in the new one.
  const key = JSON.stringify([
    props.system.id, props.system.projectId, props.system.updatedAt,
    designSystemLogoHost(props.system), workspaceResourceReadIdentityKey(props.resourceReadIdentity),
  ]);
  return <ResolvedSystemLogo key={key} {...props} />;
}

function ResolvedSystemLogo({ system, resourceReadIdentity, enabled }: Props) {
  const projectId = isUserSystem(system) ? system.projectId : undefined;
  const identityRef = useRef(resourceReadIdentity);
  identityRef.current = resourceReadIdentity;
  const [projectLogo, setProjectLogo] = useState<string | null | undefined>(projectId ? undefined : null);
  const [failedSources, setFailedSources] = useState<readonly string[]>([]);

  useEffect(() => {
    if (!enabled || !projectId || projectLogo !== undefined) return;
    let cancelled = false;
    const read = beginWorkspaceResourceScopedRead(identityRef.current);
    void fetchProjectFileText(projectId, 'brand.json', {
      cache: 'no-store', workspaceContext: read.context,
    }).then((raw) => {
      if (cancelled || !read.isStillCurrent(identityRef.current)) return;
      let primary: string | null = null;
      try {
        const candidate: unknown = raw ? JSON.parse(raw)?.logo?.primary : null;
        if (typeof candidate === 'string' && candidate.trim()) primary = candidate.trim();
      } catch {
        // Systems without a valid brand document still have a favicon/palette.
      }
      setProjectLogo(primary ? projectRawUrl(projectId, primary, read.context) : null);
    }).catch(() => {
      if (!cancelled && read.isStillCurrent(identityRef.current)) setProjectLogo(null);
    });
    return () => { cancelled = true; };
  }, [enabled, projectId, projectLogo]);

  const host = designSystemLogoHost(system);
  const candidates = [projectLogo, host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : null];
  const src = enabled && projectLogo !== undefined
    ? candidates.find((candidate): candidate is string => typeof candidate === 'string' && !failedSources.includes(candidate))
    : undefined;
  const swatches = system.swatches?.slice(0, 4) ?? [];

  return (
    <span className={styles.galleryPalette} data-testid={`design-system-logo-${system.id}`} aria-hidden>
      {src ? <img className={styles.galleryLogo} src={src} alt="" loading="lazy"
        referrerPolicy="no-referrer" onError={() => setFailedSources((failed) => [...failed, src])} />
        : swatches.length ? swatches.map((color, index) => <span key={index} style={{ backgroundColor: color }} />)
          : <Icon name="palette" size={20} />}
    </span>
  );
}
