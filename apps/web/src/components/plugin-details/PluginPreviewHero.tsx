// Hero preview surface for the PluginDetailsModal.
//
// Renders example outputs declared in the manifest's
// `od.useCase.exampleOutputs[]` as a sandboxed iframe inside a
// browser-chrome frame, with a tab pill row when more than one
// example exists. The daemon serves each example via
// `/api/plugins/:id/example/:name` with the §9.2 CSP +
// `sandbox="allow-scripts"` envelope, so the preview is safe to
// embed inline. When the plugin ships no examples we render
// nothing (the modal hides the hero entirely).

import { useMemo, useState } from 'react';
import { Icon } from '../Icon';

export interface PluginExampleEntry {
  path: string;
  title?: string;
}

interface Props {
  pluginId: string;
  pluginTitle: string;
  examples: PluginExampleEntry[];
}

interface NormalizedExample {
  key: string;
  name: string;
  stem: string;
  href: string;
}

export function PluginPreviewHero({ pluginId, pluginTitle, examples }: Props) {
  const items = useMemo<NormalizedExample[]>(
    () => examples.map((e, idx) => normalize(pluginId, e, idx)),
    [pluginId, examples],
  );
  const [activeKey, setActiveKey] = useState<string | null>(
    items[0]?.key ?? null,
  );

  if (items.length === 0) return null;

  const active = items.find((it) => it.key === activeKey) ?? items[0]!;

  return (
    <section
      className="plugin-details-modal__hero"
      data-testid="plugin-details-hero"
    >
      <div className="plugin-details-modal__hero-head">
        <div className="plugin-details-modal__hero-eyebrow">
          <span className="plugin-details-modal__hero-dot" aria-hidden />
          What it produces
        </div>
        {items.length > 1 ? (
          <div
            className="plugin-details-modal__hero-tabs"
            role="tablist"
            aria-label="Example outputs"
          >
            {items.map((it) => {
              const isActive = it.key === active.key;
              return (
                <button
                  key={it.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`plugin-details-modal__hero-tab${isActive ? ' is-active' : ''}`}
                  onClick={() => setActiveKey(it.key)}
                >
                  {it.name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="plugin-details-modal__hero-frame">
        <div className="plugin-details-modal__hero-chrome">
          <span
            className="plugin-details-modal__hero-light is-red"
            aria-hidden
          />
          <span
            className="plugin-details-modal__hero-light is-yellow"
            aria-hidden
          />
          <span
            className="plugin-details-modal__hero-light is-green"
            aria-hidden
          />
          <div
            className="plugin-details-modal__hero-url"
            title={active.name}
          >
            <Icon name="eye" size={11} />
            <span>{active.name}</span>
          </div>
          <a
            className="plugin-details-modal__hero-popout"
            href={active.href}
            target="_blank"
            rel="noreferrer"
            title="Open this example in a new tab"
            data-testid="plugin-details-hero-popout"
          >
            <Icon name="external-link" size={12} />
            <span>Open</span>
          </a>
        </div>
        <iframe
          key={active.key}
          title={`${pluginTitle} — ${active.name}`}
          src={active.href}
          sandbox="allow-scripts"
          loading="lazy"
          className="plugin-details-modal__hero-iframe"
          data-testid="plugin-details-hero-iframe"
        />
      </div>
    </section>
  );
}

function normalize(
  pluginId: string,
  entry: PluginExampleEntry,
  index: number,
): NormalizedExample {
  const segments = entry.path.split(/[\\/]/).filter(Boolean);
  const base = segments[segments.length - 1] ?? `${index}`;
  const stem = base.replace(/\.[^.]+$/, '');
  const name = entry.title ?? stem;
  const href = `/api/plugins/${encodeURIComponent(pluginId)}/example/${encodeURIComponent(stem)}`;
  return { key: `${entry.path}-${index}`, name, stem, href };
}
