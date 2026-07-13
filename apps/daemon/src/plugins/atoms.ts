// First-party atom catalog. Phase 1 ships a static list mirroring spec
// §10's "implemented today" column. Planned atoms are surfaced with
// `status: 'planned'` so `od plugin doctor` can warn rather than reject
// when a plugin references a not-yet-implemented atom.

export type AtomStatus = 'implemented' | 'planned';

export interface AtomCatalogEntry {
  id: string;
  label: string;
  description: string;
  status: AtomStatus;
  taskKinds: ReadonlyArray<'new-generation' | 'code-migration' | 'figma-migration' | 'tune-collab'>;
}

export const FIRST_PARTY_ATOMS: ReadonlyArray<AtomCatalogEntry> = [
  { id: 'discovery-question-form', label: 'Discovery question form', description: 'Turn-1 question form for ambiguous briefs.', status: 'implemented', taskKinds: ['new-generation', 'tune-collab'] },
  { id: 'direction-picker',        label: 'Direction picker',        description: '3-5 direction picker before final.',         status: 'implemented', taskKinds: ['new-generation', 'tune-collab'] },
  { id: 'todo-write',              label: 'Todo write',              description: 'TodoWrite-driven plan.',                    status: 'implemented', taskKinds: ['new-generation', 'code-migration', 'figma-migration', 'tune-collab'] },
  { id: 'file-read',               label: 'File read',               description: 'Read project files.',                       status: 'implemented', taskKinds: ['new-generation', 'code-migration', 'figma-migration', 'tune-collab'] },
  { id: 'file-write',              label: 'File write',              description: 'Write project files.',                      status: 'implemented', taskKinds: ['new-generation', 'code-migration', 'figma-migration', 'tune-collab'] },
  { id: 'file-edit',               label: 'File edit',               description: 'Edit project files.',                       status: 'implemented', taskKinds: ['new-generation', 'code-migration', 'figma-migration', 'tune-collab'] },
  { id: 'research-search',         label: 'Research search',         description: 'Tavily-backed shallow research.',           status: 'implemented', taskKinds: ['new-generation'] },
  { id: 'media-image',             label: 'Media image',             description: 'Image generation through media providers.', status: 'implemented', taskKinds: ['new-generation', 'tune-collab'] },
  { id: 'media-video',             label: 'Media video',             description: 'Video generation through media providers.', status: 'implemented', taskKinds: ['new-generation', 'tune-collab'] },
  { id: 'media-audio',             label: 'Media audio',             description: 'Audio generation through media providers.', status: 'implemented', taskKinds: ['new-generation', 'tune-collab'] },
  { id: 'live-artifact',           label: 'Live artifact',           description: 'Create/refresh live artifacts.',            status: 'implemented', taskKinds: ['new-generation', 'tune-collab'] },
  { id: 'connector',               label: 'Connector',               description: 'Composio connector tool calls.',            status: 'implemented', taskKinds: ['new-generation', 'tune-collab'] },
  { id: 'critique-theater',        label: 'Critique theater',        description: '5-dim panel critique; devloop signal.',     status: 'implemented', taskKinds: ['new-generation', 'code-migration', 'figma-migration', 'tune-collab'] },
  // Phase 6/7/8 atoms — promoted from 'planned' to 'implemented'
  // by the §3.N1-N4 / §3.O2-O5 / §3.P1-P2 / §3.Q2 / §3.S1 slices.
  { id: 'code-import',             label: 'Code import',             description: 'Walk an existing repo into <cwd>/code/index.json.',       status: 'implemented', taskKinds: ['code-migration'] },
  { id: 'design-extract',          label: 'Design extract',          description: 'Extract design tokens into <cwd>/code/tokens.json.',      status: 'implemented', taskKinds: ['code-migration', 'figma-migration'] },
  { id: 'figma-extract',           label: 'Figma extract',           description: 'Pull Figma file tree + assets via REST.',                 status: 'implemented', taskKinds: ['figma-migration'] },
  { id: 'token-map',               label: 'Token map',               description: 'Crosswalk source token bag onto active design system.',   status: 'implemented', taskKinds: ['code-migration', 'figma-migration'] },
  { id: 'rewrite-plan',            label: 'Rewrite plan',            description: 'Heuristic ownership classifier + per-leaf step list.',    status: 'implemented', taskKinds: ['code-migration', 'tune-collab'] },
  { id: 'patch-edit',              label: 'Patch edit',              description: 'Atomic unified-diff applier with shell-tier safety gate.', status: 'implemented', taskKinds: ['code-migration', 'tune-collab'] },
  { id: 'build-test',              label: 'Build / test',            description: 'Shell-out to typecheck + tests; emits build/tests.passing signals.', status: 'implemented', taskKinds: ['code-migration'] },
  { id: 'diff-review',             label: 'Diff review',             description: 'Render rewrite as review/{diff.patch,summary.md,decision.json}.', status: 'implemented', taskKinds: ['code-migration', 'tune-collab'] },
  { id: 'handoff',                 label: 'Handoff',                 description: 'Update ArtifactManifest provenance + handoffKind ladder.', status: 'implemented', taskKinds: ['code-migration', 'tune-collab'] },
];

const ATOMS_BY_ID = new Map<string, AtomCatalogEntry>(FIRST_PARTY_ATOMS.map((a) => [a.id, a]));

export function findAtom(id: string): AtomCatalogEntry | undefined {
  return ATOMS_BY_ID.get(id);
}

export function isKnownAtom(id: string): boolean {
  return ATOMS_BY_ID.has(id);
}

export function isImplementedAtom(id: string): boolean {
  return ATOMS_BY_ID.get(id)?.status === 'implemented';
}
