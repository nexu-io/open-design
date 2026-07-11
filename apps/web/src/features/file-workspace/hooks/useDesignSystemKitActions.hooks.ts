// Feature-local hook for the design-system project tab's kit-action cluster:
// loading/saving DESIGN.md, refreshing/downloading the brand kit, publish +
// default-system toggles, per-swatch color edit/reset, and logo/image
// removal. Owns the busy/toast bookkeeping every one of those actions shares
// so a failure always surfaces (nothing here fires-and-forgets any more).
//
// Transport is INJECTED as the slice port (`DesignSystemKitActionsPort`);
// `useDesignKit`/`useKitModuleUpload` stay direct `runtime/` hook calls (both
// already unit-tested transport-owning hooks in their own right — wrapping
// them as a second port would duplicate that coverage without adding a real
// seam, since neither exposes a `subscribeX` shape the port pattern models).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnalytics } from '../../../analytics/provider';
import type { DesignSystemEditClickProps } from '@open-design/contracts/analytics';
import { trackDesignSystemEditClick } from '../../../analytics/events';
import { hostnameOf, useDesignKit, type DesignKit } from '../../../runtime/design-kit';
import { useKitModuleUpload, type KitUploadModule } from '../../../runtime/kit-upload';
import { designSystemKitActionsPort } from '../dependencies';
import type { DesignSystemKitActionsPort } from '../ports';
import { designMdBodyWithColor, initialDesignKitColorHex, normalizeDesignKitHex } from '../rules';
import type { DesignSystemSummary } from '../../../types';
import type { TranslateFn } from '../types';

export type DesignKitActionFeedbackTone = 'loading' | 'success' | 'error';

export interface DesignSystemKitActionsController {
  designMdBody: string;
  savingDesignMd: boolean;
  kitActionBusy: string | null;
  kitToast: { message: string; tone: DesignKitActionFeedbackTone } | null;
  notifyKit: (tone: DesignKitActionFeedbackTone, message: string) => void;
  dismissKitToast: () => void;
  status: DesignSystemSummary['status'];
  statusBusy: boolean;
  defaultBusy: boolean;
  kit: DesignKit | null;
  kitHost: string | undefined;
  kitUploading: KitUploadModule | null;
  kitUploadModule: (module: KitUploadModule, file: File) => Promise<void>;
  emitDesignSystemProjectEditClick: (
    element: DesignSystemEditClickProps['element'],
    module: DesignSystemEditClickProps['module'],
  ) => void;
  saveDesignMd: (nextBody: string) => Promise<void>;
  refreshKit: () => Promise<void>;
  downloadKit: () => Promise<void>;
  deleteDesignSystemProject: () => Promise<void>;
  changeKitColor: (index: number, hex: string) => Promise<void>;
  resetKitColor: (index: number) => Promise<void>;
  removeKitLogo: (index: number) => Promise<void>;
  removeKitImage: (index: number) => Promise<void>;
  togglePublished: (nextPublished: boolean) => Promise<void>;
  toggleDefault: (nextDefault: boolean) => Promise<void>;
}

export interface DesignSystemKitActionsParams {
  projectId: string;
  system: DesignSystemSummary;
  brandId?: string | null;
  editable: boolean;
  t: TranslateFn;
  onRefreshFiles: () => Promise<void> | void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onDeleteDesignSystemProject?: (id: string) => Promise<boolean> | boolean;
  onSetDefaultDesignSystem?: (id: string | null) => Promise<void> | void;
  /** Whether the github-evidence gate for publishing is satisfied. Computed
   *  by the orchestrator from `files` (it needs the same value for the
   *  publish-button disabled state and the repo warning card). */
  githubEvidenceReady: boolean;
}

