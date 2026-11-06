// Connector capability gate — spec §9 / §11.3 connector-gate.
//
// Three responsibilities:
//
//   (a) Apply path: resolve `od.connectors.required[]` against the
//       connector catalog. Populates `connectorsResolved` with status
//       (connected / pending / unavailable) and auto-derives an
//       `oauth-prompt` GenUI surface (`__auto_connector_<id>`,
//       `persist: 'project'`) for any not-yet-connected required
//       connector. The plugin author can override the implicit surface
//       by declaring a same-id surface explicitly.
//
//   (b) Token-issuance path: validate the snapshot's
//       `capabilitiesGranted` against `connector:<id>` before the daemon
//       hands a connector tool token to the agent. A trusted plugin
//       implicitly carries `connector:*`; a restricted plugin must list
//       each id explicitly.
//
//   (c) /api/tools/connectors/execute re-validates on every call so a
//       token replacement attack never bypasses the gate.
//
// All three functions are synchronous and pure relative to their inputs;
// the only side effect is reading the connector status snapshot the
// caller passes in. apply.ts owns the binding into ConnectorService;
// tests inject a stub catalog probe.

import type {
  AppliedPluginSnapshot,
  GenUISurfaceSpec,
  PluginConnectorBinding,
  PluginConnectorRef,
  PluginManifest,
} from '@open-design/contracts';

export type ConnectorGateStatus = 'connected' | 'pending' | 'unavailable';

export interface ConnectorCatalogEntry {
  id:                string;
  status:            ConnectorGateStatus;
  accountLabel?:     string;
  // Subset of tool names that may be invoked. Used to validate
  // `od.connectors.required[].tools[]`.
  allowedToolNames:  string[];
}

export interface ConnectorProbe {
  // Sync lookup over the FAST catalog + status maps. Returns undefined
  // when the id is unknown — apply.ts surfaces that as a doctor warning.
  get(connectorId: string): ConnectorCatalogEntry | undefined;
}

export interface ConnectorRefValidationIssue {
  connectorId: string;
  code:        | 'unknown-connector'
               | 'unknown-tool'
               | 'missing-capability';
  message:     string;
  // Optional unknown tool list for the unknown-tool issue.
  tools?:      string[];
}

// Resolve `od.connectors.required[] + optional[]` into apply-time bindings.
// Pure function; the caller injects the catalog probe so tests stay
// deterministic. When the probe returns no entry, the binding's status
// defaults to `unavailable` (the doctor / install path will surface
// 'unknown-connector' separately).
export function resolveConnectorBindings(
  manifest: PluginManifest,
  probe: ConnectorProbe | undefined,
): { resolved: PluginConnectorBinding[]; required: PluginConnectorRef[] } {
  const required: PluginConnectorRef[] = [
    ...(manifest.od?.connectors?.required ?? []).map((r) => ({ ...r, required: true })),
    ...(manifest.od?.connectors?.optional ?? []).map((r) => ({ ...r, required: false })),
  ];
  const resolved: PluginConnectorBinding[] = required.map((c) => {
    const tools = Array.isArray(c.tools) ? c.tools : [];
    if (!probe) {
      return { id: c.id, tools, required: c.required, status: 'pending' as const };
    }
    const entry = probe.get(c.id);
    if (!entry) {
      return { id: c.id, tools, required: c.required, status: 'unavailable' as const };
    }
    const binding: PluginConnectorBinding = {
      id:       entry.id,
      tools,
      required: c.required,
      status:   entry.status,
    };
    if (entry.accountLabel) binding.accountLabel = entry.accountLabel;
    return binding;
  });
  return { resolved, required };
}

