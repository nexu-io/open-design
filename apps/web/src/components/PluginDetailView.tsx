// Plan G4 / spec §11.6 — Marketplace plugin detail.
//
// Renders one plugin's manifest, capability checklist, declared GenUI
// surfaces and connector requirements, plus a "Use this plugin"
// button that hydrates a fresh ApplyResult. The user lands back on
// Home where the PluginLoopHome surface (or ChatComposer once a
// project is created) consumes the applied snapshot — applyPlugin
// returns the exact ApplyResult those hosts already hydrate from.

import { useEffect, useState } from 'react';
import type { ApplyResult, InstalledPluginRecord } from '@open-design/contracts';
import { applyPlugin } from '../state/projects';
import { navigate } from '../router';
import { useI18n } from '../i18n';

interface Props {
  pluginId: string;
}

export function PluginDetailView(props: Props) {
  const { locale } = useI18n();
  const [plugin, setPlugin] = useState<InstalledPluginRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<ApplyResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/plugins/${encodeURIComponent(props.pluginId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((row) => {
        if (cancelled) return;
        setPlugin(row as InstalledPluginRecord);
      })
      .catch((err) => {
        if (cancelled) return;
        setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [props.pluginId]);

  if (error) {
    return (
      <div className="plugin-detail" data-testid="plugin-detail">
        <button type="button" onClick={() => navigate({ kind: 'marketplace' })}>
          ← Marketplace
        </button>
        <div role="alert">Failed to load plugin: {error}</div>
      </div>
    );
  }

  if (!plugin) {
    return (
      <div className="plugin-detail" data-testid="plugin-detail">
        <div>Loading plugin…</div>
      </div>
    );
  }

  const od = plugin.manifest?.od ?? {};
  const surfaces = od.genui?.surfaces ?? [];
  const required = od.connectors?.required ?? [];
  const optional = od.connectors?.optional ?? [];
  const capabilities = od.capabilities ?? [];
  // Plan §6 Phase 2B / spec §11.6 — show a sandboxed iframe of the
  // plugin's preview entry when one is declared. The daemon serves
  // it under `/api/plugins/:id/preview` with the §9.2 CSP +
  // sandbox="allow-scripts" envelope; we only hint here that a
  // preview is available.
  const hasPreview = typeof od.preview?.entry === 'string' && od.preview.entry.length > 0;
  const examples = (od.useCase?.exampleOutputs ?? []) as Array<{
    path: string;
    title?: string;
  }>;

  const onUse = async () => {
    setApplying(true);
    setError(null);
    const result = await applyPlugin(plugin.id, { locale });
    setApplying(false);
    if (!result) {
      setError('Apply failed. Make sure the daemon is reachable.');
      return;
    }
    setApplied(result);
    // Navigate to Home so the PluginLoopHome surface picks up the
    // applied snapshot. Inside an existing project, the ChatComposer
    // mount of PluginsSection consumes the same ApplyResult.
    navigate({ kind: 'home', view: 'home' });
  };

  return (
    <div className="plugin-detail" data-testid="plugin-detail">
      <button
        type="button"
        className="plugin-detail__back"
        onClick={() => navigate({ kind: 'marketplace' })}
      >
        ← Marketplace
      </button>

      <header className="plugin-detail__header">
        <h1>{plugin.title}</h1>
        <div className="plugin-detail__meta">
          <span>v{plugin.version}</span>
          <span>trust: {plugin.trust}</span>
          <span>source: {plugin.sourceKind}</span>
          {od.taskKind ? <span>{od.taskKind}</span> : null}
        </div>
      </header>

      {plugin.manifest?.description ? (
        <p className="plugin-detail__description">{plugin.manifest.description}</p>
      ) : null}

      <section className="plugin-detail__capabilities">
        <h2>Capabilities</h2>
        {capabilities.length === 0 ? (
          <div>None declared (defaults to <code>prompt:inject</code>).</div>
        ) : (
          <ul>
            {capabilities.map((c: string) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      {required.length > 0 || optional.length > 0 ? (
        <section className="plugin-detail__connectors">
          <h2>Connectors</h2>
          {required.length > 0 ? (
            <>
              <h3>Required</h3>
              <ul>
                {required.map((c: { id: string; tools?: string[] }) => (
                  <li key={c.id}>
                    <code>{c.id}</code>
                    {c.tools && c.tools.length > 0 ? ` · ${c.tools.join(', ')}` : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {optional.length > 0 ? (
            <>
              <h3>Optional</h3>
              <ul>
                {optional.map((c: { id: string; tools?: string[] }) => (
                  <li key={c.id}>
                    <code>{c.id}</code>
                    {c.tools && c.tools.length > 0 ? ` · ${c.tools.join(', ')}` : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {hasPreview ? (
        <section className="plugin-detail__preview" data-testid="plugin-detail-preview-section">
          <h2>Preview</h2>
          <iframe
            title={`${plugin.title} preview`}
            src={`/api/plugins/${encodeURIComponent(plugin.id)}/preview`}
            sandbox="allow-scripts"
            className="plugin-detail__preview-frame"
            data-testid="plugin-detail-preview-iframe"
            style={{
              width: '100%',
              minHeight: 360,
              border: '1px solid var(--od-border, #ddd)',
              borderRadius: 6,
              background: '#fff',
            }}
          />
        </section>
      ) : null}

      {examples.length > 0 ? (
        <section className="plugin-detail__examples" data-testid="plugin-detail-examples-section">
          <h2>Examples</h2>
          <ul>
            {examples.map((e, idx) => {
              const base = e.path.split(/[\\/]/).filter(Boolean).pop() ?? `${idx}`;
              const stem = base.replace(/\.[^.]+$/, '');
              const name = e.title ?? stem;
              return (
                <li key={`${e.path}-${idx}`}>
                  <a
                    href={`/api/plugins/${encodeURIComponent(plugin.id)}/example/${encodeURIComponent(stem)}`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`plugin-detail-example-${stem}`}
                  >
                    {name}
                  </a>
                  {e.title && e.title !== stem ? (
                    <span style={{ marginLeft: '0.5em', color: 'var(--od-muted, #888)' }}>
                      <code>{stem}</code>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {surfaces.length > 0 ? (
        <section className="plugin-detail__surfaces">
          <h2>This plugin may ask you</h2>
          <ul>
            {surfaces.map((s: { id: string; kind: string; persist?: string; prompt?: string }) => (
              <li key={s.id}>
                <code>{s.kind}</code> · <code>{s.id}</code>
                {s.persist ? <> · persists at <code>{s.persist}</code></> : null}
                {s.prompt ? <> — {s.prompt}</> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="plugin-detail__footer">
        <button
          type="button"
          className="plugin-detail__use"
          onClick={onUse}
          disabled={applying}
          data-testid="plugin-detail-use"
        >
          {applying ? 'Applying…' : 'Use this plugin'}
        </button>
        {applied ? (
          <div className="plugin-detail__applied">
            Applied (snapshot {applied.appliedPlugin.snapshotId.slice(0, 8)}…) —
            redirected to Home with the brief pre-filled.
          </div>
        ) : null}
      </footer>
    </div>
  );
}
