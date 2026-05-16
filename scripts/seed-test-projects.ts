#!/usr/bin/env node
// Seed Open Design with pre-baked test projects so the UI has real slide
// decks and web prototypes to work with without waiting for an LLM run.
// Pulls each project's content straight from a skill or plugin
// `example.html`, drops it in as `index.html`, and adds a couple of fake
// chat messages so the conversation panel isn't empty.
//
// Usage:
//   pnpm seed:test-projects                    # default bundle
//   pnpm seed:test-projects --decks 2 --webs 2 # cap counts
//   pnpm seed:test-projects --daemon http://127.0.0.1:17456
//   pnpm seed:test-projects --namespace work-a     # discover tools-dev namespace
//   pnpm seed:test-projects --offline          # ingest into ./.od before boot
//   pnpm seed:test-projects --clear            # remove previously seeded projects
//
// The daemon URL is resolved in this order: --daemon flag > $OD_DAEMON_URL >
// http://127.0.0.1:$OD_PORT > whatever `pnpm tools-dev status --json` reports
// for the daemon app. --namespace is only passed to that tools-dev discovery
// step; it is not forwarded to the od CLI or stored in daemon data. The
// discovery step is what makes the two-shell flow
// (`pnpm tools-dev` then `pnpm seed:test-projects`) work without extra flags,
// because tools-dev defaults to an ephemeral daemon port that isn't exported
// to sibling shells.
//
// Seeded project ids start with `seed-` so `--clear` only touches the
// fixtures this script created.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const BUNDLED_PLUGIN_EXAMPLES_DIR = path.join(REPO_ROOT, 'plugins', '_official', 'examples');
const COMMUNITY_PLUGIN_EXAMPLES_DIR = path.join(REPO_ROOT, 'plugins', 'community', 'examples');
const SEED_PREFIX = 'seed-';

type SeedKind = 'deck' | 'prototype';
type SeedSourceKind = 'skill' | 'default-plugin' | 'community-plugin';
type SeedMode = 'auto' | 'online' | 'offline';

interface SeedFixture {
  skillId: string;
  sourceKind: SeedSourceKind;
  kind: SeedKind;
  name: string;
  pendingPrompt: string;
  pluginId?: string;
  // optional: path to the file inside skills/<skillId>/ to load as index.html
  // (defaults to example.html)
  source?: string;
}

// Local mirror of the daemon `ProjectFile` shape. Kept in sync with
// `packages/contracts/src/api/files.ts` — the assistant message stores
// `producedFiles: ProjectFile[]`, so we type the upload response against
// it instead of fabricating a string array.
interface ProjectFile {
  name: string;
  path?: string;
  type?: 'file' | 'dir';
  size: number;
  mtime: number;
  kind: string;
  mime: string;
}

interface ProjectFileResponse {
  file: ProjectFile;
}

interface SeedProjectSummary {
  id: string;
  metadata?: {
    seeded?: boolean;
    source?: string;
    sourceKind?: string;
    sourceId?: string;
    [k: string]: unknown;
  } | null;
}

interface OfflineDatabase {
  exec: (sql: string) => void;
  pragma: (sql: string) => void;
  prepare: (sql: string) => {
    all: (...args: unknown[]) => unknown[];
    get: (...args: unknown[]) => unknown;
    run: (...args: unknown[]) => unknown;
  };
  transaction: (fn: () => void) => () => void;
  close: () => void;
}

interface OfflineSeedContext {
  db: OfflineDatabase;
  dataDir: string;
  projectsDir: string;
}

