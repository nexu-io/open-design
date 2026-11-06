import { useEffect, useRef, useState } from 'react';
import { formatTemplateViews, type GalleryTemplate, type TemplatePage } from '../../../shared/catalog';
import { hostNames, templatePrompt, type IntegrationHost, type IntegrationInfo } from '../../../shared/integration';
import { useI18n } from '../i18n/I18n';
import { MotionIcon } from './icons';
import { motionApi } from './useWorkspace';
import { useWorkspaceChrome } from './WorkspaceFrame';

const categories = [
  ['builtin', 'Ready to edit'], ['featured', 'Featured references'], ['ads', 'Product promos'],
  ['motion', 'Motion design'], ['script', 'Talking head'], ['all', 'All templates'],
] as const;

export function HomeTemplates({ onSelect }: { onSelect?: (template: GalleryTemplate) => void }) {
  const { t } = useI18n();
  const { workspace, switchingDisabled } = useWorkspaceChrome();
  const [category, setCategory] = useState<string>('builtin');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [attempt, retry] = useState(0);
  const [page, setPage] = useState<TemplatePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [manualCopy, setManualCopy] = useState('');
  const [info, setInfo] = useState<IntegrationInfo | null>(null);
  const [host, setHost] = useState<IntegrationHost>('codex');
  const [preview, setPreview] = useState<GalleryTemplate | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      const params = new URLSearchParams({ category, query, offset: String(offset), limit: '6', grouped: 'true', covered: 'true' });
      void motionApi<TemplatePage>('/template-catalog?' + params, { signal: controller.signal }).then(next => {
        if (!controller.signal.aborted) setPage(previous => offset && previous ? { ...next, items: [...previous.items, ...next.items] } : next);
      }).catch(err => { if (!controller.signal.aborted) setError((err as Error).message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, query ? 180 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [category, query, offset, attempt]);
  useEffect(() => {
    if (onSelect) return;
    const controller = new AbortController();
    void motionApi<IntegrationInfo>('/integration', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setInfo(data);
    }).catch(() => {});
    return () => controller.abort();
  }, [onSelect]);
  function filter(nextCategory: string, nextQuery = query) {
    setCategory(nextCategory); setQuery(nextQuery); setOffset(0); setPage(null); setLoading(true); setFeedback(''); setManualCopy('');
  }
  async function copy(template: GalleryTemplate) {
    setFeedback(''); setManualCopy('');
    try {
      const connection = info ?? await motionApi<IntegrationInfo>('/integration');
      setInfo(connection);
      const prompt = templatePrompt(connection, host, template);
      try {
        await navigator.clipboard.writeText(prompt);
        setFeedback(t('Copied. Send it to {agent} to recreate this template.', { agent: hostNames[host] }));
      } catch {
        setManualCopy(prompt); setFeedback(t('Copy the instruction below and send it to your Agent.'));
      }
    } catch (err) { setFeedback((err as Error).message); }
  }
  function action(template: GalleryTemplate) {
    if (onSelect) { if (!switchingDisabled) { setPreview(null); onSelect(template); } return; }
    if (template.kind === 'builtin') { if (!switchingDisabled) { setPreview(null); void workspace.open('templates', template.id); } }
    else void copy(template);
  }
  return <section className="motion-home-templates" aria-labelledby="home-template-title">
    <div className="motion-section-heading"><h2 id="home-template-title">{t('Templates')}</h2><MotionIcon name="sparkles" size={20} /></div>
    <div className="motion-template-toolbar">
      <div className="motion-template-filters" role="group" aria-label={t('Template categories')}>
        {categories.map(([id, label]) => <button key={id} aria-pressed={category === id} onClick={() => filter(id)}>{id === 'builtin' && <MotionIcon name="scissors" size={14} />}{t(label)}</button>)}
      </div>
      <label className="motion-template-search"><MotionIcon name="search" /><input type="search" maxLength={200} value={query} placeholder={t('Search templates…')} aria-label={t('Search templates')} onChange={event => filter(category, event.target.value)} /></label>
    </div>
    {category !== 'builtin' && !onSelect && <label className="motion-template-agent">{t('Copy instruction for')}<select aria-label={t('Agent for template instructions')} value={host} onChange={event => setHost(event.target.value as IntegrationHost)}>{(['codex', 'claude', 'deepseek', 'mcp'] as const).map(id => <option key={id} value={id}>{hostNames[id]}</option>)}</select></label>}
    {feedback && <p className="motion-template-feedback" role="status">{feedback}</p>}
    {manualCopy && <textarea className="motion-manual-copy" aria-label={t('Template instruction')} readOnly value={manualCopy} onFocus={event => event.target.select()} />}
    <div className="motion-template-grid" aria-busy={loading}>
      {page?.items.map(template => <article className="motion-home-template" key={template.id} data-template-id={template.id}>
        <button className="motion-template-cover" onClick={() => setPreview(template)} aria-label={t('Preview {title}', { title: template.title })}>
          {template.posterUrl && <img src={template.posterUrl} alt={template.title} loading="lazy" />}
          <span className="motion-template-duration">{template.duration != null ? `${template.duration}s` : template.ratio}</span>
          {template.kind === 'builtin' && <span className="motion-editable-badge"><MotionIcon name="scissors" size={12} />{t('Ready to edit')}</span>}
          <span className="motion-template-preview-hint"><MotionIcon name="eye" />{t('Preview')}</span>
        </button>
        <div className="motion-template-info"><h3>{template.title}</h3>
          <div className="motion-template-footer"><div><a href={template.sourceUrl} target="_blank" rel="noreferrer">{template.authorName || template.author}<MotionIcon name="arrow-up-right" size={11} /></a>{template.social && <small title={`${template.social.platform} · ${template.social.views} · ${template.social.syncedAt}`}>{formatTemplateViews(template.social.views)} {t('views')}</small>}</div>
            <button className="motion-button" disabled={(Boolean(onSelect) || template.kind === 'builtin') && switchingDisabled} onClick={() => action(template)}><MotionIcon name={onSelect ? 'plus' : template.kind === 'builtin' ? 'scissors' : 'copy'} size={14} />{t(onSelect ? 'Use template' : template.kind === 'builtin' ? 'Open and edit' : 'Copy to recreate')}</button>
          </div>
        </div>
      </article>)}
    </div>
    {loading && <p className="motion-home-empty" role="status">{t('Loading templates…')}</p>}
    {error && <div className="motion-home-empty" role="alert">{error} <button className="motion-button" onClick={() => retry(value => value + 1)}>{t('Retry')}</button></div>}
    {!loading && !error && page?.items.length === 0 && <p className="motion-home-empty">{t('No matching templates. Try another name or category.')}</p>}
    {page?.next != null && !error && <button className="motion-button motion-more-templates" disabled={loading} onClick={() => setOffset(page.next!)}>{t('More templates')}<MotionIcon name="arrow-right" /></button>}
    {preview && <TemplatePreview template={preview} selecting={Boolean(onSelect)} busy={switchingDisabled} onClose={() => setPreview(null)} onAction={action} feedback={feedback} manualCopy={manualCopy} />}
  </section>;
}

function TemplatePreview({ template, selecting, busy, onClose, onAction, feedback, manualCopy }: { template: GalleryTemplate; selecting: boolean; busy: boolean; onClose: () => void; onAction: (template: GalleryTemplate) => void; feedback: string; manualCopy: string }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(template);
  const [failed, setFailed] = useState(false);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog className="motion-template-dialog" ref={dialog} aria-labelledby="home-preview-title" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header><h2 id="home-preview-title">{selected.title}</h2><button className="motion-icon-button" aria-label={t('Close preview')} onClick={onClose}><MotionIcon name="close" /></button></header>
    <div className="motion-template-preview-stage">
      {selected.previewUrl ? <video key={selected.id} controls playsInline preload="metadata" poster={selected.posterUrl} src={selected.previewUrl} onError={() => setFailed(true)} aria-label={selected.title} /> : <img src={selected.posterUrl} alt={selected.title} />}
    </div>
    <div className="motion-template-preview-details">
      {failed && <p role="status">{t('Preview unavailable. You can still use the template instruction.')}</p>}
      {template.variants && <label>{t('Versions')}<select aria-label={t('Template version')} value={selected.id} onChange={event => { setSelected(template.variants!.find(item => item.id === event.target.value)!); setFailed(false); }}>{template.variants.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      <p>{selected.description || selected.subtitle}</p>
      <div className="motion-template-footer"><a href={selected.sourceUrl} target="_blank" rel="noreferrer">{selected.authorName || selected.author}<MotionIcon name="arrow-up-right" size={13} /></a><button className="motion-button motion-button-primary" disabled={(selecting || selected.kind === 'builtin') && busy} onClick={() => onAction(selected)}>{t(selecting ? 'Use template' : selected.kind === 'builtin' ? 'Open and edit' : 'Copy to recreate')}</button></div>
      {feedback && <p role="status">{feedback}</p>}{manualCopy && <textarea className="motion-manual-copy" aria-label={t('Template instruction')} readOnly value={manualCopy} onFocus={event => event.target.select()} />}
    </div>
  </dialog>;
}
