import {
  OPEN_DESIGN_PLUGIN_SPEC_VERSION,
  type InputField,
  type PluginManifest,
} from '@open-design/contracts';
import { parseFrontmatter, type FrontmatterObject, type FrontmatterValue } from '../parsers/frontmatter.js';

// Adapter from a portable SKILL.md (with optional `od:` frontmatter, see
// docs/skills-protocol.md) to a synthesized PluginManifest. Spec invariant
// I1 demands this synthesizer always produce a schema-valid manifest for
// any SKILL.md that already carries the `od:` frontmatter we use today.
//
// Inputs:
//   - rawSkillMd: full SKILL.md file body (frontmatter + markdown).
//   - folderId: the folder/install id that the registry will use ("blog-post").
//   - opts.compatPath: relative path placed into `compat.agentSkills[].path`
//     so the daemon resolver can re-locate the SKILL.md from the manifest
//     alone. Defaults to "./SKILL.md".
//
// Output: { manifest, warnings } — warnings carry unmappable frontmatter
// fields (e.g. od.parameters live sliders that v1 manifest does not surface).

export interface AgentSkillAdapterOptions {
  folderId: string;
  compatPath?: string;
}

export interface AgentSkillAdapterResult {
  manifest: PluginManifest;
  warnings: string[];
  bodyMarkdown: string;
}

const ROLE_PARAMETER_KEYS = ['od.parameters'];

export function adaptAgentSkill(
  rawSkillMd: string,
  opts: AgentSkillAdapterOptions,
): AgentSkillAdapterResult {
  const { data: frontmatter, body } = parseFrontmatter(rawSkillMd);
  const od = isObject(frontmatter['od']) ? frontmatter['od'] : {};
  const warnings: string[] = [];

  const name = stringOr(frontmatter['name'], opts.folderId).trim() || opts.folderId;
  const title = humanizeName(name);
  const description = stringOr(frontmatter['description'], '');
  const version = stringOr(frontmatter['version'], '0.0.0');
  const compatPath = opts.compatPath ?? './SKILL.md';

  const designSystemFm = isObject(od['design_system']) ? od['design_system'] : null;
  const designSystem = designSystemFm
    ? {
        ref: stringOr(designSystemFm['ref'], '') || undefined,
        primary: typeof designSystemFm['primary'] === 'boolean' ? (designSystemFm['primary'] as boolean) : undefined,
      }
    : undefined;

  const craftFm = isObject(od['craft']) ? od['craft'] : null;
  const craftRequires = craftFm && Array.isArray(craftFm['requires'])
    ? (craftFm['requires'] as FrontmatterValue[]).filter((v): v is string => typeof v === 'string')
    : undefined;

  const inputs: InputField[] | undefined = mapInputs(od['inputs'], warnings);

  // od.parameters are deferred to Phase 4 per spec §5.4; record a warning so
  // doctor surfaces them instead of silently dropping.
  for (const key of ROLE_PARAMETER_KEYS) {
    const [namespace, sub] = key.split('.');
    if (namespace === 'od' && sub && Array.isArray(od[sub])) {
      warnings.push(`SKILL.md ${key} is preserved as adapter metadata; v1 manifest does not expose live sliders`);
    }
  }

  const previewFm = isObject(od['preview']) ? od['preview'] : null;
  const preview = previewFm
    ? {
        type: stringOr(previewFm['type'], '') || undefined,
        entry: stringOr(previewFm['entry'], '') || undefined,
      }
    : undefined;

  const manifest: PluginManifest = {
    specVersion: OPEN_DESIGN_PLUGIN_SPEC_VERSION,
    name,
    title,
    version,
    description: description || undefined,
    compat: { agentSkills: [{ path: compatPath }] },
    od: {
      kind: 'skill',
      taskKind: stringOr(od['taskKind'], 'new-generation') as PluginManifest['od'] extends infer T ? T extends { taskKind?: infer K } ? K : never : never,
      mode: stringOr(od['mode'], '') || undefined,
      platform: stringOr(od['platform'], '') || undefined,
      scenario: stringOr(od['scenario'], '') || undefined,
      preview,
      useCase: { query: examplePromptFromFrontmatter(frontmatter, body) },
      context: {
        designSystem: designSystem ?? undefined,
        craft: craftRequires,
      },
      inputs,
    },
  };

  return { manifest, warnings, bodyMarkdown: body };
}

function isObject(value: FrontmatterValue | undefined): value is FrontmatterObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOr(value: FrontmatterValue | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function humanizeName(name: string): string {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((part) => (part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

function mapInputs(value: FrontmatterValue | undefined, warnings: string[]): InputField[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: InputField[] = [];
  for (const raw of value) {
    if (!isObject(raw)) continue;
    const name = stringOr(raw['name'], '').trim();
    if (!name) continue;
    const t = stringOr(raw['type'], 'string');
    let mappedType: InputField['type'];
    if (t === 'integer') mappedType = 'number';
    else if (t === 'enum') mappedType = 'select';
    else if (t === 'upload') mappedType = 'file';
    else if (t === 'string' || t === 'text' || t === 'select' || t === 'number' || t === 'boolean' || t === 'file') mappedType = t;
    else {
      warnings.push(`SKILL.md inputs[${name}].type='${t}' is not in the v1 input vocabulary; falling back to 'string'`);
      mappedType = 'string';
    }
    const optionsSrc = raw['options'] ?? raw['values'];
    const options = Array.isArray(optionsSrc)
      ? optionsSrc.filter((v): v is string => typeof v === 'string')
      : undefined;
    const field: InputField = {
      name,
      label: stringOr(raw['label'], '') || undefined,
      type: mappedType,
      required: typeof raw['required'] === 'boolean' ? (raw['required'] as boolean) : undefined,
      options: options && options.length > 0 ? options : undefined,
      placeholder: stringOr(raw['placeholder'], '') || undefined,
      default: raw['default'] ?? undefined,
    };
    out.push(field);
  }
  return out.length > 0 ? out : undefined;
}

function examplePromptFromFrontmatter(fm: FrontmatterObject, body: string): string {
  const od = isObject(fm['od']) ? fm['od'] : {};
  const direct = stringOr(od['example_prompt'], '').trim();
  if (direct) return direct;
  const desc = stringOr(fm['description'], '').trim();
  if (desc) {
    const firstLine = desc.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? '';
    if (firstLine) return firstLine;
  }
  // Last resort — use the first non-frontmatter heading from the body.
  const heading = /^#\s+(.+)$/m.exec(body);
  return heading?.[1]?.trim() ?? '';
}
