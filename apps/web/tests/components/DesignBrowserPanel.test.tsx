// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BROWSER_USE_ACTION_TOTAL,
  BROWSER_USE_CATEGORIES,
  REFERENCE_GROUPS,
  REFERENCE_TOTAL,
  browserUseActionById,
  browserUsePrompt,
  browserFileName,
  faviconUrl,
  filterBrowserUseCategories,
  filterReferenceGroups,
  formatAddressDisplay,
  formatAddressDisplayParts,
  hostnameFromUrl,
  isHistoryEntry,
  isHistoryUrl,
  labelFromUrl,
  loadHistory,
  normalizeBrowserAddress,
  pageBriefMarkdown,
  referenceIconUrl,
  sameUrl,
  saveHistory,
} from '../../src/components/DesignBrowserPanel';
import {
  browserCommentFilePath,
  isProjectHtmlBrowserUrl,
  projectRelativePathFromBrowserUrl,
} from '../../src/components/design-browser-tools';

describe('normalizeBrowserAddress', () => {
  it('passes through absolute http URLs unchanged', () => {
    expect(normalizeBrowserAddress('http://example.com/page')).toBe('http://example.com/page');
  });

  it('passes through absolute https URLs unchanged', () => {
    expect(normalizeBrowserAddress('https://example.com/page')).toBe('https://example.com/page');
  });

  it('passes through file URLs unchanged', () => {
    expect(normalizeBrowserAddress('file:///Users/me/page.html')).toBe('file:///Users/me/page.html');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(normalizeBrowserAddress('  https://example.com  ')).toBe('https://example.com');
  });

  it('promotes a bare domain to https', () => {
    expect(normalizeBrowserAddress('example.com')).toBe('https://example.com');
  });

  it('promotes a bare domain with a path and port to https', () => {
    expect(normalizeBrowserAddress('example.com:8080/path')).toBe('https://example.com:8080/path');
  });

  it('maps localhost to http', () => {
    expect(normalizeBrowserAddress('localhost')).toBe('http://localhost');
    expect(normalizeBrowserAddress('localhost:3000/dash')).toBe('http://localhost:3000/dash');
  });

  it('maps loopback IPs to http', () => {
    expect(normalizeBrowserAddress('127.0.0.1')).toBe('http://127.0.0.1');
    expect(normalizeBrowserAddress('127.0.0.1:5173')).toBe('http://127.0.0.1:5173');
    expect(normalizeBrowserAddress('0.0.0.0:8000')).toBe('http://0.0.0.0:8000');
  });

  it('resolves /api, /artifacts, /frames paths against the page origin', () => {
    const origin = window.location.origin;
    expect(normalizeBrowserAddress('/api/runs')).toBe(`${origin}/api/runs`);
    expect(normalizeBrowserAddress('/artifacts/x.png')).toBe(`${origin}/artifacts/x.png`);
    expect(normalizeBrowserAddress('/frames/1')).toBe(`${origin}/frames/1`);
  });

  it('maps other absolute paths to file URLs', () => {
    expect(normalizeBrowserAddress('/Users/me/page.html')).toBe('file:///Users/me/page.html');
    expect(normalizeBrowserAddress('/some path/with space')).toBe(`file://${encodeURI('/some path/with space')}`);
  });

  it('treats free text as a Google search', () => {
    expect(normalizeBrowserAddress('design inspiration')).toBe(
      'https://www.google.com/search?q=design%20inspiration',
    );
  });

  it('maps an empty string to about:blank', () => {
    expect(normalizeBrowserAddress('')).toBe('about:blank');
    expect(normalizeBrowserAddress('   ')).toBe('about:blank');
  });

  it('passes through an explicit about:blank', () => {
    expect(normalizeBrowserAddress('about:blank')).toBe('about:blank');
  });
});

