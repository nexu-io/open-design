// Trust resolver. Spec §5.3 has two tiers — `trusted` and `restricted`.
// Phase 1 keeps the policy minimal:
//
//   - Local installs default to `trusted` (the user copied the folder
//     here themselves).
//   - Anything else (bundled / marketplace / github / url / project) defaults
//     to `restricted` until an explicit `od plugin trust <id>` flips it. Phase
//     2A wires the marketplace trust roll-up; we just expose the helpers now.
//   - `restricted` plugins ship the prompt:inject capability only. Apply-time
//     adds explicit grants (e.g. `mcp:<name>`, `connector:<id>`) onto the
//     snapshot; we never widen the registry-stored cache here.

import type { InstalledPluginRecord, PluginManifest, TrustTier } from '@open-design/contracts';

export const TRUSTED_DEFAULT_CAPABILITIES: ReadonlyArray<string> = [
  'prompt:inject',
  'mcp:*',
  'connector:*',
  'genui:*',
  'pipeline:*',
];

export const RESTRICTED_DEFAULT_CAPABILITIES: ReadonlyArray<string> = ['prompt:inject'];

export function defaultTrustForRecord(record: Pick<InstalledPluginRecord, 'sourceKind'>): TrustTier {
  return record.sourceKind === 'local' ? 'trusted' : 'restricted';
}

export function defaultCapabilities(trust: TrustTier): string[] {
  return trust === 'trusted'
    ? Array.from(TRUSTED_DEFAULT_CAPABILITIES)
    : Array.from(RESTRICTED_DEFAULT_CAPABILITIES);
}

// Return the capabilities a manifest *requires* to apply cleanly. Apply-time
// grant decisions consult this; the doctor reports under-grants here too.
export function requiredCapabilities(manifest: PluginManifest): string[] {
  const required = new Set<string>(['prompt:inject']);
  const od = manifest.od;

  for (const mcp of od?.context?.mcp ?? []) {
    if (mcp?.name) required.add(`mcp:${mcp.name}`);
  }
  for (const ref of od?.connectors?.required ?? []) {
    if (ref?.id) required.add(`connector:${ref.id}`);
  }
  for (const ref of od?.connectors?.optional ?? []) {
    if (ref?.id) required.add(`connector:${ref.id}?`);
  }
  for (const surface of od?.genui?.surfaces ?? []) {
    if (surface?.kind) required.add(`genui:${surface.kind}`);
  }
  if ((od?.pipeline?.stages?.length ?? 0) > 0) {
    required.add('pipeline:*');
  }
  for (const cap of od?.capabilities ?? []) {
    if (typeof cap === 'string' && cap.length > 0) required.add(cap);
  }
  return Array.from(required.values()).sort();
}

// Compute the granted set Phase 1 applies for a given trust tier and
// manifest. Restricted plugins start at `prompt:inject`; trusted plugins
// receive everything required by their manifest plus the trusted defaults.
export function resolveCapabilitiesGranted(args: {
  manifest: PluginManifest;
  trust: TrustTier;
}): string[] {
  const out = new Set(defaultCapabilities(args.trust));
  if (args.trust === 'trusted') {
    for (const cap of requiredCapabilities(args.manifest)) {
      out.add(stripOptionalSuffix(cap));
    }
  }
  return Array.from(out.values()).sort();
}

function stripOptionalSuffix(cap: string): string {
  return cap.endsWith('?') ? cap.slice(0, -1) : cap;
}

// Plan §3.A2 / spec §9.1. The capability vocabulary that a `restricted`
// plugin can be promoted to via `od plugin trust`. Anything outside this
// set is rejected at the HTTP layer.
const KNOWN_TOP_LEVEL_CAPABILITIES = new Set<string>([
  'prompt:inject',
  'fs:read',
  'fs:write',
  'mcp',
  'subprocess',
  'bash',
  'network',
  'connector',
  // Plan §3.K3 / spec §10.3.5 — plugin-bundled React component
  // surfaces require an explicit capability so a restricted plugin
  // cannot smuggle arbitrary UI through the GenUI layer.
  'genui:custom-component',
]);