const DECKS: SeedFixture[] = [
  {
    skillId: 'html-ppt-pitch-deck',
    sourceKind: 'skill',
    kind: 'deck',
    name: 'Pitch deck — Series A',
    pendingPrompt:
      'Make a 10-slide investor pitch deck for an AI design tool. Cover problem, solution, market, traction, ask.',
  },
  {
    skillId: 'kami-deck',
    sourceKind: 'skill',
    kind: 'deck',
    name: 'Kami deck — quarterly review',
    pendingPrompt:
      'Build a print-grade kami deck summarizing Q2 results: revenue, top wins, risks, next quarter.',
  },
  {
    skillId: 'html-ppt-weekly-report',
    sourceKind: 'skill',
    kind: 'deck',
    name: 'Weekly report — eng team',
    pendingPrompt:
      'Weekly report deck for an engineering team: shipped, in-progress, blockers, next-week plan.',
  },
  {
    skillId: 'html-ppt-product-launch',
    sourceKind: 'skill',
    kind: 'deck',
    name: 'Product launch — v2.0',
    pendingPrompt:
      'Product launch deck for v2.0: hero feature, before/after, pricing, rollout plan.',
  },
];

const WEBS: SeedFixture[] = [
  {
    skillId: 'open-design-landing',
    sourceKind: 'skill',
    kind: 'prototype',
    name: 'Editorial landing — Atelier Zero',
    pendingPrompt:
      'Single-page editorial landing page for an AI design tool. Magazine collage hero, sticky nav, scroll reveal.',
  },
  {
    skillId: 'kami-landing',
    sourceKind: 'skill',
    kind: 'prototype',
    name: 'Kami landing — white paper',
    pendingPrompt:
      'Print-grade kami landing — parchment canvas, ink-blue accent. Treat it like a studio one-pager.',
  },
  {
    skillId: 'dashboard',
    sourceKind: 'skill',
    kind: 'prototype',
    name: 'Admin dashboard — analytics',
    pendingPrompt:
      'Admin dashboard with KPI cards, a revenue chart, and a recent activity table. Fixed left sidebar.',
  },
];

const DEFAULT_PLUGINS: SeedFixture[] = [
  {
    skillId: 'html-ppt-pitch-deck',
    sourceKind: 'default-plugin',
    pluginId: 'example-html-ppt-pitch-deck',
    kind: 'deck',
    name: 'Default plugin — pitch deck',
    pendingPrompt:
      'Run the bundled pitch-deck plugin for a seed-stage AI design product and produce the HTML slide artifact.',
  },
  {
    skillId: 'dashboard',
    sourceKind: 'default-plugin',
    pluginId: 'example-dashboard',
    kind: 'prototype',
    name: 'Default plugin — analytics dashboard',
    pendingPrompt:
      'Run the bundled dashboard plugin for a product analytics control panel with KPIs and a weekly trend chart.',
  },
  {
    skillId: 'social-carousel',
    sourceKind: 'default-plugin',
    pluginId: 'example-social-carousel',
    kind: 'prototype',
    name: 'Default plugin — social carousel',
    pendingPrompt:
      'Run the bundled social carousel plugin for a three-card product launch announcement.',
  },
];

const COMMUNITY_PLUGINS: SeedFixture[] = [
  {
    skillId: 'create-prototype-dashboard',
    sourceKind: 'community-plugin',
    pluginId: 'create-prototype-dashboard',
    kind: 'prototype',
    name: 'Community plugin — ops dashboard',
    pendingPrompt:
      'Run the community prototype dashboard plugin for a launch operations room.',
  },
  {
    skillId: 'create-slides-pitch',
    sourceKind: 'community-plugin',
    pluginId: 'create-slides-pitch',
    kind: 'deck',
    name: 'Community plugin — founder pitch',
    pendingPrompt:
      'Run the community pitch slides plugin for a founder fundraising narrative.',
  },
  {
    skillId: 'create-live-artifact-ops',
    sourceKind: 'community-plugin',
    pluginId: 'create-live-artifact-ops',
    kind: 'prototype',
    name: 'Community plugin — live ops artifact',
    pendingPrompt:
      'Run the community live artifact plugin for a refreshable customer success command center.',
  },
];

