import { useEffect, useMemo, useRef, useState } from 'react';
import {
  isPreviewBuildFocusReady, parsePreviewBuildFocusResult,
  parsePreviewBuildFocusSections, previewBuildFocusRequest,
  type PreviewBuildFocusResult,
} from '@open-design/contracts/runtime/preview-build-focus';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { useT } from '../../i18n';
import { appendResourceQuery } from '../../collab/workspace-identity';
import { projectRawUrl } from '../../providers/registry';
import type { ProjectFile } from '../../types';
import type { RunFailure, RunPhase, RunProgressStep } from '../../runtime/run-progress';
import { DesignFilesEmptyState } from './DesignFilesEmptyState';
import { failureLabel } from './run-step-label';

interface Props {
  projectId: string;
  file: ProjectFile;
  filesRefreshKey: number;
  steps: RunProgressStep[];
  phase?: RunPhase;
  workspaceContext: WorkspaceCollabContext | null;
  failure?: RunFailure | null;
}

/** Two URL frames keep the last usable document visible until its successor
 * reports rendered content. Unready/failed loads never replace that document. */
export function DesignFilesBuildingState({ projectId, file, filesRefreshKey, steps,
  phase = 'preparing', workspaceContext, failure = null }: Props) {
  const t = useT();
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const requests = useRef(new Map<string, string>());
  const [visible, setVisible] = useState<string | null>(null);
  const [focus, setFocus] = useState<PreviewBuildFocusResult | null>(null);
  const current = steps[0];
  const location = current?.location;
  const anchor = location
    ? (location.file === file.name || location.file?.endsWith(`/${file.name}`) ? location.anchor : null)
    : current?.anchor ?? null;
  const src = useMemo(() => appendResourceQuery(projectRawUrl(projectId, file.name, workspaceContext),
    `v=${Math.round(file.mtime)}&fr=${filesRefreshKey}&odPreviewBridge=buildfocus`),
  [projectId, file.name, file.mtime, filesRefreshKey, workspaceContext]);

  useEffect(() => {
    function request(url: string) {
      if (failure) return;
      const id = Math.random().toString(36).slice(2);
      requests.current.set(url, id);
      frames.current.get(url)?.contentWindow?.postMessage(
        previewBuildFocusRequest(id, anchor, null, current?.title), '*');
    }
    function onMessage(event: MessageEvent) {
      const entry = [...frames.current].find(([, frame]) => frame.contentWindow === event.source);
      if (!entry) return;
      const [url] = entry;
      if (isPreviewBuildFocusReady(event.data)) request(url);
      const sections = parsePreviewBuildFocusSections(event.data);
      if (sections?.length && url === src) {
        setVisible(url);
        request(url);
      }
      const result = parsePreviewBuildFocusResult(event.data);
      if (result && result.requestId === requests.current.get(url) && url === visible) {
        setFocus(result.found ? result : null);
      }
    }
    window.addEventListener('message', onMessage);
    setFocus(null);
    for (const url of frames.current.keys()) request(url);
    return () => window.removeEventListener('message', onMessage);
  }, [anchor, current?.title, src, visible, failure]);

  const urls = visible && visible !== src ? [visible, src] : [src];
  return <div className="live-build-stage" data-testid="design-files-building">
    {!visible && <DesignFilesEmptyState running={!failure} steps={steps} phase={phase} failure={failure} />}
    {urls.map((url) => <iframe key={url} ref={(frame) => {
      if (frame) frames.current.set(url, frame);
      else { frames.current.delete(url); requests.current.delete(url); }
    }} src={url} title={file.name} sandbox="allow-scripts" tabIndex={-1}
      className="live-build-frame" style={{ opacity: visible === url ? 1 : 0 }} />)}
    {visible && <div className="live-build-overlay">
      {!failure && focus && <div data-testid="build-focus-outline" className="live-build-outline"
        style={{ left: focus.x, top: focus.y, width: focus.width, height: focus.height }} />}
      {failure && <div className="live-build-bubble" style={{ left: '8px', top: '8px' }} role="status">
        <span>{failureLabel(failure, t)}</span>
      </div>}
    </div>}
  </div>;
}
