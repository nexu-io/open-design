// @vitest-environment node


import { expect } from 'vitest';

import { createDesktopHarness,STORAGE_KEY } from '../../../lib/desktop/desktop-test-helpers.ts';



export type DesktopHarness = ReturnType<typeof createDesktopHarness>;

export type DesktopSettingsSnapshot = {
  baseUrl: string | null;
  dialogOpen: boolean;
  heading: string | null;
  model: string | null;
  quickFillProvider: string | null;
  selectedProtocol: string | null;
};

export type DesktopLocalCliSnapshot = {
  codexExecutablePath: string | null;
  codexHome: string | null;
  dialogOpen: boolean;
  heading: string | null;
  localCliTabSelected: boolean;
  selectedAgent: string | null;
};

export type DesktopAppearanceSnapshot = {
  dialogOpen: boolean;
  documentAccent: string | null;
  documentTheme: string | null;
  savedAccent: string | null;
  savedTheme: string | null;
};

export type DesktopConnectorsSnapshot = {
  apiKeyLabelVisible: boolean;
  dialogOpen: boolean;
  drawerTitle: string | null;
  drawerVisible: boolean;
  gateVisible: boolean;
  gridVisible: boolean;
  heading: string | null;
  sectionTitle: string | null;
};

export type DesktopMediaSnapshot = {
  dialogOpen: boolean;
  heading: string | null;
  providerCardCount: number;
  reloadVisible: boolean;
  sectionTitle: string | null;
};

export type DesktopAboutSnapshot = {
  aboutListVisible: boolean;
  dialogOpen: boolean;
  heading: string | null;
  sectionTitle: string | null;
  versionUnavailableVisible: boolean;
};

export type DesktopAppearanceSectionSnapshot = {
  accentSwatchesVisible: boolean;
  defaultAccentVisible: boolean;
  dialogOpen: boolean;
  heading: string | null;
  sectionTitle: string | null;
  /** #5517 removed it; kept as a negative assertion so it cannot creep back. */
  themeSegControlVisible: boolean;
};

export type DesktopArtifactOpenSnapshot = {
  artifactPreviewVisible: boolean;
  fileWorkspaceVisible: boolean;
  openHref: string | null;
  openRel: string | null;
  openTarget: string | null;
  selectedTab: string | null;
};

export async function seedDesktopConfig(
  desktop: DesktopHarness,
  config: Record<string, unknown>,
  stableField: string,
): Promise<void> {
  await desktop.seedConfigAndReload(config, stableField);
}

