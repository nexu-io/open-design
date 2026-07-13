// Phase 4 / spec §11.5 / plan §3.BB2 — snapshot diff helper.
//
// Pure helper that compares two AppliedPluginSnapshot values and
// returns a structured report. Useful for:
//
//   - debugging replay invariance ('e2e-2: applying the same plugin
//     twice produces byte-equal digests'),
//   - inspecting why a re-apply produced a different snapshot
//     ('did the resolved skills change between turns?'),
//   - comparing the snapshot a run launched against vs. the live
//     plugin's current apply.
//
// Sister of plugins/diff.ts (which compares InstalledPluginRecord
// values). The shape is intentionally identical so renderers reuse
// the same +/-/~ glyph format.

import type { AppliedPluginSnapshot } from '@open-design/contracts';

export interface SnapshotDiffEntry {
  field:    string;
  kind:     'added' | 'removed' | 'changed';
  before?:  string;
  after?:   string;
  summary?: string;
}

export interface SnapshotDiffReport {
  // Same id when both sides share an id; otherwise inferred missing.
  pluginId?: string;
  // Were the two snapshots' manifestSourceDigests equal? Surfaces
  // the e2e-2 invariance check at-a-glance.
  digestEqual: boolean;
  entries:     SnapshotDiffEntry[];
  added:       number;
  removed:     number;
  changed:     number;
}

export interface DiffSnapshotsInput {
  a: AppliedPluginSnapshot;
  b: AppliedPluginSnapshot;
}

export function diffSnapshots(input: DiffSnapshotsInput): SnapshotDiffReport {
  const { a, b } = input;
  const entries: SnapshotDiffEntry[] = [];

  // Identity + lineage.
  diffScalar(entries, 'snapshotId',           a.snapshotId,           b.snapshotId);
  diffScalar(entries, 'pluginId',             a.pluginId,             b.pluginId);
  diffScalar(entries, 'pluginSpecVersion',    a.pluginSpecVersion,    b.pluginSpecVersion);
  diffScalar(entries, 'pluginVersion',        a.pluginVersion,        b.pluginVersion);
  diffScalar(entries, 'manifestSourceDigest', a.manifestSourceDigest, b.manifestSourceDigest);
  diffScalar(entries, 'sourceMarketplaceId',  a.sourceMarketplaceId,  b.sourceMarketplaceId);
  diffScalar(entries, 'pinnedRef',            a.pinnedRef,            b.pinnedRef);
  diffScalar(entries, 'taskKind',             a.taskKind,             b.taskKind);
  diffScalar(entries, 'status',               a.status,               b.status);
  diffScalar(entries, 'pluginTitle',          a.pluginTitle,          b.pluginTitle);
  diffScalar(entries, 'pluginDescription',    a.pluginDescription,    b.pluginDescription);
  diffScalar(entries, 'query',                a.query,                b.query);

  // Inputs (typed scalar map).
  diffMap(entries, 'inputs', recordToStringMap(a.inputs), recordToStringMap(b.inputs));

  // Capabilities.
  diffArray(entries, 'capabilitiesRequired', a.capabilitiesRequired, b.capabilitiesRequired);
  diffArray(entries, 'capabilitiesGranted',  a.capabilitiesGranted,  b.capabilitiesGranted);

  // Resolved context items (compare by ref, the digest input).
  diffArray(entries, 'resolvedContext.items',
    contextRefs(a.resolvedContext?.items),
    contextRefs(b.resolvedContext?.items),
  );

  // Connectors / MCP.
  diffArray(entries, 'connectorsRequired',
    nonEmptyStrings((a.connectorsRequired ?? []).map((c) => safeString((c as { id?: unknown })?.id))),
    nonEmptyStrings((b.connectorsRequired ?? []).map((c) => safeString((c as { id?: unknown })?.id))));
  diffArray(entries, 'connectorsResolved',
    nonEmptyStrings((a.connectorsResolved ?? []).map((c) => `${safeString((c as { id?: unknown })?.id)}:${safeString((c as { status?: unknown })?.status)}`)),
    nonEmptyStrings((b.connectorsResolved ?? []).map((c) => `${safeString((c as { id?: unknown })?.id)}:${safeString((c as { status?: unknown })?.status)}`)));
  diffArray(entries, 'mcpServers',
    nonEmptyStrings((a.mcpServers ?? []).map((m) => safeString((m as { id?: unknown })?.id))),
    nonEmptyStrings((b.mcpServers ?? []).map((m) => safeString((m as { id?: unknown })?.id))));

  // GenUI surfaces (by id).
  diffArray(entries, 'genuiSurfaces',
    nonEmptyStrings((a.genuiSurfaces ?? []).map((s) => safeString((s as { id?: unknown })?.id))),
    nonEmptyStrings((b.genuiSurfaces ?? []).map((s) => safeString((s as { id?: unknown })?.id))));

  // Pipeline (by stage id roster + per-stage atoms).
  diffPipeline(entries, a.pipeline, b.pipeline);

  // Assets (by path).
  diffArray(entries, 'assetsStaged',
    nonEmptyStrings((a.assetsStaged ?? []).map((x) => safeString((x as { path?: unknown })?.path))),
    nonEmptyStrings((b.assetsStaged ?? []).map((x) => safeString((x as { path?: unknown })?.path))));

  entries.sort((x, y) => x.field.localeCompare(y.field));

  let added = 0; let removed = 0; let changed = 0;
  for (const e of entries) {
    if (e.kind === 'added')   added++;
    if (e.kind === 'removed') removed++;
    if (e.kind === 'changed') changed++;
  }
  const report: SnapshotDiffReport = {
    digestEqual: a.manifestSourceDigest === b.manifestSourceDigest,
    entries,
    added, removed, changed,
  };
  if (a.pluginId === b.pluginId) report.pluginId = a.pluginId;
  return report;
}

