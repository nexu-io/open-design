/**
 * Plugin source / author / contribute link derivation.
 *
 * Turns the raw `InstalledPluginRecord.source` install string + the
 * manifest's `author` / `homepage` fields into a small bag of
 * renderable URLs and labels. Used by the Home plugin grid (small
 * "by <author>" byline) and by the PluginDetailsModal (rich author
 * + source + contribute block).
 *
 * Why a separate module:
 *  - the parsing rules (`github:owner/repo[@ref][/sub]`, https URL,
 *    local path, bundled relpath) are non-trivial enough to warrant
 *    isolated unit tests,
 *  - the modal and the card both need the same shape, so deriving
 *    twice would invite drift,
 *  - the host React surface needs a single safe-URL gate (only
 *    http(s) URLs become clickable) to keep `javascript:` /
 *    `data:` payloads in a manifest from rendering as live links.
 */
import type { InstalledPluginRecord } from '@open-design/contracts';

export interface PluginSourceLinks {
  /** Browseable URL for the install source, or null when the source
   *  is a local path / bundled relpath / unknown shape. */
  sourceUrl: string | null;
  /** Friendly label for the source — github slug, hostname, or path
   *  basename. Always present, never null. */
  sourceLabel: string;
  /** Display label for the source kind — "GitHub", "Official",
   *  "Marketplace", etc. */
  sourceKindLabel: string;
  /** manifest.author.name trimmed, or null. */
  authorName: string | null;
  /** manifest.author.url when http(s), or null. */
  authorProfileUrl: string | null;
  /** Avatar URL when author.url points at a github profile/org, or
   *  null. Uses github.com/<user>.png which works for both users and
   *  orgs without an authenticated API call. */
  authorAvatarUrl: string | null;
  /** manifest.homepage when http(s), or null. */
  homepageUrl: string | null;
  /** Issues URL when source/homepage points at github, or null.
   *  Encourages contributors by giving them a one-click "report an
   *  issue / open a PR" entry point. */
  contributeUrl: string | null;
  /** True when the contribute URL points at a github repo. The UI
   *  uses this to choose the right verb / icon ("Contribute on
   *  GitHub" vs. a generic external-link). */
  contributeOnGithub: boolean;
}

const OPEN_DESIGN_REPO_URL = 'https://github.com/nexu-io/open-design';
const OPEN_DESIGN_REPO_LABEL = 'nexu-io/open-design';

const GITHUB_SOURCE_RE = /^github:([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)(?:@([A-Za-z0-9._/-]+))?(?:\/(.+))?$/;
const GITHUB_PROFILE_RE = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?)(?:[\/?#].*)?$/;
const GITHUB_REPO_RE = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[\/?#].*)?$/;

/** Only http(s) URLs are safe to render as clickable links. */
function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** github.com/owner/repo[/...] → "owner/repo" or null. */
function githubRepoSlug(url: string): { owner: string; repo: string } | null {
  const match = GITHUB_REPO_RE.exec(url);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]! };
}

/** github.com/<user> → "<user>" or null. Distinguishes single-segment
 *  profile/org URLs from multi-segment repo URLs. */
function githubUsername(url: string): string | null {
  const match = GITHUB_PROFILE_RE.exec(url);
  if (!match) return null;
  // Reject multi-segment paths: a profile URL has nothing after the
  // username (other than query/hash). Repo URLs go through the repo
  // matcher instead.
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length !== 1) return null;
  } catch {
    return null;
  }
  return match[1]!;
}

function basename(filesystemPath: string): string {
  const parts = filesystemPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? filesystemPath;
}

const SOURCE_KIND_LABELS: Record<InstalledPluginRecord['sourceKind'], string> = {
  bundled:     'Official',
  user:        'User',
  project:     'Project',
  marketplace: 'Marketplace',
  github:      'GitHub',
  url:         'URL',
  local:       'Local',
};

/** Derive everything the UI needs about a plugin's source + author
 *  in one call. Pure — safe to call from render. */
