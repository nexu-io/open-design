import { useMemo } from 'react';
import { Button } from '@open-design/components';
import { useT } from '../i18n';
import { deriveFileOps } from '../runtime/file-ops';
import { latestTodosFromEvents } from '../runtime/todos';
import {
  DesignKitView,
  type DesignKitEditFocusRequest,
  type HeaderMenuAction,
} from './DesignKitView';
import { designSystemGithubEvidenceState, repoConnectCopy } from './design-system-github-evidence';
import { Icon, type IconName } from './Icon';
import { MissingBrandFontsBanner } from './MissingBrandFontsBanner';
import { Toast } from './Toast';
import type { AgentEvent, DesignSystemSummary, ProjectFile, ProjectMetadata } from '../types';
import {
  buildDesignSystemReviewSections,
  designSystemGenerationProgress,
  designSystemGenerationReviewHasStarted,
  designSystemInitialGenerationSteps,
  designSystemReviewGroups,
  designSystemReviewPreviewDisplay,
  designSystemReviewTimeLabel,
  designSystemSectionActivity,
  designSystemSectionChangedAfterReview,
  designSystemSectionPreviewFile,
  designSystemSectionStatus,
  designSystemSectionStatusClass,
  designSystemSectionStatusLabel,
  designSystemSectionVisibleDuringGeneration,
  normalizeDesignSystemPath,
  slugForTestId,
  useWiredDesignSystemCardManifest,
  useDesignSystemReviewCards,
  useWiredDesignSystemKitActions,
  DesignSystemProjectLoading,
  type DesignSystemProjectSectionReview,
  type DesignSystemReviewAgentTask,
  type DesignSystemReviewDecision,
  type DesignSystemReviewDetails,
} from '../features/file-workspace';

interface DesignSystemProjectPanelProps {
  projectId: string;
  system: DesignSystemSummary;
  brandId?: string | null;
  editable: boolean;
  files: ProjectFile[];
  streaming: boolean;
  activityEvents: AgentEvent[];
  onOpenFile: (name: string) => void;
  onUploadAssets: () => void;
  onRefreshFiles: () => Promise<void> | void;
  defaultDesignSystemId?: string | null;
  onSetDefaultDesignSystem?: (id: string | null) => Promise<void> | void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onDeleteDesignSystemProject?: (id: string) => Promise<boolean> | boolean;
  onNeedsWork?: (
    sectionTitle: string,
    feedback: string,
    files: string[],
  ) => DesignSystemReviewAgentTask | void;
  designSystemReview?: ProjectMetadata['designSystemReview'];
  onReviewDecision?: (
    sectionTitle: string,
    decision: DesignSystemReviewDecision,
    details?: DesignSystemReviewDetails,
  ) => void;
  onUseDesignSystem?: (id: string, title: string) => Promise<void> | void;
  editFocusRequest?: DesignKitEditFocusRequest | null;
  onConnectRepo?: () => void;
  githubConnected?: boolean;
}

