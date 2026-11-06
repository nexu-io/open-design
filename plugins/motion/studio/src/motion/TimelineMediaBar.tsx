import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaGateway } from './MediaGatewayContext';
import { selectedMedia } from './timelineMediaSelection';
import { useTimelineContext } from '../player/components/TimelineProvider';
import { useTimelineReadOnlyPress } from '../player/components/timelineReadOnly';
import { RULER_H } from '../player/components/timelineLayout';
import { usePlayerStore } from '../player/store/playerStore';
import { useStudioShellContextOptional } from '../contexts/StudioContext';
import { useI18n } from '../i18n/I18n';
import { EditPopover } from '../player/components/EditModal';
import { useArtifactViewActive } from './ArtifactViewState';

export function TimelineMediaBar() {
  const gateway = useMediaGateway();
  const active = useArtifactViewActive();
  return gateway && active ? <ConnectedTimelineMediaBar /> : null;
}

function ConnectedTimelineMediaBar() {
  const gateway = useMediaGateway()!; const { t } = useI18n();
  const { state } = useTimelineContext(); const shell = useStudioShellContextOptional();
  const readOnly = useTimelineReadOnlyPress();
  const playing = usePlayerStore(s => s.isPlaying);
  const selectedIds = usePlayerStore(s => s.selectedElementIds);
  const [interaction, setInteraction] = useState(0), [caret, setCaret] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(''), [prompt, setPrompt] = useState(''), [ask, setAsk] = useState(false);
  const [position, setPosition] = useState({ left: 16, bottom: 240 });
  const range = state.overlays.showPopover ? state.overlays.rangeSelection : null;
  const clip = !range && selectedIds.size <= 1 ? state.elements.find(el => (el.key ?? el.id) === state.selectedElementId) : undefined;
  const media = selectedMedia(clip);
  const start = range ? Math.min(range.start, range.end) : clip?.start ?? caret ?? 0;
  const duration = range ? Math.abs(range.end - range.start) : clip?.duration ?? 3;
  const identity = `${shell?.projectId}:${state.sessionEpoch}:${range ? 'range' : clip?.key ?? clip?.id ?? 'caret'}:${start}:${duration}:${interaction}`;
  const scroll = state.canvas.scrollRef;
  useEffect(() => {
    const viewport = scroll.current;
    if (!viewport) return;
    const activate = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = viewport.getBoundingClientRect();
      const ruler = event.clientY >= rect.top && event.clientY < rect.top + RULER_H;
      if (ruler) setCaret(Math.max(0, (event.clientX - rect.left + viewport.scrollLeft - state.canvas.contentOrigin) / state.canvas.pps));
      else setCaret(null);
      setInteraction(n => n + 1);
    };
    viewport.addEventListener('pointerup', activate);
    return () => viewport.removeEventListener('pointerup', activate);
  }, [scroll, state.timelineReady, state.canvas.pps, state.canvas.contentOrigin]);
  useEffect(() => { setCaret(null); setAsk(false); }, [state.sessionEpoch, shell?.activeCompPath]);
  useEffect(() => {
    const update = () => {
      const viewport = scroll.current;
      const timeline = viewport?.closest('[data-studio-timeline]');
      if (!viewport || !timeline) return;
      const rect = viewport.getBoundingClientRect();
      const x = rect.left + state.canvas.contentOrigin + start * state.canvas.pps - viewport.scrollLeft;
      setPosition({ left: Math.max(12, Math.min(x - 24, window.innerWidth - 692)), bottom: Math.max(16, window.innerHeight - timeline.getBoundingClientRect().top + 8) });
    };
    update(); window.addEventListener('resize', update); scroll.current?.addEventListener('scroll', update);
    const observer = new ResizeObserver(update); if (scroll.current) observer.observe(scroll.current);
    return () => { window.removeEventListener('resize', update); scroll.current?.removeEventListener('scroll', update); observer.disconnect(); };
  }, [scroll, start, state.canvas.pps, state.canvas.contentOrigin]);
  const hidden = readOnly || !state.timelineReady || gateway.generationOpen || playing || shell?.writeBlockedReason || shell?.renderQueue.isRendering
    || state.canvas.isScrubbing || state.canvas.draggedElement || state.canvas.resizingClip || state.canvas.marqueeRect
    || state.overlays.clipContextMenu || state.overlays.kfContextMenu || state.overlays.gapContextMenu
    || dismissed === identity || (!range && !clip && caret === null);
  if (hidden) return null;
  const close = () => { setDismissed(identity); setAsk(false); };
  const open = (edit = false) => gateway.openGenerator({ prompt, placement: { start, duration: Math.max(.1, duration), track: clip?.track ?? 0 },
    anchorX: position.left, modality: media?.modality, selection: media, ...(edit ? { intent: 'edit' as const } : {}) });
  const host = document.querySelector('[data-motion-studio]') ?? document.body;
  return createPortal(ask ? <EditPopover initialPrompt={prompt} rangeStart={start} rangeEnd={start + duration} anchorX={position.left} anchorY={window.innerHeight - position.bottom} onClose={close} /> :
    <aside className="motion-timeline-media-bar motion-media-surface" style={position} aria-label={t('Timeline media actions')} onPointerDown={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') close(); }}>
      <div className="motion-media-context"><span>{start.toFixed(1)}–{(start + duration).toFixed(1)}s</span><span title={media?.label}>{media?.label ?? t(range ? 'Selected time range' : clip ? 'Selected clip' : 'At playhead')}</span><button className="motion-media-close" aria-label={t('Close timeline media actions')} onClick={close}>×</button></div>
      <form onSubmit={e => { e.preventDefault(); open(); }}>
        <input aria-label={t('Timeline media prompt')} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={t(media?.modality === 'image' ? 'Describe a new image or how to change this one…' : 'Describe what goes here…')} />
        <button type="submit">{t('Generate media')}</button>
        {media?.modality === 'image' && <button type="button" className="motion-media-primary" onClick={() => open(true)}>{t('Edit image')}</button>}
        <button type="button" onClick={() => setAsk(true)}>{t('Ask Agent')}</button>
      </form>
    </aside>, host);
}
