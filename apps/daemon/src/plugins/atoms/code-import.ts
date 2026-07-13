// Phase 7 entry slice / spec §10 / §21.3.2 — code-import atom runner.
//
// SKILL.md fragment lives at plugins/_official/atoms/code-import/. The
// runner walks an existing repository's tree and writes a normalised
// snapshot under `<projectCwd>/code/` so subsequent atoms
// (`design-extract`, `rewrite-plan`, `patch-edit`, `build-test`)
// don't have to re-walk on every turn.
//
// The walk respects:
//   - a budget (`OD_CODE_IMPORT_BUDGET_MS`, default 60s) so monorepos
//     don't burn an entire run on import;
//   - the standard skip-list (node_modules, .git, .next, dist, build,
//     out, .turbo, .pnpm-store) — recorded under
//     `code/index.json.skipped[]` with a reason so the human can audit;
//   - the §11.5.1 patch-safety contract via lightweight framework
//     detection (next / vite / remix / astro / sveltekit / cra /
//     custom).

import path from 'node:path';
import { promises as fsp } from 'node:fs';

export interface CodeImportFileEntry {
  path:     string;
  size:     number;
  language: 'ts' | 'tsx' | 'js' | 'jsx' | 'css' | 'scss' | 'json' | 'html' | 'md' | 'other';
  // Lightweight import edges (regex-extracted from `from '…'`). The
  // pass is heuristic: we accept false positives (commented imports
  // sneak through) and document the limitation in the SKILL.md
  // fragment so the agent doesn't treat the list as authoritative.
  imports?: string[];
}

export interface CodeImportSkipped {
  path:   string;
  reason: 'directory-skiplist' | 'unsupported-extension' | 'budget-exceeded' | 'symlink' | 'large-file';
}

