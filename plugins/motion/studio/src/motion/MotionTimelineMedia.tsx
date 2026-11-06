import { useEffect, useRef } from 'react';
import { useMediaGateway } from './MediaGatewayContext';
import { usePlayerStore } from '../player/store/playerStore';
import { useI18n } from '../i18n/I18n';
import { useStudioShellContextOptional } from '../contexts/StudioContext';
import { useDomEditActionsContextOptional } from '../contexts/DomEditContext';
import { buildDomEditPatchTarget } from '../components/editor/domEditing';
import { readTagAttribute, readTagSnippetByTarget } from '../utils/sourcePatcher';
import { resolveTimelineAssetSrc } from '../utils/timelineAssetDrop';
import { encodeUrlPath } from '@hyperframes/parsers';
import { selectedMedia, projectMediaPath } from './timelineMediaSelection';

export function MotionTimelineMedia({ projectId, compositionId, disabled, onFileDrop, onAssetDrop }: {
  projectId: string; compositionId: string; disabled: boolean;
  onFileDrop?: (files: File[], placement?: { start: number; track: number }) => Promise<void> | void;
  onAssetDrop?: (path: string, placement: { start: number; track: number }, duration?: number, reportFailure?: boolean) => Promise<void> | void;
}) {
  const gateway = useMediaGateway(); const { t } = useI18n();
  const shell = useStudioShellContextOptional();
  const edits = useDomEditActionsContextOptional();
  const state = useRef({ projectId, compositionId, disabled, onFileDrop, onAssetDrop, shell, edits }); state.current = { projectId, compositionId, disabled, onFileDrop, onAssetDrop, shell, edits };
  const bind = gateway?.bindTimeline;
  useEffect(() => {
    if (!bind) return;
    const basis = `${projectId}:${compositionId}`;
    let bound = true;
    const check = () => { const now = state.current; if (!bound || `${now.projectId}:${now.compositionId}` !== basis) throw new Error(t('The composition changed. Open Generate media again to choose a new placement.')); if (now.disabled || now.shell?.writeBlockedReason || now.shell?.renderQueue.isRendering) throw new Error(t('The timeline is currently unavailable for editing')); return now; };
    bind({ projectId, compositionId,
      currentPlacement: () => { const player = usePlayerStore.getState(); const range = player.rangeSelection; const selected = player.elements.find(el => (el.key ?? el.id) === player.selectedElementId); return { start: range?.t0 ?? selected?.start ?? player.currentTime, duration: range ? Math.max(0.1, range.t1 - range.t0) : selected?.duration ?? 3, track: selected?.track ?? 0 }; },
      importFiles: async files => { const now = check(); await now.shell?.waitForPendingDomEditSaves(); check(); await now.onFileDrop?.(files, { start: usePlayerStore.getState().currentTime, track: 0 }); },
      place: async (asset, placement) => { const now = check(); if (!now.onAssetDrop) throw new Error(t('Timeline insertion is unavailable')); await now.shell?.waitForPendingDomEditSaves(); check(); await now.onAssetDrop(asset, { start: placement.start, track: placement.track }, placement.duration, true); },
      replace: async (asset, captured) => {
        let now = check();
        await now.shell?.waitForPendingDomEditSaves(); now = check();
        const element = usePlayerStore.getState().elements.find(el => (el.key ?? el.id) === captured.key);
        if (!element || captured.modality !== 'image' || selectedMedia(element)?.path !== captured.path || !now.edits) throw new Error(t('The original image changed or is unavailable. Select it again.'));
        const selection = await now.edits.buildDomSelectionForTimelineElement(element);
        check();
        if (!selection || selection.isInsideLockedComposition || selection.tagName !== 'img') throw new Error(t('The original image changed or is unavailable. Select it again.'));
        const target = buildDomEditPatchTarget(selection);
        const previousSrc = selection.element.getAttribute('src');
        if (!previousSrc || projectMediaPath(previousSrc, selection.sourceFile) !== captured.path) throw new Error(t('The original image changed or is unavailable. Select it again.'));
        // Guard disk as well as the captured timeline identity. Keep every timing/style/animation attribute.
        const ok = await now.edits.handleDomAttributeBatchCommit(selection, [{ type: 'html-attribute', property: 'src', value: encodeUrlPath(resolveTimelineAssetSrc(selection.sourceFile, asset)) }], {
          label: t('Replace generated image'),
          validateContent: source => {
            check();
            const tag = readTagSnippetByTarget(source, target);
            const saved = tag ? readTagAttribute(tag, 'src') : undefined;
            if (!saved || projectMediaPath(saved, selection.sourceFile) !== captured.path) throw new Error(t('The original image changed or is unavailable. Select it again.'));
          },
        });
        if (!ok) throw new Error(t('Could not replace the selected image'));
      },
    });
    return () => { bound = false; bind(null); };
  }, [bind, projectId, compositionId, t]);
  if (!gateway) return null;
  return <div className="motion-timeline-media-actions"><button disabled={disabled} onClick={() => gateway.openGenerator()}>{t('Generate media')}</button><button disabled={disabled || !onFileDrop} onClick={gateway.importFiles}>{t('Import files…')}</button></div>;
}
