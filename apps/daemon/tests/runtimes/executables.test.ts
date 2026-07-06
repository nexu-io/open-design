import { test } from 'vitest';
import { relative, resolve } from 'node:path';
import {
  assert, chmodSync, claude, codex, deepseek, join, minimalAgentDef, mkdirSync, mkdtempSync, resolveAgentExecutable, rmSync, tmpdir, withEnvSnapshot, withPlatform, writeFileSync,
} from './helpers/test-helpers.js';
import { codexAppBundleCandidates } from '../../src/runtimes/executables.js';

const fsTest = process.platform === 'win32' ? test.skip : test;

// ---- OpenClaude fallback (issue #235) -------------------------------------
// OpenClaude (https://github.com/Gitlawb/openclaude) is a Claude Code fork
// that ships under a different binary name but speaks an argv-compatible
// CLI. Users with only `openclaude` on PATH should be auto-detected as the
// Claude Code agent without writing a wrapper script. The mechanism is the
// `fallbackBins` array on the Claude AGENT_DEF, consumed by
// `resolveAgentExecutable`.

test('claude entry declares openclaude as a fallback bin (issue #235)', () => {
  assert.ok(
    Array.isArray(claude.fallbackBins),
    'claude.fallbackBins must be an array',
  );
  assert.ok(
    claude.fallbackBins.includes('openclaude'),
    `claude.fallbackBins must include 'openclaude'; got ${JSON.stringify(claude.fallbackBins)}`,
  );
});

test('deepseek entry declares codewhale as a fallback bin (issue #2983)', () => {
  assert.ok(
    Array.isArray(deepseek.fallbackBins),
    'deepseek.fallbackBins must be an array',
  );
  assert.ok(
    deepseek.fallbackBins.includes('codewhale'),
    `deepseek.fallbackBins must include 'codewhale'; got ${JSON.stringify(deepseek.fallbackBins)}`,
  );
});