function nonEmptyStrings(values: ReadonlyArray<string>): string[] {
  return values.filter((s): s is string => typeof s === 'string' && s.length > 0);
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function recordToStringMap(input: Record<string, string | number | boolean> | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;
  for (const [k, v] of Object.entries(input)) out[k] = String(v);
  return out;
}

function contextRefs(items: AppliedPluginSnapshot['resolvedContext']['items'] | undefined): string[] {
  if (!Array.isArray(items)) return [];
  return items.map((i) => {
    if (!i) return '';
    const anyItem = i as { kind?: string; id?: string; label?: string; path?: string };
    const ref = anyItem.id ?? anyItem.path ?? anyItem.label ?? '';
    return `${anyItem.kind ?? ''}:${ref}`;
  }).filter((s) => s.length > 1);
}

function diffPipeline(
  out: SnapshotDiffEntry[],
  a: AppliedPluginSnapshot['pipeline'] | undefined,
  b: AppliedPluginSnapshot['pipeline'] | undefined,
): void {
  if (!a && !b) return;
  if (!a && b)  { out.push({ field: 'pipeline', kind: 'added',   after:  b.stages?.map((s) => s.id).join(' \u2192 ') ?? '' }); return; }
  if (a && !b)  { out.push({ field: 'pipeline', kind: 'removed', before: a.stages?.map((s) => s.id).join(' \u2192 ') ?? '' }); return; }
  diffArray(out, 'pipeline.stages', (a!.stages ?? []).map((s) => s.id), (b!.stages ?? []).map((s) => s.id));
  const aBy = new Map((a!.stages ?? []).map((s) => [s.id, s] as const));
  const bBy = new Map((b!.stages ?? []).map((s) => [s.id, s] as const));
  for (const id of new Set([...aBy.keys(), ...bBy.keys()])) {
    const sa = aBy.get(id);
    const sb = bBy.get(id);
    if (!sa || !sb) continue;
    diffArray(out, `pipeline.stages[${id}].atoms`, sa.atoms ?? [], sb.atoms ?? []);
    diffScalar(out, `pipeline.stages[${id}].until`, sa.until, sb.until);
  }
}

function diffScalar(out: SnapshotDiffEntry[], field: string, a: unknown, b: unknown): void {
  const aPresent = a !== undefined && a !== null;
  const bPresent = b !== undefined && b !== null;
  if (!aPresent && !bPresent) return;
  if (!aPresent)              { out.push({ field, kind: 'added',   after:  String(b) }); return; }
  if (!bPresent)              { out.push({ field, kind: 'removed', before: String(a) }); return; }
  if (toComparable(a) === toComparable(b)) return;
  out.push({ field, kind: 'changed', before: String(a), after: String(b) });
}

function diffArray(out: SnapshotDiffEntry[], field: string, a: ReadonlyArray<string>, b: ReadonlyArray<string>): void {
  const setA = new Set(a);
  const setB = new Set(b);
  const added   = [...setB].filter((x) => !setA.has(x));
  const removed = [...setA].filter((x) => !setB.has(x));
  if (added.length === 0 && removed.length === 0) {
    if (a.length === b.length && a.every((v, i) => v === b[i])) return;
    out.push({ field, kind: 'changed', before: a.join(','), after: b.join(','), summary: `reordered (${a.length} entries)` });
    return;
  }
  out.push({ field, kind: 'changed', summary: `${added.length} added, ${removed.length} removed`, before: removed.join(','), after: added.join(',') });
}

function diffMap(out: SnapshotDiffEntry[], field: string, a: Record<string, string>, b: Record<string, string>): void {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if (av === undefined && bv !== undefined) { added.push(`${k}=${bv}`); continue; }
    if (av !== undefined && bv === undefined) { removed.push(`${k}=${av}`); continue; }
    if (av !== bv) changed.push(`${k}: ${av} \u2192 ${bv}`);
  }
  if (added.length === 0 && removed.length === 0 && changed.length === 0) return;
  out.push({
    field,
    kind: 'changed',
    summary: `${added.length} added, ${removed.length} removed, ${changed.length} changed`,
    before: removed.join(', '),
    after:  [...added, ...changed].join(', '),
  });
}

function toComparable(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  try { return JSON.stringify(value); } catch { return String(value); }
}
