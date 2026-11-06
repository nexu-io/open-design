import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import { usePlayerStore } from '../player/store/playerStore';
import { gatewayRequest, generateAsset, loadGateway, type GatewayStatus, type Model, type GenerationJob, type Modality } from './gatewayClient';
import type { MediaRequest } from './MediaGatewayContext';

export function generationParameters(model: Model, ratio: string, duration: number, extra: Record<string, unknown>) {
  const [w, h] = ratio.split(':').map(Number);
  if (model.provider === 'codex') return { aspect_ratio: ratio, ...extra };
  if (model.provider === 'atlascloud') {
    if (model.modality === 'image') return { size: `${Math.round(1024 * Math.min(1, w / h) / 16) * 16}*${Math.round(1024 * Math.min(1, h / w) / 16) * 16}`, ...extra };
    if (model.modality === 'video') return { ratio, duration, resolution: '720p', ...extra };
  }
  if (model.provider === 'fal' && model.modelId.startsWith('fal-ai/flux/')) return { image_size: { width: Math.round(1024 * Math.min(1, w / h) / 16) * 16, height: Math.round(1024 * Math.min(1, h / w) / 16) * 16 }, ...extra };
  if (model.provider === 'fal' && model.modelId === 'fal-ai/wan/v2.2-a14b/text-to-video') {
    if (!['16:9', '9:16', '1:1'].includes(ratio) || duration < 1 || duration > 10) throw new Error('Wan 2.2 supports 16:9, 9:16 or 1:1 and 1–10 seconds in this preset.');
    return { aspect_ratio: ratio, num_frames: Math.round(duration * 16) + 1, frames_per_second: 16, ...extra };
  }
  return extra;
}
type Kind = 'image' | 'video' | 'music' | 'voice';
export function MediaGenerator({ request, onClose, onSettings }: { request: MediaRequest; onClose: () => void; onSettings: () => void }) {
  const { t } = useI18n();
  const editing = request.intent === 'edit' && request.selection?.modality === 'image';
  const [data, setData] = useState<{ status: GatewayStatus; models: Model[] } | null>(null);
  const [projectId, setProjectId] = useState('');
  const [kind, setKind] = useState<Kind>(request.modality === 'audio' ? 'music' : request.modality ?? 'image');
  const [prompt, setPrompt] = useState(request.prompt ?? ''), [selected, setSelected] = useState('');
  const [ratio, setRatio] = useState('16:9'), [count, setCount] = useState(1);
  const [start, setStart] = useState(request.placement?.start ?? 0), [duration, setDuration] = useState(request.placement?.duration ?? 3);
  const [params, setParams] = useState('{}'), [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [placed, setPlaced] = useState<string[]>([]);
  const [replaced, setReplaced] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 16, bottom: 200, maxHeight: 500 });
  const delivered = useRef(new Set<string>());
  const submission = useRef<{ hash: string; id: string } | null>(null);
  const mediaKind: Modality = kind === 'music' || kind === 'voice' ? 'audio' : kind;
  const activeProjectId = usePlayerStore(s => s.timelineProjectId);
  const activeSession = usePlayerStore(s => s.timelineSessionEpoch);
  const openingSession = useRef({ projectId: activeProjectId, epoch: activeSession });
  useEffect(() => {
    let active = true;
    void Promise.all([loadGateway(), gatewayRequest<{ projectId: string }>('project/status')]).then(([next, status]) => { if (active) { setData(next); setProjectId(status.projectId); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => { void loadGateway().then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); }); };
    window.addEventListener('motion:gateway-changed', refresh);
    return () => { active = false; window.removeEventListener('motion:gateway-changed', refresh); };
  }, []);
  useEffect(() => {
    const update = () => { const rect = document.querySelector('[data-studio-timeline]')?.getBoundingClientRect(); if (rect) { const bottom = Math.max(16, Math.min(window.innerHeight - rect.top + 8, window.innerHeight - 280)); setPosition({ left: Math.max(12, Math.min(request.anchorX ?? rect.left + 10, window.innerWidth - 660)), bottom, maxHeight: window.innerHeight - bottom - 16 }); } };
    update(); window.addEventListener('resize', update);
    const timer = window.setInterval(update, 500);
    return () => { window.removeEventListener('resize', update); clearInterval(timer); };
  }, [request.anchorX]);
  useEffect(() => {
    if (!projectId) return;
    let active = true, pending = false;
    const refresh = async () => {
      if (pending) return; pending = true;
      try {
        const value = await gatewayRequest<{ jobs: GenerationJob[] }>('generations?projectId=' + encodeURIComponent(projectId));
        if (active) {
          setJobs(value.jobs);
          for (const job of value.jobs) if (job.state === 'completed' && job.idempotencyKey?.startsWith(request.id) && !delivered.current.has(job.id)) { delivered.current.add(job.id); request.onComplete?.(job); }
        }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : String(e)); }
      finally { pending = false; }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 1500);
    return () => { active = false; clearInterval(timer); };
  }, [projectId, request]);
  useEffect(() => {
    if (activeProjectId !== openingSession.current.projectId || activeSession !== openingSession.current.epoch) return;
    const previous = usePlayerStore.getState().rangeSelection;
    const owned = { t0: start, t1: start + duration };
    if (request.target?.projectId === activeProjectId) usePlayerStore.setState({ rangeSelection: owned });
    return () => { const now = usePlayerStore.getState(); if (now.timelineProjectId === openingSession.current.projectId && now.timelineSessionEpoch === openingSession.current.epoch && now.rangeSelection === owned) usePlayerStore.setState({ rangeSelection: previous }); };
  }, [request.target, start, duration, activeProjectId, activeSession]);
  const choices = data?.models.filter(m => m.modality === mediaKind && (!editing || m.supportsImageReference) && (kind !== 'voice' || m.mode === 'text-to-speech') && (kind !== 'music' || m.mode !== 'text-to-speech')) ?? [];
  const available = (model: Model) => !!data?.status.providers.find(p => p.id === model.provider)?.available;
  const configuredDefault = editing ? choices.find(m => m.id === data?.status.routes[mediaKind])?.id : data?.status.routes[mediaKind];
  const model = selected ? choices.find(m => m.id === selected) : configuredDefault ? choices.find(m => m.id === configuredDefault) : choices.find(available);
  const supportsShape = model && (model.provider !== 'fal' || model.modelId.startsWith('fal-ai/flux/') || model.modelId === 'fal-ai/wan/v2.2-a14b/text-to-video');
  async function submit() {
    if (!model) return;
    setBusy(true); setError('');
    try {
      if (!Number.isFinite(start) || start < 0 || start > 36000 || !Number.isFinite(duration) || duration < 0.1 || duration > 600) throw new Error(t('Choose a start from 0–36000 seconds and a duration from 0.1–600 seconds'));
      const extra = JSON.parse(params);
      if (!extra || Array.isArray(extra) || typeof extra !== 'object') throw new Error(t('Advanced parameters must be a JSON object'));
      const input = { modality: mediaKind, model: model.id, prompt, projectId, ...(editing ? { referenceAsset: request.selection!.path } : {}), parameters: generationParameters(model, ratio, duration, extra), usage: { ...request.usage, ...(request.target ? { compositionId: request.target.compositionId } : {}), ...(editing ? { elementId: request.selection!.elementId, property: 'src' } : {}) } };
      const hash = JSON.stringify({ ...input, count });
      if (submission.current?.hash !== hash) submission.current = { hash, id: `${request.id}-${crypto.randomUUID()}` };
      for (let index = 0; index < count; index++) {
        const { job } = await generateAsset({ ...input, idempotencyKey: `${submission.current.id}-${index}` });
        setJobs(prev => [job, ...prev.filter(j => j.id !== job.id)]);
      }
      submission.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function place(job: GenerationJob, asset: string) {
    if (!request.target) return;
    setBusy(true); setError('');
    try { const current = await gatewayRequest<{ projectId: string }>('project/status'); if (current.projectId !== job.projectId) throw new Error(t('Switch back to the original project to place this asset'));
      await request.target.place(asset, { start, duration, track: request.placement?.track ?? 0 }); setPlaced(prev => [...prev, asset]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function replace(job: GenerationJob, asset: string) {
    if (!request.target?.replace || !request.selection) return;
    setBusy(true); setError('');
    try {
      const current = await gatewayRequest<{ projectId: string }>('project/status');
      if (current.projectId !== job.projectId) throw new Error(t('Switch back to the original project to place this asset'));
      await request.target.replace(asset, request.selection); setReplaced(asset);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  const nativeProjectId = request.target?.projectId;
  const visibleJobs = editing ? jobs.filter(job => job.reference?.path === request.selection?.path) : jobs;
  return <aside className="motion-generator motion-media-surface" style={position} role="dialog" aria-labelledby="media-generator-title" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') onClose(); }}>
    <header><strong id="media-generator-title">{t(editing ? 'Edit image' : 'Generate media')}</strong><div className="motion-media-row"><button onClick={onSettings}>{t('Model settings')}</button><button className="motion-media-close" aria-label={t('Close media generator')} onClick={onClose}>×</button></div></header>
    {editing ? <div className="motion-media-reference">{request.target && <img alt={t('Reference image')} src={`/api/projects/${encodeURIComponent(request.target.projectId)}/preview/${request.selection!.path}`} />}<span>{request.selection!.label}<small>{t('Uses the original image as a reference. Choose a result to replace it.')}</small></span></div> : <div className="motion-media-tabs">{(['image', 'video', 'music', 'voice'] as Kind[]).map(value => <button key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setSelected(''); if (value === 'video' && duration < 4) setDuration(5); }}>{t({ image: 'Image', video: 'Video', music: 'Music', voice: 'Voice' }[value])}</button>)}</div>}
    <textarea autoFocus aria-label={t('Describe your media')} placeholder={t(editing ? 'Describe how to change this image…' : 'Describe what goes here…')} maxLength={20000} value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} />
    <div className="motion-media-columns"><label>{t('Model')}<select value={model?.id ?? ''} onChange={event => setSelected(event.target.value)} aria-label={t('Generation model')}>
      {!model && <option value="">{t('Choose a model')}</option>}{choices.map(m => <option key={m.id} value={m.id}>{m.label} · {m.provider}{available(m) ? '' : ` · ${t('Unavailable')}`}</option>)}
    </select></label>{mediaKind !== 'audio' && <label>{t('Shape')}<select disabled={!supportsShape} title={supportsShape ? undefined : t('Set model-specific options in advanced parameters')} value={ratio} onChange={event => setRatio(event.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option><option>4:3</option><option>3:4</option></select></label>}
    <label>{t('How many')}<select value={count} onChange={event => setCount(Number(event.target.value))}>{[1, 2, 3, 4].map(n => <option key={n}>{n}</option>)}</select></label></div>
    <div className="motion-media-columns motion-media-placement"><label>{t('Start (seconds)')}<input type="number" disabled={editing} min={0} max={36000} step={0.1} value={start} onChange={event => setStart(Math.max(0, Number(event.target.value)))} /></label><label>{t('Duration (seconds)')}<input type="number" disabled={editing} min={0.1} max={600} step={0.1} value={duration} onChange={event => setDuration(Math.max(0.1, Number(event.target.value)))} /></label></div>
    <details><summary>{t('Advanced parameters (JSON)')}</summary><textarea aria-label={t('Advanced parameters (JSON)')} value={params} rows={2} spellCheck={false} onChange={event => setParams(event.target.value)} /></details>
    {error && <p role="alert" className="motion-media-error">{error}</p>}
    <footer><span className="motion-media-muted">{model?.provider === 'codex' ? t('Uses your local Codex account') : t('Uses your provider account')}{request.target && ` · ${start.toFixed(1)}–${(start + duration).toFixed(1)}s`}</span><button className="motion-media-primary" disabled={busy || !prompt.trim() || !projectId || !model || !available(model)} onClick={() => void submit()}>{busy ? t('Working…') : t('Generate')}</button></footer>
    {data && (!model || !available(model)) && <button className="motion-media-connect" onClick={onSettings}>{t('Connect a provider to generate this media')}</button>}
    {visibleJobs.length > 0 && <div className="motion-generation-results" aria-live="polite">{visibleJobs.slice(0, 8).map(job => <article key={job.id}>
      <div className="motion-media-row"><span title={job.prompt}>{job.model.label} <small>{t(job.state)}</small></span>{['queued', 'running'].includes(job.state) && <button onClick={() => void gatewayRequest(`generations/${job.id}/cancel`, 'POST', {}).then(() => setJobs(prev => prev.map(j => j.id === job.id ? { ...j, state: 'cancelled' } : j))).catch(e => setError(e.message))}>{t('Cancel')}</button>}</div>
      {job.error && <p className="motion-media-error">{job.error}</p>}
      {job.assets.map(asset => <div className="motion-generated-asset" key={asset.path}>
        {asset.available !== false && nativeProjectId && asset.mimeType.startsWith('image/') && <img alt={job.prompt} src={`/api/projects/${encodeURIComponent(nativeProjectId)}/preview/${asset.path}`} />}
        <span><strong>{asset.path.split('/').pop()}</strong><small>{t(asset.available === false ? 'File moved or removed · check the media library' : 'Saved to project assets')}</small></span>
        <div className="motion-generated-actions">{editing && request.target?.replace && asset.mimeType.startsWith('image/') && <button className="motion-media-primary" disabled={busy || asset.available === false || !!replaced} onClick={() => void replace(job, asset.path)}>{t(replaced === asset.path ? 'Replaced · undo in timeline' : 'Replace selected image')}</button>}
        {request.target && <button disabled={busy || asset.available === false || placed.includes(asset.path)} onClick={() => void place(job, asset.path)}>{t(placed.includes(asset.path) ? 'Placed' : 'Place on timeline')}</button>}</div>
      </div>)}
    </article>)}</div>}
  </aside>;
}
