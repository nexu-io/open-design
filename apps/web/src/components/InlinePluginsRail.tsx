// Plan §3.C2 / spec §8 — inline plugins rail.
//
// Compact card strip rendered directly under the input box on
// NewProjectPanel and inside ChatComposer (Phase 2B follow-up).
// Clicking a card calls applyPlugin() and pushes the resulting
// ApplyResult upstream; the parent decides what to do with it
// (hydrate the brief, show the input form, etc.).

import { useEffect, useState } from 'react';
import type {
  ApplyResult,
  InstalledPluginRecord,
} from '@open-design/contracts';
import { applyPlugin, listPlugins } from '../state/projects';
import { useI18n } from '../i18n';

interface Props {
  // Active project the apply will be scoped to. Omit on Home (the
  // pre-create flow); ChatComposer passes the current project id so
  // the snapshot is bound to that scope.
  projectId?: string | null;
  // Variant: 'wide' for Home / NewProjectPanel; 'strip' for the slim
  // ChatComposer overflow row.
  variant?: 'wide' | 'strip';
  // Filter the rail to a specific taskKind / mode (Phase 2B). When
  // unspecified the daemon-wide list is shown. `kinds` is a whitelist
  // applied to `od.kind` so the ChatComposer rail can hide bundled
  // atoms (which only the pipeline calls) and only surface user-facing
  // skill / scenario plugins. `pluginIds` is a hard id whitelist used
  // when the project is bound to a single applied plugin — the rail
  // collapses to that one card so the composer reflects the choice
  // the user made on Home instead of re-offering every installed
  // plugin (the user reported "选了 new-generation, 结果 composer 显示
  // 了多个 plugin").
  filter?: {
    taskKind?: string;
    mode?: string;
    kinds?: string[];
    pluginIds?: string[];
  };
  // Notification: a plugin was applied. The parent owns hydration of
  // the brief / inputs form / chip strip from `result`.
  onApplied: (record: InstalledPluginRecord, result: ApplyResult) => void;
}

export function InlinePluginsRail(props: Props) {
  const { locale } = useI18n();
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listPlugins().then((rows) => {
      if (cancelled) return;
      setPlugins(filterPlugins(rows, props.filter));
    });
    return () => {
      cancelled = true;
    };
  }, [
    props.filter?.taskKind,
    props.filter?.mode,
    props.filter?.kinds?.join(','),
    props.filter?.pluginIds?.join(','),
  ]);

  const onClick = async (record: InstalledPluginRecord) => {
    setPendingId(record.id);
    setError(null);
    const result = await applyPlugin(record.id, {
      ...(props.projectId ? { projectId: props.projectId } : {}),
      locale,
    });
    setPendingId(null);
    if (!result) {
      setError(
        `Failed to apply ${record.title}. Make sure the daemon is reachable.`,
      );
      return;
    }
    props.onApplied(record, result);
  };

  if (plugins.length === 0) {
    return null;
  }

  const className =
    props.variant === 'strip'
      ? 'inline-plugins-rail inline-plugins-rail--strip'
      : 'inline-plugins-rail inline-plugins-rail--wide';

  return (
    <div className={className} role="list">
      {plugins.map((p) => (
        <button
          key={p.id}
          type="button"
          role="listitem"
          className="inline-plugins-rail__card"
          onClick={() => onClick(p)}
          disabled={pendingId !== null}
          aria-busy={pendingId === p.id ? 'true' : undefined}
          data-plugin-id={p.id}
          title={p.manifest?.description ?? p.title}
        >
          <div className="inline-plugins-rail__title">{p.title}</div>
          {p.manifest?.description ? (
            <div className="inline-plugins-rail__desc">{p.manifest.description}</div>
          ) : null}
          <div className="inline-plugins-rail__trust">trust: {p.trust}</div>
        </button>
      ))}
      {error ? (
        <div role="alert" className="inline-plugins-rail__error">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function filterPlugins(
  rows: InstalledPluginRecord[],
  filter: Props['filter'],
): InstalledPluginRecord[] {
  if (!filter) return rows;
  return rows.filter((r) => {
    // pluginIds is a hard whitelist — when present, every other filter
    // becomes secondary. Used by ChatComposer to collapse the rail to
    // the single plugin pinned to the project.
    if (filter.pluginIds && filter.pluginIds.length > 0) {
      if (!filter.pluginIds.includes(r.id)) return false;
    }
    if (filter.taskKind && r.manifest?.od?.taskKind !== filter.taskKind) {
      return false;
    }
    if (filter.mode && r.manifest?.od?.mode !== filter.mode) {
      return false;
    }
    if (filter.kinds && filter.kinds.length > 0) {
      const k = r.manifest?.od?.kind;
      if (!k || !filter.kinds.includes(k)) return false;
    }
    return true;
  });
}
