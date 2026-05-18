// Phase 4 / spec §14.1 — `od plugin scaffold` starter folder generator.
//
// Pure, file-system-side helper that materialises the §17.2 "enriched
// plugin" shape on disk: SKILL.md (canonical anchor, with the od:
// frontmatter the skills protocol expects) + open-design.json (sidecar
// with the v1 schema reference). Authors can drop the result into a
// new git repo and start iterating immediately; `od plugin install ./<id>`
// will pick it up via the local-folder backend.
//
// Kept module-pure (no daemon globals): tests pass a temp directory as
// `targetDir`; the CLI passes `process.cwd()`.

import path from 'node:path';
import { promises as fsp } from 'node:fs';

export interface ScaffoldInput {
  // Target directory the scaffold tree is created under. The function
  // creates `<targetDir>/<id>/...`.
  targetDir: string;
  id: string;
  title?: string;
  description?: string;
  taskKind?: 'new-generation' | 'code-migration' | 'figma-migration' | 'tune-collab';
  mode?: string;
  scenario?: string;
  // When true, also drop a Claude Code-compatible plugin.json so the
  // resulting repo lands on every catalog in §3 of the spec without
  // modification (clawhub / awesome-agent-skills / claude-plugins).
  withClaudePlugin?: boolean;
}

export interface ScaffoldResult {
  folder: string;
  files: string[];
}

const SAFE_ID = /^[a-z][a-z0-9._-]{0,62}$/;

export class ScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScaffoldError';
  }
}

export async function scaffoldPlugin(input: ScaffoldInput): Promise<ScaffoldResult> {
  if (!SAFE_ID.test(input.id)) {
    throw new ScaffoldError(`plugin id "${input.id}" must be lowercase, start with a letter, and use [a-z0-9._-]`);
  }
  const folder = path.join(input.targetDir, input.id);
  // Refuse to clobber a directory that already has any of the canonical
  // files we'd emit. The caller can rm -rf and re-run if they really
  // mean it.
  try {
    const entries = await fsp.readdir(folder).catch(() => []);
    const conflicts = entries.filter((e) =>
      e === 'SKILL.md' || e === 'open-design.json' || e === '.claude-plugin' || e === 'README.md',
    );
    if (conflicts.length > 0) {
      throw new ScaffoldError(`destination ${folder} already contains ${conflicts.join(', ')}; refusing to overwrite`);
    }
  } catch (err) {
    if (err instanceof ScaffoldError) throw err;
    // ENOENT is expected on first run; surface anything else.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  const title = input.title?.trim() || humanize(input.id);
  const description = input.description?.trim() || `One-paragraph description of ${title}.`;
  const taskKind = input.taskKind ?? 'new-generation';

  await fsp.mkdir(folder, { recursive: true });

  const written: string[] = [];

  const skillFrontmatter = [
    '---',
    `name: ${input.id}`,
    `description: ${description}`,
    'od:',
    `  mode: ${input.mode ?? 'prototype'}`,
    `  scenario: ${input.scenario ?? 'general'}`,
    '---',
    '',
    `# ${title}`,
    '',
    'Workflow steps:',
    '',
    '1. Discovery / clarifying questions.',
    '2. Plan + direction picker.',
    '3. Generate the artifact.',
    '4. Self-critique against the design system + craft rules.',
    '',
    `Replace this body with the actual ${title} workflow before publishing.`,
    '',
  ].join('\n');
  const skillPath = path.join(folder, 'SKILL.md');
  await fsp.writeFile(skillPath, skillFrontmatter, 'utf8');
  written.push(skillPath);

  const manifest: Record<string, unknown> = {
    $schema:     'https://open-design.ai/schemas/plugin.v1.json',
    specVersion: '1.0.0',
    name:        input.id,
    title,
    version:     '0.1.0',
    description,
    license:     'MIT',
    tags:        [taskKind],
    compat:      { agentSkills: [{ path: './SKILL.md' }] },
    od: {
      kind:     'skill',
      taskKind,
      mode:     input.mode ?? 'prototype',
      scenario: input.scenario ?? 'general',
      useCase:  { query: `Generate a ${title.toLowerCase()} for {{audience}}.` },
      context:  {
        skills: [{ ref: input.id }],
        atoms:  ['discovery-question-form', 'todo-write'],
      },
      inputs: [
        { name: 'audience', type: 'string', required: true, label: 'Audience' },
      ],
      capabilities: ['prompt:inject'],
    },
  };
  const manifestPath = path.join(folder, 'open-design.json');
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  written.push(manifestPath);

  const readme = [
    `# ${title}`,
    '',
    description,
    '',
    '## Try it',
    '',
    '```bash',
    `od plugin install ./${input.id}`,
    `od plugin apply ${input.id} --input audience=VC`,
    '```',
    '',
    '## Files',
    '',
    '- `SKILL.md` — the canonical agent skill body.',
    '- `open-design.json` — the versioned Open Design marketplace sidecar.',
    '',
    'Edit `SKILL.md` to teach the agent how to perform the workflow.',
    'Edit `open-design.json` to refine the marketplace card and inputs.',
    '',
  ].join('\n');
  const readmePath = path.join(folder, 'README.md');
  await fsp.writeFile(readmePath, readme, 'utf8');
  written.push(readmePath);

  if (input.withClaudePlugin) {
    const claudeDir = path.join(folder, '.claude-plugin');
    await fsp.mkdir(claudeDir, { recursive: true });
    const cp = {
      name:        input.id,
      description,
      version:     '0.1.0',
    };
    const cpPath = path.join(claudeDir, 'plugin.json');
    await fsp.writeFile(cpPath, JSON.stringify(cp, null, 2) + '\n', 'utf8');
    written.push(cpPath);
  }

  return { folder, files: written };
}

function humanize(id: string): string {
  return id
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}
