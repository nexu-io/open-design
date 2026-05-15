// @vitest-environment jsdom
// PluginShareMenu — share affordance contract.
//
// Locks the share popover behaviour users expect from a "share
// this plugin" button on a detail modal: copy install command /
// plugin id / share link / markdown badge land on the clipboard,
// and the popover surfaces source + homepage links when the
// manifest carries them.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { InstalledPluginRecord } from '@open-design/contracts';

import { PluginShareMenu } from '../../src/components/plugin-details/PluginShareMenu';

interface MakeArgs {
  id: string;
  title?: string;
  source?: string;
  sourceKind?: InstalledPluginRecord['sourceKind'];
  marketplaceId?: string;
  marketplaceEntryName?: string;
  authorUrl?: string;
  homepage?: string;
}

function make(args: MakeArgs): InstalledPluginRecord {
  return {
    id: args.id,
    title: args.title ?? args.id,
    version: '0.1.0',
    sourceKind: args.sourceKind ?? 'bundled',
    source: args.source ?? `plugins/${args.id}`,
    sourceMarketplaceId: args.marketplaceId,
    sourceMarketplaceEntryName: args.marketplaceEntryName,
    trust: 'bundled',
    capabilitiesGranted: [],
    manifest: {
      name: args.id,
      version: '0.1.0',
      title: args.title ?? args.id,
      ...(args.authorUrl ? { author: { url: args.authorUrl } } : {}),
      ...(args.homepage ? { homepage: args.homepage } : {}),
      od: { kind: 'scenario' },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  };
}

describe('PluginShareMenu', () => {
  let container: HTMLDivElement;
  let root: Root;
  let writes: string[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    writes = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async (value: string) => {
          writes.push(value);
        }),
      },
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        origin: 'https://example.test',
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderMenu(record: InstalledPluginRecord) {
    act(() => {
      root.render(<PluginShareMenu record={record} />);
    });
  }

  function openPopover() {
    const trigger = container.querySelector(
      '.plugin-share-trigger',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    act(() => {
      trigger.click();
    });
  }

  function clickItem(label: string) {
    const items = Array.from(
      container.querySelectorAll('.plugin-share-item'),
    ) as HTMLButtonElement[];
    const match = items.find((b) => b.textContent?.includes(label));
    expect(match, `expected an item labelled "${label}"`).toBeTruthy();
    act(() => {
      match!.click();
    });
  }

  it('copies an install command for marketplace plugins using the registry entry name', async () => {
    renderMenu(
      make({
        id: 'mp-plugin',
        sourceKind: 'github',
        source: 'github:open-design/plugins/mp-plugin',
        marketplaceId: 'official',
        marketplaceEntryName: 'open-design/mp-plugin',
      }),
    );
    openPopover();
    clickItem('Copy install command');
    await Promise.resolve();
    expect(writes).toContain('od plugin install open-design/mp-plugin');
  });

  it('copies the github source string for github-installed plugins', async () => {
    renderMenu(
      make({
        id: 'gh-plugin',
        sourceKind: 'github',
        source: 'github:owner/repo@main/sub',
      }),
    );
    openPopover();
    clickItem('Copy install command');
    await Promise.resolve();
    expect(writes).toContain('od plugin install github:owner/repo@main/sub');
  });

  it('copies a fully qualified marketplace share link based on window.location.origin', async () => {
    renderMenu(make({ id: 'live-dashboard' }));
    openPopover();
    clickItem('Copy share link');
    await Promise.resolve();
    expect(writes).toContain('https://example.test/marketplace/live-dashboard');
  });

  it('copies the bare plugin id for paste-into-yaml workflows', async () => {
    renderMenu(make({ id: 'agentic-ds' }));
    openPopover();
    clickItem('Copy plugin ID');
    await Promise.resolve();
    expect(writes).toContain('agentic-ds');
  });

  it('exposes Open in marketplace as a navigable item even without external links', () => {
    renderMenu(make({ id: 'plain' }));
    openPopover();
    const items = Array.from(
      container.querySelectorAll('.plugin-share-item'),
    ) as HTMLButtonElement[];
    expect(items.some((b) => b.textContent?.includes('Open in marketplace'))).toBe(
      true,
    );
  });

  it('surfaces the GitHub source link when sourceKind is github', () => {
    renderMenu(
      make({
        id: 'gh-with-link',
        sourceKind: 'github',
        source: 'github:owner/repo',
      }),
    );
    openPopover();
    const items = Array.from(
      container.querySelectorAll('.plugin-share-item'),
    ) as HTMLElement[];
    expect(items.some((b) => b.textContent?.includes('Open source on GitHub'))).toBe(
      true,
    );
    const sourceLink = container.querySelector<HTMLAnchorElement>(
      'a.plugin-share-item[href="https://github.com/owner/repo"]',
    );
    expect(sourceLink).toBeTruthy();
  });

  it('surfaces the homepage link when manifest.homepage is set', () => {
    renderMenu(
      make({
        id: 'with-homepage',
        sourceKind: 'local',
        homepage: 'https://example.test/plugin-home',
      }),
    );
    openPopover();
    const items = Array.from(
      container.querySelectorAll('.plugin-share-item'),
    ) as HTMLElement[];
    expect(items.some((b) => b.textContent?.includes('Open homepage'))).toBe(
      true,
    );
    const homepageLink = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a.plugin-share-item'),
    ).find((link) => link.textContent?.includes('Open homepage'));
    expect(homepageLink).toBeTruthy();
    expect(homepageLink?.getAttribute('href')).toBe('https://example.test/plugin-home');
  });

  it('renders official bundled repo links as anchors', () => {
    renderMenu(
      make({
        id: 'official-plugin',
        sourceKind: 'bundled',
        source: 'plugins/_official/scenarios/official-plugin',
      }),
    );
    openPopover();
    const repoLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(
        'a.plugin-share-item[href="https://github.com/nexu-io/open-design"]',
      ),
    );
    expect(repoLinks.length).toBeGreaterThan(0);
    expect(
      repoLinks.some((link) => link.textContent?.includes('Open source on GitHub')),
    ).toBe(true);
  });
});