const SCOPED_CONNECTOR_RE = /^connector:[a-z0-9][a-z0-9_-]*$/;
const SCOPED_MCP_RE = /^mcp:[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface InvalidCapabilityIssue {
  capability: string;
  reason: 'unknown' | 'malformed';
}

// Validate a list of capability strings against the spec §5.3 vocabulary.
// Returns the (deduped) accepted list plus issues for anything rejected;
// unknown shapes are NOT silently dropped — the caller must surface them.
export function validateCapabilityList(
  raw: unknown,
): { accepted: string[]; rejected: InvalidCapabilityIssue[] } {
  const accepted: string[] = [];
  const rejected: InvalidCapabilityIssue[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(raw)) {
    return { accepted, rejected };
  }
  for (const item of raw) {
    if (typeof item !== 'string') {
      rejected.push({ capability: String(item), reason: 'malformed' });
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    if (KNOWN_TOP_LEVEL_CAPABILITIES.has(trimmed)) {
      seen.add(trimmed);
      accepted.push(trimmed);
      continue;
    }
    if (SCOPED_CONNECTOR_RE.test(trimmed) || SCOPED_MCP_RE.test(trimmed)) {
      seen.add(trimmed);
      accepted.push(trimmed);
      continue;
    }
    rejected.push({ capability: trimmed, reason: 'unknown' });
  }
  return { accepted, rejected };
}

// Persist a capability grant. Reads the existing union from
// `installed_plugins.capabilities_granted`, merges with the request,
// and writes the deduped sorted union back. Idempotent — re-granting
// the same set is a no-op. Returns the resulting list.
export function grantCapabilities(args: {
  db: import('better-sqlite3').Database;
  pluginId: string;
  capabilities: string[];
}): string[] {
  const row = args.db
    .prepare(`SELECT capabilities_granted FROM installed_plugins WHERE id = ?`)
    .get(args.pluginId) as { capabilities_granted?: string } | undefined;
  if (!row) {
    throw new Error(`plugin not found: ${args.pluginId}`);
  }
  let existing: string[] = [];
  try {
    const parsed = JSON.parse(row.capabilities_granted ?? '[]') as unknown;
    if (Array.isArray(parsed)) {
      existing = parsed.filter((c): c is string => typeof c === 'string');
    }
  } catch {
    existing = [];
  }
  const merged = Array.from(new Set([...existing, ...args.capabilities])).sort();
  const now = Date.now();
  args.db
    .prepare(
      `UPDATE installed_plugins
          SET capabilities_granted = ?, updated_at = ?
        WHERE id = ?`,
    )
    .run(JSON.stringify(merged), now, args.pluginId);
  return merged;
}

// Revoke previously-granted capabilities. Subset of `grantCapabilities`
// but subtracts. The implicit `prompt:inject` floor is preserved so a
// trusted-by-default plugin never falls below the spec §5.3 minimum.
export function revokeCapabilities(args: {
  db: import('better-sqlite3').Database;
  pluginId: string;
  capabilities: string[];
}): string[] {
  const row = args.db
    .prepare(`SELECT capabilities_granted FROM installed_plugins WHERE id = ?`)
    .get(args.pluginId) as { capabilities_granted?: string } | undefined;
  if (!row) {
    throw new Error(`plugin not found: ${args.pluginId}`);
  }
  let existing: string[] = [];
  try {
    const parsed = JSON.parse(row.capabilities_granted ?? '[]') as unknown;
    if (Array.isArray(parsed)) {
      existing = parsed.filter((c): c is string => typeof c === 'string');
    }
  } catch {
    existing = [];
  }
  const drop = new Set(args.capabilities);
  drop.delete('prompt:inject');
  const next = existing.filter((c) => !drop.has(c));
  if (!next.includes('prompt:inject')) next.push('prompt:inject');
  next.sort();
  const now = Date.now();
  args.db
    .prepare(
      `UPDATE installed_plugins
          SET capabilities_granted = ?, updated_at = ?
        WHERE id = ?`,
    )
    .run(JSON.stringify(next), now, args.pluginId);
  return next;
}
