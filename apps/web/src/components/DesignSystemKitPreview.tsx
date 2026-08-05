import { useEffect, useRef, useState } from 'react';
import type { BrandSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { useT } from '../i18n';
import { fetchDesignSystem } from '../providers/registry';
import {
  brandSummaryToKit,
  useDesignKit,
} from '../runtime/design-kit';
import type { DesignSystemDetail, DesignSystemSummary } from '../types';
import { DesignKitView } from './DesignKitView';
import {
  designSystemLogoHost,
  isUserSystem,
} from './design-system-metadata';
import { useWorkspaceContext } from '../collab/useWorkspaceContext';
import {
  beginWorkspaceResourceScopedRead,
  resolveWorkspaceResourceReadIdentity,
  workspaceResourceReadIdentityFromContext,
  workspaceResourceReadIdentityKey,
  type WorkspaceResourceReadIdentity,
} from '../collab/workspace-identity';

interface DesignSystemKitPreviewProps {
  system: DesignSystemSummary;
  brandSummary?: BrandSummary | null;
  variant?: 'panel' | 'compact';
  showCover?: boolean;
  className?: string;
  dataTestId?: string;
  workspaceContext?: WorkspaceCollabContext | null;
  resourceReadIdentity?: WorkspaceResourceReadIdentity | null;
}

export function DesignSystemKitPreview({
  system,
  brandSummary,
  variant = 'panel',
  showCover = false,
  className,
  dataTestId = 'design-system-kit-preview',
  workspaceContext,
  resourceReadIdentity,
}: DesignSystemKitPreviewProps) {
  const workspaceState = useWorkspaceContext();
  const ambientResourceReadIdentity = resolveWorkspaceResourceReadIdentity(workspaceState);
  // ProjectView/Picker already own an exact route context. It must win over
  // ambient provisional identity; only callers without an explicit context
  // consume the ambient `{ context, generation }` read witness.
  const effectiveResourceReadIdentity = workspaceContext !== undefined
    ? workspaceResourceReadIdentityFromContext(workspaceContext)
    : resourceReadIdentity === undefined
      ? ambientResourceReadIdentity
      : resourceReadIdentity;
  if (brandSummary) {
    return (
      <BrandDesignSystemKitPreview
        summary={brandSummary}
        variant={variant}
        showCover={showCover}
        className={className}
        dataTestId={dataTestId}
        resourceReadIdentity={effectiveResourceReadIdentity}
      />
    );
  }

  return (
    <RegistryDesignSystemKitPreview
      system={system}
      variant={variant}
      showCover={showCover}
      className={className}
      dataTestId={dataTestId}
      resourceReadIdentity={effectiveResourceReadIdentity}
    />
  );
}

function BrandDesignSystemKitPreview({
  summary,
  variant,
  showCover,
  className,
  dataTestId,
  resourceReadIdentity,
}: {
  summary: BrandSummary;
  variant: 'panel' | 'compact';
  showCover: boolean;
  className?: string;
  dataTestId: string;
  resourceReadIdentity: WorkspaceResourceReadIdentity | null;
}) {
  const workspaceContext = resourceReadIdentity?.context ?? null;
  const kit = brandSummaryToKit(summary, workspaceContext);
  const resourceReadIdentityKey = workspaceResourceReadIdentityKey(resourceReadIdentity);
  return (
    <div className={className} data-testid={dataTestId}>
      <DesignKitView
        kit={kit}
        workspaceContext={resourceReadIdentity?.context ?? null}
        workspaceReadGeneration={resourceReadIdentityKey}
        variant={variant}
        showCover={showCover}
        dataTestId={`${dataTestId}-view`}
      />
    </div>
  );
}

function RegistryDesignSystemKitPreview({
  system,
  variant,
  showCover,
  className,
  dataTestId,
  resourceReadIdentity,
}: {
  system: DesignSystemSummary;
  variant: 'panel' | 'compact';
  showCover: boolean;
  className?: string;
  dataTestId: string;
  resourceReadIdentity: WorkspaceResourceReadIdentity | null;
}) {
  const t = useT();
  const effectiveResourceReadIdentity = resourceReadIdentity;
  const resourceReadIdentityKey = workspaceResourceReadIdentityKey(effectiveResourceReadIdentity);
  const resourceReadIdentityRef = useRef(effectiveResourceReadIdentity);
  resourceReadIdentityRef.current = effectiveResourceReadIdentity;
  const workspaceContext = effectiveResourceReadIdentity?.context ?? null;
  const [detail, setDetail] = useState<DesignSystemDetail | null>(null);
  const [detailResolved, setDetailResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const read = beginWorkspaceResourceScopedRead(resourceReadIdentityRef.current);
    setDetail(null);
    setDetailResolved(false);
    void fetchDesignSystem(system.id, read.context)
      .then((next) => {
        if (cancelled || !read.isStillCurrent(resourceReadIdentityRef.current)) return;
        setDetail(next);
        setDetailResolved(true);
      })
      .catch(() => {
        if (!cancelled && read.isStillCurrent(resourceReadIdentityRef.current)) {
          setDetailResolved(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [system.id, resourceReadIdentityKey]);

  const projectId = detail?.projectId ?? system.projectId;
  const host = designSystemLogoHost(system) || undefined;
  const { kit, loading } = useDesignKit({
    designSystemId: system.id,
    title: system.title,
    projectId,
    body: detail?.body,
    packageInfo: detail?.packageInfo,
    swatches: system.swatches,
    showcaseHtml: null,
    editable: isUserSystem(system),
    host,
    workspaceContext,
    workspaceReadGeneration: resourceReadIdentityKey,
  });

  const pending = !detailResolved || loading || !kit;

  return (
    <div className={className} data-testid={dataTestId}>
      {pending ? (
        <div
          className="design-system-kit-preview-loading"
          role="status"
          aria-busy="true"
          data-testid={`${dataTestId}-loading`}
        >
          {t('designSystemPicker.loadingPreview')}
        </div>
      ) : (
        <DesignKitView
          kit={kit}
          workspaceContext={workspaceContext}
          workspaceReadGeneration={resourceReadIdentityKey}
          variant={variant}
          showCover={showCover}
          dataTestId={`${dataTestId}-view`}
        />
      )}
    </div>
  );
}
