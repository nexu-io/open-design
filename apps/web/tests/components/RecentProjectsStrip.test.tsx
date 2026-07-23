// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecentProjectsStrip } from '../../src/components/RecentProjectsStrip';
import type { Project } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchProjectFileText: vi.fn(async (projectId: string, name: string) => {
    if (projectId === 'project-ds' && name === 'brand.json') {
      return JSON.stringify({
        logo: { primary: 'logos/favicon-1.png' },
        imagery: { samples: [{ file: 'imagery/cover-0.png', kind: 'cover' }] },
      });
    }
    if (projectId === 'project-ds-fallback' && name === 'brand.json') {
      return JSON.stringify({
        logo: {
          primary: 'logos/favicon-1.png',
          alternates: ['logos/wordmark.svg'],
        },
      });
    }
    return null;
  }),
  fetchProjectFiles: vi.fn(async (projectId: string) => {
    if (projectId === 'project-ds') {
      return [
        { name: 'favicon-1.png', path: 'logos/favicon-1.png', kind: 'image', mtime: 4 },
        { name: 'cover-0.png', path: 'imagery/cover-0.png', kind: 'image', mtime: 3 },
      ];
    }
    if (projectId === 'project-ds-fallback') {
      return [
        { name: 'favicon-1.png', path: 'logos/favicon-1.png', kind: 'image', mtime: 4 },
        { name: 'wordmark.svg', path: 'logos/wordmark.svg', kind: 'image', mtime: 3 },
      ];
    }
    if (projectId === 'project-html') {
      return [{ name: 'index.html', kind: 'html', mtime: 200 }];
    }
    if (projectId === 'project-deck') {
      return [{ name: 'index.html', kind: 'html', mtime: 400 }];
    }
    return [];
  }),
  projectFileUrl: (projectId: string, fileName: string) =>
    `/api/projects/${projectId}/files/${fileName}`,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function project(overrides: Partial<Project>): Project {
  return {
    id: 'project-1',
    name: 'Project',
    skillId: null,
    designSystemId: null,
    createdAt: 1,
    updatedAt: 2,
    status: { value: 'not_started' },
    ...overrides,
  };
}

function projects(count: number): Project[] {
  return Array.from({ length: count }, (_, index) =>
    project({
      id: `project-${index + 1}`,
      name: `Project ${index + 1}`,
      updatedAt: count - index,
    }),
  );
}

