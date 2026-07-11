// Wired live-artifact viewer: binds the state/transport hook to its
// presentational view.
import { useI18n } from '../../../i18n';
import type { LiveArtifactEventItem, LiveArtifactWorkspaceEntry } from '../../../types';
import { useWiredLiveArtifactViewer } from '../hooks/useLiveArtifactViewer.hooks';
import { LiveArtifactViewerView } from './LiveArtifactViewerView';

export function LiveArtifactViewer({
  projectId,
  liveArtifact,
  liveArtifactEvents = [],
  onRefreshArtifacts,
}: {
  projectId: string;
  liveArtifact: LiveArtifactWorkspaceEntry;
  liveArtifactEvents?: LiveArtifactEventItem[];
  onRefreshArtifacts?: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const controller = useWiredLiveArtifactViewer({
    projectId,
    liveArtifact,
    liveArtifactEvents,
    onRefreshArtifacts,
    t,
  });

  return (
    <LiveArtifactViewerView
      t={t}
      projectId={projectId}
      liveArtifact={liveArtifact}
      tabs={controller.tabs}
      mode={controller.mode}
      onSetMode={controller.setMode}
      detail={controller.detail}
      loading={controller.loading}
      previewUrlReloadKey={controller.previewUrlReloadKey}
      zoom={controller.zoom}
      onSetZoom={controller.setZoom}
      previewViewport={controller.previewViewport}
      onSetPreviewViewport={controller.setPreviewViewport}
      iframeRef={controller.iframeRef}
      refreshError={controller.refreshError}
      refreshSuccess={controller.refreshSuccess}
      onDismissRefreshSuccess={controller.dismissRefreshSuccess}
      refreshEvents={controller.refreshEvents}
      refreshHistory={controller.refreshHistory}
      isRunning={controller.isRunning}
      onRefresh={() => void controller.handleRefresh()}
      onReloadPreview={controller.reloadPreview}
      presentMenuOpen={controller.presentMenuOpen}
      onSetPresentMenuOpen={controller.setPresentMenuOpen}
      presentWrapRef={controller.presentWrapRef}
      onPresentInThisTab={controller.presentInThisTab}
      onPresentFullscreen={controller.presentFullscreen}
      onPresentNewTab={controller.presentNewTab}
      inTabPresent={controller.inTabPresent}
      onExitInTabPresent={controller.exitInTabPresent}
      zoomMenuOpen={controller.zoomMenuOpen}
      onSetZoomMenuOpen={controller.setZoomMenuOpen}
      zoomMenuRef={controller.zoomMenuRef}
      chromeActionsHost={controller.chromeActionsHost}
      previewBodyRef={controller.previewBodyRef}
      previewBodySize={controller.previewBodySize}
    />
  );
}