describe('inspiration action prompts', () => {
  it('keeps the inspiration catalogue at the intended 43 actions', () => {
    expect(BROWSER_USE_ACTION_TOTAL).toBe(43);
    expect(BROWSER_USE_CATEGORIES.map((category) => category.id)).toEqual([
      'assets',
      'tokens',
      'motion',
      'visual',
      'structure',
      'project',
      'general',
    ]);
    expect(BROWSER_USE_CATEGORIES[0]?.actions.slice(0, 3).map((action) => action.id)).toEqual([
      'extract_logo',
      'list_images',
      'download_assets',
    ]);
    expect(BROWSER_USE_CATEGORIES[BROWSER_USE_CATEGORIES.length - 1]?.actions.map((action) => action.id)).toContain('navigate');
    expect(browserUseActionById('extract_fonts')?.output).toContain('typography.json');
    expect(browserUseActionById('extract_og_metadata')?.output).toContain('OG/Twitter');
    expect(browserUseActionById('audit_accessibility')?.output).toContain('A11y');
  });

  it('filters inspiration actions by action evidence and category title', () => {
    const visualCategory = BROWSER_USE_CATEGORIES.find((category) => category.id === 'visual');
    const categoryTitle = (category: (typeof BROWSER_USE_CATEGORIES)[number]) =>
      ({
        assets: '素材提取',
        tokens: '设计语言',
        motion: '动效',
        visual: '视觉校验',
        structure: '组件结构',
        project: '项目运行',
        general: '通用操作',
      })[category.id] ?? category.title;
    expect(visualCategory).toBeTruthy();
    expect(filterBrowserUseCategories(BROWSER_USE_CATEGORIES, 'a11y', categoryTitle)).toEqual([
      {
        ...visualCategory!,
        actions: [browserUseActionById('audit_accessibility')!],
      },
    ]);
    expect(
      filterBrowserUseCategories(
        BROWSER_USE_CATEGORIES,
        '字体',
        categoryTitle,
        (action) => (action.id === 'extract_fonts' ? ['字体家族、字号、字重和 @font-face'] : []),
      )[0]?.actions,
    ).toEqual([browserUseActionById('extract_fonts')!]);
    expect(filterBrowserUseCategories(BROWSER_USE_CATEGORIES, '通用操作', categoryTitle)[0]?.id).toBe('general');
    expect(filterBrowserUseCategories(BROWSER_USE_CATEGORIES, 'no-such-action', categoryTitle)).toEqual([]);
  });

  it('builds an agent-browser prompt bound to the current browser tab context', () => {
    const action = browserUseActionById('extract_colors');
    expect(action).not.toBeNull();

    const prompt = browserUsePrompt(action!, {
      browserFilePath: 'browser:https://example.com',
      projectId: 'proj-1',
      resolvedDir: '/tmp/open-design/project',
      tabLabel: 'Example landing',
      title: 'Example',
      url: 'https://example.com',
    });

    expect(prompt).toContain('@agent-browser');
    expect(prompt).toContain('Use the selected Open Design Browser tab as the bound target.');
    expect(prompt).toContain('- tab: Example landing');
    expect(prompt).toContain('- url: https://example.com');
    expect(prompt).toContain('Operation: extract_colors');
    expect(prompt).toContain('browser-use / browser-harness style evidence');
  });
});

describe('browser tool file targeting', () => {
  it('treats localhost dev-server pages as browser targets, not single-file HTML saves', () => {
    const url = 'http://localhost:3000/src/App.jsx';

    expect(browserCommentFilePath(url, '/Users/me/project')).toBe(`browser:${url}`);
    expect(projectRelativePathFromBrowserUrl(url, '/Users/me/project')).toBeNull();
    expect(isProjectHtmlBrowserUrl(url, '/Users/me/project')).toBe(false);
  });

  it('maps project-local file HTML pages back to editable project files', () => {
    const url = 'file:///Users/me/project/dist/index.html';

    expect(browserCommentFilePath(url, '/Users/me/project')).toBe('dist/index.html');
    expect(projectRelativePathFromBrowserUrl(url, '/Users/me/project')).toBe('dist/index.html');
    expect(isProjectHtmlBrowserUrl(url, '/Users/me/project')).toBe(true);
  });

  it('keeps project-local non-HTML files as commentable browser targets without save affordance', () => {
    const url = 'file:///Users/me/project/src/App.jsx';

    expect(browserCommentFilePath(url, '/Users/me/project')).toBe('src/App.jsx');
    expect(projectRelativePathFromBrowserUrl(url, '/Users/me/project')).toBe('src/App.jsx');
    expect(isProjectHtmlBrowserUrl(url, '/Users/me/project')).toBe(false);
  });
});

describe('sameUrl', () => {
  it('treats trailing slashes as equivalent', () => {
    expect(sameUrl('https://example.com', 'https://example.com/')).toBe(true);
    expect(sameUrl('https://example.com///', 'https://example.com')).toBe(true);
  });

  it('distinguishes different paths', () => {
    expect(sameUrl('https://example.com/a', 'https://example.com/b')).toBe(false);
  });
});

