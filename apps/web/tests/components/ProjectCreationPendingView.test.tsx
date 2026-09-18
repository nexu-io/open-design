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
  it('sizes the chat column from the saved width, the same source ProjectView reads (OPEND-3207)', () => {
    window.localStorage.setItem('open-design.project.chatPanelWidth', '380');
    try {
      renderPending();
      const split = screen.getByTestId('project-creation-pending-view') as HTMLElement;
      // jsdom lays nothing out, so the container measures 0 and the saved
      // width is the whole answer; the real browser case is pinned by
      // e2e/ui/home-send-split-width.test.ts.
      expect(split.style.getPropertyValue('--project-chat-panel-width')).toBe('380px');
      expect(split.style.getPropertyValue('--project-chat-handle-width')).toBe('4px');
      expect(split.style.getPropertyValue('--project-workspace-panel-track')).toBe('minmax(400px, 1fr)');
      expect(split.classList.contains('split-settling')).toBe(false);
    } finally {
      window.localStorage.removeItem('open-design.project.chatPanelWidth');
    }
  });

  it('draws the history control footprint and live-looking empty-state pills, all inert', () => {
    renderPending();
    // The frame's ChatPane portals its real history control into the dock,
    // as it does under ProjectView, so the row does not gain a button at the
    // hand-off; the dock is inert because no project exists yet.
    const dock = screen.getByTestId('pending-chat-history-dock');
    expect(dock.querySelector('.chat-session-trigger')).toBeTruthy();
    expect(dock.hasAttribute('inert')).toBe(true);
    // The workspace column is inert as a whole; its pills keep the live look
    // DesignFilesPanel gives them instead of a disabled one.
    const workspace = document.querySelector('section.workspace') as HTMLElement;
    expect(workspace.hasAttribute('inert')).toBe(true);
    const ctas = Array.from(workspace.querySelectorAll('.df-empty-cta')) as HTMLButtonElement[];
    expect(ctas.length).toBeGreaterThan(0);
    expect(ctas.every((cta) => !cta.disabled)).toBe(true);
  });

  it('shows the sent prompt from the creation record alone, with no project-name header row', () => {
    renderPending();

    // The name is shown once, in the switcher above the card (OPEND-3128).
    expect(screen.queryByTestId('pending-project-title')).toBeNull();
    expect(document.querySelector('.chat-project-header')).toBeNull();
    expect(screen.getByText('Make a landing page for a coffee shop')).toBeTruthy();
    // OPEND-3334: the chat column is the real ChatPane drawing the optimistic
    // first turn: a user message and a running, empty assistant turn whose
    // execution record says "Working".
    const log = screen.getByTestId('chat-log');
    expect(log.querySelectorAll('[data-testid="user-message"]')).toHaveLength(1);
    expect(log.querySelectorAll('.msg.assistant')).toHaveLength(1);
    expect(screen.getByText('Working')).toBeTruthy();
    expect(screen.queryByText('Preparing...')).toBeNull();
    expect(document.querySelector('.assistant-footer')).toBeNull();
  });

  it('lists staged attachments as user-message cards in send order', () => {
    renderPending({
      files: [
        new File(['brief'], 'brief.txt', { type: 'text/plain' }),
        new File(['png'], 'mood.png', { type: 'image/png' }),
      ],
    });

    const row = screen.getByTestId('user-attachment-row');
    const cards = Array.from(row.querySelectorAll('.msg-att-doc, .msg-att-img'));
    expect(cards.map((card) => (card.classList.contains('msg-att-img') ? 'img' : 'doc'))).toEqual(['doc', 'img']);
    expect(cards[0]!.textContent).toContain('brief');
    expect(cards[0]!.textContent).toContain('.txt');
    expect(cards[1]!.querySelector('img')?.getAttribute('src')).toBe('blob:preview-1');
    // Nothing has been uploaded, so no card can open a file.
    const buttons = Array.from(row.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.every((button) => button.disabled)).toBe(true);
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

    const src = screen.getByTestId('user-attachment-row').querySelector('img')?.getAttribute('src');
    expect(src).toBeTruthy();
    expect(createdUrls).toContain(src);
    expect(revokedUrls).not.toContain(src);
    // Whatever the simulated unmount revoked was one of ours, never the live one.
    expect(revokedUrls.every((url) => createdUrls.includes(url))).toBe(true);
  });

  it('renders the real chat pane, inert as a whole', () => {
    renderPending();

    const pane = screen.getByTestId('project-creation-pending-chat');
    // React 18 drops the boolean `inert` prop, so ChatPane sets the attribute
    // on the node itself; the assertion is on the DOM, not on props.
    expect(pane.hasAttribute('inert')).toBe(true);
    expect(pane.classList.contains('pane')).toBe(true);
    // The pane is the slot's direct child: the card material is keyed on
    // `.split-chat-slot > .pane`, so a wrapper would strip it.
    expect(pane.parentElement?.classList.contains('split-chat-slot')).toBe(true);
    // jsdom measures no geometry, so the composer stays in the pane's slot
    // here; in a browser it is portaled to a body-level layer that ChatPane
    // marks inert as well.
    expect(pane.querySelector('.chat-composer-slot textarea, .chat-composer-slot [contenteditable]')).toBeTruthy();
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