interface Args {
  daemonUrl: string | null;
  dataDir: string | null;
  namespace: string | null;
  mode: SeedMode;
  decks: number;
  webs: number;
  defaultPlugins: number;
  communityPlugins: number;
  clear: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    daemonUrl: null,
    dataDir: null,
    namespace: null,
    mode: 'auto',
    decks: DECKS.length,
    webs: WEBS.length,
    defaultPlugins: DEFAULT_PLUGINS.length,
    communityPlugins: COMMUNITY_PLUGINS.length,
    clear: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--daemon' || a === '--daemon-url') {
      const value = argv[++i];
      if (!value) {
        console.error(`${a} requires a URL argument`);
        process.exit(2);
      }
      out.daemonUrl = value;
    } else if (a === '--data-dir') {
      const value = argv[++i];
      if (!value) {
        console.error('--data-dir requires a directory argument');
        process.exit(2);
      }
      out.dataDir = value;
    } else if (a === '--namespace') {
      const value = argv[++i];
      if (!value) {
        console.error('--namespace requires a name argument');
        process.exit(2);
      }
      out.namespace = value;
    } else if (a === '--mode') {
      const value = argv[++i];
      if (value !== 'auto' && value !== 'online' && value !== 'offline') {
        console.error('--mode must be one of: auto, online, offline');
        process.exit(2);
      }
      out.mode = value;
    } else if (a === '--online') {
      out.mode = 'online';
    } else if (a === '--offline') {
      out.mode = 'offline';
    } else if (a === '--decks') {
      out.decks = Math.max(0, Number(argv[++i]) || 0);
    } else if (a === '--webs' || a === '--prototypes') {
      out.webs = Math.max(0, Number(argv[++i]) || 0);
    } else if (a === '--default-plugins') {
      out.defaultPlugins = Math.max(0, Number(argv[++i]) || 0);
    } else if (a === '--community-plugins') {
      out.communityPlugins = Math.max(0, Number(argv[++i]) || 0);
    } else if (a === '--clear') {
      out.clear = true;
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`unknown flag: ${a}`);
      printHelp();
      process.exit(2);
    }
  }
  if (out.mode === 'offline' && out.daemonUrl) {
    console.error('--offline cannot be combined with --daemon/--daemon-url');
    process.exit(2);
  }
  return out;
}

function printHelp() {
  console.log(`Usage: pnpm seed:test-projects [opts]

Seeds Open Design with pre-baked, real HTML artifacts from:
  - Skills examples
  - Bundled default plugin examples
  - Community plugin examples

In online mode it writes through the running daemon API. In offline mode it
writes <dataDir>/app.sqlite plus <dataDir>/projects/* directly, so you can
ingest fixtures before starting pnpm tools-dev.

Options:
  --daemon <url>     Daemon base URL. When omitted, the script reads
                     \$OD_DAEMON_URL, then \$OD_PORT, and finally falls back
                     to discovering the URL from \`pnpm tools-dev status --json\`.
  --mode <mode>      auto | online | offline (default: auto). Auto uses the
                     daemon when one is discoverable; otherwise offline ingest.
  --online           Alias for --mode online.
  --offline          Alias for --mode offline.
  --data-dir <dir>   Offline target data dir (default: \$OD_DATA_DIR or ./.od).
  --namespace <name> Tools-dev namespace for online auto-discovery. This does
                     not affect od CLI behavior. Offline mode requires
                     --data-dir or OD_DATA_DIR when --namespace is set.
  --decks <n>        Number of slide decks to seed (default: ${DECKS.length}, max: ${DECKS.length})
  --webs <n>         Number of web prototypes to seed (default: ${WEBS.length}, max: ${WEBS.length})
  --default-plugins <n>
                     Number of bundled default plugin artifacts to seed
                     (default: ${DEFAULT_PLUGINS.length}, max: ${DEFAULT_PLUGINS.length})
  --community-plugins <n>
                     Number of community plugin artifacts to seed
                     (default: ${COMMUNITY_PLUGINS.length}, max: ${COMMUNITY_PLUGINS.length})
  --clear            Delete every previously seeded project (id prefix '${SEED_PREFIX}')
  -h, --help         Show this help

Online daemon URL resolution (first match wins):
  1. \`--daemon <url>\` on the command line.
  2. \`OD_DAEMON_URL\` env var.
  3. \`http://127.0.0.1:\$OD_PORT\` when \`OD_PORT\` is set to a real port.
  4. Auto-discovered from \`pnpm tools-dev status --json\`. \`tools-dev\` defaults
     to an ephemeral daemon port, so a typical two-shell flow works without
     extra flags:
       pnpm tools-dev          # in one shell
       pnpm seed:test-projects # in another — discovers the running daemon
     For a non-default tools-dev namespace, pass \`--namespace <name>\` so the
     status lookup reads that namespace.

Offline ingest before boot:
  pnpm seed:test-projects --offline --data-dir ./.od
  pnpm tools-dev
`);
}