describe('labelFromUrl', () => {
  it('returns New Tab for the blank URL', () => {
    expect(labelFromUrl('about:blank')).toBe('New Tab');
  });

  it('strips the www. prefix from the host', () => {
    expect(labelFromUrl('https://www.example.com/page')).toBe('example.com');
    expect(labelFromUrl('https://sub.example.com/')).toBe('sub.example.com');
  });

  it('falls back to the raw value when the URL cannot be parsed', () => {
    expect(labelFromUrl('not a url')).toBe('not a url');
  });
});

describe('formatAddressDisplay', () => {
  it('keeps the URL alone when the title is only the host fallback', () => {
    expect(formatAddressDisplay('https://www.example.com/path', 'example.com')).toBe('https://www.example.com/path');
  });

  it('appends a real page title for the passive address display', () => {
    expect(formatAddressDisplay('https://www.baidu.com/', '百度一下，你就知道')).toBe(
      'https://www.baidu.com/ / 百度一下，你就知道',
    );
  });

  it('exposes URL and title as separate passive display parts', () => {
    expect(formatAddressDisplayParts('https://brandfetch.com/', 'Just a moment...')).toEqual({
      url: 'https://brandfetch.com/',
      title: 'Just a moment...',
    });
  });

  it('keeps the blank tab display empty', () => {
    expect(formatAddressDisplay('about:blank', 'New Tab')).toBe('');
  });
});

describe('hostnameFromUrl', () => {
  it('returns a compact hostname without www', () => {
    expect(hostnameFromUrl('https://www.example.com/docs')).toBe('example.com');
  });

  it('falls back to the raw value when parsing fails', () => {
    expect(hostnameFromUrl('not a url')).toBe('not a url');
  });
});

describe('faviconUrl', () => {
  it('derives a same-origin favicon URL for http pages', () => {
    expect(faviconUrl('https://www.example.com/docs')).toBe('https://www.example.com/favicon.ico');
  });

  it('skips non-http urls', () => {
    expect(faviconUrl('file:///Users/me/page.html')).toBeUndefined();
  });
});

describe('referenceIconUrl', () => {
  it('routes a reference site through the favicon service with its hostname', () => {
    expect(referenceIconUrl('https://dribbble.com/')).toBe(
      'https://www.google.com/s2/favicons?sz=64&domain=dribbble.com',
    );
  });

  it('preserves subdomains and accepts a custom size', () => {
    expect(referenceIconUrl('https://styles.refero.design/', 32)).toBe(
      'https://www.google.com/s2/favicons?sz=32&domain=styles.refero.design',
    );
  });

  it('returns a resolvable icon for every catalogued reference site', () => {
    for (const group of REFERENCE_GROUPS) {
      for (const site of group.sites) {
        expect(referenceIconUrl(site.url)).toMatch(
          /^https:\/\/www\.google\.com\/s2\/favicons\?sz=64&domain=/,
        );
      }
    }
  });

  it('skips non-http urls so the globe fallback still applies', () => {
    expect(referenceIconUrl('file:///Users/me/page.html')).toBeUndefined();
  });
});

describe('isHistoryUrl', () => {
  it('accepts http(s) and file URLs', () => {
    expect(isHistoryUrl('https://example.com')).toBe(true);
    expect(isHistoryUrl('http://localhost:3000')).toBe(true);
    expect(isHistoryUrl('file:///Users/me/x.html')).toBe(true);
  });

  it('rejects the blank URL', () => {
    expect(isHistoryUrl('about:blank')).toBe(false);
  });

  it('rejects non http/file schemes', () => {
    expect(isHistoryUrl('data:text/html,hi')).toBe(false);
    expect(isHistoryUrl('mailto:hi@example.com')).toBe(false);
  });
});

