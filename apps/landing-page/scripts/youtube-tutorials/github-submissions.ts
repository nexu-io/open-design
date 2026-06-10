/*
 * youtube-tutorials/github-submissions — pull user-submitted tutorials into the
 * daily review digest: open issues from the "Submit a tutorial" form and open
 * PRs that contribute a tutorial entry. Both are surfaced (label `tutorials`)
 * so a maintainer reviews them alongside the auto-discovered YouTube candidates.
 */

export interface SubmissionIssue {
  number: number;
  title: string;
  author: string;
  url: string;
  /** YouTube link extracted from the form body, if present. */
  videoUrl?: string;
}

export interface ContributionPR {
  number: number;
  title: string;
  author: string;
  url: string;
}

interface SearchItem {
  number: number;
  title: string;
  html_url: string;
  user?: { login?: string };
  body?: string;
  pull_request?: unknown;
}

const YT_URL = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^\s)]*v=[\w-]{11}|youtu\.be\/[\w-]{11})[^\s)]*)/i;

async function searchIssues(token: string, repo: string, qualifiers: string): Promise<SearchItem[]> {
  const q = encodeURIComponent(`repo:${repo} is:open ${qualifiers}`);
  const url = `https://api.github.com/search/issues?q=${q}&per_page=50&sort=created&order=desc`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub search HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { items?: SearchItem[] };
  return data.items ?? [];
}

/** Open issues from the tutorial-submission form (label `tutorials`, not PRs). */
export async function fetchSubmissionIssues(token: string, repo: string): Promise<SubmissionIssue[]> {
  const items = await searchIssues(token, repo, 'is:issue label:tutorials');
  return items
    .filter((it) => !it.pull_request)
    .map((it) => ({
      number: it.number,
      title: it.title.trim(),
      author: it.user?.login ?? 'unknown',
      url: it.html_url,
      videoUrl: it.body?.match(YT_URL)?.[1],
    }));
}

/** Open PRs that contribute a tutorial entry (label `tutorials`, PRs only). */
export async function fetchContributionPRs(token: string, repo: string): Promise<ContributionPR[]> {
  const items = await searchIssues(token, repo, 'is:pr label:tutorials');
  return items
    .filter((it) => it.pull_request)
    .map((it) => ({
      number: it.number,
      title: it.title.trim(),
      author: it.user?.login ?? 'unknown',
      url: it.html_url,
    }));
}
