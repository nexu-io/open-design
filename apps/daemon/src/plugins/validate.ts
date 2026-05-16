// Phase 4 / spec §11.5 / plan §3.W1 — author-side plugin validation.
//
// Pre-install lint pass: takes a path to a plugin folder on disk
// (typically the author's local working dir) and returns the same
// DoctorReport shape the post-install `od plugin doctor <id>`
// command emits.
//
// The lift from `od plugin doctor`:
//   - reads the folder via the same resolvePluginFolder() the
//     installer uses, so manifest parsing is byte-equal,
//   - calls doctorPlugin() with the supplied registry view (which
//     the CLI fetches from the daemon when reachable; falls back
//     to an empty registry so the lint runs offline),
//   - skips the `snapshot-stale` cross-check (no SQLite involved
//     because nothing is installed yet).
//
// Rationale: spec §16 Phase 4 ships `od plugin scaffold`, `od
// plugin export`, `od plugin publish` for the author tooling slice.
// `od plugin validate` closes the loop: the author can run lint
// before pushing to a marketplace catalog, without installing into
// their own daemon (which would dirty the registry table).

import path from 'node:path';
import type { RegistryView } from '@open-design/plugin-runtime';
import { doctorPlugin, type DoctorReport, type Diagnostic } from './doctor.js';
import { resolvePluginFolder } from './registry.js';
import type { ConnectorProbe } from './connector-gate.js';

export interface ValidatePluginFolderInput {
  // Path to the plugin folder. Must contain at least one of
  // `open-design.json` / `SKILL.md` / `.claude-plugin/plugin.json`
  // for resolvePluginFolder() to succeed.
  folder: string;
  // Optional pre-fetched registry. Tests pass a stub; CLI fetches
  // from a reachable daemon. Empty / undefined means the validator
  // skips registry-bound ref checks (skills / DS / craft refs in
  // the manifest just emit warnings).
  registry?: RegistryView;
  // Optional connector probe. Same semantics as the post-install
  // doctor.
  connectorProbe?: ConnectorProbe;
}

export interface ValidatePluginFolderResult {
  ok: boolean;
  // Warnings/errors raised during folder resolution (manifest
  // parse + adapter merge), separate from the doctorPlugin pass.
  resolveErrors: string[];
  resolveWarnings: string[];
  // Doctor report; absent only when resolve failed.
  doctor?: DoctorReport;
  // Echoed for the CLI's audit / JSON output.
  folder: string;
}

const EMPTY_REGISTRY: RegistryView = {
  skills:        [],
  designSystems: [],
  craft:         [],
  atoms:         [],
};

export async function validatePluginFolder(
  input: ValidatePluginFolderInput,
): Promise<ValidatePluginFolderResult> {
  const folder = path.resolve(input.folder);
  const folderId = path.basename(folder).toLowerCase();
  // Match the installer's safe-id check so the author sees the
  // same rejection they'll get at install time.
  const probe = await resolvePluginFolder({
    folder,
    folderId,
    sourceKind: 'local',
    source:     folder,
    trust:      'restricted',
  });
  if (!probe.ok) {
    return {
      ok:              false,
      resolveErrors:   probe.errors,
      resolveWarnings: probe.warnings,
      folder,
    };
  }

  const doctor = doctorPlugin(probe.record, input.registry ?? EMPTY_REGISTRY, {
    warnOnMissingRefs: !!input.registry,
    ...(input.connectorProbe ? { connectorProbe: input.connectorProbe } : {}),
  });
  return {
    ok:              probe.warnings.length > 0 ? doctor.ok : doctor.ok,
    resolveErrors:   [],
    resolveWarnings: probe.warnings,
    doctor,
    folder,
  };
}

// Helper a CLI / API renderer can use to flatten the result into a
// flat list the output formatter walks. Useful when the consumer
// doesn't want to special-case resolve vs. doctor diagnostics.
export function flattenValidationDiagnostics(result: ValidatePluginFolderResult): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const err of result.resolveErrors) {
    out.push({ severity: 'error', code: 'manifest.resolve', message: err });
  }
  for (const warn of result.resolveWarnings) {
    out.push({ severity: 'warning', code: 'manifest.resolve', message: warn });
  }
  if (result.doctor) {
    for (const issue of result.doctor.issues) out.push(issue);
  }
  return out;
}
