import { test } from 'vitest';
import {
  assert, chmodSync, claude, gemini, join, minimalAgentDef, mkdirSync, mkdtempSync, resolveAgentExecutable, rmSync, tmpdir, withPlatform, writeFileSync,
} from './helpers/test-helpers.js';

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

// resolveAgentExecutable touches the filesystem via existsSync; on
// Windows resolveOnPath also walks PATHEXT extensions, which our fixture
// files don't carry. Skip the filesystem-backed cases there — the
// declarative `fallbackBins`-on-claude assertion above still runs on
// every platform and is what catches regressions in the AGENT_DEF.
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
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'codex'), '');
      chmodSync(join(dir, 'codex'), 0o755);
      process.env.OD_AGENT_HOME = home;
      process.env.PATH = '/usr/bin:/bin';

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
