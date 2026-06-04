import { describe, expect, it } from 'vitest';

import {
  buildSocialSharePayload,
  OPEN_DESIGN_GITHUB_REPO_URL,
} from '../src/api/social-share';

describe('social-share contract', () => {
  it('builds Open Design repository share targets', () => {
    const payload = buildSocialSharePayload({
      kind: 'open-design-repo',
      locale: 'zh-CN',
      title: 'Open Design GitHub',
      text: '推荐 Open Design',
    });

    expect(payload.url).toBe(OPEN_DESIGN_GITHUB_REPO_URL);
    expect(payload.locale).toBe('zh-CN');
    expect(payload.platforms.some((target) => target.platform === 'x' && target.shareUrl?.includes('twitter.com/intent/tweet'))).toBe(true);
    expect(payload.platforms.some((target) => target.platform === 'xiaohongshu' && target.mode === 'copy-open')).toBe(true);
  });

  it('keeps deployed project links and the repo recommendation together', () => {
    const payload = buildSocialSharePayload({
      kind: 'project-html',
      locale: 'en',
      url: 'https://example.com/open-design-demo',
      title: 'Demo',
      text: `Built with Open Design. Repo: ${OPEN_DESIGN_GITHUB_REPO_URL}`,
      copyText: `Demo\nhttps://example.com/open-design-demo\n${OPEN_DESIGN_GITHUB_REPO_URL}`,
    });

    expect(payload.url).toBe('https://example.com/open-design-demo');
    expect(payload.githubRepoUrl).toBe(OPEN_DESIGN_GITHUB_REPO_URL);
    expect(payload.copyText).toContain(OPEN_DESIGN_GITHUB_REPO_URL);
    expect(payload.platforms.find((target) => target.platform === 'telegram')?.shareUrl)
      .toContain('https%3A%2F%2Fexample.com%2Fopen-design-demo');
  });
});