export function DesignSystemProjectPanel({
  projectId,
  system,
  brandId,
  editable,
  files,
  streaming,
  activityEvents,
  onOpenFile,
  onUploadAssets,
  onRefreshFiles,
  defaultDesignSystemId,
  onSetDefaultDesignSystem,
  onDesignSystemsRefresh,
  onDeleteDesignSystemProject,
  onNeedsWork,
  designSystemReview,
  onReviewDecision,
  onUseDesignSystem,
  editFocusRequest,
  onConnectRepo,
  githubConnected,
}: DesignSystemProjectPanelProps) {
  const t = useT();

  const allFileNames = files.map((file) => file.name);
  const fileByName = new Map(files.map((file) => [file.name, file]));
  const githubEvidence = designSystemGithubEvidenceState(system, allFileNames);

  const kitActions = useWiredDesignSystemKitActions({
    projectId,
    system,
    brandId,
    editable,
    t,
    onRefreshFiles,
    onDesignSystemsRefresh,
    onDeleteDesignSystemProject,
    onSetDefaultDesignSystem,
    githubEvidenceReady: githubEvidence.ready,
  });
  const reviewCards = useDesignSystemReviewCards({ editable, designSystemReview, onNeedsWork, onReviewDecision });

  const manifestFile = files.find((file) => normalizeDesignSystemPath(file.name) === '_ds_manifest.json');
  const manifestFileName = manifestFile?.name ?? null;
  const manifestCacheBustKey = manifestFile ? Math.round(manifestFile.mtime) : null;
  const manifestReadFailedLabel = t('ds.manifestReadFailed');
  const { cardManifest, cardManifestError } = useWiredDesignSystemCardManifest(
    projectId,
    system.id,
    manifestFileName,
    manifestCacheBustKey,
    manifestReadFailedLabel,
  );
  const fontFiles = allFileNames.filter((name) =>
    /\.(otf|ttf|woff|woff2)$/i.test(name) || name.toLowerCase().includes('/fonts/'),
  );
  const sections = buildDesignSystemReviewSections(allFileNames, fileByName, cardManifest);
  const published = kitActions.status === 'published';
  const isDefault = published && defaultDesignSystemId === system.id;
  // Strip a trailing "design system" from the title so the heading
  // "Review <name> design system" does not read redundantly when a system is
  // already named e.g. "Acme Design System".
  const systemDisplayName = system.title.replace(/\s*design system$/i, '').trim() || system.title;
  const activityFileOps = useMemo(() => deriveFileOps(activityEvents), [activityEvents]);
  const activityTodos = useMemo(() => latestTodosFromEvents(activityEvents), [activityEvents]);
  const sectionReviews: DesignSystemProjectSectionReview[] = sections.map((section) => {
    const previewFile = designSystemSectionPreviewFile(section.files, fileByName);
    const reviewEntry = designSystemReview?.[section.title];
    const reviewDecision = reviewCards.reviewDecisions[section.title] ?? reviewEntry?.decision;
    const sectionActivity = designSystemSectionActivity(section, activityFileOps, activityTodos);
    const changedAfterFeedback = designSystemSectionChangedAfterReview(
      section.files,
      fileByName,
      reviewEntry,
    );
    const sectionStatus = designSystemSectionStatus(
      section,
      reviewDecision,
      changedAfterFeedback,
      sectionActivity,
    );
    return {
      section,
      previewFile,
      previewDisplay: designSystemReviewPreviewDisplay(section, previewFile),
      reviewEntry,
      sectionActivity,
      changedAfterFeedback,
      sectionStatus,
      sectionStatusLabel: designSystemSectionStatusLabel(t, section, sectionStatus, sectionActivity),
      reviewTimeLabel: reviewEntry?.updatedAt
        ? designSystemReviewTimeLabel(t, reviewEntry.updatedAt)
        : null,
    };
  });
  // The rest of the section-review/TOC chain below (generationReviewHasStarted
  // through reviewTocGroups) is retained from the pre-decomposition source
  // without being wired into JSX — see DesignSystemReviewCard.tsx's header
  // note. generationSteps (below) is the one live consumer of sectionReviews.
  const generationReviewHasStarted = published || designSystemGenerationReviewHasStarted(sectionReviews);
  const visibleSectionReviews = streaming && !published && generationReviewHasStarted
    ? sectionReviews.filter((item) => designSystemSectionVisibleDuringGeneration(item))
    : sectionReviews;
  const groupedSectionReviews = designSystemReviewGroups(visibleSectionReviews);
  const reviewTocGroups = groupedSectionReviews
    .map((group) => ({
      title: group.title,
      items: group.items.map((item) => ({
        id: `design-system-section-${slugForTestId(`${group.title}:${item.section.title}`)}`,
        label: item.section.title,
        statusClass: designSystemSectionStatusClass(item.sectionStatus),
        statusLabel: item.sectionStatusLabel,
      })),
    }))
    .filter((group) => group.items.length > 0);
  const creatingInitialDraft = streaming && !published && !brandId;
  const generationSteps = designSystemInitialGenerationSteps({
    files,
    sectionReviews,
    system,
    t,
  });
  const generationProgress = designSystemGenerationProgress(generationSteps);

  if (creatingInitialDraft) {
    return (
      <div className="ds-project-panel ds-project-panel--generating">
        <DesignSystemProjectLoading
          kicker={t('dsManager.tabDesignSystem')}
          title={t('ds.creatingProjectTitle')}
          subtitle={t('ds.creatingProjectSubtitle')}
          progress={generationProgress}
          progressLabel={t('ds.generationProgressLabel', { progress: generationProgress })}
        />
      </div>
    );
  }

  // Scaffolding kept around the brand.html kit: publish / default controls in
  // the kit header, and the publish card + repo / font / manifest warnings above
  // the modules. The Looks-good / Needs-work review flow is intentionally gone
  // here — the kit is the single, on-brand view of the system.
  // The publish lifecycle button stays a visible primary; everything else
  // (asset refresh/download/reset and the chat-default toggle) folds into the
  // header's "More" dropdown so the sticky row reads as one clear action.
  const repoCopy = repoConnectCopy(t, githubConnected);
  const publishActionLabel = published ? t('ds.unpublishDesignSystem') : t('ds.publishDesignSystem');
  const extractionRunning = !editable || streaming;
  const actionsSlot = (
    <span
      className="ds-project-publish-trigger"
      title={
        !published && !githubEvidence.ready
          ? t('ds.publishRepoRequiredTitle')
          : undefined
      }
    >
      <button
        type="button"
        className={published ? 'ghost compact' : 'primary'}
        data-testid="design-system-publish"
        aria-label={publishActionLabel}
        title={publishActionLabel}
        disabled={!editable || kitActions.statusBusy || (!published && !githubEvidence.ready)}
        aria-busy={kitActions.statusBusy || undefined}
        onClick={() => void kitActions.togglePublished(!published)}
      >
        <Icon name={kitActions.statusBusy ? 'spinner' : published ? 'check' : 'arrow-up'} size={14} />
        {published ? t('ds.published') : t('ds.publish')}
      </button>
    </span>
  );

  const headerMenuActions: HeaderMenuAction[] = [
    {
      id: 'refresh',
      label: t('ds.refresh'),
      icon: 'refresh',
      onClick: () => {
        kitActions.emitDesignSystemProjectEditClick('kit_refresh', 'kit');
        void kitActions.refreshKit();
      },
      disabled: !editable || Boolean(kitActions.kitActionBusy) || kitActions.statusBusy || kitActions.defaultBusy,
      loading: kitActions.kitActionBusy === 'refresh',
    },
    {
      id: 'download',
      label: t('dsManager.downloadTitle'),
      icon: 'download',
      onClick: () => {
        kitActions.emitDesignSystemProjectEditClick('kit_download', 'kit');
        void kitActions.downloadKit();
      },
      disabled: !editable || Boolean(kitActions.kitActionBusy) || kitActions.statusBusy || kitActions.defaultBusy,
      loading: kitActions.kitActionBusy === 'download',
    },
    ...(published && onSetDefaultDesignSystem
      ? [
          {
            id: 'default',
            label: isDefault ? t('dsManager.badgeDefault') : t('dsManager.makeDefault'),
            icon: (isDefault ? 'check' : 'star') as IconName,
            onClick: () => void kitActions.toggleDefault(!isDefault),
            disabled: !editable || kitActions.statusBusy || kitActions.defaultBusy || Boolean(kitActions.kitActionBusy),
            loading: kitActions.defaultBusy,
            active: isDefault,
          } satisfies HeaderMenuAction,
        ]
      : []),
    ...(onDeleteDesignSystemProject
      ? [
          {
            id: 'delete',
            label: t('ds.deleteProjectAction', { title: system.title }),
            icon: 'trash' as IconName,
            onClick: () => void kitActions.deleteDesignSystemProject(),
            disabled: Boolean(kitActions.kitActionBusy) || kitActions.statusBusy || kitActions.defaultBusy,
            loading: kitActions.kitActionBusy === 'delete',
          } satisfies HeaderMenuAction,
        ]
      : []),
  ];

  const topSlot = (
    <>
      <div
        className={`ds-project-extraction-status ${extractionRunning ? 'is-running' : 'is-complete'}`}
        role="status"
        data-testid="design-system-extraction-status"
      >
        <Icon name={extractionRunning ? 'sparkles' : 'check'} size={15} />
        <span>
          <strong>{extractionRunning ? t('ds.extractionRunningTitle') : t('ds.extractionCompleteTitle')}</strong>
          <small>
            {extractionRunning
              ? t('ds.extractionRunningBody')
              : t('ds.extractionCompleteBody')}
          </small>
        </span>
      </div>

      <div className="ds-project-publish-card ds-project-publish-card--review">
        <p>
          {published
            ? t('ds.publishCardPublished')
            : t('ds.publishCardDraft')}
        </p>
        {published ? (
          <div className="ds-project-use-row">
            <span>
              <strong>{t('ds.useSystemTitle')}</strong>
              <small>
                {t('ds.useSystemBody')}
              </small>
            </span>
            <Button
              variant="primary"
              onClick={() => onUseDesignSystem?.(system.id, system.title)}
              disabled={!onUseDesignSystem}
            >
              <Icon name="plus" size={14} />
              {t('ds.createNewDesign')}
            </Button>
          </div>
        ) : null}
      </div>

      {!githubEvidence.ready ? (
        <div className="ds-project-warning-card">
          <Icon name="github" size={16} />
          <span>
            <strong>{repoCopy.bannerTitle}</strong>
            <small>{repoCopy.bannerBody}</small>
          </span>
          {onConnectRepo ? (
            <Button
              variant="ghost"
              className="compact"
              disabled={githubConnected === undefined}
              onClick={onConnectRepo}
            >
              <Icon name="github" size={13} />
              {repoCopy.buttonLabel}
            </Button>
          ) : githubEvidence.hasSourceManifest ? (
            <Button variant="ghost" className="compact" onClick={() => onOpenFile('context/source-context.md')}>
              <Icon name="file" size={13} />
              {t('ds.openSourceContext')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {editable && fontFiles.length === 0 ? (
        <MissingBrandFontsBanner projectId={projectId} onUploadAssets={onUploadAssets} />
      ) : null}

      {cardManifestError ? (
        <div
          className="ds-project-warning-card ds-project-warning-card--error"
          data-testid="design-system-manifest-error"
          role="alert"
        >
          <Icon name="alert-triangle" size={16} />
          <span>
            <strong>{t('ds.manifestNeedsAttention')}</strong>
            <small>{cardManifestError}</small>
          </span>
          {manifestFileName ? (
            <Button variant="ghost" className="compact" onClick={() => onOpenFile(manifestFileName)}>
              <Icon name="file" size={13} />
              {t('ds.openManifest')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <div className="ds-project-panel ds-project-panel--kit" data-testid="design-system-project-tab-panel">
      {kitActions.kitToast ? (
        <Toast
          message={kitActions.kitToast.message}
          tone={kitActions.kitToast.tone}
          ttlMs={kitActions.kitToast.tone === 'loading' ? 60000 : 2600}
          role={kitActions.kitToast.tone === 'error' ? 'alert' : 'status'}
          onDismiss={kitActions.dismissKitToast}
        />
      ) : null}
      {kitActions.kit ? (
        <DesignKitView
          kit={kitActions.kit}
          actionsSlot={actionsSlot}
          headerMenuActions={headerMenuActions}
          topSlot={topSlot}
          stickyHeader
          designMd={{
            body: kitActions.designMdBody,
            saving: kitActions.savingDesignMd,
            canEdit: editable,
            ...(editable
              ? {
                  onSave: kitActions.saveDesignMd,
                  onOpenFile: () => onOpenFile('DESIGN.md'),
                }
              : {}),
          }}
          onUploadModule={editable ? kitActions.kitUploadModule : undefined}
          onColorChange={editable ? (index, hex) => kitActions.changeKitColor(index, hex) : undefined}
          onColorReset={editable ? (index) => kitActions.resetKitColor(index) : undefined}
          onDeleteLogo={editable ? (index) => void kitActions.removeKitLogo(index) : undefined}
          onDeleteImage={editable ? (index) => void kitActions.removeKitImage(index) : undefined}
          onRefresh={editable ? () => void kitActions.refreshKit() : undefined}
          onDownload={editable ? () => void kitActions.downloadKit() : undefined}
          onEditClick={kitActions.emitDesignSystemProjectEditClick}
          uploading={kitActions.kitUploading}
          actionBusy={kitActions.kitActionBusy}
          onActionFeedback={kitActions.notifyKit}
          editFocusRequest={editFocusRequest}
          dataTestId="design-system-project-kit"
        />
      ) : (
        <DesignSystemProjectLoading
          kicker={t('dsManager.tabDesignSystem')}
          title={systemDisplayName}
          subtitle={t('ds.workspacePreparing')}
          progressLabel={t('ds.workspaceLoadingLabel')}
        />
      )}
    </div>
  );
}
