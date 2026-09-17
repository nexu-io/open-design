// @vitest-environment jsdom

// The optimistic project frame shown between Send and the daemon's create
// response (OPEND-2617). It must be built from the creation record alone —
// name, prompt, staged attachments — carry an inert copy of the real composer
// so the frame already reads as the project page, and start no project-owned
// request while the project does not exist yet.

import { cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectCreationPendingView } from '../../src/components/ProjectCreationPendingView';
import { I18nProvider } from '../../src/i18n';

let fetchMock: ReturnType<typeof vi.fn>;
let createdUrls: string[];
let revokedUrls: string[];

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  createdUrls = [];
  revokedUrls = [];
  Object.assign(URL, {
    createObjectURL: vi.fn(() => {
      const url = `blob:preview-${createdUrls.length + 1}`;
      createdUrls.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => {
      revokedUrls.push(url);
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function renderPending(overrides: Partial<Parameters<typeof ProjectCreationPendingView>[0]> = {}) {
  return render(
    <I18nProvider initial="en">
      <ProjectCreationPendingView
        projectName="Coffee shop landing page"
        prompt="Make a landing page for a coffee shop"
        agentId="claude"
        {...overrides}
      />
    </I18nProvider>,
  );
}

describe('ProjectCreationPendingView', () => {
  it('shows the sent prompt from the creation record alone, with no project-name header row', () => {
    renderPending();

    // The name is shown once, in the switcher above the card (OPEND-3128).
    expect(screen.queryByTestId('pending-project-title')).toBeNull();
    expect(document.querySelector('.chat-project-header')).toBeNull();
    expect(screen.getByText('Make a landing page for a coffee shop')).toBeTruthy();
    expect(screen.getByText('Preparing...')).toBeTruthy();
  });

  it('lists staged attachments as user-message cards in send order', () => {
    renderPending({
      files: [
        new File(['brief'], 'brief.txt', { type: 'text/plain' }),
        new File(['png'], 'mood.png', { type: 'image/png' }),
      ],
    });

    const row = screen.getByTestId('pending-attachment-row');
    const cards = row.querySelectorAll('.msg-att-doc, .msg-att-img');
    expect(Array.from(cards).map((card) => card.className)).toEqual(['msg-att-doc', 'msg-att-img']);
    expect(cards[0]!.querySelector('.msg-att-base')?.textContent).toBe('brief');
    expect(cards[0]!.querySelector('.msg-att-ext')?.textContent).toBe('.txt');
    expect(cards[1]!.querySelector('img')?.getAttribute('src')).toBe('blob:preview-1');
    // The cards are labels, not openable files: nothing has been uploaded.
    expect(row.querySelector('button')).toBeNull();
  });

  it('keeps image previews alive through a StrictMode double mount', () => {
    // apps/web runs with reactStrictMode: the simulated unmount fires the
    // preview cleanup, and the remount must mint fresh URLs rather than reuse
    // revoked ones (the useMemo + separate-cleanup split did exactly that).
    render(
      <StrictMode>
        <I18nProvider initial="en">
          <ProjectCreationPendingView
            projectName="Coffee shop landing page"
            prompt="Make a landing page"
            files={[new File(['png'], 'mood.png', { type: 'image/png' })]}
              />
        </I18nProvider>
      </StrictMode>,
    );

    const src = screen.getByTestId('pending-attachment-row').querySelector('img')?.getAttribute('src');
    expect(src).toBeTruthy();
    expect(createdUrls).toContain(src);
    expect(revokedUrls).not.toContain(src);
    // Whatever the simulated unmount revoked was one of ours, never the live one.
    expect(revokedUrls.every((url) => createdUrls.includes(url))).toBe(true);
  });

  it('renders the real composer as an inert, non-sendable shell', () => {
    renderPending();

    const shell = screen.getByTestId('pending-chat-composer-shell');
    // React 18 drops the boolean `inert` prop, so the view sets the attribute
    // on the node itself; the assertion is on the DOM, not on props.
    expect(shell.hasAttribute('inert')).toBe(true);
    expect(shell.getAttribute('aria-disabled')).toBe('true');
    expect(shell.querySelector('.chat-composer, [data-testid="chat-composer"], form, textarea, [contenteditable]')).toBeTruthy();
    // The send affordance is present so the frame matches ProjectView, but
    // it can never fire: no project exists to send into.
    expect((screen.getByTestId('chat-send') as HTMLButtonElement).disabled).toBe(true);
  });

  it('starts no project-owned request while the project is unconfirmed', async () => {
    renderPending({ files: [new File(['brief'], 'brief.txt', { type: 'text/plain' })] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const projectReads = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/api/projects/'));
    expect(projectReads).toEqual([]);
  });
});
