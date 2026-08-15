/**
 * In-app destination drift gate.
 *
 * When the daemon or the agent tells a user to go fix something —
 * "no Fal API key — configure it in Settings → …" — it names a place in the
 * app. Nothing tied that name to the screen it points at, so it drifted: media
 * errors and the od-media-generation skill kept pointing at a section called
 * "Media" after the nav item had been renamed to "Media providers"
 * (`媒体生成提供商` in zh-CN), and users following the instruction found no such
 * entry. That was V0.19.1 acceptance bug recvre8FrTE2Oa.
 *
 * `packages/contracts/src/settings-nav.ts` is now the single place a
 * destination is spelled. This gate holds the two ends together:
 *
 *   1. Each constant names something the UI ACTUALLY RENDERS as navigation.
 *   2. No producer re-inlines its own guess.
 *   3. No referenced prompt or skill names a destination that does not exist.
 *
 * ## Why this reads the rendered navigation, not the i18n dictionary
 *
 * The first version of this gate compared each constant to its i18n key's
 * value. That is too weak, and PR review caught it: `settings.externalMcpTitle`
 * ("External MCP") is still in the dictionary, but `mcpClient` lost its Settings
 * sidebar nav item and external MCP moved to the top-level Integrations view.
 * So a dictionary-based check happily green-lit "Settings → External MCP" — a
 * destination no user can navigate to — and the gate meant to catch dead paths
 * would have spent the rest of its life defending one.
 *
 * A key surviving in the dictionary proves nothing about reachability. This
 * version therefore parses the actual rendered nav (`settings-nav-item` buttons
 * in `SettingsDialog.tsx`, `INTEGRATION_TABS` in `IntegrationsView.tsx`) and
 * resolves those keys through the dictionary — dictionary as a lookup, rendered
 * markup as the source of truth.
 *
 * Lives in `e2e/tests/` per the root `AGENTS.md` boundary rule — it reads
 * `apps/web`, `apps/daemon`, `packages/contracts`, and `plugins/` together,
 * which no single app package is allowed to do.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

type DestinationContracts = {
  SETTINGS_MEDIA_PROVIDERS: string;
  SETTINGS_MEDIA_PROVIDERS_PATH: string;
  INTEGRATIONS: string;
  INTEGRATIONS_MCP: string;
  INTEGRATIONS_MCP_PATH: string;
};

const navModules = import.meta.glob<DestinationContracts>(
  '../../packages/contracts/src/settings-nav.ts',
  { eager: true },
);
const nav = Object.values(navModules)[0];
if (!nav) {
  throw new Error(
    'destination gate could not load packages/contracts/src/settings-nav.ts via import.meta.glob; '
      + 'this almost always means the file was renamed or moved.',
  );
}

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function read(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

/** Resolve one `'key': 'value'` entry from the English locale dictionary. */
function englishLabel(key: string): string {
  const en = read('apps/web/src/i18n/locales/en.ts');
  const match = en.match(
    new RegExp(`^\\s*['"]${key.replace(/\./g, '\\.')}['"]\\s*:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`, 'm'),
  );
  if (!match) throw new Error(`i18n key ${key} is missing from apps/web/src/i18n/locales/en.ts`);
  return match[2]!.replace(/\\(['"\\])/g, '$1');
}

/**
 * The labels the Settings sidebar actually renders as nav items.
 *
 * Sections can keep a render block after losing their nav entry (the file's own
 * comment lists workspace / mcpClient / composio / designSystems as exactly
 * that), so presence of a section constant — or of its i18n key — is not
 * evidence a user can reach it. Only a `settings-nav-item` button is.
 */
function renderedSettingsNavLabels(): readonly string[] {
  const source = read('apps/web/src/components/SettingsDialog.tsx');
  const labels = [...source.matchAll(
    /settings-nav-item[\s\S]{0,400}?<strong>\{t\(\s*'([^']+)'\s*\)\}<\/strong>/g,
  )].map((m) => englishLabel(m[1]!));
  if (labels.length === 0) {
    throw new Error(
      'could not parse any settings-nav-item labels from SettingsDialog.tsx — '
        + 'the nav markup changed shape and this gate needs updating, not deleting.',
    );
  }
  return labels;
}

/**
 * The tab labels the top-level Integrations view actually renders.
 *
 * The id → i18n key mapping is irregular (`connectors` resolves to
 * `entry.tabConnectors`, not `integrations.tabLabel.connectors`), so this reads
 * the `integrationTabLabel` switch instead of assuming a key convention, and
 * keeps only ids that `INTEGRATION_TABS` actually lists.
 */
function renderedIntegrationsTabLabels(): readonly string[] {
  const source = read('apps/web/src/components/IntegrationsView.tsx');
  const tabsBlock = source.match(/const INTEGRATION_TABS[\s\S]*?\n\];/)?.[0];
  if (!tabsBlock) throw new Error('could not locate INTEGRATION_TABS in IntegrationsView.tsx');
  const listed = new Set([...tabsBlock.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]!));

  const labelBlock = source.match(/function integrationTabLabel[\s\S]*?\n\}/)?.[0];
  if (!labelBlock) throw new Error('could not locate integrationTabLabel in IntegrationsView.tsx');
  const labels = [...labelBlock.matchAll(/case\s*'([^']+)':\s*return\s*t\(\s*'([^']+)'\s*\)/g)]
    .filter((m) => listed.has(m[1]!))
    .map((m) => englishLabel(m[2]!));
  if (labels.length === 0) {
    throw new Error(
      'could not parse any Integrations tab labels — the view changed shape and '
        + 'this gate needs updating, not deleting.',
    );
  }
  return labels;
}