function isDiscoverablePort(value: string | undefined): value is string {
  if (value == null || value.length === 0) return false;
  // tools-dev sets OD_PORT=0 to mean "ephemeral, look at runtime status",
  // which is unusable as a target. Treat it the same as unset so we fall
  // through to the discovery path.
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536;
}

async function discoverDaemonUrlFromToolsDev(namespace: string | null): Promise<string | null> {
  return await new Promise<string | null>((resolve) => {
    let child;
    try {
      // `--silent` suppresses pnpm's own warnings (notably "Unsupported
      // engine" when the local node version doesn't match the repo's
      // engines.node). Without it, those warnings land on stdout under a
      // nested pnpm context and break the JSON parse below.
      const statusArgs = ['--silent', 'exec', 'tools-dev', 'status', '--json'];
      if (namespace) statusArgs.push('--namespace', namespace);
      child = spawn('pnpm', statusArgs, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      resolve(null);
      return;
    }
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    child.stderr?.resume();
    child.on('error', () => resolve(null));
    child.on('exit', () => {
      const url = extractDaemonUrlFromStatusOutput(stdout);
      resolve(url);
    });
  });
}

// Robust against any leading non-JSON noise pnpm or a wrapper might still
// print on stdout (engine warnings, recursive run banners, deprecation
// notices). Find the first `{` and try to parse the JSON object that
// starts there; if that fails, walk forward to the next `{`. This keeps
// discovery working even if a future pnpm version regresses around
// `--silent`.
function extractDaemonUrlFromStatusOutput(stdout: string): string | null {
  for (let i = stdout.indexOf('{'); i !== -1; i = stdout.indexOf('{', i + 1)) {
    try {
      const parsed = JSON.parse(stdout.slice(i)) as {
        apps?: { daemon?: { url?: string | null } };
        url?: string | null;
      };
      const url = parsed?.apps?.daemon?.url ?? parsed?.url ?? null;
      if (typeof url === 'string' && url.length > 0) return url;
    } catch {
      // try the next `{`
    }
  }
  return null;
}

async function resolveDaemonUrl(args: Args, { required }: { required: boolean }): Promise<string | null> {
  if (args.daemonUrl) return args.daemonUrl;
  if (process.env.OD_DAEMON_URL) return process.env.OD_DAEMON_URL;
  if (isDiscoverablePort(process.env.OD_PORT)) {
    return `http://127.0.0.1:${process.env.OD_PORT}`;
  }
  const discovered = await discoverDaemonUrlFromToolsDev(args.namespace);
  if (discovered) return discovered;
  if (!required) return null;
  throw new Error(
    'cannot determine daemon URL: no --daemon flag, no OD_DAEMON_URL, ' +
      'no usable OD_PORT, and `pnpm tools-dev status --json` did not report a ' +
      'running daemon. Start the daemon (e.g. `pnpm tools-dev`), pass ' +
      '`--daemon http://127.0.0.1:<port>`, or use `--offline` to ingest ' +
      'fixtures before startup.',
  );
}

async function api<T = unknown>(
  daemonUrl: string,
  method: string,
  pathPart: string,
  body?: unknown,
): Promise<T> {
  const url = `${daemonUrl.replace(/\/$/, '')}${pathPart}`;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let resp: Response;
  try {
    resp = await fetch(url, init);
  } catch (err) {
    throw new Error(
      `cannot reach daemon at ${daemonUrl} — start it with \`pnpm tools-dev\` ` +
        `(underlying error: ${(err as Error).message || String(err)})`,
    );
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`${method} ${pathPart} → ${resp.status}: ${text}`);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

function makeSeedId(fix: SeedFixture): string {
  // unique-ish, sortable, easy to spot in the UI / db
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  // Slug must match [A-Za-z0-9._-]{1,128}, see daemon validation.
  const slug = `${fix.sourceKind}-${fix.skillId}`.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 60);
  return `${SEED_PREFIX}${slug}-${ts}-${rand}`.slice(0, 128);
}

function fixtureRoot(fix: SeedFixture): string {
  if (fix.sourceKind === 'default-plugin') {
    return path.join(BUNDLED_PLUGIN_EXAMPLES_DIR, fix.skillId);
  }
  if (fix.sourceKind === 'community-plugin') {
    return path.join(COMMUNITY_PLUGIN_EXAMPLES_DIR, fix.skillId);
  }
  return path.join(SKILLS_DIR, fix.skillId);
}

function sourceLabel(fix: SeedFixture): string {
  if (fix.sourceKind === 'default-plugin') return `plugins/_official/examples/${fix.skillId}`;
  if (fix.sourceKind === 'community-plugin') return `plugins/community/examples/${fix.skillId}`;
  return `skills/${fix.skillId}`;
}

function seedMetadata(fix: SeedFixture) {
  return {
    kind: fix.kind,
    seeded: true,
    source: 'seed-test-projects',
    sourceKind: fix.sourceKind,
    sourceId: fix.skillId,
    pluginId: fix.pluginId ?? null,
    entryFile: 'index.html',
  };
}

async function loadExample(fix: SeedFixture): Promise<string> {
  const file = path.join(fixtureRoot(fix), fix.source ?? 'example.html');
  return readFile(file, 'utf8');
}

async function seedOneOnline(daemonUrl: string, fix: SeedFixture): Promise<string> {
  const html = await loadExample(fix);
  const id = makeSeedId(fix);
  process.stdout.write(`  - ${fix.kind.padEnd(9)} ${id}  (${sourceLabel(fix)})\n`);

  const created = await api<{
    project: { id: string };
    conversationId: string;
  }>(daemonUrl, 'POST', '/api/projects', {
    id,
    name: fix.name,
    skillId: fix.sourceKind === 'skill' ? fix.skillId : null,
    pendingPrompt: fix.pendingPrompt,
    metadata: seedMetadata(fix),
  });

  const uploaded = await api<ProjectFileResponse>(
    daemonUrl,
    'POST',
    `/api/projects/${id}/files`,
    {
      name: 'index.html',
      content: html,
      encoding: 'utf8',
    },
  );

  await api(daemonUrl, 'PUT', `/api/projects/${id}/tabs`, {
    tabs: ['index.html'],
    active: 'index.html',
  });

  // Fake chat history so the conversation panel isn't empty. Two messages
  // is enough for the recent-activity sort and for the assistant bubble
  // to render with a producedFiles chip.
  const cid = created.conversationId;
  const userMid = `seed-msg-user-${Date.now().toString(36)}`;
  const asstMid = `seed-msg-asst-${Date.now().toString(36)}`;
  const now = Date.now();
  await api(
    daemonUrl,
    'PUT',
    `/api/projects/${id}/conversations/${cid}/messages/${userMid}`,
    {
      role: 'user',
      content: fix.pendingPrompt,
      createdAt: now,
    },
  );
  await api(
    daemonUrl,
    'PUT',
    `/api/projects/${id}/conversations/${cid}/messages/${asstMid}`,
    {
      role: 'assistant',
      content:
        `Seeded \`index.html\` from \`${sourceLabel(fix)}/${fix.source ?? 'example.html'}\` ` +
        `as a starting point. Open the preview tab to see the rendered ${fix.kind}.`,
      agentId: 'seed-script',
      agentName: 'seed-test-projects',
      runStatus: 'succeeded',
      startedAt: now,
      endedAt: now,
      producedFiles: [uploaded.file],
      createdAt: now,
    },
  );
  return id;
}

function expandHomePrefix(raw: string): string {
  if (raw === '~' || raw === '$HOME' || raw === '${HOME}') return os.homedir();
  const match = /^(~|\$\{HOME\}|\$HOME)[/\\](.*)$/.exec(raw);
  if (match) return path.join(os.homedir(), match[2] ?? '');
  return raw;
}

function resolveDataDir(raw: string | null): string {
  const value = raw ?? process.env.OD_DATA_DIR ?? path.join(REPO_ROOT, '.od');
  const expanded = expandHomePrefix(value);
  return path.isAbsolute(expanded) ? expanded : path.resolve(REPO_ROOT, expanded);
}

function assertOfflineDataDirIsExplicit(args: Args): void {
  if (args.namespace && !args.dataDir && !process.env.OD_DATA_DIR) {
    throw new Error(
      '--namespace is only a tools-dev discovery selector. Offline mode with ' +
        '--namespace requires --data-dir or OD_DATA_DIR so the script does not ' +
        'guess a namespace-scoped daemon data directory.',
    );
  }
}

function loadBetterSqlite(): new (filename: string) => OfflineDatabase {
  const daemonRequire = createRequire(path.join(REPO_ROOT, 'apps', 'daemon', 'package.json'));
  return daemonRequire('better-sqlite3') as new (filename: string) => OfflineDatabase;
}

function ensureColumn(db: OfflineDatabase, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<Record<string, unknown>>;
  if (!cols.some((c) => c['name'] === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrateOffline(db: OfflineDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skill_id TEXT,
      design_system_id TEXT,
      pending_prompt TEXT,
      metadata_json TEXT,
      applied_plugin_snapshot_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT,
      applied_plugin_snapshot_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conv_project
      ON conversations(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      agent_id TEXT,
      agent_name TEXT,
      run_id TEXT,
      run_status TEXT,
      last_run_event_id TEXT,
      events_json TEXT,
      attachments_json TEXT,
      comment_attachments_json TEXT,
      produced_files_json TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv
      ON messages(conversation_id, position);

    CREATE TABLE IF NOT EXISTS tabs (
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(project_id, name),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tabs_project
      ON tabs(project_id, position);
  `);
  ensureColumn(db, 'projects', 'metadata_json', 'TEXT');
  ensureColumn(db, 'projects', 'applied_plugin_snapshot_id', 'TEXT');
  ensureColumn(db, 'conversations', 'applied_plugin_snapshot_id', 'TEXT');
  ensureColumn(db, 'messages', 'agent_id', 'TEXT');
  ensureColumn(db, 'messages', 'agent_name', 'TEXT');
  ensureColumn(db, 'messages', 'run_id', 'TEXT');
  ensureColumn(db, 'messages', 'run_status', 'TEXT');
  ensureColumn(db, 'messages', 'last_run_event_id', 'TEXT');
  ensureColumn(db, 'messages', 'comment_attachments_json', 'TEXT');
  ensureColumn(db, 'messages', 'produced_files_json', 'TEXT');
}

async function openOfflineSeedContext(args: Args): Promise<OfflineSeedContext> {
  assertOfflineDataDirIsExplicit(args);
  const dataDir = resolveDataDir(args.dataDir);
  await mkdir(dataDir, { recursive: true });
  const Database = loadBetterSqlite();
  const db = new Database(path.join(dataDir, 'app.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrateOffline(db);
  const projectsDir = path.join(dataDir, 'projects');
  await mkdir(projectsDir, { recursive: true });
  return { db, dataDir, projectsDir };
}

function projectFileMeta(filePath: string, size: number, mtime: number): ProjectFile {
  return {
    name: filePath,
    path: filePath,
    type: 'file',
    size,
    mtime,
    kind: filePath.endsWith('.html') || filePath.endsWith('.htm') ? 'html' : 'code',
    mime: filePath.endsWith('.html') || filePath.endsWith('.htm')
      ? 'text/html; charset=utf-8'
      : 'application/octet-stream',
  };
}

async function seedOneOffline(ctx: OfflineSeedContext, fix: SeedFixture): Promise<string> {
  const html = await loadExample(fix);
  const id = makeSeedId(fix);
  process.stdout.write(`  - ${fix.kind.padEnd(9)} ${id}  (${sourceLabel(fix)})\n`);

  const projectDir = path.join(ctx.projectsDir, id);
  await mkdir(projectDir, { recursive: true });
  const entryFile = 'index.html';
  const entryPath = path.join(projectDir, entryFile);
  await writeFile(entryPath, html, 'utf8');
  const written = await stat(entryPath);
  const file = projectFileMeta(entryFile, written.size, written.mtimeMs);
  const conversationId = `seed-conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const userMid = `seed-msg-user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const asstMid = `seed-msg-asst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  const metadata = seedMetadata(fix);

  const tx = ctx.db.transaction(() => {
    ctx.db.prepare(
      `INSERT INTO projects
         (id, name, skill_id, design_system_id, pending_prompt,
          metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      fix.name,
      fix.sourceKind === 'skill' ? fix.skillId : null,
      null,
      fix.pendingPrompt,
      JSON.stringify(metadata),
      now,
      now,
    );
    ctx.db.prepare(
      `INSERT INTO conversations
         (id, project_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(conversationId, id, null, now, now);
    ctx.db.prepare(
      `INSERT INTO tabs (project_id, name, position, is_active)
       VALUES (?, ?, ?, ?)`,
    ).run(id, entryFile, 0, 1);
    ctx.db.prepare(
      `INSERT INTO messages
         (id, conversation_id, role, content, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userMid, conversationId, 'user', fix.pendingPrompt, 0, now);
    ctx.db.prepare(
      `INSERT INTO messages
         (id, conversation_id, role, content, agent_id, agent_name,
          run_status, produced_files_json, started_at, ended_at, position,
          created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      asstMid,
      conversationId,
      'assistant',
      `Seeded \`index.html\` from \`${sourceLabel(fix)}/${fix.source ?? 'example.html'}\` as a starting point. Open the preview tab to see the rendered ${fix.kind}.`,
      'seed-script',
      'seed-test-projects',
      'succeeded',
      JSON.stringify([file]),
      now,
      now,
      1,
      now,
    );
  });
  tx();
  return id;
}

async function clearSeededOnline(daemonUrl: string): Promise<void> {
  const { projects } = await api<{ projects: SeedProjectSummary[] }>(
    daemonUrl,
    'GET',
    '/api/projects',
  );
  // Project ids are caller-supplied through the public daemon API, so
  // the `seed-` prefix alone is not a strong enough marker for a
  // destructive delete. Require both the prefix AND the metadata stamp
  // we wrote in `seedOne` so a manually-created project that happens to
  // share the prefix is left alone.
  const seeded = projects.filter(
    (p) =>
      p.id.startsWith(SEED_PREFIX) &&
      p.metadata?.seeded === true &&
      p.metadata?.source === 'seed-test-projects',
  );
  if (seeded.length === 0) {
    console.log('no seeded projects to remove.');
    return;
  }
  console.log(`removing ${seeded.length} seeded project(s):`);
  for (const p of seeded) {
    process.stdout.write(`  - ${p.id}\n`);
    await api(daemonUrl, 'DELETE', `/api/projects/${p.id}`);
  }
}

async function clearSeededOffline(ctx: OfflineSeedContext): Promise<void> {
  const rows = ctx.db.prepare(
    `SELECT id, metadata_json AS metadataJson FROM projects`,
  ).all() as Array<{ id?: unknown; metadataJson?: unknown }>;
  const seeded = rows.filter((row) => {
    if (typeof row.id !== 'string' || !row.id.startsWith(SEED_PREFIX)) return false;
    if (typeof row.metadataJson !== 'string') return false;
    try {
      const metadata = JSON.parse(row.metadataJson) as SeedProjectSummary['metadata'];
      return metadata?.seeded === true && metadata.source === 'seed-test-projects';
    } catch {
      return false;
    }
  });
  if (seeded.length === 0) {
    console.log('no seeded projects to remove.');
    return;
  }
  console.log(`removing ${seeded.length} seeded project(s):`);
  for (const row of seeded) {
    const id = String(row.id);
    process.stdout.write(`  - ${id}\n`);
    ctx.db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
    await rm(path.join(ctx.projectsDir, id), { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const daemonUrl = args.mode === 'offline'
    ? null
    : await resolveDaemonUrl(args, { required: args.mode === 'online' });
  const mode: Exclude<SeedMode, 'auto'> = args.mode === 'offline' || !daemonUrl
    ? 'offline'
    : 'online';
  const onlineDaemonUrl = mode === 'online' ? daemonUrl : null;

  if (args.clear) {
    if (mode === 'online') {
      if (!onlineDaemonUrl) throw new Error('online mode requires a daemon URL');
      await clearSeededOnline(onlineDaemonUrl);
      return;
    }
    const ctx = await openOfflineSeedContext(args);
    try {
      await clearSeededOffline(ctx);
    } finally {
      ctx.db.close();
    }
    return;
  }

  const decks = DECKS.slice(0, args.decks);
  const webs = WEBS.slice(0, args.webs);
  const defaultPlugins = DEFAULT_PLUGINS.slice(0, args.defaultPlugins);
  const communityPlugins = COMMUNITY_PLUGINS.slice(0, args.communityPlugins);
  const fixtures = [...decks, ...webs, ...defaultPlugins, ...communityPlugins];
  if (fixtures.length === 0) {
    console.error('--decks 0, --webs 0, --default-plugins 0, and --community-plugins 0 — nothing to do.');
    process.exit(2);
  }

  const target = mode === 'online'
    ? onlineDaemonUrl
    : resolveDataDir(args.dataDir);
  console.log(
    `seeding ${decks.length} skill deck(s) + ${webs.length} skill web prototype(s) + ` +
      `${defaultPlugins.length} default plugin artifact(s) + ` +
      `${communityPlugins.length} community plugin artifact(s) → ${mode}:${target}`,
  );
  const failures: string[] = [];
  const createdIds: string[] = [];
  if (mode === 'online') {
    if (!onlineDaemonUrl) throw new Error('online mode requires a daemon URL');
    for (const fix of fixtures) {
      try {
        createdIds.push(await seedOneOnline(onlineDaemonUrl, fix));
      } catch (err) {
        failures.push(fix.skillId);
        console.error(`  ! ${sourceLabel(fix)} failed: ${(err as Error).message}`);
      }
    }
  } else {
    const ctx = await openOfflineSeedContext(args);
    try {
      for (const fix of fixtures) {
        try {
          createdIds.push(await seedOneOffline(ctx, fix));
        } catch (err) {
          failures.push(fix.skillId);
          console.error(`  ! ${sourceLabel(fix)} failed: ${(err as Error).message}`);
        }
      }
    } finally {
      ctx.db.close();
    }
  }
  if (failures.length > 0) {
    console.error(
      `done with ${failures.length} failure(s): ${failures.join(', ')}`,
    );
    process.exit(1);
  }
  console.log(`done. Seeded ${createdIds.length} project(s).`);
  if (mode === 'offline') {
    console.log('Start the daemon/web UI next; the seeded projects will show up in the project list.');
  } else {
    console.log('Open the web UI — the seeded projects show up in the project list.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
