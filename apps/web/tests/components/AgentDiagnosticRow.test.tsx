// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentDiagnosticRow } from '../../src/components/AgentDiagnosticRow';
import type { AgentDiagnostic } from '../../src/types';
import { en } from '../../src/i18n/locales/en';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const notOnPath: AgentDiagnostic = {
  reason: 'not-on-path',
  severity: 'error',
  message: 'Gemini (`gemini`) was not found on your PATH.',
  searchedDirs: ['/usr/bin', '/opt/homebrew/bin'],
  fixActions: [{ kind: 'openInstall' }, { kind: 'rescan' }],
};

describe('AgentDiagnosticRow', () => {
  it('renders the daemon message and tags the reason', () => {
    render(<AgentDiagnosticRow diagnostic={notOnPath} />);
    const group = screen.getByRole('group');
    expect(group.getAttribute('data-reason')).toBe('not-on-path');
    expect(screen.getByText(notOnPath.message)).toBeTruthy();
  });

  it('exposes searched dirs via the message tooltip', () => {
    render(<AgentDiagnosticRow diagnostic={notOnPath} />);
    const title = screen.getByText(notOnPath.message).getAttribute('title') ?? '';
    expect(title).toContain('/usr/bin');
    expect(title).toContain('/opt/homebrew/bin');
  });

  it('only renders buttons for intents that have a wired handler', () => {
    const onRescan = vi.fn();
    // openInstall is in the diagnostic but no onOpenInstall handler is given,
    // so only Rescan should render. Actions are icon-only buttons whose
    // accessible name comes from the (tooltip) aria-label.
    render(<AgentDiagnosticRow diagnostic={notOnPath} handlers={{ onRescan }} />);
    expect(
      screen.queryByRole('button', { name: en['settings.agentInstall.install'] }),
    ).toBeNull();
    const rescan = screen.getByRole('button', { name: en['settings.rescan'] });
    fireEvent.click(rescan);
    expect(onRescan).toHaveBeenCalledTimes(1);
  });

});