export function useDesignSystemKitActions(
  port: DesignSystemKitActionsPort,
  params: DesignSystemKitActionsParams,
): DesignSystemKitActionsController {
  const {
    projectId,
    system,
    brandId,
    editable,
    t,
    onRefreshFiles,
    onDesignSystemsRefresh,
    onDeleteDesignSystemProject,
    onSetDefaultDesignSystem,
    githubEvidenceReady,
  } = params;
  const analytics = useAnalytics();
  const [status, setStatus] = useState(system.status ?? 'draft');
  const [statusBusy, setStatusBusy] = useState(false);
  const [defaultBusy, setDefaultBusy] = useState(false);
  useEffect(() => {
    setStatus(system.status ?? 'draft');
  }, [system.status]);

  // brand.html-style kit for this design system. brand.json keeps rich assets,
  // while DESIGN.md is the editable text/token contract rendered on top.
  const [designMdBody, setDesignMdBody] = useState('');
  const [savingDesignMd, setSavingDesignMd] = useState(false);
  const [kitActionBusy, setKitActionBusy] = useState<string | null>(null);
  // Transient feedback for kit edits (upload / refresh / reset / delete) so an
  // action that previously fired-and-forgot now reports success or failure.
  const [kitToast, setKitToast] = useState<{ message: string; tone: DesignKitActionFeedbackTone } | null>(null);
  const notifyKit = useCallback(
    (tone: DesignKitActionFeedbackTone, message: string) => setKitToast({ tone, message }),
    [],
  );
  const notifyKitLoading = useCallback(
    (label: string) => notifyKit('loading', label.endsWith('…') || label.endsWith('...') ? label : `${label}...`),
    [notifyKit],
  );
  const dismissKitToast = useCallback(() => setKitToast(null), []);
  const [kitReloadKey, setKitReloadKey] = useState(0);
  const initialDesignMdRef = useRef<string | null>(null);
  const initialBrandJsonRef = useRef<string | null>(null);
  const initialBrandJsonLoadedRef = useRef(false);

  const emitDesignSystemProjectEditClick = useCallback(
    (element: DesignSystemEditClickProps['element'], module: DesignSystemEditClickProps['module']) => {
      trackDesignSystemEditClick(analytics.track, {
        page_name: 'design_system_project',
        area: 'design_system_edit',
        element,
        module,
        edit_surface: 'direct_module',
        artifact_kind: 'design_system',
        design_system_id: system.id,
        project_id: projectId,
      });
    },
    [analytics.track, projectId, system.id],
  );

  const refreshKitDependencies = useCallback(
    async (options?: { finalizeBrand?: boolean }) => {
      if (options?.finalizeBrand && brandId) {
        const outcome = await port.finalizeBrandProject(brandId, projectId);
        if (!outcome.ok) throw new Error(outcome.error);
      }
      setKitReloadKey((k) => k + 1);
      await Promise.all([Promise.resolve(onRefreshFiles()), Promise.resolve(onDesignSystemsRefresh?.())]);
    },
    [brandId, onDesignSystemsRefresh, onRefreshFiles, port, projectId],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      port.readDesignMd(projectId),
      port.fetchProjectFileText(projectId, 'brand.json', { cache: 'no-store' }),
    ]).then(([designMd, brandJson]) => {
      if (cancelled) return;
      setDesignMdBody(designMd);
      if (initialDesignMdRef.current === null) initialDesignMdRef.current = designMd;
      if (!initialBrandJsonLoadedRef.current) {
        initialBrandJsonRef.current = brandJson;
        initialBrandJsonLoadedRef.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, projectId, kitReloadKey]);

  const kitHost = system.provenance?.sourceUrls?.[0] ? hostnameOf(system.provenance.sourceUrls[0]) : undefined;
  const { uploading: kitUploading, uploadModule: kitUploadModule } = useKitModuleUpload({
    projectId,
    title: system.title,
    onUploaded: (module: KitUploadModule) => {
      setKitActionBusy(`upload:${module}`);
      notifyKit('loading', t('ds.uploading'));
      void refreshKitDependencies({ finalizeBrand: true })
        .then(() => notifyKit('success', t('ds.uploadDone')))
        .catch(() => notifyKit('error', t('ds.actionFailed')))
        .finally(() => setKitActionBusy(null));
    },
    onError: () => {
      setKitActionBusy(null);
      notifyKit('error', t('ds.uploadFailed'));
    },
  });
  const { kit } = useDesignKit({
    designSystemId: system.id,
    title: system.title,
    projectId,
    swatches: system.swatches,
    body: designMdBody,
    editable,
    host: kitHost,
    reloadKey: kitReloadKey,
  });

  const persistDesignMd = useCallback(
    async (nextBody: string) => {
      const updated = await port.updateDesignSystemDraft(system.id, { body: nextBody });
      if (!updated) throw new Error(t('ds.actionFailed'));
      const file = await port.writeProjectTextFile(projectId, 'DESIGN.md', nextBody);
      if (!file) throw new Error(t('ds.actionFailed'));
      setDesignMdBody(nextBody);
      await refreshKitDependencies();
    },
    [port, projectId, refreshKitDependencies, system.id, t],
  );

  const saveDesignMd = useCallback(
    async (nextBody: string) => {
      if (kitActionBusy) throw new Error(t('ds.actionFailed'));
      setSavingDesignMd(true);
      setKitActionBusy('design-md-save');
      notifyKit('loading', t('ds.saving'));
      try {
        await persistDesignMd(nextBody);
        notifyKit('success', t('ds.actionDone'));
      } catch (err) {
        notifyKit('error', t('ds.actionFailed'));
        throw err;
      } finally {
        setSavingDesignMd(false);
        setKitActionBusy(null);
      }
    },
    [kitActionBusy, notifyKit, persistDesignMd, t],
  );

  const refreshKit = useCallback(async () => {
    if (kitActionBusy) return;
    setKitActionBusy('refresh');
    notifyKitLoading(t('ds.refresh'));
    try {
      if (brandId) {
        await refreshKitDependencies({ finalizeBrand: true });
      } else {
        const job = await port.startDesignSystemTokenContractRebuildJob(system.id, { force: true });
        if (!job) throw new Error(t('ds.actionFailed'));
        await refreshKitDependencies();
      }
      notifyKit('success', t('ds.actionDone'));
    } catch {
      notifyKit('error', t('ds.actionFailed'));
    } finally {
      setKitActionBusy(null);
    }
  }, [brandId, kitActionBusy, notifyKit, notifyKitLoading, port, refreshKitDependencies, system.id, t]);

  const downloadKit = useCallback(async () => {
    if (kitActionBusy) return;
    setKitActionBusy('download');
    notifyKitLoading(t('ds.download'));
    try {
      await refreshKitDependencies({ finalizeBrand: true });
      const ok =
        (await port.downloadProjectArchive({ projectId, fallbackTitle: system.title })) ||
        (await port.downloadDesignSystemArchive({ designSystemId: system.id, fallbackTitle: system.title }));
      if (!ok) throw new Error(t('ds.actionFailed'));
      notifyKit('success', t('ds.actionDone'));
    } catch {
      notifyKit('error', t('ds.actionFailed'));
    } finally {
      setKitActionBusy(null);
    }
  }, [kitActionBusy, notifyKit, notifyKitLoading, port, projectId, refreshKitDependencies, system.id, system.title, t]);

  // Delete the whole design system from the project tab's "..." menu: remove the
  // registered design system (so it leaves the Design Systems list) AND its
  // backing project, then exit the tab. onDeleteDesignSystemProject is App's
  // handleDeleteProject, which deletes the project, clears local state and
  // navigates home — so the panel unmounts on success and there's no busy reset
  // to do in the happy path.
  const deleteDesignSystemProject = useCallback(async () => {
    if (kitActionBusy || !onDeleteDesignSystemProject) return;
    const ok = port.confirmDelete(t('ds.deleteProjectConfirm', { title: system.title }));
    if (!ok) return;
    setKitActionBusy('delete');
    notifyKitLoading(t('ds.deleteProjectAction', { title: system.title }));
    try {
      // Delete the backing project first: this navigates home and unmounts the
      // panel, so the tab exits cleanly instead of briefly rendering an empty
      // design-system view. Only on success do we drop the registered design
      // system (so the Design Systems list keeps no ghost row) and refresh that
      // list. deleteDesignSystemDraft is a no-op (404 → false) for systems that
      // aren't user-editable; that's fine.
      const deleted = await onDeleteDesignSystemProject(projectId);
      if (!deleted) {
        notifyKit('error', t('ds.actionFailed'));
        setKitActionBusy(null);
        return;
      }
      await port.deleteDesignSystemDraft(system.id);
      await onDesignSystemsRefresh?.();
    } catch {
      notifyKit('error', t('ds.actionFailed'));
      setKitActionBusy(null);
    }
  }, [kitActionBusy, notifyKit, notifyKitLoading, onDeleteDesignSystemProject, onDesignSystemsRefresh, port, projectId, system.id, system.title, t]);

  const changeKitColor = useCallback(
    async (index: number, hex: string) => {
      if (kitActionBusy) throw new Error(t('ds.actionFailed'));
      const nextHex = normalizeDesignKitHex(hex);
      if (!nextHex) throw new Error(t('ds.invalidHexColor'));
      setKitActionBusy('color');
      notifyKit('loading', t('ds.saving'));
      try {
        const ok = await port.updateBrandColor(projectId, index, nextHex);
        if (!ok) {
          const nextBody = designMdBodyWithColor(designMdBody, kit?.colors ?? [], index, nextHex);
          await persistDesignMd(nextBody);
        } else {
          await refreshKitDependencies({ finalizeBrand: true });
        }
        notifyKit('success', t('ds.actionDone'));
      } catch (err) {
        notifyKit('error', t('ds.actionFailed'));
        throw err;
      } finally {
        setKitActionBusy(null);
      }
    },
    [designMdBody, kit?.colors, kitActionBusy, notifyKit, persistDesignMd, port, projectId, refreshKitDependencies, t],
  );

  const resetKitColor = useCallback(
    async (index: number) => {
      const originalHex = initialDesignKitColorHex(index, {
        brandJson: initialBrandJsonRef.current,
        designMdBody: initialDesignMdRef.current,
        swatches: system.swatches,
        currentColors: kit?.colors ?? [],
      });
      if (!originalHex) throw new Error(t('ds.noOriginalColor'));
      await changeKitColor(index, originalHex);
    },
    [changeKitColor, kit?.colors, system.swatches, t],
  );

  const removeKitLogo = useCallback(
    async (index: number) => {
      if (kitActionBusy) return;
      setKitActionBusy(`delete-logo:${index}`);
      notifyKitLoading(t('ds.deleteLogo'));
      try {
        const ok = await port.deleteBrandLogo(projectId, index);
        if (!ok) throw new Error(t('ds.actionFailed'));
        await refreshKitDependencies({ finalizeBrand: true });
        notifyKit('success', t('ds.actionDone'));
      } catch {
        notifyKit('error', t('ds.actionFailed'));
      } finally {
        setKitActionBusy(null);
      }
    },
    [kitActionBusy, notifyKit, notifyKitLoading, port, projectId, refreshKitDependencies, t],
  );

  const removeKitImage = useCallback(
    async (index: number) => {
      if (kitActionBusy) return;
      setKitActionBusy(`delete-image:${index}`);
      notifyKitLoading(t('ds.deleteImage', { caption: '' }).trim());
      try {
        const ok = await port.deleteBrandImage(projectId, index);
        if (!ok) throw new Error(t('ds.actionFailed'));
        await refreshKitDependencies({ finalizeBrand: true });
        notifyKit('success', t('ds.actionDone'));
      } catch {
        notifyKit('error', t('ds.actionFailed'));
      } finally {
        setKitActionBusy(null);
      }
    },
    [kitActionBusy, notifyKit, notifyKitLoading, port, projectId, refreshKitDependencies, t],
  );

  const togglePublished = useCallback(
    async (nextPublished: boolean) => {
      if (!editable) return;
      if (nextPublished && !githubEvidenceReady) return;
      setStatusBusy(true);
      notifyKitLoading(nextPublished ? t('ds.publishDesignSystem') : t('ds.unpublishDesignSystem'));
      try {
        const nextStatus = nextPublished ? 'published' : 'draft';
        const updated = await port.updateDesignSystemDraft(system.id, { status: nextStatus });
        if (!updated) throw new Error(t('ds.actionFailed'));
        setStatus((updated.status as DesignSystemSummary['status']) ?? nextStatus);
        await onDesignSystemsRefresh?.();
        notifyKit('success', t('ds.actionDone'));
      } catch {
        notifyKit('error', t('ds.actionFailed'));
      } finally {
        setStatusBusy(false);
      }
    },
    [editable, githubEvidenceReady, notifyKit, notifyKitLoading, onDesignSystemsRefresh, port, system.id, t],
  );

  const toggleDefault = useCallback(
    async (nextDefault: boolean) => {
      if (!editable) return;
      if (!onSetDefaultDesignSystem) return;
      setDefaultBusy(true);
      notifyKitLoading(nextDefault ? t('dsManager.makeDefault') : t('dsManager.badgeDefault'));
      try {
        await onSetDefaultDesignSystem(nextDefault ? system.id : null);
        notifyKit('success', t('ds.actionDone'));
      } catch {
        notifyKit('error', t('ds.actionFailed'));
      } finally {
        setDefaultBusy(false);
      }
    },
    [editable, notifyKit, notifyKitLoading, onSetDefaultDesignSystem, system.id, t],
  );

  return {
    designMdBody,
    savingDesignMd,
    kitActionBusy,
    kitToast,
    notifyKit,
    dismissKitToast,
    status,
    statusBusy,
    defaultBusy,
    kit,
    kitHost,
    kitUploading,
    kitUploadModule,
    emitDesignSystemProjectEditClick,
    saveDesignMd,
    refreshKit,
    downloadKit,
    deleteDesignSystemProject,
    changeKitColor,
    resetKitColor,
    removeKitLogo,
    removeKitImage,
    togglePublished,
    toggleDefault,
  };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This
 * is the default the orchestrator injects; swap it via the component prop in
 * tests.
 */
export function useWiredDesignSystemKitActions(
  params: DesignSystemKitActionsParams,
): DesignSystemKitActionsController {
  return useDesignSystemKitActions(designSystemKitActionsPort, params);
}
