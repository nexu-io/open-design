// @vitest-environment jsdom
//
// Acceptance #156 — the settings page's left rail no longer carries a
// "Search settings..." box. Product removed it: eight nav entries do not
// need a filter, and the box kept reading as broken. The back-to-home
// affordance above the nav stays, and every section stays visible.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsDialog } from '../../src/components/SettingsDialog';
import { DEFAULT_CONFIG } from '../../src/state/config';
import type { AgentInfo } from '../../src/types';

const AGENTS: AgentInfo[] = [{ id: 'codex', name: 'Codex', bin: 'codex', available: true }];

function renderSettingsPage() {
  return render(
    <SettingsDialog
      presentation="page"
      initial={{ ...DEFAULT_CONFIG }}
      agents={AGENTS}
      daemonLive
      appVersionInfo={null}
      initialSection="general"
      onPersist={vi.fn()}
      onPersistComposioKey={vi.fn()}
      onClose={vi.fn()}
      onRefreshAgents={vi.fn()}
    />,
  );
}

describe('SettingsDialog settings-nav (search box removed)', () => {
  afterEach(cleanup);

  it('renders no search input in the sidebar', () => {
    const { container } = renderSettingsPage();

    expect(container.querySelector('.settings-page-search')).toBeNull();
    expect(container.querySelector('input[type="search"]')).toBeNull();
    expect(screen.queryByTestId('settings-nav-search-empty')).toBeNull();
  });

  it('keeps the back-to-home affordance and shows every nav section', () => {
    const { container } = renderSettingsPage();

    expect(container.querySelector('.settings-page-back')).not.toBeNull();

    // With the filter gone, no nav item may ship `hidden`.
    const navItems = Array.from(container.querySelectorAll('.settings-nav-item'));
    expect(navItems.length).toBeGreaterThan(0);
    for (const item of navItems) {
      expect(item.hasAttribute('hidden')).toBe(false);
    }
  });
});
