// Phase 4 / spec §14.1 — `od plugin publish --to <catalog>` PR-template launcher.
//
// Produces a deep-link URL into the target catalog's "submit" form
// (or its repo PR template) so an author can land their plugin on
// every catalog the spec lists in §14 without remembering the URL
// scheme of each one. We never mutate the catalog directly — the
// author still goes through the upstream review flow.
//
// Targets (must stay in sync with spec §14):
//   - anthropics-skills      → anthropics/skills
//   - awesome-agent-skills   → VoltAgent/awesome-agent-skills
//   - clawhub                → openclaw/clawhub
//   - skills-sh              → skills.sh discovery hint
//   - open-design            → open-design/plugin-registry
//
// The function is pure: it accepts the plugin's metadata and returns
// the catalog target description. The CLI is the side-effect-bearing
// caller (prints the URL or auto-opens via `open`/`xdg-open`).

export type PublishCatalog =
  | 'anthropics-skills'
  | 'awesome-agent-skills'
  | 'clawhub'
  | 'skills-sh'
  | 'open-design';

export interface PublishMetadata {
  // Plugin name + version come from the manifest. The repo URL is the
  // upstream the author published the plugin under (github.com/owner/repo).
  pluginId: string;
  pluginVersion: string;
  pluginTitle?: string;
  pluginDescription?: string;
  repoUrl?: string;
}

export interface PublishLink {
  catalog: PublishCatalog;
  // Human-readable name of the catalog ("anthropics/skills", etc.).
  catalogLabel: string;
  // The URL the author lands on. Either a "create issue / new PR"
  // wizard with the title + body pre-filled, or the catalog's contact
  // page when the catalog has no submission form.
  url: string;
  // Optional pre-rendered PR body the author can copy if the URL's
  // query string strips it. Always supplied; UI / CLI display it.
  prBody: string;
}

export interface MarketplaceJsonManifest {
  specVersion: string;
  name: string;
  version: string;
  generatedAt?: string;
  plugins: MarketplaceJsonEntry[];
  [key: string]: unknown;
}

export interface MarketplaceJsonEntry {
  name: string;
  source: string;
  version: string;
  title?: string;
  description?: string;
  publisher?: {
    name?: string;
    github?: string;
    url?: string;
  };
  homepage?: string;
  repo?: string;
  [key: string]: unknown;
}

export interface MarketplaceJsonPublishOutcome {
  manifest: MarketplaceJsonManifest;
  entry: MarketplaceJsonEntry;
  inserted: boolean;
}

export class PublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishError';
  }
}

const KNOWN_TARGETS = new Set<PublishCatalog>([
  'anthropics-skills',
  'awesome-agent-skills',
  'clawhub',
  'skills-sh',
  'open-design',
]);

export function buildPublishLink(args: {
  catalog: PublishCatalog;
  meta: PublishMetadata;
}): PublishLink {
  if (!KNOWN_TARGETS.has(args.catalog)) {
    throw new PublishError(`unknown catalog: ${args.catalog}. Accepted: ${Array.from(KNOWN_TARGETS).join(', ')}`);
  }
  const m = args.meta;
  const title = `Add ${m.pluginTitle ?? m.pluginId}`;
  const body = renderPrBody(m);

  switch (args.catalog) {
    case 'anthropics-skills': {
      const url = newIssueUrl('anthropics/skills', title, body);
      return { catalog: args.catalog, catalogLabel: 'anthropics/skills', url, prBody: body };
    }
    case 'awesome-agent-skills': {
      const url = newIssueUrl('VoltAgent/awesome-agent-skills', title, body);
      return { catalog: args.catalog, catalogLabel: 'VoltAgent/awesome-agent-skills', url, prBody: body };
    }
    case 'clawhub': {
      const url = newIssueUrl('openclaw/clawhub', title, body);
      return { catalog: args.catalog, catalogLabel: 'openclaw/clawhub', url, prBody: body };
    }
    case 'skills-sh': {
      // skills.sh autodiscovers via `npx skills add owner/repo` so a
      // first-time submission is a documentation step, not a PR. Point
      // the author at the canonical add command + the docs page.
      const repo = m.repoUrl?.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '') ?? 'owner/repo';
      return {
        catalog: args.catalog,
        catalogLabel: 'skills.sh',
        url: 'https://skills.sh/',
        prBody: [
          body,
          '',
          '## Submission steps',
          '',
          `1. Push the plugin repo to https://github.com/${repo}`,
          `2. Run \`npx skills add ${repo}\` once locally to seed the catalog index.`,
          '3. Verify the entry appears at https://skills.sh/ within ~24 hours.',
        ].join('\n'),
      };
    }
    case 'open-design': {
      const bodyWithRegistry = [
        body,
        '',
        '## Open Design registry entry',
        '',
        '- Target path: `community/<vendor>/<plugin-name>/open-design.json`',
        '- Generated index: `open-design-marketplace.json`',
        '- Required checks: `od plugin validate`, `od plugin pack`, integrity digest, preview smoke.',
      ].join('\n');
      const url = newIssueUrl('open-design/plugin-registry', title, bodyWithRegistry);
      return {
        catalog: args.catalog,
        catalogLabel: 'open-design/plugin-registry',
        url,
        prBody: bodyWithRegistry,
      };
    }
  }
  // Unreachable; keeps the compiler happy.
  throw new PublishError(`unhandled catalog: ${String(args.catalog)}`);
}