// resolveAgentExecutable touches the filesystem via existsSync; on
// Windows resolveOnPath also walks PATHEXT extensions, which our fixture
// files don't carry. Skip the filesystem-backed cases there — the
// declarative `fallbackBins`-on-claude assertion above still runs on
// every platform and is what catches regressions in the AGENT_DEF.
fsTest(
  'resolveAgentExecutable uses packaged built-in Vela for AMR with the bundled OpenCode companion tree',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'od-amr-built-in-'));
    try {
      return withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_RESOURCE_ROOT', 'VELA_OPENCODE_BIN'], () => {
        const resourceRoot = join(root, 'resources', 'open-design');
        const builtInVela = join(resourceRoot, 'bin', 'vela');
        const companionTree = join(resourceRoot, 'bin', 'libexec', 'opencode');
        mkdirSync(join(resourceRoot, 'bin'), { recursive: true });
        mkdirSync(companionTree, { recursive: true });
        writeFileSync(builtInVela, '#!/bin/sh\nexit 0\n');
        chmodSync(builtInVela, 0o755);
        // Match the resources.test.ts packaging contract: the companion tree
        // is only valid when `<libexec>/opencode/opencode` actually exists +
        // is executable. Directory-only checks were producing a false-positive
        // availability path.
        const companionExe = join(companionTree, 'opencode');
        writeFileSync(companionExe, '#!/bin/sh\nexit 0\n');
        chmodSync(companionExe, 0o755);
        process.env.PATH = '';
        process.env.OD_AGENT_HOME = join(root, 'empty-home');
        process.env.OD_RESOURCE_ROOT = resourceRoot;
        delete process.env.VELA_OPENCODE_BIN;

        const resolved = resolveAgentExecutable(minimalAgentDef({ id: 'amr', bin: 'vela' }));

        assert.equal(resolved, builtInVela);
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable does not select packaged built-in Vela when OpenCode is missing',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'od-amr-built-in-no-opencode-'));
    try {
      return withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_RESOURCE_ROOT', 'VELA_OPENCODE_BIN'], () => {
        const resourceRoot = join(root, 'resources', 'open-design');
        const builtInVela = join(resourceRoot, 'bin', 'vela');
        mkdirSync(join(resourceRoot, 'bin'), { recursive: true });
        writeFileSync(builtInVela, '#!/bin/sh\nexit 0\n');
        chmodSync(builtInVela, 0o755);
        process.env.PATH = '';
        process.env.OD_AGENT_HOME = join(root, 'empty-home');
        process.env.OD_RESOURCE_ROOT = resourceRoot;
        delete process.env.VELA_OPENCODE_BIN;

        const resolved = resolveAgentExecutable(minimalAgentDef({ id: 'amr', bin: 'vela' }));

        assert.equal(resolved, null);
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable prefers configured VELA_BIN over packaged built-in Vela',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'od-amr-built-in-precedence-'));
    try {
      return withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_RESOURCE_ROOT'], () => {
        const resourceRoot = join(root, 'resources', 'open-design');
        const builtInVela = join(resourceRoot, 'bin', 'vela');
        const configuredVela = join(root, 'configured', 'vela');
        mkdirSync(join(resourceRoot, 'bin'), { recursive: true });
        mkdirSync(join(root, 'configured'), { recursive: true });
        writeFileSync(builtInVela, '#!/bin/sh\nexit 0\n');
        writeFileSync(configuredVela, '#!/bin/sh\nexit 0\n');
        chmodSync(builtInVela, 0o755);
        chmodSync(configuredVela, 0o755);
        process.env.PATH = '';
        process.env.OD_AGENT_HOME = join(root, 'empty-home');
        process.env.OD_RESOURCE_ROOT = resourceRoot;

        const resolved = resolveAgentExecutable(
          minimalAgentDef({ id: 'amr', bin: 'vela' }),
          { VELA_BIN: configuredVela },
        );

        assert.equal(resolved, configuredVela);
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable falls back to PATH Vela when packaged built-in Vela is absent',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'od-amr-path-fallback-'));
    try {
      return withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_RESOURCE_ROOT'], () => {
        const pathBin = join(root, 'path-bin');
        const pathVela = join(pathBin, 'vela');
        mkdirSync(pathBin, { recursive: true });
        writeFileSync(pathVela, '#!/bin/sh\nexit 0\n');
        chmodSync(pathVela, 0o755);
        process.env.PATH = pathBin;
        process.env.OD_AGENT_HOME = join(root, 'empty-home');
        process.env.OD_RESOURCE_ROOT = join(root, 'resources', 'open-design');

        const resolved = resolveAgentExecutable(minimalAgentDef({ id: 'amr', bin: 'vela' }));

        assert.equal(resolved, pathVela);
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable prefers def.bin over fallbackBins when bin is on PATH',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      writeFileSync(join(dir, 'claude'), '');
      writeFileSync(join(dir, 'openclaude'), '');
      chmodSync(join(dir, 'claude'), 0o755);
      chmodSync(join(dir, 'openclaude'), 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable(minimalAgentDef({
        bin: 'claude',
        fallbackBins: ['openclaude'],
      }));
      assert.equal(resolved, join(dir, 'claude'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable falls back through fallbackBins when def.bin is missing',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      // Only `openclaude` is installed (Claude Code fork-only setup).
      writeFileSync(join(dir, 'openclaude'), '');
      chmodSync(join(dir, 'openclaude'), 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable(minimalAgentDef({
        bin: 'claude',
        fallbackBins: ['openclaude'],
      }));
      assert.equal(resolved, join(dir, 'openclaude'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable returns null when neither def.bin nor any fallback is on PATH',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable(minimalAgentDef({
        bin: 'claude',
        fallbackBins: ['openclaude'],
      }));
      assert.equal(resolved, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable searches mise node bins when PATH is minimal',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-agents-home-'));
    try {
      const dir = join(
        home,
        '.local',
        'share',
        'mise',
        'installs',
        'node',
        '24.14.1',
        'bin',
      );
      const pathBin = join(home, 'path-bin');
      mkdirSync(dir, { recursive: true });
      mkdirSync(pathBin, { recursive: true });
      writeFileSync(join(dir, 'codex'), '');
      chmodSync(join(dir, 'codex'), 0o755);
      process.env.OD_AGENT_HOME = home;
      process.env.PATH = pathBin;

      const resolved = resolveAgentExecutable(minimalAgentDef({
        bin: 'codex',
      }));
      assert.equal(resolved, join(dir, 'codex'));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable still resolves agents without a fallbackBins field',
  () => {
    // Guard against a regression that would require every AGENT_DEF to
    // declare fallbackBins. Most agents (codex / gemini / opencode / ...)
    // only have a single binary name and must keep working unchanged.
    const dir = mkdtempSync(join(tmpdir(), 'od-agents-resolve-'));
    try {
      writeFileSync(join(dir, 'codex'), '');
      chmodSync(join(dir, 'codex'), 0o755);
      process.env.PATH = dir;

      const resolved = resolveAgentExecutable(minimalAgentDef({ bin: 'codex' }));
      assert.equal(resolved, join(dir, 'codex'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

// Issue #442: GUI-launched daemons (Finder/Dock on macOS, .desktop on Linux)
// inherit a stripped PATH that doesn't include the user's npm global prefix.
// Most third-party "fix npm EACCES without sudo" tutorials configure
// `~/.npm-global` as the prefix, so any CLI installed via `npm i -g <cli>`
// lives at `~/.npm-global/bin/<cli>`. The daemon must search there even when
// the inherited PATH only carries `/usr/bin:/bin:...`.
fsTest(
  'resolveAgentExecutable searches ~/.npm-global/bin under a minimal GUI-launched PATH (issue #442)',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-agents-npm-global-'));
    try {
      const dir = join(home, '.npm-global', 'bin');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'gemini'), '');
      chmodSync(join(dir, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = home;
      // Mirror the launchd default a `.app` actually inherits — no
      // `~/.npm-global/bin`, no `/opt/homebrew/bin`, nothing user-side.
      process.env.PATH = '/usr/bin:/bin';

      const resolved = resolveAgentExecutable(minimalAgentDef({ bin: 'gemini' }));
      assert.equal(resolved, join(dir, 'gemini'));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

// Same root cause as #442 but for the second-most-common alternative
// non-canonical npm prefix shipped in older "fix sudo-free npm" guides.
fsTest(
  'resolveAgentExecutable also searches ~/.npm-packages/bin (alt npm prefix)',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-agents-npm-packages-'));
    try {
      const dir = join(home, '.npm-packages', 'bin');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'gemini'), '');
      chmodSync(join(dir, 'gemini'), 0o755);
      process.env.OD_AGENT_HOME = home;
      process.env.PATH = '/usr/bin:/bin';

      const resolved = resolveAgentExecutable(minimalAgentDef({ bin: 'gemini' }));
      assert.equal(resolved, join(dir, 'gemini'));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable searches ~/.vite-plus/bin under a minimal GUI-launched PATH (vp global install)',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-agents-vp-home-'));
    try {
      const dir = join(home, '.vite-plus', 'bin');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'vp-cli-probe'), '');
      chmodSync(join(dir, 'vp-cli-probe'), 0o755);
      process.env.OD_AGENT_HOME = home;
      process.env.PATH = '/usr/bin:/bin';

      const resolved = resolveAgentExecutable(minimalAgentDef({ bin: 'vp-cli-probe' }));
      assert.equal(resolved, join(dir, 'vp-cli-probe'));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

fsTest(
  'resolveAgentExecutable honors $VP_HOME/bin when the custom Vite+ home is outside PATH',
  () => {
    const vpHome = mkdtempSync(join(tmpdir(), 'od-agents-vp-custom-'));
    try {
      const dir = join(vpHome, 'bin');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'vp-cli-probe'), '');
      chmodSync(join(dir, 'vp-cli-probe'), 0o755);
      process.env.PATH = '/usr/bin:/bin';
      process.env.VP_HOME = vpHome;

      const resolved = resolveAgentExecutable(minimalAgentDef({ bin: 'vp-cli-probe' }));
      assert.equal(resolved, join(dir, 'vp-cli-probe'));
    } finally {
      rmSync(vpHome, { recursive: true, force: true });
    }
  },
);

// Test isolation: when OD_AGENT_HOME points at a sandbox, an exported
// $NPM_CONFIG_PREFIX / $npm_config_prefix on the developer's or CI
// runner's environment must not leak a real <prefix>/bin into the
// sandboxed search list. Otherwise an agent installed by the host
// machine could satisfy a "not on PATH" assertion in the sandbox and
// make detection tests environment-dependent. Raised in PR review on
// #442 (review comment by @mrcfps on apps/daemon/src/agents.ts:742).
fsTest(
  'OD_AGENT_HOME isolates resolution from $NPM_CONFIG_PREFIX leakage',
  () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'od-agents-sandbox-'));
    const realPrefix = mkdtempSync(join(tmpdir(), 'od-agents-real-prefix-'));
    const realPrefixBin = join(realPrefix, 'bin');
    try {
      // Sandbox is empty — gemini does not exist under OD_AGENT_HOME.
      // Real prefix has a gemini, simulating the developer's /opt/...
      // or ~/.npm-global install. NPM_CONFIG_PREFIX points at it.
      mkdirSync(realPrefixBin, { recursive: true });
      writeFileSync(join(realPrefixBin, 'gemini'), '');
      chmodSync(join(realPrefixBin, 'gemini'), 0o755);

      process.env.OD_AGENT_HOME = sandbox;
      process.env.PATH = '/usr/bin:/bin';
      process.env.NPM_CONFIG_PREFIX = realPrefix;

      const resolved = resolveAgentExecutable(minimalAgentDef({ bin: 'gemini' }));
      assert.equal(
        resolved,
        null,
        `OD_AGENT_HOME sandbox must not see the real $NPM_CONFIG_PREFIX bin; ` +
          `got ${resolved}`,
      );
    } finally {
      // afterEach restores NPM_CONFIG_PREFIX to its pre-test value (or
      // deletes it when it was unset), so do not unconditionally
      // `delete` it here — that would clobber an export the developer
      // / CI runner had already set, leaking into the next test in the
      // same Vitest worker.
      rmSync(sandbox, { recursive: true, force: true });
      rmSync(realPrefix, { recursive: true, force: true });
    }
  },
);

fsTest(
  'OD_SANDBOX_MODE scopes fallback toolchain discovery to OD_DATA_DIR',
  () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'od-agents-sandbox-data-'));
    const emptyPath = mkdtempSync(join(tmpdir(), 'od-agents-empty-path-'));
    const realPrefix = mkdtempSync(join(tmpdir(), 'od-agents-real-prefix-'));
    const realPrefixBin = join(realPrefix, 'bin');
    try {
      return withEnvSnapshot(
        ['PATH', 'OD_AGENT_HOME', 'OD_DATA_DIR', 'OD_SANDBOX_MODE', 'NPM_CONFIG_PREFIX'],
        () => {
          mkdirSync(realPrefixBin, { recursive: true });
          writeFileSync(join(realPrefixBin, 'gemini'), '');
          chmodSync(join(realPrefixBin, 'gemini'), 0o755);

          delete process.env.OD_AGENT_HOME;
          process.env.OD_DATA_DIR = dataDir;
          process.env.OD_SANDBOX_MODE = '1';
          process.env.PATH = emptyPath;
          process.env.NPM_CONFIG_PREFIX = realPrefix;

          const resolved = resolveAgentExecutable(minimalAgentDef({ bin: 'gemini' }));
          assert.equal(
            resolved,
            null,
            `sandbox mode must not see the host $NPM_CONFIG_PREFIX bin; got ${resolved}`,
          );
        },
      );
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(emptyPath, { recursive: true, force: true });
      rmSync(realPrefix, { recursive: true, force: true });
    }
  },
);

fsTest(
  'OD_SANDBOX_MODE resolves relative OD_DATA_DIR before fallback toolchain discovery',
  () => {
    const projectRoot = resolve(process.cwd(), '../..');
    const parent = mkdtempSync(join(tmpdir(), 'od-agents-relative-data-parent-'));
    const dataDir = join(parent, 'data');
    const sandboxBin = join(dataDir, 'sandbox', 'agent-home', '.local', 'bin');
    const emptyPath = mkdtempSync(join(tmpdir(), 'od-agents-empty-path-'));
    try {
      return withEnvSnapshot(
        ['PATH', 'OD_AGENT_HOME', 'OD_DATA_DIR', 'OD_SANDBOX_MODE', 'NPM_CONFIG_PREFIX'],
        () => {
          mkdirSync(sandboxBin, { recursive: true });
          const geminiPath = join(sandboxBin, 'gemini');
          writeFileSync(geminiPath, '');
          chmodSync(geminiPath, 0o755);

          delete process.env.OD_AGENT_HOME;
          delete process.env.NPM_CONFIG_PREFIX;
          process.env.OD_DATA_DIR = relative(projectRoot, dataDir);
          process.env.OD_SANDBOX_MODE = '1';
          process.env.PATH = emptyPath;

          const resolved = resolveAgentExecutable(minimalAgentDef({ bin: 'gemini' }));
          assert.equal(resolved, geminiPath);
        },
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
      rmSync(emptyPath, { recursive: true, force: true });
    }
  },
);

fsTest(
  'OD_AGENT_HOME isolates resolution from $VP_HOME leakage',
  () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'od-agents-vp-sandbox-'));
    const realVpHome = mkdtempSync(join(tmpdir(), 'od-agents-vp-real-home-'));
    const realVpBin = join(realVpHome, 'bin');
    try {
      mkdirSync(realVpBin, { recursive: true });
      writeFileSync(join(realVpBin, 'vp-cli-probe'), '');
      chmodSync(join(realVpBin, 'vp-cli-probe'), 0o755);

      process.env.OD_AGENT_HOME = sandbox;
      process.env.PATH = '/usr/bin:/bin';
      process.env.VP_HOME = realVpHome;

      const resolved = resolveAgentExecutable(minimalAgentDef({ bin: 'vp-cli-probe' }));
      assert.equal(
        resolved,
        null,
        `OD_AGENT_HOME sandbox must not see the real $VP_HOME bin; got ${resolved}`,
      );
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
      rmSync(realVpHome, { recursive: true, force: true });
    }
  },
);

