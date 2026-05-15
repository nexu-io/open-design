import {
  OPEN_DESIGN_PLUGIN_SPEC_VERSION,
  PluginManifestSchema,
  type PluginManifest,
} from '@open-design/contracts';

export interface ManifestParseSuccess {
  ok: true;
  manifest: PluginManifest;
  warnings: string[];
}

export interface ManifestParseFailure {
  ok: false;
  warnings: string[];
  errors: string[];
}

export type ManifestParseResult = ManifestParseSuccess | ManifestParseFailure;

// Read raw `open-design.json` text into a typed PluginManifest. The Zod
// schema is permissive (passthrough), so unknown forward-compatible fields
// survive parse without complaint. Warnings carry adapter hints — e.g. a
// claude-plugin sidecar that declared an unmappable capability.
export function parseManifest(raw: string): ManifestParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      warnings: [],
      errors: [`open-design.json is not valid JSON: ${(err as Error).message}`],
    };
  }
  return parseManifestObject(json);
}

export function parseManifestObject(value: unknown): ManifestParseResult {
  const result = PluginManifestSchema.safeParse(value);
  if (!result.success) {
    return {
      ok: false,
      warnings: [],
      errors: result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
    };
  }
  return {
    ok: true,
    manifest: {
      specVersion: OPEN_DESIGN_PLUGIN_SPEC_VERSION,
      ...result.data,
    },
    warnings: [],
  };
}
