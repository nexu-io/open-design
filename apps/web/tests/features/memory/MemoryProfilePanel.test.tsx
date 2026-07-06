// @vitest-environment jsdom
//
// The profile panel owns its own transport (GET/PUT /api/memory/user_profile),
// so these mock `fetch` to drive every load branch (404 → empty, ok → hydrate,
// non-ok → leave empty, network throw → catch), the field edits, and the save
// round-trip (assembled `- <Label>: <value>` body + the transient saved pill).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryProfilePanel } from '../../../src/components/MemoryProfilePanel';
import { I18nProvider } from '../../../src/i18n';

const originalFetch = globalThis.fetch;

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => impl(String(url), init));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

function renderPanel(enabled = true) {
  return render(
    <I18nProvider initial="en">
      <MemoryProfilePanel enabled={enabled} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('MemoryProfilePanel', () => {
  it('leaves the form empty on a 404 and enables the fields', async () => {
    mockFetch(() => jsonResponse({}, 404));
    renderPanel();
    // Once loading resolves, the inputs are enabled (not disabled by `loading`).
    await waitFor(() => {
      expect(screen.getAllByRole('textbox')[0]!).not.toBeDisabled();
    });
  });

  it('hydrates known fields and skips non-matching / unknown lines', async () => {
    mockFetch(() =>
      jsonResponse({
        entry: {
          // A blank line + a non-`- k: v` line (skipped via `continue`) and an
          // unknown label (matched but not a known field) exercise those branches.
          body: 'preamble\n\n- Role: Designer\n- Unknown: ignored\n- Domain: Fintech',
        },
      }),
    );
    renderPanel();
    await waitFor(() => {
      expect(screen.getByDisplayValue('Designer')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('Fintech')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('ignored')).toBeNull();
  });

  it('leaves the form empty when the ok response has no entry', async () => {
    mockFetch(() => jsonResponse({}, 200));
    renderPanel();
    await waitFor(() => {
      expect(screen.getAllByRole('textbox')[0]!).not.toBeDisabled();
    });
    expect(screen.getAllByRole('textbox')[0]!).toHaveValue('');
  });

  it('leaves the form empty when the load response is not ok', async () => {
    const fetchFn = mockFetch(() => jsonResponse({}, 500));
    renderPanel();
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    // 500 is neither 404 nor ok → the panel returns early, values stay empty.
    expect(screen.queryByDisplayValue('Designer')).toBeNull();
  });

  it('swallows a network error during load without crashing', async () => {
    const fetchFn = mockFetch(() => {
      throw new Error('offline');
    });
    renderPanel();
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    // The catch leaves the panel mounted with an empty, enabled form.
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeInTheDocument();
  });

  it('saves an assembled body and shows the saved pill', async () => {
    const fetchFn = mockFetch((url, init) => {
      if (init?.method === 'PUT') return jsonResponse({}, 200);
      return jsonResponse({}, 404);
    });
    renderPanel();

    // Role is the first field; edit it so the assembled body is non-empty.
    await waitFor(() => expect(screen.getAllByRole('textbox')[0]!).not.toBeDisabled());
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'Founder' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => {
      const putCall = fetchFn.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
      expect(putCall).toBeTruthy();
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.body).toContain('- Role: Founder');
      expect(body.type).toBe('profile');
    });
    await waitFor(() => {
      expect(screen.getByText('Profile saved')).toBeInTheDocument();
    });
  });

  it('edits a multiline field and includes it in the saved body', async () => {
    const fetchFn = mockFetch((_url, init) =>
      init?.method === 'PUT' ? jsonResponse({}, 200) : jsonResponse({}, 404),
    );
    const { container } = renderPanel();
    // The multiline fields (Use cases / Aesthetic / Current goals) render as
    // <textarea>; edit the first one to cover its onChange handler.
    await waitFor(() => {
      const ta = container.querySelector('textarea');
      expect(ta).not.toBeNull();
      expect(ta).not.toBeDisabled();
    });
    fireEvent.change(container.querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: 'Design reviews' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => {
      const putCall = fetchFn.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
      const body = JSON.parse((putCall![1] as RequestInit).body as string);
      expect(body.body).toContain('- Use cases: Design reviews');
    });
  });

  it('does not show the saved pill when the save request fails', async () => {
    mockFetch((_url, init) => (init?.method === 'PUT' ? jsonResponse({}, 500) : jsonResponse({}, 404)));
    renderPanel();
    await waitFor(() => expect(screen.getAllByRole('textbox')[0]!).not.toBeDisabled());
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'Founder' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save profile' })).not.toBeDisabled());
    expect(screen.queryByText('Profile saved')).toBeNull();
  });

  it('auto-clears the saved pill after the timeout', async () => {
    vi.useFakeTimers();
    try {
      mockFetch((_url, init) => (init?.method === 'PUT' ? jsonResponse({}, 200) : jsonResponse({}, 404)));
      renderPanel();
      await act(async () => {}); // flush the load
      fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'Founder' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
      await act(async () => {}); // flush the save → saved pill shows
      expect(screen.getByText('Profile saved')).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(1800); // fire the auto-clear timeout
      });
      expect(screen.queryByText('Profile saved')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables save when the panel is not enabled', async () => {
    mockFetch(() => jsonResponse({}, 404));
    renderPanel(false);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    });
  });
});