export interface CodeImportIndex {
  files:    CodeImportFileEntry[];
  skipped:  CodeImportSkipped[];
  framework: 'next' | 'vite' | 'remix' | 'astro' | 'sveltekit' | 'cra' | 'custom' | 'unknown';
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
  packageJson?: { name?: string; version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  styleSystem: 'tailwind' | 'css' | 'styled-components' | 'emotion' | 'unknown';
  routes?: { kind: 'next-app' | 'next-pages' | 'react-router' | 'vite-router' | 'sveltekit' | 'unknown' };
  walkedAt: string;
  walkBudgetMs: number;
}

export interface CodeImportRunOptions {
  // Repo to walk. The atom never mutates this directory.
  repoPath: string;
  // Project cwd to write the snapshot under.
  cwd: string;
  // Walk budget (ms). Default 60s. A larger monorepo aborts gracefully
  // and records every unwalked entry in `skipped[]` with reason
  // 'budget-exceeded'.
  budgetMs?: number;
  // Per-file size cap (bytes). Files above this are listed but their
  // imports[] stay empty. Default 1 MiB.
  largeFileBytes?: number;
}

const DEFAULT_BUDGET_MS = 60_000;
const DEFAULT_LARGE_FILE = 1 * 1024 * 1024;

const SKIPLIST = new Set([
  'node_modules',
  '.git',
  '.next',
  '.svelte-kit',
  '.nuxt',
  '.astro',
  '.turbo',
  '.cache',
  '.pnpm-store',
  '.parcel-cache',
  'dist',
  'build',
  'out',
  'coverage',
  '.vercel',
  '.vscode',
]);

const LANG_EXT: Record<string, CodeImportFileEntry['language']> = {
  '.ts':   'ts',
  '.tsx':  'tsx',
  '.js':   'js',
  '.jsx':  'jsx',
  '.cjs':  'js',
  '.mjs':  'js',
  '.css':  'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.json': 'json',
  '.html': 'html',
  '.htm':  'html',
  '.md':   'md',
  '.mdx':  'md',
};

const IMPORT_RE = /^\s*import\s+(?:[^'"`]+\sfrom\s+)?['"]([^'"]+)['"]/gm;

export async function runCodeImport(opts: CodeImportRunOptions): Promise<CodeImportIndex> {
  const repoPath = path.resolve(opts.repoPath);
  const cwd = path.resolve(opts.cwd);
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const largeFileBytes = opts.largeFileBytes ?? DEFAULT_LARGE_FILE;
  const startedAt = Date.now();

  const stats = await fsp.stat(repoPath).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(`code-import: repoPath ${repoPath} is not a directory`);
  }

  const pkg = await readPackageJson(repoPath);
  const framework = detectFramework(repoPath, pkg);
  const packageManager = await detectPackageManager(repoPath);
  const styleSystem = detectStyleSystem(pkg);
  const routes = await detectRoutes(repoPath, framework);

  const files: CodeImportFileEntry[] = [];
  const skipped: CodeImportSkipped[] = [];
  const queue: string[] = [repoPath];

  while (queue.length > 0) {
    const dir = queue.pop()!;
    if (Date.now() - startedAt > budgetMs) {
      skipped.push({ path: path.relative(repoPath, dir) || '.', reason: 'budget-exceeded' });
      // Drain remaining queue entries as budget-exceeded so the
      // human can see what we missed.
      for (const remaining of queue) {
        skipped.push({ path: path.relative(repoPath, remaining) || '.', reason: 'budget-exceeded' });
      }
      break;
    }
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(repoPath, abs);
      if (entry.isSymbolicLink()) {
        skipped.push({ path: rel, reason: 'symlink' });
        continue;
      }
      if (entry.isDirectory()) {
        if (SKIPLIST.has(entry.name)) {
          skipped.push({ path: rel, reason: 'directory-skiplist' });
          continue;
        }
        queue.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const lang = LANG_EXT[path.extname(entry.name).toLowerCase()];
      if (!lang) {
        skipped.push({ path: rel, reason: 'unsupported-extension' });
        continue;
      }
      const stat = await fsp.stat(abs);
      const fileEntry: CodeImportFileEntry = {
        path:     rel.split(path.sep).join('/'),
        size:     stat.size,
        language: lang,
      };
      if (stat.size > largeFileBytes) {
        skipped.push({ path: rel, reason: 'large-file' });
      } else if (lang === 'ts' || lang === 'tsx' || lang === 'js' || lang === 'jsx') {
        try {
          const text = await fsp.readFile(abs, 'utf8');
          const imports = extractImports(text);
          if (imports.length > 0) fileEntry.imports = imports;
        } catch {
          // best-effort; skip imports[]
        }
      }
      files.push(fileEntry);
    }
  }

  const index: CodeImportIndex = {
    files,
    skipped,
    framework,
    packageManager,
    styleSystem,
    walkedAt: new Date().toISOString(),
    walkBudgetMs: budgetMs,
  };
  if (pkg) index.packageJson = pkg;
  if (routes) index.routes = routes;

  // Persist under cwd.
  const dir = path.join(cwd, 'code');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
  return index;
}

async function readPackageJson(repoPath: string): Promise<CodeImportIndex['packageJson'] | undefined> {
  try {
    const raw = await fsp.readFile(path.join(repoPath, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as CodeImportIndex['packageJson'];
    return pkg ?? undefined;
  } catch {
    return undefined;
  }
}

function detectFramework(_repoPath: string, pkg: CodeImportIndex['packageJson']): CodeImportIndex['framework'] {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  if (deps['next'])              return 'next';
  if (deps['@sveltejs/kit'])     return 'sveltekit';
  if (deps['astro'])             return 'astro';
  if (deps['@remix-run/react'] || deps['@remix-run/node']) return 'remix';
  if (deps['vite'])              return 'vite';
  if (deps['react-scripts'])     return 'cra';
  if (deps['react'] || deps['vue'] || deps['svelte']) return 'custom';
  return 'unknown';
}

async function detectPackageManager(repoPath: string): Promise<CodeImportIndex['packageManager']> {
  if (await pathExists(path.join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await pathExists(path.join(repoPath, 'yarn.lock')))      return 'yarn';
  if (await pathExists(path.join(repoPath, 'bun.lockb')))      return 'bun';
  if (await pathExists(path.join(repoPath, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

function detectStyleSystem(pkg: CodeImportIndex['packageJson']): CodeImportIndex['styleSystem'] {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  if (deps['tailwindcss'])         return 'tailwind';
  if (deps['styled-components'])   return 'styled-components';
  if (deps['@emotion/react'])      return 'emotion';
  return 'unknown';
}

async function detectRoutes(
  repoPath: string,
  framework: CodeImportIndex['framework'],
): Promise<CodeImportIndex['routes']> {
  if (framework === 'next') {
    if (await pathExists(path.join(repoPath, 'app'))) return { kind: 'next-app' };
    if (await pathExists(path.join(repoPath, 'pages'))) return { kind: 'next-pages' };
    if (await pathExists(path.join(repoPath, 'src', 'app'))) return { kind: 'next-app' };
    if (await pathExists(path.join(repoPath, 'src', 'pages'))) return { kind: 'next-pages' };
    return { kind: 'unknown' };
  }
  if (framework === 'sveltekit') return { kind: 'sveltekit' };
  if (framework === 'remix' || framework === 'vite') return { kind: 'vite-router' };
  return undefined;
}

async function pathExists(p: string): Promise<boolean> {
  try { await fsp.access(p); return true; } catch { return false; }
}

function extractImports(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(text)) !== null) {
    const spec = match[1];
    if (!spec) continue;
    if (seen.has(spec)) continue;
    seen.add(spec);
    out.push(spec);
  }
  return out;
}
