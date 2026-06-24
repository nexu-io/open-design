// Shared rich brand preview.
//
// Thin adapter: builds a normalized DesignKit from a BrandSummary and renders
// the shared `DesignKitView` (the brand.html-style module stack). The Brand Kit
// tab uses `variant='panel'` (with Use / Open / Delete actions); design-system
// pickers use `variant='compact'` (a trimmed pane for a narrow popover).
//
// The kit-rendering helpers and the module view itself now live in
// `runtime/design-kit.ts` + `DesignKitView.tsx`; they are re-exported here so
// existing imports (`BrandLogo`, `hostnameOf`) keep working.

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@open-design/components';
import type { BrandSummary } from '@open-design/contracts';
import { useT } from '../i18n';
import { navigate } from '../router';
import { useAnalytics } from '../analytics/provider';
import { trackDesignSystemEditClick } from '../analytics/events';
import { requestHomeChip } from '../runtime/home-intent';
import { brandSummaryToKit } from '../runtime/design-kit';
import { DesignKitView } from './DesignKitView';
import styles from './BrandPreviewCard.module.css';

// Re-exports preserving the previous public surface of this module.
export { hostnameOf, fontStack, isLightHex } from '../runtime/design-kit';
export { BrandLogo, useBrandFonts } from './DesignKitView';

export interface BrandPreviewCardProps {
  summary: BrandSummary;
  /** Full Brand Kit tab card ('panel') vs trimmed picker popover ('compact'). */
  variant?: 'panel' | 'compact';
  /** Panel-only: called after a mutation (delete) so a parent can refresh. */
  onChanged?: () => void | Promise<void>;
  /** Panel-only: apply this brand's design system as the global default. */
  onApplyDesignSystem?: (designSystemId: string) => void;
  /** Panel-only: open the backing extraction project through the app shell. */
  onOpenProject?: (projectId: string) => Promise<boolean> | boolean | void;
}

export function BrandPreviewCard({
  summary,
  variant = 'panel',
  onChanged,
  onApplyDesignSystem,
  onOpenProject,
}: BrandPreviewCardProps) {
  const t = useT();
  const analytics = useAnalytics();
  const compact = variant === 'compact';
  const { meta, brand } = summary;
  const name = brand?.name?.trim() || (meta.sourceUrl ? new URL(meta.sourceUrl).hostname.replace(/^www\./, '') : 'Brand');
  const extracting = meta.status === 'extracting';
  const failed = meta.status === 'failed';
  const projectId = meta.projectId;
  const [busy, setBusy] = useState(false);
  const [backingProjectMissing, setBackingProjectMissing] = useState(false);

  const kit = brandSummaryToKit(summary);

  useEffect(() => {
    setBackingProjectMissing(false);
  }, [projectId]);

  const useInChat = useCallback(async () => {
    const designSystemId = meta.designSystemId;
    if (!designSystemId || busy) return;
    trackDesignSystemEditClick(analytics.track, {
      page_name: 'design_systems',
      area: 'design_system_edit',
      element: 'brand_card_use_in_chat',
      module: 'brand_card',
      edit_surface: 'direct_module',
      artifact_kind: 'design_system',
      design_system_id: designSystemId,
      project_id: projectId ?? undefined,
    });
    setBusy(true);
    try {
      if (onApplyDesignSystem) {
        onApplyDesignSystem(designSystemId);
      } else {
        await fetch('/api/app-config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ designSystemId }),
        });
      }
      requestHomeChip('prototype');
      navigate({ kind: 'home', view: 'home' });
    } finally {
      setBusy(false);
    }
  }, [meta.designSystemId, busy, onApplyDesignSystem, analytics.track, projectId]);

  const openProject = useCallback(async () => {
    if (!projectId) return;
    trackDesignSystemEditClick(analytics.track, {
      page_name: 'design_systems',
      area: 'design_system_edit',
      element: 'brand_card_open_project',
      module: 'brand_card',
      edit_surface: 'direct_module',
      artifact_kind: 'design_system',
      design_system_id: meta.designSystemId ?? undefined,
      project_id: projectId,
    });
    if (onOpenProject) {
      const opened = await onOpenProject(projectId);
      if (opened === false) setBackingProjectMissing(true);
      return;
    }
    navigate({ kind: 'project', projectId, fileName: null, conversationId: null });
  }, [onOpenProject, projectId, analytics.track, meta.designSystemId]);

  const deleteBrand = useCallback(async () => {
    if (busy) return;
    const ok = window.confirm(t('brandDetail.deleteConfirm').replace('{name}', name));
    if (!ok) return;
    trackDesignSystemEditClick(analytics.track, {
      page_name: 'design_systems',
      area: 'design_system_edit',
      element: 'brand_card_delete',
      module: 'brand_card',
      edit_surface: 'direct_module',
      artifact_kind: 'design_system',
      design_system_id: meta.designSystemId ?? undefined,
      project_id: projectId ?? undefined,
    });
    setBusy(true);
    try {
      await fetch(`/api/brands/${encodeURIComponent(meta.id)}`, { method: 'DELETE' });
      navigate({ kind: 'home', view: 'brands' }, { replace: true });
      await onChanged?.();
    } catch {
      setBusy(false);
    }
  }, [busy, meta.id, meta.designSystemId, name, onChanged, t, analytics.track, projectId]);

  const badgeSlot = extracting ? (
    <span className={`${styles.badge} ${styles.badgeBusy}`} role="status">
      {t('brand.extracting')}
    </span>
  ) : failed ? (
    <span className={`${styles.badge} ${styles.badgeFailed}`} role="status">
      {t('brand.failed')}
    </span>
  ) : null;

  const actionsSlot = compact ? null : (
    <>
      <Button
        variant="primary"
        onClick={() => void useInChat()}
        disabled={busy || !meta.designSystemId}
        data-testid="brand-preview-use"
      >
        {t('brandDetail.useInChat')}
      </Button>
      {projectId ? (
        <Button
          variant="ghost"
          onClick={() => void openProject()}
          disabled={busy || backingProjectMissing}
          data-testid="brand-preview-open-project"
        >
          {t('brandDetail.openProject')}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        onClick={() => void deleteBrand()}
        disabled={busy}
        data-testid="brand-preview-delete"
      >
        {t('brandDetail.delete')}
      </Button>
    </>
  );

  const noticeSlot = (
    <>
      {backingProjectMissing ? (
        <div className={styles.missingProjectNotice} role="status">
          {t('project.missing')}
        </div>
      ) : null}
      {failed && meta.error ? (
        <div className={styles.missingProjectNotice} role="status">
          {meta.error}
        </div>
      ) : null}
    </>
  );

  return (
    <DesignKitView
      kit={kit}
      variant={variant}
      badgeSlot={badgeSlot}
      actionsSlot={actionsSlot}
      noticeSlot={noticeSlot}
      dataTestId="brand-preview-card"
    />
  );
}
