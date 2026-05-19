export const GITHUB_REPO = 'https://github.com/nexu-io/open-design';

export interface GithubUtmOptions {
  source?: string;
  medium: string;
  campaign: string;
  content?: string;
}

export function withUtm(url: string, options: GithubUtmOptions): string {
  const next = new URL(url);
  next.searchParams.set('utm_source', options.source ?? 'open-design.ai');
  next.searchParams.set('utm_medium', options.medium);
  next.searchParams.set('utm_campaign', options.campaign);
  if (options.content) next.searchParams.set('utm_content', options.content);
  return next.toString();
}

export function githubPath(pathname = '', options: GithubUtmOptions): string {
  return withUtm(new URL(pathname, GITHUB_REPO).toString(), options);
}
