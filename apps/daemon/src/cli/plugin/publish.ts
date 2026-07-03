// @ts-nocheck
/**
 * @module cli/plugin/publish
 */
import { parseFlags } from '../core/index.js';
import { pluginCliValidateFolder } from './dev.js';
import { execFileBuffered, execGhBuffered, isRepoNotFound, normalizeManifestRepoForOwner, parseGithubRepoUrl, resolvePluginGithubTarget, spawnGhPassthrough } from './github.js';
import { pluginDaemonUrl } from './manage.js';
import { parseCliPluginSpecifier } from './marketplace.js';

export async function runPluginLogin(rest) {
  const flags = parseFlags(rest, {
    string: new Set(['host']),
    boolean: new Set(['help', 'h']),
  });
  if (flags.help || flags.h) {
    console.log(`Usage:
  od plugin login [--host github.com]

Wraps GitHub CLI auth for Open Design registry publishing. The token stays in gh.`);
    return;
  }
  const host = typeof flags.host === 'string' ? flags.host : 'github.com';
  const version = await execGhBuffered(['--version'], { timeout: 10_000 });
  if (!version.ok) {
    console.error('[plugin login] GitHub CLI is required. Install gh from https://cli.github.com/ and retry.');
    process.exit(1);
  }
  const result = await spawnGhPassthrough(['auth', 'login', '--hostname', host, '--web']);
  process.exit(result.code ?? 0);
}

export async function runPluginWhoami(rest) {
  const flags = parseFlags(rest, {
    string: new Set(['host']),
    boolean: new Set(['help', 'h', 'json']),
  });
  if (flags.help || flags.h) {
    console.log(`Usage:
  od plugin whoami [--host github.com] [--json]

Shows the GitHub account gh will use for Open Design registry publishing.`);
    return;
  }
  const host = typeof flags.host === 'string' ? flags.host : 'github.com';
  const auth = await execGhBuffered(['auth', 'status', '--hostname', host], { timeout: 10_000 });
  if (!auth.ok) {
    if (flags.json) {
      process.stdout.write(JSON.stringify({
        ok: false,
        host,
        message: 'GitHub CLI is not authenticated for this host.',
        log: auth.stderr || auth.stdout,
      }, null, 2) + '\n');
      return;
    }
    console.error(`[plugin whoami] gh is not authenticated for ${host}. Run: od plugin login --host ${host}`);
    if (auth.stderr || auth.stdout) console.error(auth.stderr || auth.stdout);
    process.exit(1);
  }
  const user = await execGhBuffered(['api', 'user', '--hostname', host], { timeout: 10_000 });
  let login = '';
  let name = '';
  try {
    const parsed = JSON.parse(user.stdout || '{}');
    login = typeof parsed.login === 'string' ? parsed.login : '';
    name = typeof parsed.name === 'string' ? parsed.name : '';
  } catch {
    // Keep the auth status useful even if gh api output is unavailable.
  }
  const payload = {
    ok: true,
    host,
    login,
    name,
    auth: auth.stderr || auth.stdout,
  };
  if (flags.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    console.log(`[plugin whoami] ${login || 'authenticated'}${name ? ` (${name})` : ''} @ ${host}`);
  }
}