describe('pageBriefMarkdown', () => {
  it('renders title, source, and populated sections while skipping empty ones', () => {
    const md = pageBriefMarkdown(
      {
        title: 'Example',
        url: 'https://example.com',
        description: 'A description',
        headings: ['Hero', '  ', 'Features'],
        images: [],
        links: [{ text: 'Docs', url: 'https://example.com/docs' }],
        colors: [{ value: 'rgb(0, 0, 0)', count: 4 }],
      },
      'https://fallback.example.com',
    );
    expect(md).toContain('# Example');
    expect(md).toContain('Source: https://example.com');
    expect(md).toContain('## Description');
    expect(md).toContain('## Headings');
    expect(md).toContain('- Hero');
    expect(md).toContain('- Features');
    expect(md).not.toContain('## Images');
    expect(md).toContain('## Links');
    expect(md).toContain('- Docs - https://example.com/docs');
    expect(md).toContain('## Colors');
    expect(md).toContain('- rgb(0, 0, 0) (4)');
    expect(md).not.toContain('Browser Harness');
  });

  it('falls back to label and url when the brief omits them', () => {
    const md = pageBriefMarkdown({}, 'https://www.fallback.example.com/path');
    expect(md).toContain('# fallback.example.com');
    expect(md).toContain('Source: https://www.fallback.example.com/path');
  });
});

describe('browserFileName', () => {
  it('sanitizes the host and includes the prefix and extension', () => {
    const name = browserFileName('browser-capture', 'https://www.example.com/page', 'png');
    expect(name).toMatch(/^browser\/browser-capture-example\.com-[\dTZ-]+\.png$/);
  });

  it('uses a page fallback when the host sanitizes to empty', () => {
    const name = browserFileName('browser-brief', 'about:blank', 'md');
    // about:blank -> labelFromUrl 'New Tab' -> 'New-Tab'
    expect(name).toMatch(/^browser\/browser-brief-New-Tab-[\dTZ-]+\.md$/);
  });
});

describe('isHistoryEntry', () => {
  it('accepts a well-formed entry', () => {
    expect(
      isHistoryEntry({ url: 'https://x', title: 'X', iconUrl: 'https://x/favicon.ico', lastVisitedAt: 1, visitCount: 1 }),
    ).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isHistoryEntry(null)).toBe(false);
    expect(isHistoryEntry([])).toBe(false);
    expect(isHistoryEntry('x')).toBe(false);
    expect(isHistoryEntry({ url: 1, title: 'X', lastVisitedAt: 1, visitCount: 1 })).toBe(false);
    expect(isHistoryEntry({ url: 'x', title: 'X', lastVisitedAt: 1 })).toBe(false);
  });
});

describe('loadHistory / saveHistory round-trip', () => {
  const projectId = 'proj-history';

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty array when nothing is stored', () => {
    expect(loadHistory(projectId)).toEqual([]);
  });

  it('round-trips entries and sorts by lastVisitedAt descending', () => {
    saveHistory(projectId, [
      { url: 'https://a.com', title: 'A', lastVisitedAt: 100, visitCount: 1 },
      { url: 'https://b.com', title: 'B', lastVisitedAt: 300, visitCount: 2 },
      { url: 'https://c.com', title: 'C', lastVisitedAt: 200, visitCount: 1 },
    ]);
    const loaded = loadHistory(projectId);
    expect(loaded.map((entry) => entry.url)).toEqual([
      'https://b.com',
      'https://c.com',
      'https://a.com',
    ]);
  });

  it('drops malformed entries on load', () => {
    window.localStorage.setItem(
      `od:design-browser:${projectId}:history:v1`,
      JSON.stringify([
        { url: 'https://ok.com', title: 'OK', lastVisitedAt: 1, visitCount: 1 },
        { url: 123, title: 'bad', lastVisitedAt: 1, visitCount: 1 },
      ]),
    );
    const loaded = loadHistory(projectId);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.url).toBe('https://ok.com');
  });

  it('returns an empty array for corrupt or non-array JSON', () => {
    const key = `od:design-browser:${projectId}:history:v1`;
    window.localStorage.setItem(key, 'not json');
    expect(loadHistory(projectId)).toEqual([]);
    window.localStorage.setItem(key, JSON.stringify({ not: 'an array' }));
    expect(loadHistory(projectId)).toEqual([]);
  });

  it('caps stored history at the HISTORY_LIMIT on save and load', () => {
    const many = Array.from({ length: 120 }, (_, index) => ({
      url: `https://site-${index}.com`,
      title: `Site ${index}`,
      lastVisitedAt: index,
      visitCount: 1,
    }));
    saveHistory(projectId, many);
    expect(loadHistory(projectId)).toHaveLength(80);
  });
});