// The official OpenAI Codex desktop app (bundle id `com.openai.codex`) ships
// the `codex` CLI inside `Codex.app/Contents/Resources/codex` and does NOT add
// it to PATH unless the user runs the app's "Install command line tool"
// action. App-only installs must still be detected so the agent picker doesn't
// show Codex as "not installed" while a healthy native binary sits in the
// bundle. `~/Applications` honors OD_AGENT_HOME so the case stays deterministic.
fsTest(
  'resolveAgentExecutable finds codex inside ~/Applications/Codex.app when PATH is empty',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-codex-app-bundle-'));
    try {
      return withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_SANDBOX_MODE', 'OD_DATA_DIR'], () =>
        withPlatform('darwin', () => {
          const bundleDir = join(
            home,
            'Applications',
            'Codex.app',
            'Contents',
            'Resources',
          );
          const codexBin = join(bundleDir, 'codex');
          mkdirSync(bundleDir, { recursive: true });
          writeFileSync(codexBin, '');
          chmodSync(codexBin, 0o755);
          // resolveDetectionHome() consults OD_SANDBOX_MODE / OD_DATA_DIR
          // before OD_AGENT_HOME, so clear them or an ambient sandbox env
          // (dev/CI) would override `home` or throw on OD_DATA_DIR.
          delete process.env.OD_SANDBOX_MODE;
          delete process.env.OD_DATA_DIR;
          process.env.OD_AGENT_HOME = home;
          process.env.PATH = '/usr/bin:/bin';

          const resolved = resolveAgentExecutable(codex);
          assert.equal(resolved, codexBin);
        }),
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

// A real PATH/npm/Homebrew install is a deliberate CLI install and must
// outrank the app-bundle fallback.
fsTest(
  'resolveAgentExecutable prefers a PATH codex over the Codex.app bundle',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-codex-app-bundle-precedence-'));
    try {
      return withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_SANDBOX_MODE', 'OD_DATA_DIR'], () =>
        withPlatform('darwin', () => {
          const bundleDir = join(
            home,
            'Applications',
            'Codex.app',
            'Contents',
            'Resources',
          );
          mkdirSync(bundleDir, { recursive: true });
          const bundleCodex = join(bundleDir, 'codex');
          writeFileSync(bundleCodex, '');
          chmodSync(bundleCodex, 0o755);

          const pathBin = join(home, 'path-bin');
          mkdirSync(pathBin, { recursive: true });
          const pathCodex = join(pathBin, 'codex');
          writeFileSync(pathCodex, '');
          chmodSync(pathCodex, 0o755);

          // See note above: clear sandbox env so resolveDetectionHome()
          // honors this fixture's OD_AGENT_HOME deterministically.
          delete process.env.OD_SANDBOX_MODE;
          delete process.env.OD_DATA_DIR;
          process.env.OD_AGENT_HOME = home;
          process.env.PATH = pathBin;

          const resolved = resolveAgentExecutable(codex);
          assert.equal(resolved, pathCodex);
        }),
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

// The Codex.app fallback is macOS-only; on other platforms an identically
// laid-out directory must not be treated as an install.
fsTest(
  'resolveAgentExecutable ignores Codex.app bundle on non-darwin platforms',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-codex-app-bundle-linux-'));
    try {
      return withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_SANDBOX_MODE', 'OD_DATA_DIR'], () =>
        withPlatform('linux', () => {
          const bundleDir = join(
            home,
            'Applications',
            'Codex.app',
            'Contents',
            'Resources',
          );
          const codexBin = join(bundleDir, 'codex');
          mkdirSync(bundleDir, { recursive: true });
          writeFileSync(codexBin, '');
          chmodSync(codexBin, 0o755);
          // resolveDetectionHome() consults OD_SANDBOX_MODE / OD_DATA_DIR
          // before OD_AGENT_HOME, so clear them or an ambient sandbox env
          // (dev/CI) would override `home` or throw on OD_DATA_DIR.
          delete process.env.OD_SANDBOX_MODE;
          delete process.env.OD_DATA_DIR;
          process.env.OD_AGENT_HOME = home;
          process.env.PATH = '/usr/bin:/bin';

          const resolved = resolveAgentExecutable(codex);
          assert.equal(resolved, null);
        }),
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

// The app-bundle fallback is codex-specific. A different agent that happens to
// ship a `codex`-named binary must not be resolved out of the Codex.app bundle.
fsTest(
  'resolveAgentExecutable does not apply the Codex.app fallback to non-codex agents',
  () => {
    const home = mkdtempSync(join(tmpdir(), 'od-codex-app-bundle-id-'));
    try {
      return withEnvSnapshot(['PATH', 'OD_AGENT_HOME', 'OD_SANDBOX_MODE', 'OD_DATA_DIR'], () =>
        withPlatform('darwin', () => {
          const bundleDir = join(
            home,
            'Applications',
            'Codex.app',
            'Contents',
            'Resources',
          );
          const codexBin = join(bundleDir, 'codex');
          mkdirSync(bundleDir, { recursive: true });
          writeFileSync(codexBin, '');
          chmodSync(codexBin, 0o755);
          // resolveDetectionHome() consults OD_SANDBOX_MODE / OD_DATA_DIR
          // before OD_AGENT_HOME, so clear them or an ambient sandbox env
          // (dev/CI) would override `home` or throw on OD_DATA_DIR.
          delete process.env.OD_SANDBOX_MODE;
          delete process.env.OD_DATA_DIR;
          process.env.OD_AGENT_HOME = home;
          process.env.PATH = '/usr/bin:/bin';

          const resolved = resolveAgentExecutable(
            minimalAgentDef({ id: 'other-agent', bin: 'codex' }),
          );
          assert.equal(resolved, null);
        }),
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

// The fixtures above all set OD_AGENT_HOME, which scopes the probe to the
// override home and skips the system `/Applications` path. The PR's main
// real-world case is the no-override `/Applications/Codex.app` install, so
// assert the candidate list directly: `/Applications/...` must be present and
// ranked first (a path typo or ordering regression here would silently miss
// the common case while every OD_AGENT_HOME-scoped test still passes).
fsTest(
  'codexAppBundleCandidates probes /Applications first when no home override is set',
  () => {
    return withEnvSnapshot(
      ['OD_AGENT_HOME', 'OD_SANDBOX_MODE', 'OD_DATA_DIR'],
      () =>
        withPlatform('darwin', () => {
          delete process.env.OD_AGENT_HOME;
          delete process.env.OD_SANDBOX_MODE;
          delete process.env.OD_DATA_DIR;

          const candidates = codexAppBundleCandidates();
          const bundleSuffix = join(
            'Applications',
            'Codex.app',
            'Contents',
            'Resources',
            'codex',
          );
          const [system, userScoped] = candidates;

          assert.equal(candidates.length, 2);
          assert.equal(
            system,
            join('/', bundleSuffix),
            `expected the system /Applications bundle first; got ${JSON.stringify(candidates)}`,
          );
          // The user-scoped (~/Applications) candidate must also be present, be
          // a distinct absolute path, and not be the system one.
          assert.ok(
            userScoped !== undefined &&
              userScoped !== system &&
              userScoped.endsWith(`/${bundleSuffix}`),
            `expected a distinct ~/Applications candidate; got ${JSON.stringify(candidates)}`,
          );
        }),
    );
  },
);

// On non-darwin platforms there is no app bundle to probe, so the candidate
// list must be empty regardless of home override.
fsTest('codexAppBundleCandidates is empty on non-darwin platforms', () => {
  return withPlatform('linux', () => {
    assert.deepEqual(codexAppBundleCandidates(), []);
  });
});