// Phase 4 / spec §14.1 — `od plugin publish --to <catalog>`.
//
// Reads the installed plugin's manifest metadata (or the snapshot's
// frozen view via --snapshot-id) and prints the catalog submission URL
// + PR body. With `--open` the CLI auto-launches the system browser
// against the URL so the author lands on the catalog's submission form
// in one step. We never POST anywhere — the upstream review flow is
// always under the author's control.
export async function runPluginPublish(rest) {
  const flags = parseFlags(rest, {
    string: new Set(['daemon-url', 'to', 'snapshot-id', 'repo', 'catalog']),
    boolean: new Set(['help', 'h', 'json', 'open']),
  });
  if (rest.length === 0 || flags.help || flags.h) {
    console.log(`Usage:
  od plugin publish <pluginId> --to open-design|anthropics-skills|awesome-agent-skills|clawhub|skills-sh
                    [--repo <github-url>] [--snapshot-id <id>] [--open] [--json]
  od plugin publish <pluginId> --to marketplace-json --catalog ./open-design-marketplace.json --repo <github-url>

The CLI prints the catalog's submission URL + a pre-filled PR body.
Pass --open to auto-launch the system browser. Use --snapshot-id to
publish from a frozen run snapshot rather than the live installed copy.`);
    process.exit(rest.length === 0 ? 2 : 0);
  }
  const id = rest.find((a) => !a.startsWith('-')
    && a !== flags.to
    && a !== flags.repo
    && a !== flags['snapshot-id']);
  const target = String(flags.to ?? '');
  if (!id) {
    console.error('Usage: od plugin publish <pluginId> --to <catalog>');
    process.exit(2);
  }
  if (!target) {
    console.error('--to <catalog> is required (one of: open-design, anthropics-skills, awesome-agent-skills, clawhub, skills-sh)');
    process.exit(2);
  }
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  // Pull the plugin metadata from the daemon. We do this through the
  // existing /api/plugins/:id endpoint so the CLI never needs a direct
  // SQLite handle; everything stays loopback-mediated.
  let meta = { pluginId: id, pluginVersion: '0.0.0' };
  try {
    const resp = await fetch(`${base}/api/plugins/${encodeURIComponent(id)}`);
    if (resp.ok) {
      const row = await resp.json();
      // The daemon's plugin row carries a stored `version` plus the full
      // manifest. For project-local plugins (`generated-plugin/`, snapshots,
      // freshly imported folders) the stored `version` is `'0.0.0'` until
      // the registry handshake runs, but the manifest's `version` is the
      // real value the author wrote. Mirror `plugins/marketplaces.ts:298,328`
      // and prefer the manifest version when the stored row reads as the
      // pre-handshake sentinel. Closes #1765.
      const storedVersion = typeof row.version === 'string' && row.version.length > 0
        ? row.version
        : null;
      const manifestVersion = typeof row.manifest?.version === 'string' && row.manifest.version.length > 0
        ? row.manifest.version
        : null;
      const resolvedVersion = (storedVersion && storedVersion !== '0.0.0')
        ? storedVersion
        : (manifestVersion ?? storedVersion ?? '0.0.0');
      meta = {
        pluginId:          row.id ?? id,
        pluginVersion:     resolvedVersion,
        ...(row.title              ? { pluginTitle: row.title }                       : {}),
        ...(row.manifest?.description ? { pluginDescription: row.manifest.description } : {}),
      };
    }
  } catch {
    // Best-effort; if the daemon isn't reachable we still try to build
    // a link from the user's flags so the author doesn't need a daemon
    // to publish.
  }
  if (typeof flags.repo === 'string' && flags.repo.length > 0) {
    meta.repoUrl = flags.repo;
  }
  if (target === 'marketplace-json') {
    if (typeof flags.catalog !== 'string' || flags.catalog.length === 0) {
      console.error('--catalog <path> is required for --to marketplace-json');
      process.exit(2);
    }
    if (!meta.repoUrl) {
      console.error('--repo <github-url> is required for --to marketplace-json so the source can be reproduced');
      process.exit(2);
    }
    const outcome = await publishToMarketplaceJson({
      catalogPath: flags.catalog,
      meta,
    });
    if (flags.json) {
      process.stdout.write(JSON.stringify(outcome, null, 2) + '\n');
    } else {
      console.log(`[publish] updated ${outcome.catalogPath}`);
      console.log(`[publish] ${outcome.entry.name}@${outcome.entry.version} -> ${outcome.entry.source}`);
    }
    return;
  }
  const { buildPublishLink, PublishError } = await import('./plugins/publish.js');
  let link;
  try {
    link = buildPublishLink({ catalog: target, meta });
  } catch (err) {
    if (err instanceof PublishError) {
      console.error(`[publish] ${err.message}`);
      process.exit(2);
    }
    throw err;
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(link, null, 2) + '\n');
  } else {
    console.log(`[publish] ${link.catalogLabel}`);
    console.log(link.url);
    console.log('---');
    console.log(link.prBody);
  }
  if (flags.open) {
    const opener = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';
    const { spawn } = await import('node:child_process');
    spawn(opener, [link.url], { detached: true, stdio: 'ignore' }).unref();
  }
}

