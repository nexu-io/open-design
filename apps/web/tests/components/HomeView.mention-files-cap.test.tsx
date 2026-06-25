// @vitest-environment jsdom

// Red spec for the Home "@" picker capping staged design files at 6.
//
// Repro: a user stages more than six design files, then opens the context
// picker. On `origin/main` the "Design files" surface ran the staged files
// through `.slice(0, 6)` BEFORE both the tab count and the rendered list, so
// the tab badge read "6" and only six files were ever pickable — the 7th+
// upload was unreachable through the picker. The dedicated Design files tab
// must instead list every staged match and report the true total.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

import { HomeView } from '../../src/components/HomeView';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

function stubContextFetch() {
  const fetchMock = vi.fn<typeof fetch>(async (url) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (typeof url === 'string' && url === '/api/mcp/servers') {
      return new Response(JSON.stringify({ servers: [], templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HomeView design-files mention picker', () => {
  it('lists every staged design file and counts the true total when more than six are uploaded', async () => {
    stubContextFetch();

    const files = Array.from(
      { length: 7 },
      (_, i) => new File(['x'], `design-${i + 1}.png`, { type: 'image/png' }),
    );

    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    const input = await screen.findByTestId('home-hero-input');
    // Stage all seven uploads in one paste (Lexical's PastePlugin reads
    // `clipboardData.files`).
    fireEvent.paste(input, {
      clipboardData: {
        files,
        items: files.map((file) => ({ kind: 'file', getAsFile: () => file })),
      },
    });

    await waitFor(() => expect(screen.getByText('design-1.png')).toBeTruthy());

    // Open the context picker with a query that matches every staged file.
    setHomeHeroPrompt('@design');
    await settle();

    // The "Design files" tab badge must report the true number staged (7),
    // not the truncated preview (6).
    const filesTab = await screen.findByRole('tab', { name: /design files/i });
    expect(filesTab.textContent).toContain('7');

    // Switching to the dedicated Design files tab must surface every match,
    // including the 7th upload that the old `.slice(0, 6)` dropped.
    fireEvent.click(filesTab);
    await settle();

    const picker = screen.getByTestId('home-hero-plugin-picker');
    for (let i = 1; i <= 7; i += 1) {
      expect(within(picker).getByText(`design-${i}.png`)).toBeTruthy();
    }
  });

  it('keeps the All overview count aligned with its preview-sized render', async () => {
    stubContextFetch();

    const files = Array.from(
      { length: 7 },
      (_, i) => new File(['x'], `design-${i + 1}.png`, { type: 'image/png' }),
    );

    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />,
    );

    const input = await screen.findByTestId('home-hero-input');
    fireEvent.paste(input, {
      clipboardData: {
        files,
        items: files.map((file) => ({ kind: 'file', getAsFile: () => file })),
      },
    });
    await waitFor(() => expect(screen.getByText('design-1.png')).toBeTruthy());

    setHomeHeroPrompt('@design');
    await settle();

    // The default All overview previews only the first six files, so its badge
    // must read 6 — not the full 7 — and exactly six file options render. This
    // prevents the count/content mismatch from relocating to the All tab.
    const allTab = await screen.findByRole('tab', { name: /^all/i });
    expect(allTab.textContent).toContain('6');
    expect(allTab.textContent).not.toContain('7');

    const picker = screen.getByTestId('home-hero-plugin-picker');
    const shown = Array.from({ length: 7 }, (_, i) => `design-${i + 1}.png`).filter(
      (name) => within(picker).queryByText(name) !== null,
    );
    expect(shown).toHaveLength(6);
  });
});