describe('REFERENCE_GROUPS catalogue', () => {
  it('exposes every documented designer reference category', () => {
    const ids = REFERENCE_GROUPS.map((group) => group.id);
    expect(ids).toEqual([
      'inspiration',
      'interfaces',
      'motion',
      'color',
      'type',
      'icons',
      'illustration',
      'photography',
      '3d',
      'mockups',
      'systems',
      'components',
      'guidelines',
      'tools',
    ]);
  });

  it('gives every group a title and at least one absolute https/http site', () => {
    for (const group of REFERENCE_GROUPS) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.sites.length).toBeGreaterThan(0);
      for (const site of group.sites) {
        expect(site.label.length).toBeGreaterThan(0);
        expect(site.detail.length).toBeGreaterThan(0);
        expect(site.url).toMatch(/^https?:\/\//);
      }
    }
  });

  it('uses unique category ids and unique site urls', () => {
    const ids = REFERENCE_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    const urls = REFERENCE_GROUPS.flatMap((group) => group.sites.map((site) => site.url));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('keeps REFERENCE_TOTAL in sync with the catalogue', () => {
    const counted = REFERENCE_GROUPS.reduce((sum, group) => sum + group.sites.length, 0);
    expect(REFERENCE_TOTAL).toBe(counted);
  });

  it('includes the handoff and component-library reference URLs', () => {
    const urls = new Set(REFERENCE_GROUPS.flatMap((group) => group.sites.map((site) => site.url)));
    expect(Array.from(urls)).toEqual(expect.arrayContaining([
      'https://thesvg.org/',
      'https://unsplash.com/',
      'https://motionsites.ai/',
      'https://motion.page/showcase/',
      'https://styles.refero.design/',
      'https://brandfetch.com/',
      'https://gsap.com/',
      'https://transitions.dev/',
      'https://fonts.google.com/',
      'https://animography.net/',
      'https://reactbits.dev/text-animations/shiny-text',
      'https://toolfolio.io/',
      'https://www.whirrls.com/',
      'https://startups.gallery/',
      'https://www.worldindots.com/',
      'https://getdesign.md/',
      'https://github.com/superset-sh/superset',
      'https://svglogos.dev/',
      'https://icons.lobehub.com/',
      'https://animations.dev/',
      'https://impeccable.style/',
      'https://www.tasteskill.dev/',
      'https://base-ui.com/',
      'https://ui.shadcn.com/',
      'https://www.heroui.com/',
    ]));
  });
});

describe('filterReferenceGroups', () => {
  it('returns every group untouched for the "all" category and an empty query', () => {
    const result = filterReferenceGroups(REFERENCE_GROUPS, 'all', '');
    expect(result.map((group) => group.id)).toEqual(REFERENCE_GROUPS.map((group) => group.id));
    expect(result).toEqual(REFERENCE_GROUPS);
  });

  it('narrows to a single group when a category id is active', () => {
    const result = filterReferenceGroups(REFERENCE_GROUPS, 'motion', '');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('motion');
    expect(result[0]?.sites.length).toBeGreaterThan(0);
  });

  it('matches sites by label, hostname, or detail across all categories', () => {
    const byLabel = filterReferenceGroups(REFERENCE_GROUPS, 'all', 'dribbble');
    expect(byLabel.flatMap((group) => group.sites.map((site) => site.label))).toContain('Dribbble');

    const byHostname = filterReferenceGroups(REFERENCE_GROUPS, 'all', 'unsplash.com');
    expect(byHostname.flatMap((group) => group.sites.map((site) => site.label))).toContain('Unsplash');

    const byDetail = filterReferenceGroups(REFERENCE_GROUPS, 'all', 'contrast');
    expect(byDetail.flatMap((group) => group.sites.map((site) => site.label))).toContain('WebAIM Contrast');
  });

  it('keeps an entire group when the query matches its title', () => {
    const color = REFERENCE_GROUPS.find((group) => group.id === 'color');
    const result = filterReferenceGroups(REFERENCE_GROUPS, 'all', 'color');
    const matchedColor = result.find((group) => group.id === 'color');
    expect(matchedColor?.sites).toEqual(color?.sites);
  });

  it('drops groups with no surviving sites and is case-insensitive', () => {
    const result = filterReferenceGroups(REFERENCE_GROUPS, 'all', 'COOLORS');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('color');
    expect(result[0]?.sites.map((site) => site.label)).toEqual(['Coolors']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterReferenceGroups(REFERENCE_GROUPS, 'all', 'zzz-no-such-reference')).toEqual([]);
  });
});