function stubCoverProbe(status = 200, statusText = 'OK', body?: string) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => body ?? '',
  }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('RecentProjectsStrip', () => {
  it('shows seven projects when the row has room for a seventh card', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      return {
        x: 0,
        y: 0,
        width: this.classList.contains('recent-projects__row') ? 1332 : 180,
        height: 100,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      };
    });

    const { container } = render(
      <RecentProjectsStrip
        projects={projects(8)}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll('.recent-projects__card')).toHaveLength(7);
    });
  });

  it('keeps six projects when the row is below the wide-card threshold', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      return {
        x: 0,
        y: 0,
        width: this.classList.contains('recent-projects__row') ? 1331 : 180,
        height: 100,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      };
    });

    const { container } = render(
      <RecentProjectsStrip
        projects={projects(8)}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    expect(container.querySelectorAll('.recent-projects__card')).toHaveLength(6);
  });

  it('remeasures when projects arrive after the initial empty render', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1400,
    });

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      return {
        x: 0,
        y: 0,
        width: this.classList.contains('recent-projects__row') ? 1331 : 180,
        height: 100,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      };
    });

    const { container, rerender } = render(
      <RecentProjectsStrip
        projects={[]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    rerender(
      <RecentProjectsStrip
        projects={projects(8)}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    expect(container.querySelectorAll('.recent-projects__card')).toHaveLength(6);
  });

  it('matches project cards with previews and design-system tags', async () => {
    stubCoverProbe();

    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-ds',
            name: 'Acme Design System',
            updatedAt: 4,
            metadata: {
              kind: 'other',
              importedFrom: 'design-system',
            },
          }),
          project({
            id: 'project-html',
            name: 'Web Prototype',
            updatedAt: 3,
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    expect(screen.getByText('Design System')).toBeTruthy();
    expect(screen.getAllByText('Prototype').length).toBeGreaterThan(0);
    const designSystemCard = container.querySelector('.recent-projects__card.is-design-system-project');
    expect(designSystemCard).toBeTruthy();
    expect(designSystemCard?.querySelectorAll('.design-card-tag')).toHaveLength(1);

    await waitFor(() => {
      expect(designSystemCard?.querySelector('.recent-projects__card-thumb-image img')).toBeTruthy();
      expect(designSystemCard?.querySelector('img')?.getAttribute('src')).toBe(
        '/api/projects/project-ds/files/imagery/cover-0.png?v=3',
      );
      const htmlFrame = container.querySelector<HTMLIFrameElement>('.recent-projects__card-thumb-html iframe');
      expect(htmlFrame).toBeTruthy();
      expect(htmlFrame?.getAttribute('src')).toBe('/api/projects/project-html/files/index.html?v=200');
      expect(container.querySelector('.recent-projects__card-thumb-html .recent-projects__card-glyph')).toBeNull();
    });
  });

  it('uses non-favicon design-system logo alternates when no cover exists', async () => {
    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-ds-fallback',
            name: 'Acme Design System',
            updatedAt: 4,
            metadata: {
              kind: 'other',
              importedFrom: 'design-system',
            },
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    const designSystemCard = container.querySelector('.recent-projects__card.is-design-system-project');

    await waitFor(() => {
      expect(designSystemCard?.querySelector('.recent-projects__card-thumb-logo img')).toBeTruthy();
      expect(designSystemCard?.querySelector('img')?.getAttribute('src')).toBe(
        '/api/projects/project-ds-fallback/files/logos/wordmark.svg?v=3',
      );
    });
  });

  it('renders HTML and deck covers from the current file URL', async () => {
    // Deck projects render the first slide as an inert thumbnail (no carousel
    // chrome), so the deck cover returns a minimal parseable deck body; plain
    // HTML projects keep the raw iframe. See #2648.
    const deckBody =
      '<!DOCTYPE html><html><body>' +
      '<div class="slide">Slide one</div>' +
      '<style>.slide{width:1280px;height:720px;background:#fff;color:#000}</style>' +
      '</body></html>';
    const fetchMock = stubCoverProbe(200, 'OK', deckBody);

    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-deck',
            name: 'Simple Deck',
            updatedAt: 4,
            metadata: { kind: 'deck' },
          }),
          project({
            id: 'project-html',
            name: 'Web Prototype',
            updatedAt: 3,
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    const deckCard = container.querySelector('[data-project-id="project-deck"]');
    const htmlCard = container.querySelector('[data-project-id="project-html"]');

    await waitFor(() => {
      // Deck card renders the static slide thumbnail, not the raw iframe, so
      // no carousel nav controls leak into the gallery card.
      expect(deckCard?.querySelector('iframe')).toBeNull();
      expect(htmlCard?.querySelector('iframe')?.getAttribute('src')).toBe(
        '/api/projects/project-html/files/index.html?v=200',
      );
      expect(deckCard?.querySelector('.recent-projects__card-glyph')).toBeNull();
      expect(htmlCard?.querySelector('.recent-projects__card-glyph')).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-deck/files/index.html?v=400',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-html/files/index.html?v=200',
      expect.objectContaining({ cache: 'no-store', method: 'HEAD' }),
    );
  });

  it('does not mount the deck iframe fallback while the deck body is still loading (#2648)', async () => {
    // Regression for the loading-state gap mrcfps flagged on #6013: while the
    // deck GET/parse is pending, the card must render the glyph (loading), not
    // the raw HTML iframe — otherwise an immediately-successful HEAD probe
    // could mount index.html with the carousel chrome this change removes, and
    // every parseable deck pays for a redundant probe. Here the deck GET never
    // resolves (deferred), so the card stays in the loading/glyph phase and no
    // iframe is mounted for the deck card at all.
    const deckUrl = '/api/projects/project-deck/files/index.html?v=400';
    const htmlUrl = '/api/projects/project-html/files/index.html?v=200';
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      // Deck GET stays pending forever (deferred body).
      if (url === deckUrl && init?.method !== 'HEAD') {
        return new Promise<Response>(() => {});
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '',
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-deck',
            name: 'Simple Deck',
            updatedAt: 4,
            metadata: { kind: 'deck' },
          }),
          project({
            id: 'project-html',
            name: 'Web Prototype',
            updatedAt: 3,
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    const deckCard = container.querySelector('[data-project-id="project-deck"]');

    // While the deck body is still loading, the deck card shows the glyph and
    // never mounts an iframe (no carousel chrome, no redundant HEAD probe).
    await waitFor(() => {
      expect(deckCard?.querySelector('.recent-projects__card-glyph')).not.toBeNull();
    });
    expect(deckCard?.querySelector('iframe')).toBeNull();
    // The deck GET was issued exactly once (the loading fetch); no HEAD probe.
    const deckCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : String(input);
      return url === deckUrl;
    });
    expect(deckCalls).toHaveLength(1);
    // The plain-HTML card still resolves normally via its HEAD probe.
    expect(fetchMock).toHaveBeenCalledWith(
      htmlUrl,
      expect.objectContaining({ cache: 'no-store', method: 'HEAD' }),
    );
  });

  it('falls back to the glyph and logs when an HTML cover is unavailable', async () => {
    stubCoverProbe(404, 'Not Found');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { container } = render(
      <RecentProjectsStrip
        projects={[
          project({
            id: 'project-html',
            name: 'Web Prototype',
            updatedAt: 3,
          }),
        ]}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    );

    await waitFor(() => {
      const htmlThumb = container.querySelector('.recent-projects__card-thumb-html');
      expect(htmlThumb?.querySelector('iframe')).toBeNull();
      expect(htmlThumb?.querySelector('.recent-projects__card-glyph')?.textContent).toBe('W');
      expect(warn).toHaveBeenCalledWith(
        '[project-cover] HTML cover unavailable (404 Not Found):',
        'project-html:index.html',
      );
    });
  });
});
