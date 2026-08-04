import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
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

const evaluateTemplateConstant = (
  page: string,
  name: string,
  bindings: Record<string, string> = {},
) => {
  const match = page.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'));
  assert.ok(match, `missing ${name}`);
  return Function(...Object.keys(bindings), 'return `' + match[1] + '`;')(
    ...Object.values(bindings),
  ) as string;
};

const runBash = (script: string, path = process.env.PATH) =>
  spawnSync('/bin/bash', ['-c', script], {
    encoding: 'utf8',
    env: { PATH: path ?? '' },
  });

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
    assert.match(page, /minimumCodexCliVersion/);
    assert.match(page, /minimumOpenDesignVersion/);
    assert.match(page, /open_design_version_at_least/);
    assert.match(page, /"\$open_design_od_path" version --json/);
    assert.match(page, /\/Applications\/Open Design\.app/);
    assert.match(page, /codesign --verify --deep --strict/);
    assert.match(page, /plutil -extract CFBundleShortVersionString/);
    assert.match(page, /open-design-preflight:action:settings-mcp-snippet-required/);
    assert.match(page, /codex plugin marketplace list --json/);
    assert.match(
      page,
      /codex plugin marketplace add nexu-io\/open-design-agent-plugins --ref main --json/,
    );
    assert.match(page, /codex plugin add open-design@open-design --json/);
    assert.match(page, /release-manifest\.json/);
    assert.match(page, /command -v od/);
    assert.match(page, /open-design-cli:mcp-install:v1/);
    assert.match(page, /\/usr\/bin\/open -g -j/);
    assert.match(page, /--headless --mcp-install codex/);
    assert.match(page, /open-design-mcp-install:action:settings-mcp-snippet-required/);
    assert.doesNotMatch(page, /const MCP_INSTALL_COMMAND = 'od mcp install codex'/);
    assert.match(page, /codex plugin list --json/);
    assert.match(page, /open_design_safe_mcp_inspect/);
    assert.match(page, /codex mcp list --json 2>\/dev\/null/);
    assert.match(
      page,
      /printf "\{\\\\\\"name\\\\\\":%s,\\\\\\"enabled\\\\\\":%s,\\\\\\"transport\\\\\\":\{\\\\\\"type\\\\\\":%s,\\\\\\"command\\\\\\":%s\}\}/,
    );
    assert.doesNotMatch(page, /const INSPECT_COMMANDS = `[^`]*codex mcp list`/);
    assert.doesNotMatch(page, /const VERIFY_COMMANDS = `[^`]*codex mcp list`/);
    assert.doesNotMatch(page, /codex mcp get open-design --json/);
  });

  it('keeps MCP inspection output credential-free', async () => {
    const page = await readFile(PAGE, 'utf8');
    const helper = evaluateTemplateConstant(page, 'SAFE_MCP_INSPECTION_FUNCTION');
    const fixture = JSON.stringify(
      [
        {
          name: 'open-design',
          enabled: true,
          transport: {
            type: 'stdio',
            command: '/Applications/Open Design.app/Contents/MacOS/Open Design',
            args: ['--token', 'fake-arg-secret', '--api-key=fake-inline-secret'],
            env: { VELA_TOKEN: 'fake-env-secret' },
            env_vars: [],
            cwd: null,
          },
        },
      ],
      null,
      2,
    );
    const result = runBash(`${helper}
codex() { printf '%s\\n' '${fixture}'; }
open_design_safe_mcp_inspect`);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      '{"name":"open-design","enabled":true,"transport":{"type":"stdio","command":"/Applications/Open Design.app/Contents/MacOS/Open Design"}}',
    );
    assert.doesNotMatch(result.stdout, /fake-(?:arg|inline|env)-secret/);
  });

  it('stops safely when od is missing or PATH-shadowed', async () => {
    const page = await readFile(PAGE, 'utf8');
    const preflight = evaluateTemplateConstant(page, 'PREFLIGHT_COMMANDS', {
      RELEASE_MANIFEST: 'https://example.invalid/release-manifest.json',
      SIGNED_MACOS_APP_FUNCTION: 'open_design_signed_macos_app() { return 1; }',
    });
    const mocks = `awk() { /usr/bin/awk "$@"; }
curl() { printf '%s\\n' '{"plugin":{"minimumCodexCliVersion":"0.1.0","minimumOpenDesignVersion":"0.1.0"}}'; }
codex() { printf '%s\\n' 'codex-cli 0.2.0'; }
git() { return 0; }`;

    const missing = runBash(`${mocks}
${preflight}`, '/open-design-test-empty-path');
    assert.notEqual(missing.status, 0);
    assert.match(
      missing.stdout,
      /open-design-preflight:action:settings-mcp-snippet-required/,
    );

    const shadowed = runBash(`${mocks}
od() { printf '%s\\n' 'not-open-design-coreutils-od'; }
${preflight}`, '/open-design-test-empty-path');
    assert.notEqual(shadowed.status, 0);
    assert.match(
      shadowed.stdout,
      /open-design-preflight:action:settings-mcp-snippet-required/,
    );
  });

  it('localizes the full protocol and keeps installation conditional', async () => {
    const locales = ['zh', 'ja', 'ko', 'de', 'fr', 'ru', 'es', 'pt-br', 'it', 'tr'] as const;
    const english = await readFile(COPY, 'utf8');

    assert.match(english, /canonical Git marketplace source/);
    assert.match(english, /Run the marketplace command only if/);
    assert.match(english, /version declared in release-manifest\.json/);
    assert.match(english, /ask the user for confirmation before updating or reinstalling/);
    assert.match(english, /plugin\.minimumOpenDesignVersion/);
    assert.match(english, /signed macOS app bundle/);
    assert.match(english, /Open Design Settings → MCP server/);
    assert.match(english, /filtered MCP snapshot/);
    assert.match(english, /name, enabled, transport\.type and command/);
    assert.match(english, /args, env, env_vars, headers and token fields/);
    assert.match(english, /missing open-design result is expected and non-fatal/);
    assert.match(english, /installed version exactly matches plugin\.version/);
    assert.doesNotMatch(english, /Require Codex CLI 0\.144\.6/);

    for (const locale of locales) {
      const localized = await readFile(new URL(`${locale}.ts`, LOCALE_DIR), 'utf8');
      assert.match(localized, /agentInstall:\s*\{/);
      assert.match(localized, /release-manifest\.json/);
      assert.match(localized, /open-design-cli:mcp-install:v1/);
      assert.match(localized, /plugin\.minimumOpenDesignVersion/);
      assert.match(localized, /codex mcp list --json/);
      assert.match(localized, /CFBundleShortVersionString/);
      assert.match(localized, /Open Design Settings → MCP server/);
      assert.match(localized, /args/);
      assert.match(localized, /env/);
      assert.match(localized, /headers/);
      assert.doesNotMatch(localized, /Agent-readable installation protocol/);
      assert.doesNotMatch(localized, /Run the marketplace command only if/);
    }
  });
});