export async function runPluginPublishRepo(rest) {
  const flags = parseFlags(rest, {
    string: new Set(['host', 'owner']),
    boolean: new Set(['help', 'h', 'json', 'dry-run']),
  });
  if (rest.length === 0 || flags.help || flags.h) {
    console.log(`Usage:
  od plugin publish-repo <folder> [--host github.com] [--owner github-login-or-org] [--dry-run] [--json]

Creates or updates the public GitHub repository named by the plugin manifest.
If plugin.repo is missing or uses a placeholder owner, the CLI resolves the
target from --owner, a trusted manifest owner, local gh auth status, then the
GitHub API as a last resort. It never publishes to placeholder owners.`);
    process.exit(rest.length === 0 ? 2 : 0);
  }
  const folder = rest.find((a) => !a.startsWith('-') && a !== flags.host && a !== flags.owner);
  if (!folder) {
    console.error('Usage: od plugin publish-repo <folder>');
    process.exit(2);
  }

  const [{ resolve, join }, { readFile, writeFile, stat, mkdtemp, readdir, rm, mkdir, cp }, { pathToFileURL }, os] = await Promise.all([
    import('node:path'),
    import('node:fs/promises'),
    import('node:url'),
    import('node:os'),
  ]);
  const absFolder = resolve(process.cwd(), folder);
  const manifestPath = resolve(absFolder, 'open-design.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const host = typeof flags.host === 'string' ? flags.host : 'github.com';
  const target = await resolvePluginGithubTarget({ host, owner: flags.owner, manifest, purpose: 'publish-repo' });
  const normalized = normalizeManifestRepoForOwner(manifest, target.owner);
  if (normalized.changed && !flags['dry-run']) {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await pluginCliValidateFolder(absFolder);
  }

  const repo = parseGithubRepoUrl(normalized.repoUrl);
  if (!repo) {
    console.error(`[publish-repo] invalid plugin.repo after normalization: ${normalized.repoUrl}`);
    process.exit(2);
  }
  const steps = [];
  const run = async (label, command, args, opts = {}) => {
    steps.push({ label, command: [command, ...args].join(' ') });
    if (flags['dry-run']) return { ok: true, stdout: '', stderr: '' };
    const result = await (command === 'gh'
      ? execGhBuffered(args, { cwd: opts.cwd ?? absFolder, timeout: opts.timeout ?? 120_000 })
      : execFileBuffered(command, args, { cwd: opts.cwd ?? absFolder, timeout: opts.timeout ?? 120_000 }));
    steps[steps.length - 1].ok = result.ok;
    steps[steps.length - 1].stdout = result.stdout;
    steps[steps.length - 1].stderr = result.stderr;
    if (!result.ok) {
      emitPluginWorkflowResult(flags, {
        ok: false,
        action: 'publish-repo',
        folder: absFolder,
        repoUrl: normalized.repoUrl,
        login: target.login,
        owner: target.owner,
        ownerSource: target.ownerSource,
        apiRateLimited: target.apiRateLimited,
        steps,
        error: { label, stdout: result.stdout, stderr: result.stderr, code: result.code },
      });
      process.exit(1);
    }
    return result;
  };

  let exists = false;
  const view = flags['dry-run']
    ? { ok: false, stderr: 'dry-run' }
    : await execGhBuffered(['repo', 'view', repo.fullName], { cwd: absFolder, timeout: 30_000 });
  steps.push({ label: 'check repo', command: `gh repo view ${repo.fullName}`, ok: view.ok, stdout: view.stdout, stderr: view.stderr });
  if (view.ok) {
    exists = true;
  } else if (!flags['dry-run'] && !isRepoNotFound(view)) {
    emitPluginWorkflowResult(flags, {
      ok: false,
      action: 'publish-repo',
      folder: absFolder,
      repoUrl: normalized.repoUrl,
      login: target.login,
      owner: target.owner,
      ownerSource: target.ownerSource,
      apiRateLimited: target.apiRateLimited,
      steps,
      error: { label: 'check repo', stdout: view.stdout, stderr: view.stderr, code: view.code },
    });
    process.exit(1);
  }

  let workdir = absFolder;
  let cleanupDir = null;
  if (exists && !flags['dry-run']) {
    cleanupDir = await mkdtemp(join(os.tmpdir(), 'od-plugin-publish-sync-'));
    workdir = join(cleanupDir, repo.name);
    await run('clone repo', 'gh', ['repo', 'clone', repo.fullName, workdir], { cwd: cleanupDir, timeout: 240_000 });
    for (const entry of await readdir(workdir)) {
      if (entry === '.git') continue;
      await rm(join(workdir, entry), { recursive: true, force: true });
    }
    await mkdir(workdir, { recursive: true });
    for (const entry of await readdir(absFolder)) {
      if (entry === '.git') continue;
      await cp(join(absFolder, entry), join(workdir, entry), { recursive: true, force: true });
    }
  } else if (!flags['dry-run']) {
    let hasGit = false;
    try { await stat(resolve(absFolder, '.git')); hasGit = true; } catch {}
    if (!hasGit) await run('git init', 'git', ['init']);
  }

  await run('git add', 'git', ['add', '-A'], { cwd: workdir });
  const status = flags['dry-run']
    ? { stdout: 'dry-run' }
    : await execFileBuffered('git', ['status', '--porcelain'], { cwd: workdir });
  if (status.stdout.trim().length > 0 || !exists) {
    const commitMessage = exists
      ? `Update: ${manifest.name} v${manifest.version ?? '0.0.0'}`
      : `Initial commit: ${manifest.name} v${manifest.version ?? '0.0.0'}`;
    await run('git commit', 'git', ['commit', '-m', commitMessage], { cwd: workdir });
  }
  const tag = `v${manifest.version ?? '0.0.0'}`;
  if (!flags['dry-run']) {
    const localTag = await execFileBuffered('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], { cwd: workdir });
    if (!localTag.ok) await run('git tag', 'git', ['tag', tag], { cwd: workdir });
  }

  if (exists) {
    await run('git push', 'git', ['push', 'origin', 'HEAD'], { cwd: workdir });
  } else {
    await run('gh repo create', 'gh', [
      'repo', 'create', repo.fullName, '--public', '--source', '.', '--push',
      '--description', String(manifest.description ?? ''),
    ], { cwd: workdir });
  }
  await run('git push tags', 'git', ['push', '--tags'], { cwd: workdir });
  const verify = flags['dry-run']
    ? { ok: true, stdout: JSON.stringify({ nameWithOwner: repo.fullName, url: normalized.repoUrl }) }
    : await run('verify repo', 'gh', ['repo', 'view', repo.fullName, '--json', 'url,nameWithOwner'], { cwd: workdir });
  const parsedVerify = safeJson(verify.stdout);
  if (cleanupDir && !flags['dry-run']) {
    await rm(cleanupDir, { recursive: true, force: true }).catch(() => undefined);
  }
  emitPluginWorkflowResult(flags, {
    ok: true,
    action: 'publish-repo',
    folder: absFolder,
    login: target.login,
    owner: target.owner,
    ownerSource: target.ownerSource,
    apiRateLimited: target.apiRateLimited,
    repoUrl: parsedVerify?.url ?? normalized.repoUrl,
    manifestRewritten: normalized.changed,
    manifestPath: pathToFileURL(manifestPath).pathname,
    steps,
  });
}

export async function runPluginOpenDesignPr(rest) {
  const flags = parseFlags(rest, {
    string: new Set(['host', 'owner']),
    boolean: new Set(['help', 'h', 'json', 'dry-run']),
  });
  if (rest.length === 0 || flags.help || flags.h) {
    console.log(`Usage:
  od plugin open-design-pr <folder> [--host github.com] [--owner github-login-or-fork-owner] [--dry-run] [--json]

Copies a local plugin folder into plugins/community/<name>/ on the author's
fork of nexu-io/open-design, pushes a branch, and opens the PR form with --web.`);
    process.exit(rest.length === 0 ? 2 : 0);
  }
  const folder = rest.find((a) => !a.startsWith('-') && a !== flags.host && a !== flags.owner);
  if (!folder) {
    console.error('Usage: od plugin open-design-pr <folder>');
    process.exit(2);
  }
  const [{ resolve, join }, fsp, os] = await Promise.all([
    import('node:path'),
    import('node:fs/promises'),
    import('node:os'),
  ]);
  const absFolder = resolve(process.cwd(), folder);
  const manifestPath = resolve(absFolder, 'open-design.json');
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  const host = typeof flags.host === 'string' ? flags.host : 'github.com';
  const target = await resolvePluginGithubTarget({ host, owner: flags.owner, manifest, purpose: 'open-design-pr' });
  const name = String(manifest.name ?? '').trim();
  if (!name) {
    console.error('[open-design-pr] manifest.name is required');
    process.exit(2);
  }
  const title = String(manifest.title ?? name).trim();
  const branch = `plugin/${name}-${Math.floor(Date.now() / 1000)}`;
  const tmpRoot = await fsp.mkdtemp(join(os.tmpdir(), 'od-open-design-pr-'));
  const checkout = join(tmpRoot, 'open-design');
  const steps = [];
  const run = async (label, command, args, opts = {}) => {
    steps.push({ label, command: [command, ...args].join(' ') });
    if (flags['dry-run']) return { ok: true, stdout: '', stderr: '' };
    const result = await (command === 'gh'
      ? execGhBuffered(args, { cwd: opts.cwd ?? process.cwd(), timeout: opts.timeout ?? 180_000 })
      : execFileBuffered(command, args, { cwd: opts.cwd ?? process.cwd(), timeout: opts.timeout ?? 180_000 }));
    steps[steps.length - 1].ok = result.ok;
    steps[steps.length - 1].stdout = result.stdout;
    steps[steps.length - 1].stderr = result.stderr;
    if (!result.ok && !opts.tolerate?.(result)) {
      emitPluginWorkflowResult(flags, {
        ok: false,
        action: 'open-design-pr',
        folder: absFolder,
        login: target.login,
        owner: target.owner,
        ownerSource: target.ownerSource,
        apiRateLimited: target.apiRateLimited,
        branch,
        steps,
        error: { label, stdout: result.stdout, stderr: result.stderr, code: result.code },
      });
      process.exit(1);
    }
    return result;
  };

  await run('fork', 'gh', ['repo', 'fork', 'nexu-io/open-design'], {
    tolerate: (r) => /already exists|existing fork/i.test(`${r.stdout}\n${r.stderr}`),
  });
  await run('clone fork', 'git', [
    'clone',
    '--depth', '1',
    '--single-branch',
    '--branch', 'main',
    '--filter=blob:none',
    '--sparse',
    `https://github.com/${target.owner}/open-design.git`,
    checkout,
  ], { timeout: 240_000 });
  await run('sparse checkout', 'git', ['sparse-checkout', 'set', 'plugins/community'], { cwd: checkout });
  await run('checkout branch', 'git', ['checkout', '-b', branch], { cwd: checkout });
  const dest = join(checkout, 'plugins', 'community', name);
  if (!flags['dry-run']) {
    await fsp.rm(dest, { recursive: true, force: true });
    await fsp.mkdir(dest, { recursive: true });
    await fsp.cp(absFolder, dest, { recursive: true, force: true, filter: (src) => !src.includes(`${absFolder}/.git`) });
  }
  await run('git add', 'git', ['add', `plugins/community/${name}`], { cwd: checkout });
  await run('git commit', 'git', ['commit', '-m', `Add ${title} plugin`], { cwd: checkout });
  await run('git push branch', 'git', ['push', '-u', 'origin', branch], { cwd: checkout });
  const body = [
    `Add ${title} (${name}) plugin.`,
    '',
    `Version: ${manifest.version ?? '0.0.0'}`,
    manifest.description ? `Description: ${manifest.description}` : '',
  ].filter(Boolean).join('\n');
  const pr = await run('open PR form', 'gh', [
    'pr', 'create',
    '--repo', 'nexu-io/open-design',
    '--head', `${target.owner}:${branch}`,
    '--base', 'main',
    '--title', `Add ${title} plugin`,
    '--body', body,
    '--web',
  ], { cwd: checkout });
  const prUrl = extractFirstUrl(pr.stdout || pr.stderr) ?? `https://github.com/${target.owner}/open-design/pull/new/${branch}`;
  emitPluginWorkflowResult(flags, {
    ok: true,
    action: 'open-design-pr',
    folder: absFolder,
    login: target.login,
    owner: target.owner,
    ownerSource: target.ownerSource,
    apiRateLimited: target.apiRateLimited,
    branch,
    prUrl,
    checkout,
    steps,
  });
}

async function publishToMarketplaceJson({ catalogPath, meta }) {
  const [{ dirname, resolve }, { mkdir, readFile, writeFile }, { PublishError, upsertMarketplaceJsonEntry }] = await Promise.all([
    import('node:path'),
    import('node:fs/promises'),
    import('./plugins/publish.js'),
  ]);
  const resolvedPath = resolve(process.cwd(), catalogPath);
  let existing = null;
  try {
    existing = JSON.parse(await readFile(resolvedPath, 'utf8'));
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      throw err;
    }
  }
  let outcome;
  try {
    outcome = upsertMarketplaceJsonEntry({ manifest: existing, meta });
  } catch (err) {
    if (err instanceof PublishError) {
      console.error(`[publish] ${err.message}`);
      process.exit(2);
    }
    throw err;
  }
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(outcome.manifest, null, 2)}\n`, 'utf8');
  return {
    catalogPath: resolvedPath,
    inserted: outcome.inserted,
    entry: outcome.entry,
    manifest: {
      name: outcome.manifest.name,
      version: outcome.manifest.version,
      plugins: outcome.manifest.plugins.length,
    },
  };
}

function emitPluginWorkflowResult(flags, payload) {
  if (flags.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return;
  }
  if (!payload.ok) {
    console.error(`[${payload.action}] failed${payload.error?.label ? ` at ${payload.error.label}` : ''}`);
    if (payload.error?.stderr) console.error(payload.error.stderr);
    if (payload.error?.stdout) console.error(payload.error.stdout);
    return;
  }
  if (payload.action === 'publish-repo') {
    console.log(`Plugin published: ${payload.repoUrl}`);
    if (payload.ownerSource) console.log(`[publish-repo] owner resolved from ${payload.ownerSource}: ${payload.owner}`);
    if (payload.apiRateLimited) console.log('[publish-repo] GitHub API was rate limited; continued with the locally resolved owner.');
    if (payload.manifestRewritten) console.log('[publish-repo] manifest repo fields were normalized before publishing.');
    return;
  }
  if (payload.action === 'open-design-pr') {
    if (payload.ownerSource) console.log(`[open-design-pr] owner resolved from ${payload.ownerSource}: ${payload.owner}`);
    if (payload.apiRateLimited) console.log('[open-design-pr] GitHub API was rate limited; continued with the locally resolved owner.');
    console.log(`Open this URL and click Create to file the PR: ${payload.prUrl}`);
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

function safeJson(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function extractFirstUrl(text) {
  const match = /https?:\/\/\S+/i.exec(String(text ?? ''));
  return match ? match[0].replace(/[)\].,]+$/, '') : null;
}

export async function runPluginYank(rest) {
  const flags = parseFlags(rest, {
    string: new Set(['daemon-url', 'reason', 'to']),
    boolean: new Set(['help', 'h', 'json', 'open']),
  });
  if (rest.length === 0 || flags.help || flags.h) {
    console.log(`Usage:
  od plugin yank <vendor/plugin-name>@<version> --reason "<why>" [--to open-design] [--json]

Yanking never deletes metadata or bytes. It opens the registry review flow that
marks a version unresolvable for new installs while preserving lockfile replay.`);
    process.exit(rest.length === 0 ? 2 : 0);
  }
  const spec = rest.find((a) => !a.startsWith('-') && a !== flags.reason && a !== flags.to);
  const reason = typeof flags.reason === 'string' ? flags.reason.trim() : '';
  const parsed = parseCliPluginSpecifier(spec);
  if (!parsed.name || !parsed.range) {
    console.error('Usage: od plugin yank <vendor/plugin-name>@<version> --reason "<why>"');
    process.exit(2);
  }
  if (!reason) {
    console.error('--reason is required for yanking');
    process.exit(2);
  }
  const target = flags.to ?? 'open-design';
  if (target !== 'open-design') {
    console.error('Only --to open-design is supported in this v1 GitHub-backed yank flow.');
    process.exit(2);
  }
  const title = `Yank ${parsed.name}@${parsed.range}`;
  const body = [
    `## Yank ${parsed.name}@${parsed.range}`,
    '',
    `Reason: ${reason}`,
    '',
    'Expected registry patch:',
    '',
    '```json',
    JSON.stringify({
      name: parsed.name,
      version: parsed.range,
      yanked: true,
      yankReason: reason,
    }, null, 2),
    '```',
    '',
    'Generated by `od plugin yank`.',
  ].join('\n');
  const params = new URLSearchParams({ title, body });
  const payload = {
    catalog: 'open-design',
    name: parsed.name,
    version: parsed.range,
    reason,
    url: `https://github.com/nexu-io/open-design/issues/new?${params.toString()}`,
    body,
  };
  if (flags.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    console.log(`[yank] ${payload.url}`);
    console.log('---');
    console.log(body);
  }
  if (flags.open) {
    const opener = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';
    const { spawn } = await import('node:child_process');
    spawn(opener, [payload.url], { detached: true, stdio: 'ignore' }).unref();
  }
}
