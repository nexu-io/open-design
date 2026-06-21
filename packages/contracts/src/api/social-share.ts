export const OPEN_DESIGN_GITHUB_REPO_URL = 'https://github.com/nexu-io/open-design';

export type SocialShareTargetKind = 'open-design-repo' | 'project-html';

export type SocialSharePlatform =
  | 'x'
  | 'linkedin'
  | 'facebook'
  | 'reddit'
  | 'telegram'
  | 'whatsapp'
  | 'weibo'
  | 'line'
  | 'instagram'
  | 'xiaohongshu';

export type SocialShareMode = 'intent' | 'copy-open';

export interface SocialShareRequest {
  kind: SocialShareTargetKind;
  url?: string;
  title?: string;
  text?: string;
  copyText?: string;
  locale?: string;
}

export interface SocialSharePlatformTarget {
  platform: SocialSharePlatform;
  mode: SocialShareMode;
  shareUrl?: string;
  entryUrl?: string;
}

export interface SocialShareResponse {
  kind: SocialShareTargetKind;
  locale: string;
  url: string;
  title: string;
  text: string;
  copyText: string;
  githubRepoUrl: string;
  platforms: SocialSharePlatformTarget[];
}

interface PlatformDescriptor {
  platform: SocialSharePlatform;
  mode: SocialShareMode;
  entryUrl?: string;
}

export const SOCIAL_SHARE_PLATFORM_ORDER: SocialSharePlatform[] = [
  'x',
  'linkedin',
  'facebook',
  'reddit',
  'telegram',
  'whatsapp',
  'weibo',
  'line',
  'instagram',
  'xiaohongshu',
];

const PLATFORM_DESCRIPTORS: PlatformDescriptor[] = [
  { platform: 'x', mode: 'intent' },
  { platform: 'linkedin', mode: 'intent' },
  { platform: 'facebook', mode: 'intent' },
  { platform: 'reddit', mode: 'intent' },
  { platform: 'telegram', mode: 'intent' },
  { platform: 'whatsapp', mode: 'intent' },
  { platform: 'weibo', mode: 'intent' },
  { platform: 'line', mode: 'intent' },
  { platform: 'instagram', mode: 'copy-open', entryUrl: 'https://www.instagram.com/' },
  { platform: 'xiaohongshu', mode: 'copy-open', entryUrl: 'https://www.xiaohongshu.com/' },
];

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1200) : fallback;
}

function cleanLocale(value: unknown): string {
  if (typeof value !== 'string') return 'en';
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 32) : 'en';
}

export function normalizeSocialShareUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function query(items: Array<[string, string | undefined]>): string {
  return items
    .filter(([, value]) => value !== undefined && value.length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value ?? '')}`)
    .join('&');
}

function buildPlatformUrl(
  platform: SocialSharePlatform,
  args: { url: string; title: string; text: string; copyText: string },
): string | undefined {
  switch (platform) {
    case 'x':
      return `https://twitter.com/intent/tweet?${query([
        ['text', args.text],
        ['url', args.url],
      ])}`;
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?${query([
        ['url', args.url],
      ])}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?${query([
        ['u', args.url],
        ['quote', args.text],
      ])}`;
    case 'reddit':
      return `https://www.reddit.com/submit?${query([
        ['url', args.url],
        ['title', args.text || args.title],
      ])}`;
    case 'telegram':
      return `https://t.me/share/url?${query([
        ['url', args.url],
        ['text', args.text],
      ])}`;
    case 'whatsapp':
      return `https://api.whatsapp.com/send?${query([
        ['text', args.copyText],
      ])}`;
    case 'weibo':
      return `https://service.weibo.com/share/share.php?${query([
        ['url', args.url],
        ['title', args.text],
      ])}`;
    case 'line':
      return `https://social-plugins.line.me/lineit/share?${query([
        ['url', args.url],
      ])}`;
    case 'instagram':
    case 'xiaohongshu':
      return undefined;
  }
  const exhaustive: never = platform;
  return exhaustive;
}

export function buildSocialSharePayload(input: SocialShareRequest): SocialShareResponse {
  const kind = input.kind === 'project-html' ? 'project-html' : 'open-design-repo';
  const url = normalizeSocialShareUrl(input.url)
    ?? (kind === 'open-design-repo' ? OPEN_DESIGN_GITHUB_REPO_URL : '');
  const fallbackTitle = kind === 'project-html' ? 'Open Design project' : 'Open Design';
  const title = cleanText(input.title, fallbackTitle);
  const fallbackText = kind === 'project-html'
    ? `Built with Open Design: ${title}. Open Design repo: ${OPEN_DESIGN_GITHUB_REPO_URL}`
    : 'Open Design is an open-source workspace for creating, editing, deploying, and handing off design artifacts.';
  const text = cleanText(input.text, fallbackText);
  const copyText = cleanText(input.copyText, `${text}\n${url}`);
  const platforms = PLATFORM_DESCRIPTORS.map((descriptor) => ({
    platform: descriptor.platform,
    mode: descriptor.mode,
    ...(descriptor.entryUrl ? { entryUrl: descriptor.entryUrl } : {}),
    ...(descriptor.mode === 'intent' && url
      ? {
          shareUrl: buildPlatformUrl(descriptor.platform, {
            url,
            title,
            text,
            copyText,
          })!,
        }
      : {}),
  }));

  return {
    kind,
    locale: cleanLocale(input.locale),
    url,
    title,
    text,
    copyText,
    githubRepoUrl: OPEN_DESIGN_GITHUB_REPO_URL,
    platforms,
  };
}