export function buildMarketplaceJsonEntry(meta: PublishMetadata): MarketplaceJsonEntry {
  if (!meta.pluginId.includes('/')) {
    throw new PublishError('marketplace-json publish requires a stable namespaced id: vendor/plugin-name');
  }
  if (!meta.repoUrl) {
    throw new PublishError('marketplace-json publish requires meta.repoUrl');
  }
  const parsedRepo = parseGithubRepo(meta.repoUrl);
  const entry: MarketplaceJsonEntry = {
    name: meta.pluginId,
    source: parsedRepo.source,
    version: meta.pluginVersion,
    repo: meta.repoUrl,
    homepage: meta.repoUrl,
    publisher: {
      name: parsedRepo.owner,
      github: parsedRepo.owner,
      url: `https://github.com/${parsedRepo.owner}`,
    },
  };
  if (meta.pluginTitle) entry.title = meta.pluginTitle;
  if (meta.pluginDescription) entry.description = meta.pluginDescription;
  return entry;
}

export function upsertMarketplaceJsonEntry(args: {
  manifest?: Partial<MarketplaceJsonManifest> | null;
  meta: PublishMetadata;
  generatedAt?: string;
}): MarketplaceJsonPublishOutcome {
  const entry = buildMarketplaceJsonEntry(args.meta);
  const existing = args.manifest ?? {};
  const plugins = Array.isArray(existing.plugins) ? existing.plugins : [];
  let inserted = true;
  const nextPlugins = plugins.map((plugin) => {
    if (plugin?.name === entry.name) {
      inserted = false;
      return {
        ...plugin,
        ...entry,
      };
    }
    return plugin;
  });
  if (inserted) {
    nextPlugins.push(entry);
  }
  nextPlugins.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const manifest: MarketplaceJsonManifest = {
    ...existing,
    specVersion: typeof existing.specVersion === 'string' ? existing.specVersion : '1.0.0',
    name: typeof existing.name === 'string' ? existing.name : 'open-design-marketplace',
    version: typeof existing.version === 'string' ? existing.version : '1.0.0',
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    plugins: nextPlugins,
  };
  return { manifest, entry, inserted };
}

function newIssueUrl(repo: string, title: string, body: string): string {
  const params = new URLSearchParams();
  params.set('title', title);
  params.set('body', body);
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}

function parseGithubRepo(repoUrl: string): { owner: string; repo: string; source: string } {
  let url: URL;
  try {
    url = new URL(repoUrl);
  } catch {
    throw new PublishError(`unsupported repo URL: ${repoUrl}`);
  }
  if (url.hostname.toLowerCase() !== 'github.com') {
    throw new PublishError('marketplace-json publish currently requires a github.com repo URL');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/i, '');
  if (!owner || !repo) {
    throw new PublishError(`unsupported GitHub repo URL: ${repoUrl}`);
  }
  if (parts[2] === 'tree' && parts[3]) {
    const ref = parts[3];
    const subpath = parts.slice(4).join('/');
    return {
      owner,
      repo,
      source: `github:${owner}/${repo}@${ref}${subpath ? `/${subpath}` : ''}`,
    };
  }
  return {
    owner,
    repo,
    source: `github:${owner}/${repo}`,
  };
}

function renderPrBody(m: PublishMetadata): string {
  const lines: string[] = [];
  lines.push(`## ${m.pluginTitle ?? m.pluginId}`);
  if (m.pluginDescription) {
    lines.push('');
    lines.push(m.pluginDescription);
  }
  lines.push('');
  lines.push('## Provenance');
  lines.push('');
  lines.push(`- name: \`${m.pluginId}\``);
  lines.push(`- version: \`${m.pluginVersion}\``);
  if (m.repoUrl) lines.push(`- repository: ${m.repoUrl}`);
  lines.push('');
  lines.push('## Compatibility');
  lines.push('');
  lines.push('- Ships `SKILL.md` (canonical agent skill anchor).');
  lines.push('- Ships `open-design.json` sidecar (additive Open Design metadata).');
  lines.push('');
  lines.push('Generated by `od plugin publish` — see https://open-design.ai/docs/plugins-spec.md.');
  return lines.join('\n');
}

export const PUBLISH_TARGETS = Array.from(KNOWN_TARGETS);
