import { describe, expect, it } from 'vitest';
import { rewriteSkillAssetUrls } from '../../src/server.js';

describe('rewriteSkillAssetUrls', () => {
  it('rewrites ./assets/<file> img sources to the daemon route', () => {
    const html = `<img src='./assets/hero.png' alt='' />`;
    expect(rewriteSkillAssetUrls(html, 'open-design-landing')).toBe(
      `<img src='/api/skills/open-design-landing/assets/hero.png' alt='' />`,
    );
  });

  it('handles double quotes and the no-leading-dot variant', () => {
    const html = `<img src="assets/cta.png"><a href="./assets/diagram.svg"></a>`;
    expect(rewriteSkillAssetUrls(html, 'foo')).toBe(
      `<img src="/api/skills/foo/assets/cta.png"><a href="/api/skills/foo/assets/diagram.svg"></a>`,
    );
  });

  it('rewrites sibling skill asset references', () => {
    const html = `<img src='../open-design-landing/assets/hero.png' /><a href="../skill-two/assets/guide.pdf"></a>`;
    expect(rewriteSkillAssetUrls(html, 'foo')).toBe(
      `<img src='/api/skills/open-design-landing/assets/hero.png' /><a href="/api/skills/skill-two/assets/guide.pdf"></a>`,
    );
  });

  it('leaves absolute and fragment URLs untouched', () => {
    const html = `<a href='https://example.com/assets/x.png'></a><a href='#assets'></a><img src='/assets/hero.png' />`;
    expect(rewriteSkillAssetUrls(html, 'foo')).toBe(html);
  });

  it('URL-encodes current and sibling skill ids in rewritten routes', () => {
    const html = `<img src='./assets/hero.png' /><img src="../foo bar/assets/hero.png" />`;
    expect(rewriteSkillAssetUrls(html, '../oops')).toBe(
      `<img src='/api/skills/..%2Foops/assets/hero.png' /><img src="/api/skills/foo%20bar/assets/hero.png" />`,
    );
  });

  it('keeps rewritten asset URLs under the configured browser base path', () => {
    expect(rewriteSkillAssetUrls(`<img src="./assets/hero.png">`, 'foo', '/open-design')).toBe(
      `<img src="/open-design/api/skills/foo/assets/hero.png">`,
    );
  });

  it('prefixes known root-relative daemon URLs in generated HTML', () => {
    expect(rewriteSkillAssetUrls(`<img src="/api/projects/p/raw/hero.png">`, 'foo', '/open-design')).toBe(
      `<img src="/open-design/api/projects/p/raw/hero.png">`,
    );
  });

  it('returns non-string input unchanged', () => {
    expect(rewriteSkillAssetUrls('', 'foo')).toBe('');
  });
});
