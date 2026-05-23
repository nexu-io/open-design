import { test } from 'vitest';
import {
  assert,
  chmodSync,
  inspectAgentExecutableResolution,
  join,
  mkdtempSync,
  openclaw,
  rmSync,
  tmpdir,
  writeFileSync,
} from './helpers/test-helpers.js';
import { installMetaForAgent } from '../../src/runtimes/metadata.js';

// Regression guard for PR #2556 review (@mrcfps, @Siri-Ray). Both
// reviewers asked, independently and minutes apart, that the OpenClaw
// adapter not advertise a bare-`openclaw` fallback for chat spawn:
// `resolveAgentExecutable` walks `[def.bin, ...def.fallbackBins]`
// looking for a launchable binary, and the same resolution path is
// reused for both detection AND the actual chat spawn. With
// `fallbackBins: ['openclaw']` left in, OD would mark OpenClaw
// `available: true` whenever a user had the official OpenClaw CLI on
// PATH but not the `openclaw-acp-shim` wrapper \u2014 and then chat spawn
// would launch bare `openclaw acp`, which hits the stdin-EOF
// disconnect mid-`session/new` documented inline in
// `defs/openclaw.ts`. So the user would see "OpenClaw available" in
// the picker and then have every session die immediately.
//
// The fix is to drop the `fallbackBins` entry entirely so the runtime
// only surfaces when the shim is actually present, and to populate
// `installMetaForAgent('openclaw')` so the unavailable-agent record
// carries an install hint to the picker.
//
// Following PR #2557 review style (@PerishCode): assertions are
// written as invariants on the resolved behaviour, not as
// `deepEqual`/magic-string comparisons against the AGENT_DEF. A later
// adapter tweak that, say, renames the shim or adds an unrelated
// declarative field shouldn't turn this suite red \u2014 only a
// regression that lets bare `openclaw` win chat-spawn resolution, or
// that hides the install hint, should.

const fsTest = process.platform === 'win32' ? test.skip : test;

// --- Invariant 1: no bare-`openclaw` fallback at the adapter level. ---
//
// This is the declarative half. `fallbackBins` is read by
// `resolveAgentExecutable` (and by extension every detection /
// chat-spawn caller), so if it ever contains `'openclaw'` again, the
// known-broken bare-CLI path is back on the menu regardless of what
// the comment block says.

test('openclaw adapter does not declare a bare `openclaw` fallback bin', () => {
  const fallbacks = Array.isArray(openclaw.fallbackBins)
    ? openclaw.fallbackBins
    : [];
  assert.ok(
    !fallbacks.includes('openclaw'),
    `openclaw.fallbackBins must not include 'openclaw' \u2014 the bare CLI hits the stdin-EOF disconnect mid-session/new; got ${JSON.stringify(fallbacks)}`,
  );
});

// --- Invariant 2: resolution-layer behaviour with shim missing. ---
//
// The declarative invariant above is necessary but not sufficient: a
// future refactor could introduce a different bare-`openclaw`
// fallback (env var override, hard-coded second candidate, etc.) and
// still satisfy "fallbackBins doesn't include openclaw". Pin the
// observable resolution behaviour: when only the bare `openclaw` CLI
// exists on PATH and no shim is present, `selectedPath` is null. Any
// future code path that resurrects bare-`openclaw` chat spawn fails
// here even if it bypasses `fallbackBins`.

fsTest(
  'inspectAgentExecutableResolution returns null when only bare `openclaw` is on PATH',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-openclaw-shim-missing-'));
    try {
      // Only the official OpenClaw CLI exists; the shim is absent
      // \u2014 the exact "user installed OpenClaw but not the shim"
      // setup the reviewers flagged.
      writeFileSync(join(dir, 'openclaw'), '');
      chmodSync(join(dir, 'openclaw'), 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const resolution = inspectAgentExecutableResolution(openclaw);
      assert.equal(
        resolution.selectedPath,
        null,
        'bare `openclaw` must not be picked as the chat-spawn binary',
      );
      assert.equal(
        resolution.pathResolvedPath,
        null,
        'no PATH candidate should resolve when only bare `openclaw` is present',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

// --- Invariant 3: resolution still works when the shim *is* present. ---
//
// Belt-and-braces: dropping `fallbackBins` shouldn't accidentally make
// the happy path stop working. With `openclaw-acp-shim` on PATH,
// resolution still selects it. This guards against a future
// over-correction (e.g. dropping `bin` itself, or renaming it without
// the test catching the typo).

fsTest(
  'inspectAgentExecutableResolution selects the shim when it is on PATH',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'od-openclaw-shim-present-'));
    try {
      writeFileSync(join(dir, 'openclaw-acp-shim'), '');
      chmodSync(join(dir, 'openclaw-acp-shim'), 0o755);
      // Also include the bare CLI to prove resolution prefers / requires
      // the shim and isn't quietly satisfied by the bare binary.
      writeFileSync(join(dir, 'openclaw'), '');
      chmodSync(join(dir, 'openclaw'), 0o755);
      process.env.OD_AGENT_HOME = dir;
      process.env.PATH = dir;

      const resolution = inspectAgentExecutableResolution(openclaw);
      assert.equal(
        resolution.selectedPath,
        join(dir, 'openclaw-acp-shim'),
        'the shim must be picked as the chat-spawn binary when present',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

// --- Invariant 4: install hint is surfaced when the runtime is unavailable. ---
//
// `unavailableAgent(def)` in `detection.ts` spreads
// `installMetaForAgent(def.id)` into the DetectedAgent payload \u2014
// that's the field the picker reads to render "OpenClaw is not
// installed \u2192 see install instructions." Without an entry in
// `AGENT_INSTALL_LINKS`, the unavailable record carries no link and
// the user has no idea why OpenClaw is missing or how to fix it. The
// reviewers explicitly asked for "an install hint instead of falling
// back to bare `openclaw`."

test('installMetaForAgent("openclaw") surfaces an https install hint for the shim', () => {
  const meta = installMetaForAgent('openclaw');
  assert.ok(
    meta.installUrl,
    'openclaw must surface an installUrl so the picker can tell users how to recover when the shim is missing',
  );
  assert.ok(
    meta.installUrl?.startsWith('https://'),
    `openclaw installUrl must be an https URL (metadata.ts sanitizes non-https); got ${meta.installUrl ?? '<unset>'}`,
  );
});
