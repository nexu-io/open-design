// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkillSummary } from '@open-design/contracts';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => ({
      context: null,
      loading: false,
      failure: 'unsupported' as const,
    }),
  };
});

import { HomeView } from '../../src/components/HomeView';
import type { PluginLoopSubmit } from '../../src/components/PluginLoopHome';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

// The shipped frontmatter is the thing under test. `image-led-page` builds and
// lints an HTML page, so its home-entry route must compose the page workflow —
// a media mode/surface would instead resolve project kind `image`, and the
// daemon then appends MEDIA_GENERATION_CONTRACT, which forbids `<artifact>`
// output and caps the visible reply at one sentence. That head existed briefly
// on PR #7625; this spec pins the file so it cannot come back silently.
// jsdom rewrites `import.meta.url` to an http scheme, so resolve from the
// package cwd (`apps/web`) the way the repo-root path actually sits.
const SKILL_MD = readFileSync(
  resolve(process.cwd(), '../../design-templates/image-led-page/SKILL.md'),
  'utf8',
);

function frontmatterValue(key: 'mode' | 'surface'): string | null {
  const match = SKILL_MD.match(new RegExp(`^\\s{2}${key}:\\s*(\\S+)\\s*$`, 'm'));
  return match ? match[1]! : null;
}

function skillFromShippedFrontmatter(): SkillSummary {
  return {
    id: 'image-led-page',
    name: 'Image-Led Page',
    description: 'Build a page whose imagery is generated rather than borrowed.',
    triggers: ['image-led page'],
    mode: frontmatterValue('mode') as SkillSummary['mode'],
    surface: (frontmatterValue('surface') ?? undefined) as SkillSummary['surface'],
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Build the launch page and generate its imagery.',
    aggregatesExamples: false,
  };
}

function submitSpy() {
  return vi.fn<(payload: PluginLoopSubmit) => void>();
}
type SubmitSpy = ReturnType<typeof submitSpy>;

function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stubAnimationFrame() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(window.performance.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

// The @-mention popover's own pick path, identical to
// HomeView.skill-with-chip.test.tsx: type an `@query` into the live Lexical
// editor, then mouseDown the listed option.
async function mentionSkill(query: string, label: RegExp) {
  screen.getByTestId('home-hero-input');
  setHomeHeroPrompt(query);
  await settle();
  fireEvent.mouseDown(await screen.findByRole('option', { name: label }));
  await waitFor(() => expect(screen.getByTestId('home-hero-active-skill')).toBeTruthy());
}

async function submitAndRead(onSubmit: SubmitSpy) {
  fireEvent.click(screen.getByTestId('home-hero-submit'));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  return onSubmit.mock.calls[0]![0] as unknown as Record<string, unknown>;
}

function renderHome(onSubmit: SubmitSpy, skill: SkillSummary) {
  return render(
    <HomeView
      projects={[]}
      skills={[skill]}
      onSubmit={onSubmit}
      onOpenProject={() => undefined}
      onViewAllProjects={() => undefined}
    />,
  );
}

describe('HomeView — image-led-page routes to the page workflow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('ships prototype/web frontmatter', () => {
    expect(frontmatterValue('mode')).toBe('prototype');
    expect(frontmatterValue('surface')).toBe('web');
  });

  it('selecting the shipped skill composes an HTML-page project, not a media project', async () => {
    stubFetch();
    stubAnimationFrame();
    const onSubmit = submitSpy();
    renderHome(onSubmit, skillFromShippedFrontmatter());

    await mentionSkill('@image-led', /image-led page/i);
    setHomeHeroPrompt('Build the launch page for Falz & Bund with generated photography.');
    await settle();

    const payload = await submitAndRead(onSubmit);

    expect(payload.skillId).toBe('image-led-page');
    // `projectKindForSkill` maps the skill's mode; `prototype` is the HTML
    // page workflow. Anything media-shaped here means the daemon would compose
    // MEDIA_GENERATION_CONTRACT and the skill could not build its page.
    expect(payload.projectKind).toBe('prototype');
    expect((payload.projectMetadata as { kind?: string }).kind).toBe('prototype');
  });

  it('documents the failure this pins down: a media mode/surface routes to the media workflow', async () => {
    stubFetch();
    stubAnimationFrame();
    const onSubmit = submitSpy();
    renderHome(onSubmit, {
      ...skillFromShippedFrontmatter(),
      mode: 'image',
      surface: 'image',
    });

    await mentionSkill('@image-led', /image-led page/i);
    setHomeHeroPrompt('Build the launch page for Falz & Bund with generated photography.');
    await settle();

    const payload = await submitAndRead(onSubmit);

    expect(payload.projectKind).toBe('image');
    expect((payload.projectMetadata as { kind?: string }).kind).toBe('image');
  });
});
