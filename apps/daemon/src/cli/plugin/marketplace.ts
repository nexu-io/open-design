// @ts-nocheck
/** @module cli/plugin/marketplace
 * `od marketplace` subcommand router: catalog discovery, plugin lookup, metadata doctor.
 * Collaborators: manage.ts (flag parsing), github.ts (auth/login flows).
 * Invariant: marketplace list is the source of truth; all plugin resolution routes through resolveMarketplacePluginFromList().
 */
import { parseFlags, structuredHttpFailure } from '../core/index.js';
import { execFileBuffered, inferGithubHost, spawnPassthrough } from './github.js';
import { PLUGIN_BOOLEAN_FLAGS, PLUGIN_STRING_FLAGS, pluginDaemonUrl } from './manage.js';

// Plan §3.B4 / spec §6: `od marketplace …` minimum verbs. Add / list /
// refresh / remove / trust. The Phase 3 follow-up wires
// `od plugin install <name>` resolution through these catalogs.
/**
 * Router for marketplace subcommands: list, search, plugins, doctor, login, add, info, refresh, remove, trust.
 * Mirrors plugin list/search filter ops; adds marketplace CRUD and manifest validation (spec §6, §3.B4).
 * @param args Raw argv after 'marketplace'
 */
export async function runMarketplace(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od marketplace add     <url> [--trust trusted|restricted]   Register a federated catalog.
  od marketplace list                                         List registered marketplaces.
  od marketplace info    <id>                                 Inspect one marketplace + cached manifest.
  od marketplace plugins <id> [--json]                        List cached plugin entries for one marketplace.
  od marketplace search  <query> [--json]                     Search cached marketplace entries.
  od marketplace doctor  [id] [--strict] [--json]             Validate cached marketplace entries.
  od marketplace login   <id|url> [--host github.com]         Authenticate gh for private GitHub catalogs.
  od marketplace refresh <id>                                 Re-fetch the manifest.
  od marketplace remove  <id>                                 Forget a marketplace.
  od marketplace trust   <id> [--trust trusted|restricted|official]
                                                              Update the marketplace trust tier.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base (default OD_DAEMON_URL, OD_SIDECAR_IPC_PATH discovery, or http://127.0.0.1:7456).
  --json               Emit raw JSON (suitable for scripts).`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: PLUGIN_STRING_FLAGS, boolean: PLUGIN_BOOLEAN_FLAGS });
  const base = (await pluginDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'list': {
      const resp = await fetch(`${base}/api/marketplaces`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) return structuredHttpFailure(resp);
      if (flags.json) {
        process.stdout.write(JSON.stringify(data, null, 2) + '\n');
        return;
      }
      const rows = data?.marketplaces ?? [];
      if (rows.length === 0) {
        console.log('No marketplaces registered. Run `od marketplace add <url>`.');
        return;
      }
      for (const m of rows) {
        console.log(`${m.id}  version=${m.version ?? 'unknown'}  spec=${m.specVersion ?? 'unknown'}  trust=${m.trust}  url=${m.url}`);
      }
      return;
    }
    case 'search': {
      // Plan §3.H4 / spec §12 — marketplace catalog query. Walks
      // every configured marketplace's plugins[] entry and matches
      // by substring on name + description + tags.
      const query = (rest.find((a) => !a.startsWith('-')) ?? '').toLowerCase();
      if (!query) {
        console.error('Usage: od marketplace search "<query>" [--tag <tag>]');
        process.exit(2);
      }
      const tag = typeof flags.tag === 'string' ? flags.tag.toLowerCase() : null;
      const resp = await fetch(`${base}/api/marketplaces`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      const matches = [];
      for (const mp of data?.marketplaces ?? []) {
        const plugins = mp.manifest?.plugins ?? [];
        for (const p of plugins) {
          const haystack = [
            p.name ?? '',
            p.description ?? '',
            ...(Array.isArray(p.tags) ? p.tags : []),
          ].join(' ').toLowerCase();
          if (!haystack.includes(query)) continue;
          if (tag && !(Array.isArray(p.tags) && p.tags.map((t) => t.toLowerCase()).includes(tag))) continue;
          matches.push({
            marketplaceId:  mp.id,
            marketplaceUrl: mp.url,
            marketplaceVersion: mp.version,
            name:           p.name,
            version:        p.version,
            source:         p.source,
            description:    p.description ?? '',
            tags:           p.tags ?? [],
          });
        }
      }
      if (flags.json) {
        process.stdout.write(JSON.stringify({ matches }, null, 2) + '\n');
        return;
      }
      if (matches.length === 0) {
        console.log(`No matches for "${query}"`);
        return;
      }
      for (const m of matches) {
        console.log(`${m.name}@${m.version}\t${m.source}\t${m.marketplaceId}@${m.marketplaceVersion}\t${m.description}`);
      }
      return;
    }
    case 'plugins': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od marketplace plugins <id> [--json]');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/marketplaces/${encodeURIComponent(id)}/plugins`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error(`plugins failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      const plugins = Array.isArray(data?.plugins) ? data.plugins : [];
      if (flags.json) {
        process.stdout.write(JSON.stringify({ marketplaceId: id, plugins }, null, 2) + '\n');
        return;
      }
      if (plugins.length === 0) {
        console.log(`No plugins in marketplace ${id}.`);
        return;
      }
      for (const p of plugins) {
        console.log(`${p.name}@${p.version}\t${p.source}\t${p.description ?? ''}`);
      }
      return;
    }
    case 'doctor': {
      const strict = flags.strict === true;
      const id = rest.find((a) => !a.startsWith('-'));
      const resp = id
        ? await fetch(`${base}/api/marketplaces/${encodeURIComponent(id)}`)
        : await fetch(`${base}/api/marketplaces`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error(`doctor failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      const rows = id ? [data] : (data?.marketplaces ?? []);
      const { doctorMarketplace } = await import('./plugins/marketplace-doctor.js');
      const reports = [];
      for (const row of rows) {
        reports.push(await doctorMarketplace({
          id: row.id,
          trust: row.trust,
          manifest: row.manifest,
          strict,
        }));
      }
      const ok = reports.every((report) => report.ok);
      if (flags.json) {
        process.stdout.write(JSON.stringify({ ok, reports }, null, 2) + '\n');
      } else {
        for (const report of reports) {
          console.log(`[marketplace doctor] ${report.backendId}: ${report.ok ? 'ok' : 'issues'} (${report.entriesChecked} entries)`);
          for (const issue of report.issues) {
            console.log(`  [${issue.severity}] ${issue.code}${issue.pluginName ? ` ${issue.pluginName}` : ''}: ${issue.message}`);
          }
        }
      }
      process.exit(ok ? 0 : 1);
    }
    case 'login': {
      const target = rest.find((a) => !a.startsWith('-'));
      const host = typeof flags.host === 'string'
        ? flags.host
        : inferGithubHost(target ?? 'github.com');
      const version = await execFileBuffered('gh', ['--version'], { timeout: 10_000 });
      if (!version.ok) {
        console.error('[marketplace login] GitHub CLI is required. Install gh from https://cli.github.com/ and retry.');
        process.exit(1);
      }
      console.log(`[marketplace login] authenticating gh for ${host}. Tokens stay in gh, not Open Design.`);
      const result = await spawnPassthrough('gh', ['auth', 'login', '--hostname', host, '--web']);
      process.exit(result.code ?? 0);
    }
    case 'add': {
      const url = rest.find((a) => !a.startsWith('-'));
      if (!url) {
        console.error('Usage: od marketplace add <url> [--trust trusted|restricted]');
        process.exit(2);
      }
      const trust = flags.trust ?? 'restricted';
      const resp = await fetch(`${base}/api/marketplaces`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, trust }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error(`add failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      console.log(`[marketplace] added ${data.id} (${data.url}) trust=${data.trust}`);
      return;
    }
    case 'info':
    case 'refresh':
    case 'remove':
    case 'trust': {
      const id = rest.find((a) => !a.startsWith('-')
        && a !== flags.trust);
      if (!id) {
        console.error(`Usage: od marketplace ${sub} <id>`);
        process.exit(2);
      }
      let url;
      let method = 'GET';
      let body;
      if (sub === 'info')         url = `${base}/api/marketplaces/${encodeURIComponent(id)}`;
      else if (sub === 'refresh') { url = `${base}/api/marketplaces/${encodeURIComponent(id)}/refresh`; method = 'POST'; }
      else if (sub === 'remove')  { url = `${base}/api/marketplaces/${encodeURIComponent(id)}`; method = 'DELETE'; }
      else if (sub === 'trust') {
        const trust = flags.trust ?? 'trusted';
        url = `${base}/api/marketplaces/${encodeURIComponent(id)}/trust`;
        method = 'POST';
        body = JSON.stringify({ trust });
      }
      const resp = await fetch(url, {
        method,
        ...(body ? { headers: { 'content-type': 'application/json' }, body } : {}),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error(`${sub} failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    default:
      console.error(`unknown subcommand: od marketplace ${sub}`);
      process.exit(2);
  }
}

/**
 * Resolves a CLI specifier (name or name@range) against a list of marketplaces.
 * Returns resolved entry with version/source/ref/integrity/manifestDigest or null if not found / yanked.
 * Used by info command and plugin install fallback (Phase 3).
 * @param marketplaces Array of { id, manifest: { plugins: [...] } }
 * @param specifier Name or name@version|tag|range
 * @returns Resolved marketplace entry or null
 */
export function resolveMarketplacePluginFromList(marketplaces, specifier) {
  const parsed = parseCliPluginSpecifier(specifier);
  const target = parsed.name.toLowerCase();
  for (const marketplace of marketplaces) {
    for (const entry of marketplace?.manifest?.plugins ?? []) {
      if (String(entry.name ?? '').toLowerCase() !== target) continue;
      const version = resolveCliEntryVersion(entry, parsed.range);
      if (!version) return null;
      return {
        marketplaceId: marketplace.id,
        marketplaceTrust: marketplace.trust,
        name: entry.name,
        version: version.version,
        source: version.source,
        ref: version.ref,
        integrity: version.integrity,
        manifestDigest: version.manifestDigest,
        entry,
      };
    }
  }
  return null;
}

/**
 * Parses 'vendor/name@range' → { name, range }. Range defaults to undefined (resolved as 'latest').
 * Handles slash-separated vendor prefix; range is optional.
 * @param input CLI specifier string
 * @returns { name, range? }
 */
export function parseCliPluginSpecifier(input) {
  const trimmed = String(input ?? '').trim();
  const slash = trimmed.indexOf('/');
  const at = trimmed.lastIndexOf('@');
  if (slash > 0 && at > slash + 1) {
    return { name: trimmed.slice(0, at), range: trimmed.slice(at + 1) };
  }
  return { name: trimmed, range: undefined };
}

/**
 * Resolves distTags[range] or range version from entry.versions[], respecting yanked flag.
 * Returns { version, source, ref, integrity, manifestDigest } or null if not found / yanked.
 * @internal
 */
function resolveCliEntryVersion(entry, range) {
  if (entry?.yanked) return null;
  const versions = Array.isArray(entry?.versions) ? entry.versions : [];
  const target = range && range !== 'latest'
    ? (entry?.distTags?.[range] ?? range)
    : (entry?.distTags?.latest ?? entry?.version);
  const version = versions.find((item) => item.version === target) ?? null;
  if (version?.yanked) return null;
  return {
    version: target,
    source: version?.source ?? entry?.source,
    ref: version?.ref ?? entry?.ref,
    integrity: version?.integrity ?? version?.dist?.integrity ?? entry?.integrity ?? entry?.dist?.integrity,
    manifestDigest: version?.manifestDigest ?? version?.dist?.manifestDigest ?? entry?.manifestDigest ?? entry?.dist?.manifestDigest,
  };
}