export function derivePluginSourceLinks(
  record: Pick<
    InstalledPluginRecord,
    'source' | 'sourceKind' | 'pinnedRef' | 'fsPath' | 'manifest'
  >,
): PluginSourceLinks {
  const manifest = record.manifest ?? {};
  const author = (manifest as { author?: { name?: unknown; url?: unknown } }).author ?? {};
  const homepageRaw = (manifest as { homepage?: unknown }).homepage;
  const officialBundled = record.sourceKind === 'bundled';

  const authorName = typeof author.name === 'string' && author.name.trim().length > 0
    ? author.name.trim()
    : null;
  const authorProfileUrl = officialBundled ? OPEN_DESIGN_REPO_URL : safeHttpUrl(author.url);
  const homepageUrl = officialBundled ? OPEN_DESIGN_REPO_URL : safeHttpUrl(homepageRaw);

  // Source URL + label resolution. The github:owner/repo case wins
  // because we can produce a deep `tree/<ref>/<sub>` URL when the
  // source string carries a ref; the https case just uses the URL
  // verbatim so users can click through to their tarball mirror.
  let sourceUrl: string | null = null;
  let sourceLabel: string;
  let sourceContributeUrl: string | null = null;

  if (record.sourceKind === 'github') {
    const match = GITHUB_SOURCE_RE.exec(record.source);
    if (match) {
      const [, owner, repo, ref, subpath] = match;
      const ref0 = ref || record.pinnedRef;
      // Refs can contain `/` (branches like `release/1.0`, or
      // installer refs that absorbed a subpath) — encode each
      // segment so spaces/special chars are escaped but the
      // separators stay.
      const refSegment = ref0 && ref0 !== 'HEAD'
        ? `/tree/${ref0.split('/').map(encodeURIComponent).join('/')}`
        : '';
      const subSegment = subpath ? `/${subpath.split('/').map(encodeURIComponent).join('/')}` : '';
      sourceUrl = `https://github.com/${owner}/${repo}${refSegment}${subSegment}`;
      sourceLabel = `${owner}/${repo}${ref0 ? ` @${ref0}` : ''}${subpath ? `/${subpath}` : ''}`;
      sourceContributeUrl = `https://github.com/${owner}/${repo}/issues/new`;
    } else {
      sourceLabel = record.source;
    }
  } else if (record.sourceKind === 'url') {
    const safe = safeHttpUrl(record.source);
    if (safe) {
      sourceUrl = safe;
      try {
        sourceLabel = new URL(safe).hostname + new URL(safe).pathname.replace(/\/$/, '');
      } catch {
        sourceLabel = safe;
      }
    } else {
      sourceLabel = record.source;
    }
  } else if (record.sourceKind === 'marketplace') {
    sourceLabel = record.source;
  } else if (officialBundled) {
    sourceUrl = OPEN_DESIGN_REPO_URL;
    sourceLabel = OPEN_DESIGN_REPO_LABEL;
  } else {
    // user / project / local — the source string is a filesystem
    // path. Show just the basename for compactness; the
    // full path stays available via the existing fsPath dt/dd.
    sourceLabel = basename(record.source) || record.source;
  }

  // Contribute link: prefer the source's github repo, fall back to
  // the homepage when it points at github (covers bundled plugins
  // whose `source` is a local relpath but `homepage` is the upstream
  // repo URL).
  let contributeUrl = sourceContributeUrl;
  let contributeOnGithub = sourceContributeUrl !== null;
  if (!contributeUrl && homepageUrl) {
    const repo = githubRepoSlug(homepageUrl);
    if (repo) {
      contributeUrl = `https://github.com/${repo.owner}/${repo.repo}/issues/new`;
      contributeOnGithub = true;
    }
  }

  // Avatar derivation: github.com/<user>.png returns the avatar for
  // both user and organisation accounts without authentication. The
  // fallback also works when author.url is a repo URL — we extract
  // the owner segment for the avatar.
  let authorAvatarUrl: string | null = null;
  if (authorProfileUrl) {
    const username = githubUsername(authorProfileUrl);
    if (username) {
      authorAvatarUrl = `https://github.com/${username}.png?size=80`;
    } else {
      const repo = githubRepoSlug(authorProfileUrl);
      if (repo) authorAvatarUrl = `https://github.com/${repo.owner}.png?size=80`;
    }
  }

  return {
    sourceUrl,
    sourceLabel,
    sourceKindLabel: SOURCE_KIND_LABELS[record.sourceKind] ?? record.sourceKind,
    authorName,
    authorProfileUrl,
    authorAvatarUrl,
    homepageUrl,
    contributeUrl,
    contributeOnGithub,
  };
}

/** Deterministic two-letter monogram for the avatar fallback. */
export function authorInitials(name: string | null): string {
  if (!name) return '??';
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '??';
  return parts.map((p) => p[0]!.toUpperCase()).join('');
}
