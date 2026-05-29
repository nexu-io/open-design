// @vitest-environment jsdom
// PluginShareMenu — plugin actions affordance contract.
//
// Locks the popover behaviour users expect from a plugin-specific
// actions button on a detail modal: copy install command / plugin id /
// README badge land on the clipboard, and the popover surfaces source +
// homepage links when the manifest carries them.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { InstalledPluginRecord } from '@open-design/contracts';

import {
  buildPluginShareUrl,
  PluginShareMenu,
} from '../../src/components/plugin-details/PluginShareMenu';
import { I18nProvider, type Locale } from '../../src/i18n';

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

  function renderMenu(record: InstalledPluginRecord, locale?: Locale) {
    act(() => {
      root.render(
        locale ? (
          <I18nProvider initial={locale}>
            <PluginShareMenu record={record} />
          </I18nProvider>
        ) : (
          <PluginShareMenu record={record} />
        ),
      );
    });
  }

  function openPopover(expectedTriggerText = 'More') {
    const trigger = container.querySelector(
      '.plugin-share-trigger',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain(expectedTriggerText);
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

  it('does not duplicate the template share link action', () => {
    renderMenu(make({ id: 'live-dashboard' }));
    openPopover();
    const labels = Array.from(
      container.querySelectorAll('.plugin-share-item'),
    ).map((item) => item.textContent ?? '');
    expect(labels.some((label) => label.includes('Copy share link'))).toBe(false);
  });

  it('copies the bare plugin id for paste-into-yaml workflows', async () => {
    renderMenu(make({ id: 'agentic-ds' }));
    openPopover();
    clickItem('Copy plugin ID');
    await Promise.resolve();
    expect(writes).toContain('agentic-ds');
  });

  it('copies a README badge that links back to the marketplace detail page', async () => {
    renderMenu(make({
      id: 'badge-plugin',
      title: 'Badge Plugin',
      marketplaceId: 'official',
      marketplaceEntryName: 'open-design/badge-plugin',
    }));
    openPopover();
    clickItem('Copy README badge');
    await Promise.resolve();
    expect(writes.some((value) => (
      value.includes('Badge Plugin') &&
      value.includes('https://open-design.ai/plugins/badge-plugin')
    ))).toBe(true);
  });

  it('does not expose public share artifacts for local-only plugins', () => {
    const localOnly = make({
      id: 'local-plugin',
      sourceKind: 'local',
      source: '/tmp/local-plugin',
    });
    expect(buildPluginShareUrl(localOnly)).toBeNull();

    renderMenu(localOnly);
    openPopover();
    const labels = Array.from(
      container.querySelectorAll('.plugin-share-item'),
    ).map((item) => item.textContent ?? '');
    expect(labels.some((label) => label.includes('Copy README badge'))).toBe(false);
  });

  it('does not expose public share artifacts for private marketplace plugins', () => {
    const privateMarketplace = make({
      id: 'private-plugin',
      sourceKind: 'marketplace',
      source: 'private/private-plugin',
      marketplaceId: 'private',
      marketplaceEntryName: 'private/private-plugin',
    });
    expect(buildPluginShareUrl(privateMarketplace)).toBeNull();

    renderMenu(privateMarketplace);
    openPopover();
    const labels = Array.from(
      container.querySelectorAll('.plugin-share-item'),
    ).map((item) => item.textContent ?? '');
    expect(labels.some((label) => label.includes('Copy README badge'))).toBe(false);
  });

  it('localizes the plugin action menu labels', () => {
    renderMenu(
      make({
        id: 'zh-plugin',
        sourceKind: 'github',
        source: 'github:owner/repo',
        marketplaceId: 'official',
        marketplaceEntryName: 'open-design/zh-plugin',
        homepage: 'https://example.test/plugin-home',
      }),
      'zh-CN',
    );
    openPopover('更多');
    const labels = Array.from(
      container.querySelectorAll('.plugin-share-item'),
    ).map((item) => item.textContent ?? '');
    expect(labels).toContain('复制安装命令');
    expect(labels).toContain('复制插件 ID');
    expect(labels).toContain('复制 README 徽章');
    expect(labels).toContain('在 GitHub 打开源码');
    expect(labels).toContain('打开项目主页');
    expect(labels).toContain('在插件市场打开');
    expect(labels.some((label) => label.includes('Copy install command'))).toBe(false);
  });

  it('points Open in marketplace at the public open-design.ai page for bundled plugins', () => {
    renderMenu(make({ id: 'plain' }));
    openPopover();
    const items = Array.from(
      container.querySelectorAll('.plugin-share-item'),
    ) as HTMLButtonElement[];
    expect(items.some((b) => b.textContent?.includes('Open in marketplace'))).toBe(
      true,
    );
    const marketplaceLink = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a.plugin-share-item'),
    ).find((link) => link.textContent?.includes('Open in marketplace'));
    // Bundled plugins have a public detail page, so the link is the public
    // open-design.ai URL — not a local /marketplace path.
    expect(marketplaceLink?.getAttribute('href')).toBe(
      'https://open-design.ai/plugins/plain/',
    );
  });

  it('builds a public open-design.ai share link for bundled plugins', () => {
    expect(buildPluginShareUrl(make({ id: 'simple-deck' }))).toBe(
      'https://open-design.ai/plugins/simple-deck/',
    );
  });

  it('builds a public open-design.ai share link for community marketplace plugins', () => {
    // Community manifest names carry a `community-` prefix, but the landing
    // page routes are keyed on the folder name via routeId=`community/<folder>`.
    // buildPluginShareUrl must use sourceMarketplaceEntryName so pluginDetailSlug
    // takes the last segment and matches the generated page slug.
    expect(
      buildPluginShareUrl(
        make({
          id: 'community-registry-starter',
          sourceKind: 'marketplace',
          source: 'community/registry-starter',
          marketplaceId: 'community',
          marketplaceEntryName: 'community/registry-starter',
        }),
      ),
    ).toBe('https://open-design.ai/plugins/registry-starter/');
  });

  it('copies a README badge for community marketplace plugins', async () => {
    renderMenu(
      make({
        id: 'community-registry-starter',
        title: 'Community Registry Starter',
        sourceKind: 'marketplace',
        source: 'community/registry-starter',
        marketplaceId: 'community',
        marketplaceEntryName: 'community/registry-starter',
      }),
    );
    openPopover();
    clickItem('Copy README badge');
    await Promise.resolve();
    expect(
      writes.some(
        (value) =>
          value.includes('Community Registry Starter') &&
          value.includes('https://open-design.ai/plugins/registry-starter/'),
      ),
    ).toBe(true);
  });

  it('points Open in marketplace at the public page for community marketplace plugins', () => {
    renderMenu(
      make({
        id: 'community-registry-starter',
        sourceKind: 'marketplace',
        source: 'community/registry-starter',
        marketplaceId: 'community',
        marketplaceEntryName: 'community/registry-starter',
      }),
    );
    openPopover();
    const marketplaceLink = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a.plugin-share-item'),
    ).find((link) => link.textContent?.includes('Open in marketplace'));
    expect(marketplaceLink?.getAttribute('href')).toBe(
      'https://open-design.ai/plugins/registry-starter/',
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
