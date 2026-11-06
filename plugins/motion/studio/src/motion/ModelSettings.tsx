import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n';
import { gatewayRequest, loadGateway, type GatewayStatus, type Model, type Modality } from './gatewayClient';

export function ModelSettings({ onClose }: { onClose: () => void }) {
  const { t } = useI18n(); const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<{ status: GatewayStatus; models: Model[] } | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [query, setQuery] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  useEffect(() => { let active = true; void loadGateway().then(value => { if (active) setData(value); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, []);
  async function change(action: () => Promise<unknown>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setData(await loadGateway()); window.dispatchEvent(new Event('motion:gateway-changed')); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const kindLabel = (kind: Modality) => t(kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : 'Audio');
  const filtered = data?.models.filter(m => `${m.label} ${m.modelId}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <dialog ref={dialog} className="motion-model-dialog motion-media-surface" aria-labelledby="model-settings-title" onKeyDown={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><small>MODEL GATEWAY</small><h2 id="model-settings-title">{t('Model settings')}</h2></div><button className="motion-media-close" onClick={onClose} aria-label={t('Close model settings')}>×</button></header>
    <p className="motion-media-muted">{t('Connect your local Agent or add a provider key. Studio and MCP share these capabilities.')}</p>
    {error && <p role="alert" className="motion-media-error">{error}</p>}
    {!data && !error && <p role="status">{t('Detecting local capabilities…')}</p>}
    {data && <>
      <section className="motion-provider-grid">
        {data.status.providers.map(provider => <article key={provider.id} className="motion-provider-card">
          <div className="motion-media-row"><strong>{provider.label}</strong><label className="motion-media-toggle"><input type="checkbox" checked={provider.enabled} disabled={busy} aria-label={t('Enable {provider}', { provider: provider.label })} onChange={e => void change(() => gatewayRequest(`models/providers/${provider.id}`, 'PUT', { enabled: e.target.checked }))} />{t('Enabled')}</label></div>
          <span className="motion-capability-badge" data-available={provider.available}>{t(provider.available ? 'Ready to request' : 'Unavailable')}</span>
          <p className="motion-media-muted">{t(provider.reason)}</p>
          {provider.id === 'codex' ? <button disabled={busy} onClick={() => void change(() => gatewayRequest('models/capabilities?refresh=true'))}>{t('Detect again')}</button> : <>
            <label>{t('API key')}<input type="password" autoComplete="off" spellCheck={false} aria-label={`${provider.label} API key`} value={keys[provider.id] ?? ''} placeholder={provider.configured ? t('Key saved · enter to replace') : t('Paste your API key')} onChange={event => setKeys(prev => ({ ...prev, [provider.id]: event.target.value }))} /></label>
            <div className="motion-media-row"><button disabled={busy || !keys[provider.id]?.trim()} onClick={() => void change(async () => { await gatewayRequest(`models/providers/${provider.id}`, 'PUT', { apiKey: keys[provider.id].trim(), enabled: true }); setKeys(prev => ({ ...prev, [provider.id]: '' })); })}>{t('Save key')}</button>
              {provider.credentialSource === 'stored' && <button disabled={busy} onClick={() => void change(() => gatewayRequest(`models/providers/${provider.id}`, 'PUT', { apiKey: null }))}>{t('Remove saved key')}</button>}
            </div>
            <small className="motion-media-muted">{t(provider.credentialSource === 'environment' ? 'Using environment key' : 'Keys stay on this computer and are never returned by the API.')}</small>
          </>}
        </article>)}
      </section>
      <section className="motion-model-routes"><h3>{t('Default models')}</h3><div className="motion-media-columns">
        {(['image', 'video', 'audio'] as Modality[]).map(kind => <label key={kind}>{kindLabel(kind)}<select aria-label={t('Default {kind} model', { kind: kindLabel(kind) })} disabled={busy} value={data.status.routes[kind] ?? ''} onChange={event => void change(() => gatewayRequest(`models/routes/${kind}`, 'PUT', { model: event.target.value || null }))}>
          <option value="">{t('Automatic · local Agent first')}</option>{data.models.filter(m => m.modality === kind).map(model => <option key={model.id} value={model.id}>{model.label} · {model.provider}</option>)}
        </select></label>)}
      </div></section>
      <section><div className="motion-media-row"><h3>{t('Model catalogue')}</h3><button disabled={busy} onClick={() => void change(async () => { const result = await gatewayRequest<{ warnings: string[] }>('models?refresh=true&query=' + encodeURIComponent(query)); setNotice(result.warnings.map(w => t(w)).join(' · ') || t('Model catalogue refreshed')); })}>{busy ? t('Working…') : t('Discover models')}</button></div>
        <input type="search" aria-label={t('Search models')} placeholder={t('Search models')} value={query} onChange={e => setQuery(e.target.value)} />
        {notice && <p role="status" className="motion-media-muted">{notice}</p>}
        <div className="motion-model-list">{filtered.slice(0, 100).map(model => <div key={model.id}><span><strong>{model.label}</strong><small>{model.modelId}</small></span><span>{kindLabel(model.modality)} · {model.provider}<small>{t(model.source === 'live' ? 'Live catalogue' : model.source === 'custom' ? 'Custom model' : 'Built-in catalogue')}</small></span></div>)}</div>
        <details className="motion-custom-model"><summary>{t('Add a model by endpoint ID')}</summary><form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void change(async () => { const kind = String(values.get('modality')); await gatewayRequest('models/custom', 'POST', { provider: values.get('provider'), modelId: values.get('modelId'), label: values.get('label'), modality: kind, mode: values.get('mode') || `text-to-${kind}` }); form.reset(); }); }}>
          <div className="motion-media-columns"><label>{t('Provider')}<select name="provider"><option value="atlascloud">Atlas Cloud</option><option value="fal">fal.ai</option></select></label><label>{t('Type')}<select name="modality"><option value="image">{t('Image')}</option><option value="video">{t('Video')}</option><option value="audio">{t('Audio')}</option></select></label></div>
          <label>{t('Model name')}<input name="label" required maxLength={180} /></label><label>{t('Endpoint ID')}<input name="modelId" required maxLength={180} placeholder="fal-ai/flux/schnell" /></label><label>{t('Generation mode')}<input name="mode" placeholder="text-to-image" /></label><button disabled={busy}>{t('Add model')}</button>
        </form></details>
      </section>
    </>}
  </dialog>;
}