export async function openDesktopSettingsSection(
  desktop: DesktopHarness,
  label: string,
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const section = Array.from(document.querySelectorAll('[role="dialog"] button'))
        .find((node) => node.textContent?.includes(${JSON.stringify(label)}));
      if (!(section instanceof HTMLElement)) return false;
      section.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

export async function clickDesktopProtocolTab(
  desktop: DesktopHarness,
  label: 'Anthropic' | 'OpenAI',
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const protocolTabs = Array.from(document.querySelectorAll('[role="tablist"]'))
        .find((node) => node.getAttribute('aria-label') === 'API protocol');
      const tab = Array.from(protocolTabs?.querySelectorAll('[role="tab"]') ?? [])
        .find((node) => node.textContent?.trim() === ${JSON.stringify(label)});
      if (!(tab instanceof HTMLElement)) return false;
      tab.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

export async function clickDesktopExecutionModeTab(
  desktop: DesktopHarness,
  label: 'BYOK' | 'Local CLI',
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const modeTabs = Array.from(document.querySelectorAll('[role="tablist"]'))
        .find((node) => {
          const labels = Array.from(node.querySelectorAll('[role="tab"]'))
            .map((tab) => tab.textContent?.trim() ?? '');
          return labels.some((text) => text.startsWith('BYOK')) &&
            labels.some((text) => text.startsWith('Local CLI'));
        });
      const tab = Array.from(modeTabs?.querySelectorAll('[role="tab"]') ?? [])
        .find((node) => node.textContent?.trim().startsWith(${JSON.stringify(label)}));
      if (!(tab instanceof HTMLElement)) return false;
      tab.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

/**
 * Click an accent swatch in the Settings › Appearance section.
 *
 * Replaces the old `clickDesktopSegmentButton` theme helper: the
 * 系统/浅色/深色 segmented control is gone (#5517 hid it, and the theme setting
 * was removed outright because the app ships light-only), leaving the accent
 * swatches as the only appearance control Settings still owns. Swatches carry
 * the hex as their aria-label (the default swatch is "Default accent color").
 */
export async function clickDesktopAccentSwatch(
  desktop: DesktopHarness,
  label: string,
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const swatch = document.querySelector(
        '[role="dialog"] .pet-swatches [role="radio"][aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']',
      );
      if (!(swatch instanceof HTMLElement)) return false;
      swatch.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

export async function clickDesktopSettingsFooterButton(
  desktop: DesktopHarness,
  className: 'ghost' | 'primary',
): Promise<void> {
  const clicked = await desktop.eval<boolean>(`
    (() => {
      const footerButton = document.querySelector('.modal-foot button.${className}');
      if (!(footerButton instanceof HTMLElement)) return false;
      footerButton.click();
      return true;
    })()
  `);
  expect(clicked).toBe(true);
}

export async function readDesktopSettingsSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopSettingsSnapshot> {
  return await desktop.eval<DesktopSettingsSnapshot>(`
    (() => {
      const labelFields = Array.from(document.querySelectorAll('[role="dialog"] label.field'));
      const getField = (label) => {
        const field = labelFields.find((node) =>
          node.querySelector('.field-label')?.textContent?.trim() === label,
        );
        if (!field) return null;
        const control = field.querySelector('input, select, textarea');
        if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) {
          return null;
        }
        if (control instanceof HTMLSelectElement) {
          return control.selectedOptions.item(0)?.textContent?.trim() ?? control.value;
        }
        return control.value;
      };
      const activeProtocol = Array.from(document.querySelectorAll('[role="tablist"][aria-label="API protocol"] [role="tab"]'))
        .find((node) => node.getAttribute('aria-selected') === 'true');
      const protocolText = activeProtocol?.textContent?.trim() ?? null;

      return {
        baseUrl: getField('Base URL'),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        model: getField('Model'),
        quickFillProvider: getField('Quick fill provider'),
        selectedProtocol: protocolText === 'OpenAI' || protocolText === 'Anthropic'
          ? protocolText + ' API'
          : protocolText,
      };
    })()
  `);
}

export async function readDesktopAppearanceSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopAppearanceSnapshot> {
  return await desktop.eval<DesktopAppearanceSnapshot>(`
    (() => {
      const raw = window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
      const config = raw ? JSON.parse(raw) : {};
      return {
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        documentAccent: document.documentElement.style.getPropertyValue('--accent').trim() || null,
        documentTheme: document.documentElement.getAttribute('data-theme'),
        savedAccent: typeof config.accentColor === 'string' ? config.accentColor : null,
        savedTheme: typeof config.theme === 'string' ? config.theme : null,
      };
    })()
  `);
}

export async function readDesktopConnectorsSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopConnectorsSnapshot> {
  return await desktop.eval<DesktopConnectorsSnapshot>(`
    (() => {
      const fieldLabels = Array.from(document.querySelectorAll('[role="dialog"] .field-label'))
        .map((node) => node.textContent?.trim() ?? '');
      const sectionTitle = document.querySelector('.settings-section-connectors .section-head h3')
        ?.textContent?.trim() ?? null;
      const drawerTitle = document.querySelector('[data-testid="connector-drawer"] h2')
        ?.textContent?.trim() ?? null;
      return {
        apiKeyLabelVisible: fieldLabels.includes('Composio API Key'),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        drawerTitle,
        drawerVisible: Boolean(document.querySelector('[data-testid="connector-drawer"]')),
        gateVisible: Boolean(document.querySelector('[data-testid="connector-gate"]')),
        gridVisible: Boolean(document.querySelector('[data-testid="connector-grid-wrap"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        sectionTitle,
      };
    })()
  `);
}

export async function readDesktopMediaSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopMediaSnapshot> {
  return await desktop.eval<DesktopMediaSnapshot>(`
    (() => {
      const sectionTitle = document.querySelector('.settings-section .section-head h3')
        ?.textContent?.trim() ?? null;
      return {
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        providerCardCount: document.querySelectorAll('.settings-provider-card').length,
        reloadVisible: Boolean(Array.from(document.querySelectorAll('button'))
          .find((node) => node.textContent?.trim() === 'Reload from daemon')),
        sectionTitle,
      };
    })()
  `);
}

export async function readDesktopAboutSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopAboutSnapshot> {
  return await desktop.eval<DesktopAboutSnapshot>(`
    (() => {
      const sectionTitle = document.querySelector('.settings-section .section-head h3')
        ?.textContent?.trim() ?? null;
      const emptyCards = Array.from(document.querySelectorAll('.settings-section .empty-card'))
        .map((node) => node.textContent?.trim() ?? '');
      return {
        aboutListVisible: Boolean(document.querySelector('.settings-about-list')),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        sectionTitle,
        versionUnavailableVisible: emptyCards.includes('Version details are unavailable while the daemon is offline.'),
      };
    })()
  `);
}

export async function readDesktopAppearanceSectionSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopAppearanceSectionSnapshot> {
  return await desktop.eval<DesktopAppearanceSectionSnapshot>(`
    (() => {
      const sectionTitle = document.querySelector('.settings-section .section-head h3')
        ?.textContent?.trim() ?? null;
      const accentGroup = document.querySelector('.settings-section .pet-swatches[role="radiogroup"]');
      const accentSwatches = accentGroup
        ? Array.from(accentGroup.querySelectorAll('[role="radio"]'))
        : [];
      return {
        accentSwatchesVisible: accentSwatches.length > 0,
        defaultAccentVisible: accentSwatches.some(
          (node) => node.getAttribute('aria-label') === 'Default accent color',
        ),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        sectionTitle,
        // Scoped by aria-label: the Notifications controls in the same dialog
        // are seg-controls too, and they are not what #5517 removed.
        themeSegControlVisible: Boolean(
          document.querySelector('.seg-control[aria-label="Appearance"]'),
        ),
      };
    })()
  `);
}

export async function readDesktopArtifactOpenSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopArtifactOpenSnapshot> {
  return await desktop.eval<DesktopArtifactOpenSnapshot>(`
    (() => {
      const openLink = Array.from(document.querySelectorAll('a'))
        .find((node) => node.textContent?.trim() === 'Open');
      const activeTab = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]'))
        .map((node) => node.textContent?.trim())
        .find((value) => typeof value === 'string') ?? null;
      return {
        artifactPreviewVisible: Boolean(document.querySelector('[data-testid="artifact-preview-frame"]')),
        fileWorkspaceVisible: Boolean(document.querySelector('[data-testid="file-workspace"]')),
        openHref: openLink?.getAttribute('href') ?? null,
        openRel: openLink?.getAttribute('rel') ?? null,
        openTarget: openLink?.getAttribute('target') ?? null,
        selectedTab: activeTab,
      };
    })()
  `);
}

export async function readDesktopLocalCliSnapshot(
  desktop: DesktopHarness,
): Promise<DesktopLocalCliSnapshot> {
  return await desktop.eval<DesktopLocalCliSnapshot>(`
    (() => {
      const labelFields = Array.from(document.querySelectorAll('[role="dialog"] label.field'));
      const getField = (label) => {
        const field = labelFields.find((node) =>
          node.querySelector('.field-label')?.textContent?.trim() === label,
        );
        if (!field) return null;
        const control = field.querySelector('input');
        return control instanceof HTMLInputElement ? control.value : null;
      };
      const localCliTab = Array.from(document.querySelectorAll('[role="tab"]'))
        .find((node) => node.textContent?.trim().startsWith('Local CLI'));
      const selectedAgent = Array.from(document.querySelectorAll('.agent-card.active .agent-card-name'))
        .map((node) => node.textContent?.trim())
        .find((value) => typeof value === 'string') ?? null;

      return {
        codexExecutablePath: getField('Codex executable path'),
        codexHome: getField('Codex home'),
        dialogOpen: Boolean(document.querySelector('[role="dialog"]')),
        heading: document.querySelector('[role="dialog"] h2')?.textContent?.trim() ?? null,
        localCliTabSelected: localCliTab?.getAttribute('aria-selected') === 'true',
        selectedAgent,
      };
    })()
  `);
}
