// @vitest-environment jsdom

// `HandoffButton` now mounts in the artifact viewer chrome on every artifact,
// so it is on the crash path for the whole viewer. `fetchHostEditors` casts the
// raw `/api/editors` JSON straight to `HostEditorsResponse` without validating
// it, which means an off-contract host reply reaches the render path as-is: a
// non-array `editors` (or entries that are null / missing `id` / missing
// `label`) would throw inside `editors.filter(...)` or render half-formed rows.
//
// The invariant these lock in: whatever `/api/editors` answers, the component
// reduces it to a renderable list — array-shaped, every entry carrying a
// non-empty `id` and `label` and a real boolean `available` — and falls back to
// the OS file-manager control instead of crashing the viewer.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HandoffButton } from '../../src/components/HandoffButton';
import { I18nProvider } from '../../src/i18n';
import type { HostEditorsResponse } from '@open-design/contracts';

const fetchHostEditors = vi.fn<() => Promise<HostEditorsResponse>>();
const openProjectInEditor = vi.fn();
const copyToClipboard = vi.fn();

vi.mock('../../src/providers/registry', () => ({
  fetchHostEditors: () => fetchHostEditors(),
  openProjectInEditor: (...args: unknown[]) => openProjectInEditor(...args),
}));

vi.mock('../../src/lib/copy-to-clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => copyToClipboard(...args),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  fetchHostEditors.mockReset();
  openProjectInEditor.mockReset();
  copyToClipboard.mockReset();
});

// The point of these cases is payloads the contract type forbids, so each one
// is cast in at the mock boundary exactly the way `fetchHostEditors` casts the
// real `/api/editors` body.
function mockRawEditorsResponse(body: unknown) {
  fetchHostEditors.mockResolvedValue(body as HostEditorsResponse);
}

function renderHandoff() {
  render(
    <I18nProvider initial="en">
      <HandoffButton projectId="p1" projectDir="/tmp/p1" />
    </I18nProvider>,
  );
}

describe('HandoffButton /api/editors response hardening', () => {
  it('treats a non-array `editors` as no editors instead of crashing the viewer', async () => {
    mockRawEditorsResponse({ platform: 'darwin', editors: {} });

    renderHandoff();

    // The zero-editor fallback control, not a thrown render.
    expect(await screen.findByText('Finder')).toBeTruthy();
  });

  it('survives a response body that is not an object at all', async () => {
    mockRawEditorsResponse(null);

    renderHandoff();

    expect(await screen.findByText('Finder')).toBeTruthy();
  });

  it('drops malformed entries and keeps the well-formed ones', async () => {
    mockRawEditorsResponse({
      platform: 'darwin',
      editors: [
        null,
        'cursor',
        { label: 'No Id', available: true },
        { id: '', label: 'Empty Id', available: true },
        { id: 'zed', available: true },
        { id: 'vscode', label: 'VS Code', available: true },
        // A duplicate id would collide as a React key and as a `data-testid`.
        { id: 'vscode', label: 'VS Code (again)', available: true },
      ],
    });

    renderHandoff();

    // The one well-formed entry becomes the primary target...
    const trigger = await screen.findByTestId('handoff-trigger');
    expect(trigger.getAttribute('title')).toContain('VS Code');

    // ...and nothing else made it into the list.
    expect(screen.queryByText('No Id')).toBeNull();
    expect(screen.queryByText('Empty Id')).toBeNull();
    expect(screen.queryByText('VS Code (again)')).toBeNull();
    expect(screen.queryByTestId('handoff-menu-item-zed')).toBeNull();
  });

  it('treats a non-boolean `available` as not-detected rather than launchable', async () => {
    mockRawEditorsResponse({
      platform: 'darwin',
      editors: [{ id: 'cursor', label: 'Cursor', available: 'yes' }],
    });

    renderHandoff();

    // No entry counts as available, so the file-manager fallback owns the
    // surface and a truthy-but-wrong flag never becomes a launch target.
    expect(await screen.findByText('Finder')).toBeTruthy();
    expect(screen.queryByTestId('handoff-trigger')).toBeNull();
    expect(screen.queryByText('Cursor')).toBeNull();
  });

  it('falls back to the darwin-style control when `platform` is off-contract', async () => {
    mockRawEditorsResponse({ platform: 'MacOS', editors: [] });

    renderHandoff();

    // An unrecognized platform degrades to `unknown`, which shares the default
    // reveal target rather than leaking the raw string into the open-in call.
    expect(await screen.findByText('Finder')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Finder')).toBeTruthy());
  });
});
