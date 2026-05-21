import { PluginManifestSchema, type PluginManifest } from '@open-design/contracts';

export interface ValidateResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
}

// Doctor-level validation. Combines schema parse + cross-field rules that
// the JSON Schema cannot easily express:
//
//   - Pipeline stages with `repeat: true` must declare an `until`
//     expression (spec §10.2 hard constraint).
//   - Capability list must be an array of canonical capability strings;
//     unknown ids land in `warnings[]` instead of `errors[]` so a forward
//     spec patch can introduce new caps without breaking installs.
//   - GenUI surface oauth.route='connector' references a connector id that
//     the plugin actually declared (when od.connectors are present).

const KNOWN_CAPABILITIES = new Set([
  'prompt:inject',
  'fs:read',
  'fs:write',
  'mcp',
  'subprocess',
  'bash',
  'network',
  'connector',
]);

export function validateManifest(value: unknown): ValidateResult {
  const parsed = PluginManifestSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      warnings: [],
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
    };
  }
  return validateSafe(parsed.data);
}

export function validateSafe(manifest: PluginManifest): ValidateResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const od = manifest.od;
  if (od) {
    const stages = od.pipeline?.stages ?? [];
    for (const stage of stages) {
      if (stage.repeat && !stage.until) {
        errors.push(`pipeline.stages[${stage.id}]: repeat=true requires an 'until' expression`);
      }
    }

    const caps = od.capabilities ?? [];
    for (const cap of caps) {
      if (cap.startsWith('connector:')) continue;
      if (!KNOWN_CAPABILITIES.has(cap)) {
        warnings.push(`capability '${cap}' is not in the v1 vocabulary; doctor will surface this to the operator`);
      }
    }

    const declaredConnectorIds = new Set<string>();
    for (const ref of od.connectors?.required ?? []) declaredConnectorIds.add(ref.id);
    for (const ref of od.connectors?.optional ?? []) declaredConnectorIds.add(ref.id);

    const declaredMcpNames = new Set<string>();
    for (const mcp of od.context?.mcp ?? []) {
      if (typeof mcp.name === 'string') declaredMcpNames.add(mcp.name);
    }

    for (const surface of od.genui?.surfaces ?? []) {
      const oauth = surface.oauth;
      if (!oauth) continue;
      if (oauth.route === 'connector') {
        if (!oauth.connectorId) {
          errors.push(`genui.surfaces[${surface.id}]: oauth.route='connector' requires connectorId`);
        } else if (declaredConnectorIds.size > 0 && !declaredConnectorIds.has(oauth.connectorId)) {
          errors.push(`genui.surfaces[${surface.id}]: oauth.connectorId='${oauth.connectorId}' is not in od.connectors.required/optional`);
        }
      } else if (oauth.route === 'mcp') {
        if (!oauth.mcpServerId) {
          errors.push(`genui.surfaces[${surface.id}]: oauth.route='mcp' requires mcpServerId`);
        } else if (declaredMcpNames.size > 0 && !declaredMcpNames.has(oauth.mcpServerId)) {
          errors.push(`genui.surfaces[${surface.id}]: oauth.mcpServerId='${oauth.mcpServerId}' is not declared in od.context.mcp`);
        }
      }
    }
  }

  return { ok: errors.length === 0, warnings, errors };
}
