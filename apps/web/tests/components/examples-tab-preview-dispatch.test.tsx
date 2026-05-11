// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillSummary } from '../../src/types';

// Regression coverage for nexu-io/open-design#897 — the Examples gallery
// dispatches on `od.preview.type` so skills that ship no HTML artifact
// (image / markdown / …) render a calm "no shipped preview" placeholder
// instead of bouncing through a doomed `/api/skills/:id/example` fetch
// and the misleading "Couldn't load this example" error state.

vi.mock('../../src/providers/registry', () => ({
  fetchSkillExample: vi.fn(),
}));

import { fetchSkillExample } from '../../src/providers/registry';
import { ExamplesTab } from '../../src/components/ExamplesTab';

const mockedFetch = fetchSkillExample as unknown as ReturnType<typeof vi.fn>;

function makeSkill(overrides: Partial<SkillSummary>): SkillSummary {
  return {
    id: 'sample',
    name: 'Sample',
    description: 'A sample skill.',
    triggers: [],
    mode: 'prototype',
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Make me something nice.',
    aggregatesExamples: false,
    ...overrides,
  };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ExamplesTab preview dispatch (#897)', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the unavailable affordance for a markdown skill without firing a network call', async () => {
    // The dispatch lives in fetchSkillExample (the mocked module), so we
    // mirror the production short-circuit shape here. This test pins the
    // contract: ExamplesTab routes the result into the modal and the
    // user sees the calm placeholder instead of the loading shimmer.
    mockedFetch.mockImplementation(async (_id: string, previewType: string) => {
      if (previewType !== 'html') {
        return { unavailable: true, kind: previewType };
      }
      return { html: '<html><body>ok</body></html>' };
    });

    const skill = makeSkill({
      id: 'dcf-valuation',
      name: 'DCF Valuation',
      previewType: 'markdown',
    });
    render(<ExamplesTab skills={[skill]} onUsePrompt={() => {}} />);

    // Open the preview modal.
    const openButtons = screen.getAllByText(/open preview/i);
    fireEvent.click(openButtons[0]!);
    await flushPromises();

    // Dispatch routed through fetchSkillExample with the right kind.
    expect(mockedFetch).toHaveBeenCalledWith('dcf-valuation', 'markdown');

    // Modal renders the unavailable affordance (the testid is the
    // contract surface — copy can be tweaked without breaking this).
    expect(screen.getByTestId('preview-unavailable')).toBeTruthy();
    // Loading + error copy must not appear alongside it.
    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(screen.queryByText(/couldn't load/i)).toBeNull();
  });

  it('shows the unavailable card placeholder instead of the loading shimmer', async () => {
    mockedFetch.mockImplementation(async (_id: string, previewType: string) => {
      if (previewType !== 'html') {
        return { unavailable: true, kind: previewType };
      }
      return { html: '<html><body>ok</body></html>' };
    });

    const skill = makeSkill({
      id: 'hatch-pet',
      name: 'Hatch Pet',
      previewType: 'image',
    });
    render(<ExamplesTab skills={[skill]} onUsePrompt={() => {}} />);

    // The card's IntersectionObserver hook fires onLoad on first paint
    // (jsdom IntersectionObserver fallback short-circuits to true). Wait
    // for the dispatched result to land in state.
    await flushPromises();

    expect(
      screen.getByTestId('example-card-unavailable-hatch-pet'),
    ).toBeTruthy();
    // The transient "Loading preview…" shimmer must NOT render for a
    // non-html skill — it would never resolve, since no HTML is ever
    // fetched.
    expect(screen.queryByText(/loading preview/i)).toBeNull();
  });

  it('still routes html skills through the normal fetch path', async () => {
    mockedFetch.mockResolvedValue({ html: '<html><body>ok</body></html>' });

    const skill = makeSkill({
      id: 'blog-post',
      name: 'Blog post',
      previewType: 'html',
    });
    render(<ExamplesTab skills={[skill]} onUsePrompt={() => {}} />);

    fireEvent.click(screen.getAllByText(/open preview/i)[0]!);
    await flushPromises();

    // The dispatch passes the previewType through verbatim — no
    // legacy single-arg signature, no implicit defaults.
    expect(mockedFetch).toHaveBeenCalledWith('blog-post', 'html');
    // Unavailable affordance must NOT show for an html dispatch.
    expect(screen.queryByTestId('preview-unavailable')).toBeNull();
  });
});