// Auto-derive `oauth-prompt` GenUI surfaces for required connectors that
// are not yet connected. Keeps the implicit `__auto_connector_<id>` /
// `persist: 'project'` shape locked by spec §10.3.1. Plugin-declared
// surfaces with the same id win — the apply path filters those out
// before passing into this function (see `mergeAutoOAuthPrompts`).
export function deriveAutoOAuthPrompts(
  bindings: PluginConnectorBinding[],
): GenUISurfaceSpec[] {
  const out: GenUISurfaceSpec[] = [];
  for (const b of bindings) {
    if (!b.required) continue;
    if (b.status === 'connected') continue;
    out.push({
      id:      `__auto_connector_${b.id}`,
      kind:    'oauth-prompt',
      persist: 'project',
      capabilitiesRequired: [`connector:${b.id}`],
      prompt:  `This plugin needs the ${b.id} connector. Authorize it to continue.`,
      oauth:   { route: 'connector', connectorId: b.id },
    });
  }
  return out;
}

// Merge author-declared surfaces with auto-derived ones; same id (case-insensitive)
// wins for the explicit declaration. Returns a deduped list, explicit-first.
export function mergeAutoOAuthPrompts(
  declared: GenUISurfaceSpec[],
  auto:     GenUISurfaceSpec[],
): GenUISurfaceSpec[] {
  const ids = new Set(declared.map((s) => s.id.toLowerCase()));
  const merged: GenUISurfaceSpec[] = [...declared];
  for (const surface of auto) {
    if (ids.has(surface.id.toLowerCase())) continue;
    merged.push(surface);
    ids.add(surface.id.toLowerCase());
  }
  return merged;
}

// Validate `od.connectors.required[].tools[]` against the catalog.
// Returns issues grouped by connector. Used by `od plugin doctor` (F7).
export function validateConnectorRefs(
  manifest: PluginManifest,
  probe: ConnectorProbe,
): ConnectorRefValidationIssue[] {
  const issues: ConnectorRefValidationIssue[] = [];
  const all = [
    ...(manifest.od?.connectors?.required ?? []),
    ...(manifest.od?.connectors?.optional ?? []),
  ];
  const required = manifest.od?.connectors?.required ?? [];
  const declaredCaps = new Set(manifest.od?.capabilities ?? []);
  for (const ref of all) {
    const entry = probe.get(ref.id);
    if (!entry) {
      issues.push({
        connectorId: ref.id,
        code:        'unknown-connector',
        message:     `Unknown connector "${ref.id}" — no entry in connectorService.listAll()`,
      });
      continue;
    }
    const tools = Array.isArray(ref.tools) ? ref.tools : [];
    const allowed = new Set(entry.allowedToolNames);
    const unknown = tools.filter((t) => !allowed.has(t));
    if (unknown.length > 0) {
      issues.push({
        connectorId: ref.id,
        code:        'unknown-tool',
        message:     `Connector "${ref.id}" tools not in allowedToolNames: ${unknown.join(', ')}`,
        tools:       unknown,
      });
    }
  }
  for (const ref of required) {
    const cap = `connector:${ref.id}`;
    if (!declaredCaps.has(cap)) {
      issues.push({
        connectorId: ref.id,
        code:        'missing-capability',
        message:     `Required connector "${ref.id}" is missing the "${cap}" capability declaration`,
      });
    }
  }
  return issues;
}

// Token-issuance gate. Called from `apps/daemon/src/tool-tokens.ts`
// before the daemon hands a connector tool token to the agent, and from
// `/api/tools/connectors/execute` on every call (defense in depth, c).
//
// Returns `{ ok: true }` when the snapshot is allowed to use the
// connector. Returns `{ ok: false, reason }` otherwise; callers MUST
// reject the request with HTTP 403.
export function checkConnectorTokenIssuance(args: {
  snapshot:    Pick<AppliedPluginSnapshot, 'capabilitiesGranted'>;
  trust:       'trusted' | 'restricted' | 'bundled';
  connectorId: string;
}): { ok: true } | { ok: false; reason: string } {
  const cap = `connector:${args.connectorId}`;
  const granted = new Set(args.snapshot.capabilitiesGranted);
  if (args.trust !== 'restricted') {
    // Trusted + bundled implicitly carry connector:*.
    return { ok: true };
  }
  if (granted.has(cap)) return { ok: true };
  return {
    ok: false,
    reason: `restricted plugin lacks "${cap}" — Grant the capability via /api/plugins/:id/trust before issuing a token`,
  };
}
