// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OdCardRuleProposal, OdCardBrandBrowserAssist } from '@open-design/contracts';
import { OdCardView } from '../../src/components/OdCard';
import { I18nProvider } from '../../src/i18n';

const ASSIST_CARD: OdCardBrandBrowserAssist = {
  kind: 'brand-browser-assist',
  brandId: 'brand-123',
  browserTabId: '__browser__:1',
  url: 'https://acme.test/',
  reason: 'Cloudflare',
};

function renderAssistCard(
  onConfirm: (
    card: OdCardBrandBrowserAssist,
  ) => Promise<{ ok: boolean; action?: 'opened' | 'confirmed'; message?: string }>,
) {
  return render(
    <I18nProvider initial="en">
      <OdCardView card={ASSIST_CARD} onBrandBrowserAssistConfirm={onConfirm} />
    </I18nProvider>,
  );
}

const RULE_CARD: OdCardRuleProposal = {
  kind: 'rule-proposal',
  name: 'Palette only',
  description: 'Only use the brand palette.',
  assertion: 'Every CSS color must match a brand token.',
  check: 'Scan CSS color literals.',
  rationale: 'The user corrected off-palette colors.',
};

function renderRuleCard(card: OdCardRuleProposal = RULE_CARD, instanceScope = 'scope-a') {
  return render(
    <I18nProvider initial="en">
      <OdCardView card={card} instanceScope={instanceScope} />
    </I18nProvider>,
  );
}

function memoryListResponse(entries: Array<{ id: string; name: string; type: string }> = []) {
  return new Response(JSON.stringify({ entries }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function savedRuleResponse(id = 'rule_palette_only') {
  return new Response(JSON.stringify({
    entry: {
      id,
      name: 'Palette only',
      description: 'Only use the brand palette.',
      type: 'rule',
      body: 'Assertion: Every CSS color must match a brand token.',
      updatedAt: 1,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function memoryFailureResponse() {
  return new Response(JSON.stringify({ error: 'memory list failed' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('OdCard brand browser assist', () => {
  it('marks browser assist done only when the confirm handler succeeds', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true });

    renderAssistCard(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Open browser assist' }));

    await waitFor(() => {
      expect(screen.getByText('Browser opened')).toBeTruthy();
    });
    expect(onConfirm).toHaveBeenCalledWith(ASSIST_CARD);
    expect(screen.getByRole('button', { name: 'Open browser assist' })).toBeTruthy();
    expect(window.localStorage.getItem('od:brand-browser-assist-decision:brand-123')).toBe('done');
  });

  it('marks browser assist done when the handler opens or focuses the browser tab', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: true, action: 'opened' });

    renderAssistCard(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Open browser assist' }));

    await waitFor(() => {
      expect(screen.getByText('Browser opened')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Open browser assist' })).toBeTruthy();
    expect(screen.getByText(/Open Browser and clear any human check/)).toBeTruthy();
    expect(window.localStorage.getItem('od:brand-browser-assist-decision:brand-123')).toBe('done');
  });

  it('keeps browser assist available after a saved opened state remounts', () => {
    window.localStorage.setItem('od:brand-browser-assist-decision:brand-123', 'done');

    renderAssistCard(vi.fn().mockResolvedValue({ ok: true }));

    expect(screen.getByText('Browser opened')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open browser assist' })).toBeTruthy();
  });

  it('keeps browser assist retryable when the confirm handler reports failure', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: false, message: 'Open this in the desktop app.' });

    renderAssistCard(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Open browser assist' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('desktop app');
    });
    expect(screen.getByRole('button', { name: 'Open browser assist' })).toBeTruthy();
    expect(screen.queryByText('Browser opened')).toBeNull();
  });
});

describe('OdCard rule proposal decisions', () => {
  it('keeps the saved state after the card remounts', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/memory' && init?.method === 'POST') return Promise.resolve(savedRuleResponse());
      if (url === '/api/memory') {
        return Promise.resolve(memoryListResponse([
          { id: 'rule_palette_only', name: 'Palette only', type: 'rule' },
        ]));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }));

    const first = renderRuleCard();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

    await waitFor(() => {
      expect(screen.getByText('Saved “Palette only” as a rule')).toBeTruthy();
    });
    first.unmount();

    renderRuleCard();

    expect(screen.getByText('Saved “Palette only” as a rule')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
  });

  it('reverts stale saved decisions when the memory entry is absent', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/memory' && init?.method === 'POST') return Promise.resolve(savedRuleResponse());
      if (url === '/api/memory') return Promise.resolve(memoryListResponse([]));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = renderRuleCard();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

    await waitFor(() => {
      expect(screen.getByText('Saved “Palette only” as a rule')).toBeTruthy();
    });
    first.unmount();

    renderRuleCard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
    });
    expect(screen.getByText('Palette only')).toBeTruthy();
    expect(screen.queryByText('Saved “Palette only” as a rule')).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('keeps saved decisions when memory validation fails', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/memory' && init?.method === 'POST') return Promise.resolve(savedRuleResponse());
      if (url === '/api/memory') return Promise.resolve(memoryFailureResponse());
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = renderRuleCard();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));

    await waitFor(() => {
      expect(screen.getByText('Saved “Palette only” as a rule')).toBeTruthy();
    });
    first.unmount();

    renderRuleCard();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/memory');
    });
    expect(screen.getByText('Saved “Palette only” as a rule')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
    expect(window.localStorage.length).toBe(1);
  });

  it('keeps the discarded state after the card remounts', () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/memory') return Promise.resolve(memoryListResponse([]));
      return Promise.resolve(new Response(null, { status: 404 }));
    }));

    const first = renderRuleCard();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.queryByText('Palette only')).toBeNull();
    first.unmount();

    renderRuleCard();

    expect(screen.queryByText('Palette only')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
  });

  it('keeps discarded decisions when memory validation fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(memoryFailureResponse());
    vi.stubGlobal('fetch', fetchMock);

    const first = renderRuleCard();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.queryByText('Palette only')).toBeNull();
    first.unmount();

    renderRuleCard();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/memory');
    });
    expect(screen.queryByText('Palette only')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
    expect(window.localStorage.length).toBe(1);
  });

  it('does not reuse discarded decisions across scoped card instances', () => {
    const first = renderRuleCard(RULE_CARD, 'project-a:conversation-a:message-a:card-a');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.queryByText('Palette only')).toBeNull();
    first.unmount();

    renderRuleCard(RULE_CARD, 'project-b:conversation-b:message-b:card-a');

    expect(screen.getByText('Palette only')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
  });
});
