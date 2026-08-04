import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const PAGE = new URL('../app/pages/codex-plugin/index.astro', import.meta.url);
const LOCALIZED_PAGE = new URL(
  '../app/pages/[locale]/codex-plugin/index.astro',
  import.meta.url,
);
const OLD_PAGE = new URL('../app/pages/open-design-pugin/index.astro', import.meta.url);
const REDIRECTS = new URL('../public/_redirects', import.meta.url);
const HEADER = new URL('../app/_components/header.tsx', import.meta.url);
const FOOTER = new URL('../app/_components/site-footer.astro', import.meta.url);
const COPY = new URL('../app/open-design-plugin-i18n.ts', import.meta.url);
const LOCALE_DIR = new URL('../app/open-design-plugin-locales/', import.meta.url);

describe('Codex plugin landing route', () => {
  it('publishes the canonical route and all localized variants', async () => {
    await Promise.all([access(PAGE), access(LOCALIZED_PAGE)]);
    await assert.rejects(access(OLD_PAGE));
  });

  it('removes the misspelled legacy route and updates site navigation', async () => {
    const [redirects, header, footer] = await Promise.all([
      readFile(REDIRECTS, 'utf8'),
      readFile(HEADER, 'utf8'),
      readFile(FOOTER, 'utf8'),
    ]);

    assert.doesNotMatch(redirects, /open-design-pugin/);
    assert.match(header, /href\('\/codex-plugin\/\'\)/);
    assert.match(footer, /href\('\/codex-plugin\/\'\)/);
  });

  it('gives an agent a self-contained, verifiable install protocol', async () => {
    const page = await readFile(PAGE, 'utf8');

    assert.match(page, /https:\/\/open-design\.ai\/codex-plugin\//);
    assert.match(page, /data-agent-install-protocol="open-design-codex-v1"/);
    assert.match(page, /codex --version/);
    assert.match(page, /codex plugin marketplace list --json/);
    assert.match(
      page,
      /codex plugin marketplace add nexu-io\/open-design-agent-plugins --ref main --json/,
    );
    assert.match(page, /codex plugin add open-design@open-design --json/);
    assert.match(page, /release-manifest\.json/);
    assert.match(page, /command -v od/);
    assert.match(page, /open-design-cli:mcp-install:v1/);
    assert.match(page, /open-design-mcp-install:fallback-required/);
    assert.doesNotMatch(page, /const MCP_INSTALL_COMMAND = 'od mcp install codex'/);
    assert.match(page, /codex plugin list --json/);
    assert.match(page, /codex mcp get open-design --json/);
  });

  it('localizes the full protocol and keeps installation conditional', async () => {
    const locales = ['zh', 'ja', 'ko', 'de', 'fr', 'ru', 'es', 'pt-br', 'it', 'tr'] as const;
    const english = await readFile(COPY, 'utf8');

    assert.match(english, /canonical Git marketplace source/);
    assert.match(english, /Run the marketplace command only if/);
    assert.match(english, /version declared in release-manifest\.json/);
    assert.match(english, /ask the user for confirmation before updating or reinstalling/);
    assert.match(english, /installed version exactly matches plugin\.version/);

    for (const locale of locales) {
      const localized = await readFile(new URL(`${locale}.ts`, LOCALE_DIR), 'utf8');
      assert.match(localized, /agentInstall:\s*\{/);
      assert.match(localized, /release-manifest\.json/);
      assert.match(localized, /open-design-cli:mcp-install:v1/);
      assert.doesNotMatch(localized, /Agent-readable installation protocol/);
      assert.doesNotMatch(localized, /Run the marketplace command only if/);
    }
  });
});