describe('destinations quoted to users', () => {
  it('names a Settings section the sidebar actually renders', () => {
    expect(renderedSettingsNavLabels()).toContain(nav.SETTINGS_MEDIA_PROVIDERS);
  });

  it('names an Integrations tab the view actually renders', () => {
    expect(renderedIntegrationsTabLabels()).toContain(nav.INTEGRATIONS_MCP);
    expect(englishLabel('entry.navIntegrations')).toBe(nav.INTEGRATIONS);
  });

  // Regression guard for the review finding on PR #6831. The first version of
  // this gate would have passed with "External MCP" as a Settings destination,
  // because `settings.externalMcpTitle` is still in the dictionary. If this
  // assertion ever fails it means either the label came back to the sidebar (fine
  // — delete this test) or the gate stopped reading rendered markup (not fine).
  it('rejects a label that survives in the dictionary but renders nowhere', () => {
    const stale = englishLabel('settings.externalMcpTitle');
    expect(stale).toBe('External MCP');
    expect(renderedSettingsNavLabels()).not.toContain(stale);
  });

  it('writes a destination as "<Area> → <Section>"', () => {
    expect(nav.SETTINGS_MEDIA_PROVIDERS_PATH).toBe(`Settings → ${nav.SETTINGS_MEDIA_PROVIDERS}`);
    expect(nav.INTEGRATIONS_MCP_PATH).toBe(`${nav.INTEGRATIONS} → ${nav.INTEGRATIONS_MCP}`);
  });

  it('never sends a media-credential error to a bare, unnamed "Settings"', () => {
    const source = read('apps/daemon/src/media/index.ts');
    const offenders = source
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      // Only lines that actually instruct the user, not prose comments.
      .filter(([, line]) => /configure[^\n]*\bin Settings\b|key in Settings\b/.test(line))
      .filter(([, line]) => !line.trimStart().startsWith('//'));
    expect(offenders).toEqual([]);
  });

  it('routes every media-credential error through the shared destination', () => {
    const source = read('apps/daemon/src/media/index.ts');
    // Sanity: the file really does still carry these errors, so an accidental
    // deletion cannot make the gate above vacuously pass.
    const routed = source.match(/\$\{SETTINGS_MEDIA_PROVIDERS_PATH\}/g) ?? [];
    expect(routed.length).toBeGreaterThanOrEqual(25);
  });

  it.each([
    'plugins/_official/scenarios/od-media-generation/SKILL.md',
    'apps/daemon/src/prompts/system.ts',
    'packages/contracts/src/prompts/system.ts',
    'skills/hatch-pet/SKILL.md',
    'plugins/_official/examples/hatch-pet/SKILL.md',
  ])('does not name a destination that does not exist: %s', (relative) => {
    // Markdown wraps mid-phrase, so compare against whitespace-normalized text
    // — otherwise "Settings → Media\n  providers" reads as a section named
    // "Media" and the gate reports a violation that isn't one.
    const text = read(relative).replace(/\s+/g, ' ');
    const known = [
      ...renderedSettingsNavLabels(),
      ...renderedIntegrationsTabLabels(),
      // Sub-sections folded into General keep their own heading inside it.
      'Pets',
    ];
    for (const match of text.matchAll(/(?:Settings|Integrations)\s*(?:→|->)\s*/g)) {
      const rest = text.slice(match.index! + match[0].length);
      // A template expression is the constant itself, already verified above.
      if (rest.startsWith('${')) continue;
      expect(
        known.some((section) => rest.startsWith(section)),
        `${relative} points at "…→ ${rest.slice(0, 40)}…", which the UI does not render. `
          + `Rendered destinations: ${known.join(', ')}.`,
      ).toBe(true);
    }
  });
});
