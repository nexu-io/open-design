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
      /codex plugin marketplace add "\$open_design_required_source" --ref "\$open_design_required_ref" --json/,
    );
    assert.match(page, /codex plugin add "\$open_design_required_selector" --json/);
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

  it('rejects marketplace collisions and stale plugin versions', async () => {
    const page = await readFile(PAGE, 'utf8');
    const helper = evaluateTemplateConstant(page, 'PLUGIN_STATE_FUNCTION', {
      RELEASE_MANIFEST: 'https://example.invalid/release-manifest.json',
    });
    const manifest = JSON.stringify(
      {
        marketplace: {
          name: 'open-design',
          gitSource: 'nexu-io/open-design-agent-plugins',
          gitRef: 'main',
        },
        plugin: { name: 'open-design', version: '0.5.2' },
      },
      null,
      2,
    );
    const canonicalMarketplace = JSON.stringify(
      {
        marketplaces: [
          {
            name: 'open-design',
            marketplaceSource: {
              sourceType: 'git',
              source: 'https://github.com/nexu-io/open-design-agent-plugins.git',
            },
          },
        ],
      },
      null,
      2,
    );
    const conflictingMarketplace = canonicalMarketplace.replace(
      'https://github.com/nexu-io/open-design-agent-plugins.git',
      'https://github.com/example/not-open-design.git',
    );
    const stalePlugin = JSON.stringify(
      {
        installed: [
          {
            pluginId: 'open-design@open-design',
            name: 'open-design',
            marketplaceName: 'open-design',
            version: '0.4.0',
            installed: true,
            enabled: true,
            marketplaceSource: {
              sourceType: 'git',
              source: 'https://github.com/nexu-io/open-design-agent-plugins.git',
            },
          },
        ],
        available: [],
      },
      null,
      2,
    );
    const foreignSelector = JSON.stringify(
      {
        installed: [
          {
            pluginId: 'open-design@another-marketplace',
            name: 'open-design',
            marketplaceName: 'another-marketplace',
            version: '0.5.2',
            installed: true,
            enabled: true,
            marketplaceSource: {
              sourceType: 'git',
              source: 'https://github.com/example/not-open-design.git',
            },
          },
        ],
        available: [],
      },
      null,
      2,
    );

    const collision = runBash(`${helper}
curl() { printf '%s\\n' '${manifest}'; }
codex() {
  case "$*" in
    'plugin marketplace list --json') printf '%s\\n' '${conflictingMarketplace}' ;;
    'plugin list --json') printf '%s\\n' '{"installed":[],"available":[]}' ;;
  esac
}
open_design_plugin_inspect`);
    assert.notEqual(collision.status, 0);
    assert.match(collision.stdout, /open-design-plugin:error:marketplace-collision/);

    const selectorCollision = runBash(`${helper}
open_design_marketplace_config_ref() { printf '%s\\n' 'main'; }
curl() { printf '%s\\n' '${manifest}'; }
codex() {
  case "$*" in
    'plugin marketplace list --json') printf '%s\\n' '${canonicalMarketplace}' ;;
    'plugin list --json') printf '%s\\n' '${foreignSelector}' ;;
  esac
}
open_design_plugin_inspect`);
    assert.notEqual(selectorCollision.status, 0);
    assert.match(selectorCollision.stdout, /open-design-plugin:error:selector-collision/);

    const refCollision = runBash(`${helper}
open_design_marketplace_config_ref() { printf '%s\\n' 'feature/not-main'; }
curl() { printf '%s\\n' '${manifest}'; }
codex() {
  case "$*" in
    'plugin marketplace list --json') printf '%s\\n' '${canonicalMarketplace}' ;;
    'plugin list --json') printf '%s\\n' '${stalePlugin}' ;;
  esac
}
open_design_plugin_inspect`);
    assert.notEqual(refCollision.status, 0);
    assert.match(refCollision.stdout, /open-design-plugin:error:marketplace-ref-collision/);

    const stale = runBash(`${helper}
open_design_marketplace_config_ref() { printf '%s\\n' 'main'; }
curl() { printf '%s\\n' '${manifest}'; }
codex() {
  case "$*" in
    'plugin marketplace list --json') printf '%s\\n' '${canonicalMarketplace}' ;;
    'plugin list --json') printf '%s\\n' '${stalePlugin}' ;;
  esac
}
open_design_plugin_inspect`);
    assert.equal(stale.status, 2, stale.stderr);
    assert.match(
      stale.stdout,
      /open-design-plugin:action:version-confirmation-required:0\.4\.0:0\.5\.2/,
    );
  });

  it('gates plugin mutations on marketplace success and version confirmation', async () => {
    const page = await readFile(PAGE, 'utf8');
    const helper = evaluateTemplateConstant(page, 'PLUGIN_STATE_FUNCTION', {
      RELEASE_MANIFEST: 'https://example.invalid/release-manifest.json',
    });
    const install = evaluateTemplateConstant(page, 'PLUGIN_INSTALL_COMMANDS', {
      PLUGIN_STATE_FUNCTION: helper,
    });
    const installWithCanonicalRef = install.replace(
      'open_design_install_plugin() {',
      `open_design_marketplace_config_ref() { printf '%s\\n' 'main'; }
open_design_install_plugin() {`,
    );
    const manifest = JSON.stringify(
      {
        marketplace: {
          name: 'open-design',
          gitSource: 'nexu-io/open-design-agent-plugins',
          gitRef: 'main',
        },
        plugin: { name: 'open-design', version: '0.5.2' },
      },
      null,
      2,
    );
    const missing = JSON.stringify({ marketplaces: [] }, null, 2);
    const pluginList = JSON.stringify(
      {
        installed: [],
        available: [
          {
            pluginId: 'open-design@open-design',
            name: 'open-design',
            marketplaceName: 'open-design',
            version: '0.5.2',
            installed: false,
            enabled: false,
          },
        ],
      },
      null,
      2,
    );
    const result = runBash(`plugin_add_called=0
curl() { printf '%s\\n' '${manifest}'; }
codex() {
  case "$*" in
    'plugin marketplace list --json') printf '%s\\n' '${missing}' ;;
    'plugin list --json') printf '%s\\n' '${pluginList}' ;;
    'plugin marketplace add nexu-io/open-design-agent-plugins --ref main --json') return 1 ;;
    'plugin add open-design@open-design --json') plugin_add_called=1 ;;
  esac
}
${install}
open_design_install_status=$?
printf 'plugin-add-called:%s\\n' "$plugin_add_called"
exit "$open_design_install_status"`);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /open-design-plugin:error:marketplace-add-failed/);
    assert.match(result.stdout, /plugin-add-called:0/);

    const canonicalMarketplace = JSON.stringify(
      {
        marketplaces: [
          {
            name: 'open-design',
            marketplaceSource: {
              sourceType: 'git',
              source: 'https://github.com/nexu-io/open-design-agent-plugins.git',
            },
          },
        ],
      },
      null,
      2,
    );
    const stalePlugin = JSON.stringify(
      {
        installed: [
          {
            pluginId: 'open-design@open-design',
            name: 'open-design',
            marketplaceName: 'open-design',
            version: '0.4.0',
            installed: true,
            enabled: true,
            marketplaceSource: {
              sourceType: 'git',
              source: 'https://github.com/nexu-io/open-design-agent-plugins.git',
            },
          },
        ],
        available: [],
      },
      null,
      2,
    );
    const unconfirmed = runBash(`mutation_calls=0
curl() { printf '%s\\n' '${manifest}'; }
codex() {
  case "$*" in
    'plugin marketplace list --json') printf '%s\\n' '${canonicalMarketplace}' ;;
    'plugin list --json') printf '%s\\n' '${stalePlugin}' ;;
    *) mutation_calls=$((mutation_calls + 1)) ;;
  esac
}
${installWithCanonicalRef}
open_design_install_status=$?
printf 'mutation-calls:%s\\n' "$mutation_calls"
exit "$open_design_install_status"`);

    assert.equal(unconfirmed.status, 2, unconfirmed.stderr);
    assert.match(
      unconfirmed.stdout,
      /open-design-plugin:action:version-confirmation-required:0\.4\.0:0\.5\.2/,
    );
    assert.match(unconfirmed.stdout, /mutation-calls:0/);
  });

  it('accepts only a verified local stdio MCP launch path', async () => {
    const page = await readFile(PAGE, 'utf8');
    const app = '/Applications/Open Design.app';
    const signedApp =
      `open_design_signed_macos_app() { printf '%s\\n' '${app}'; }`;
    const validator = evaluateTemplateConstant(page, 'MCP_VALIDATION_FUNCTION', {
      SIGNED_MACOS_APP_FUNCTION: signedApp,
    });
    const validSignedTransport = {
      type: 'stdio',
      command:
        `${app}/Contents/Frameworks/Open Design Helper.app/Contents/MacOS/Open Design Helper`,
      args: [`${app}/Contents/Resources/app/prebundled/daemon/daemon-cli.mjs`, 'mcp'],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        OD_DATA_DIR: '/tmp/open-design/data',
        OD_MCP_BOOTSTRAP_ARGS: JSON.stringify([
          '-g',
          '-j',
          app,
          '--args',
          '--headless',
        ]),
        OD_MCP_BOOTSTRAP_COMMAND: '/usr/bin/open',
        OD_SIDECAR_IPC_PATH: '/tmp/open-design/ipc/stable/daemon.sock',
      },
      env_vars: [],
      cwd: null,
    };
    const validate = (fixture: unknown, transport: unknown = validSignedTransport) => {
      const privateFixture = JSON.stringify([
        { name: 'open-design', enabled: true, transport },
      ]);
      return runBash(`${validator}
codex() { printf '%s\\n' '${privateFixture}'; }
open_design_mcp_snapshot_is_verified_local '${JSON.stringify(fixture)}'`);
    };

    assert.notEqual(
      validate({
        name: 'open-design',
        enabled: true,
        transport: { type: 'streamable_http', command: null },
      }).status,
      0,
    );
    assert.notEqual(
      validate({
        name: 'open-design',
        enabled: true,
        transport: { type: 'stdio', command: 'open-design-helper' },
      }).status,
      0,
    );
    assert.notEqual(
      validate({
        name: 'open-design',
        enabled: true,
        transport: {
          type: 'stdio',
          command: '/Applications/Open Design.app/Contents/Resources/not-the-launcher',
        },
      }).status,
      0,
    );
    assert.equal(
      validate({
        name: 'open-design',
        enabled: true,
        transport: {
          type: 'stdio',
          command:
            '/Applications/Open Design.app/Contents/Frameworks/Open Design Helper.app/Contents/MacOS/Open Design Helper',
        },
      }).status,
      0,
    );
    const wrongLaunchArgs = {
      ...validSignedTransport,
      args: [
        `${app}/Contents/Resources/app/prebundled/daemon/daemon-cli.mjs`,
        'mcp',
        '--daemon-url',
        'https://attacker.invalid',
      ],
    };
    const wrongArgsResult = validate(
      {
        name: 'open-design',
        enabled: true,
        transport: { type: 'stdio', command: validSignedTransport.command },
      },
      wrongLaunchArgs,
    );
    assert.notEqual(wrongArgsResult.status, 0);
    assert.doesNotMatch(wrongArgsResult.stdout + wrongArgsResult.stderr, /attacker\.invalid/);

    const cliValidator = evaluateTemplateConstant(page, 'MCP_VALIDATION_FUNCTION', {
      SIGNED_MACOS_APP_FUNCTION: 'open_design_signed_macos_app() { return 1; }',
    });
    const cliTransport = {
      type: 'stdio',
      command: '/opt/open-design/open-design-runtime',
      args: ['mcp'],
      env: { OD_DAEMON_URL: 'http://127.0.0.1:7456' },
      env_vars: [],
      cwd: null,
    };
    const cliFixture = JSON.stringify({
      name: 'open-design',
      enabled: true,
      transport: { type: 'stdio', command: '/opt/open-design/open-design-runtime' },
    });
    const cliPrivateFixture = JSON.stringify([
      { name: 'open-design', enabled: true, transport: cliTransport },
    ]);
    const cliExpected = JSON.stringify({
      command: cliTransport.command,
      args: cliTransport.args,
      env: cliTransport.env,
    });
    const cliResult = runBash(`${cliValidator}
codex() { printf '%s\\n' '${cliPrivateFixture}'; }
od() {
  case "$*" in
    'mcp install --open-design-cli-probe') printf '%s\\n' 'open-design-cli:mcp-install:v1' ;;
    'mcp install codex --print --json') printf '%s\\n' '${cliExpected}' ;;
    *) return 1 ;;
  esac
}
open_design_mcp_snapshot_is_verified_local '${cliFixture}'`);
    assert.equal(cliResult.status, 0, cliResult.stderr);

    const wrongDaemonPrivateFixture = JSON.stringify([
      {
        name: 'open-design',
        enabled: true,
        transport: {
          ...cliTransport,
          env: { OD_DAEMON_URL: 'https://attacker.invalid' },
        },
      },
    ]);
    const wrongDaemonResult = runBash(`${cliValidator}
codex() { printf '%s\\n' '${wrongDaemonPrivateFixture}'; }
od() {
  case "$*" in
    'mcp install --open-design-cli-probe') printf '%s\\n' 'open-design-cli:mcp-install:v1' ;;
    'mcp install codex --print --json') printf '%s\\n' '${cliExpected}' ;;
    *) return 1 ;;
  esac
}
open_design_mcp_snapshot_is_verified_local '${cliFixture}'`);
    assert.notEqual(wrongDaemonResult.status, 0);
    assert.doesNotMatch(
      wrongDaemonResult.stdout + wrongDaemonResult.stderr,
      /attacker\.invalid/,
    );
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
    assert.match(english, /installed version that exactly matches plugin\.version/);
    assert.match(english, /OPEN_DESIGN_PLUGIN_UPDATE_CONFIRMED=1/);
    assert.match(english, /enabled, uses stdio, and its absolute command matches/);
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
      assert.match(localized, /OPEN_DESIGN_PLUGIN_UPDATE_CONFIRMED=1/);
      assert.match(localized, /stdio/);
      assert.match(localized, /args/);
      assert.match(localized, /env/);
      assert.match(localized, /headers/);
      assert.doesNotMatch(localized, /Agent-readable installation protocol/);
      assert.doesNotMatch(localized, /Run the marketplace command only if/);
    }
  });
});
