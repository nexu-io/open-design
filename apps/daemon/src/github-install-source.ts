const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const GITHUB_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type GithubRepositoryUrlResolution =
  | { kind: 'other' }
  | { kind: 'invalid'; error: string }
  | {
      kind: 'repository';
      owner: string;
      repo: string;
      source: string;
    };

const ROOT_URL_HELP =
  'GitHub repository URLs must use https://github.com/<owner>/<repo> '
  + '(repository root only; issues, tree, and blob URLs are not supported)';

/**
 * Translate the browser URL users naturally paste into the canonical
 * `github:owner/repo` source understood by both install backends.
 *
 * Deliberately narrow: accepting only a repository root keeps refs/subpaths
 * unambiguous and prevents a GitHub HTML page (issues/tree/blob) from falling
 * through to the generic HTTPS tarball downloader.
 */
export function resolveGithubRepositoryUrl(rawSource: string): GithubRepositoryUrlResolution {
  const source = rawSource.trim();
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return { kind: 'other' };
  }
  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return { kind: 'other' };
  if (
    url.protocol !== 'https:'
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
  ) {
    return { kind: 'invalid', error: ROOT_URL_HELP };
  }

  const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) return { kind: 'invalid', error: ROOT_URL_HELP };
  const owner = match[1]!;
  const repo = match[2]!.replace(/\.git$/i, '');
  if (
    !GITHUB_SEGMENT_RE.test(owner)
    || !GITHUB_SEGMENT_RE.test(repo)
    || owner === '.'
    || owner === '..'
    || repo === '.'
    || repo === '..'
  ) {
    return { kind: 'invalid', error: ROOT_URL_HELP };
  }
  return {
    kind: 'repository',
    owner,
    repo,
    source: `github:${owner}/${repo}`,
  };
}
