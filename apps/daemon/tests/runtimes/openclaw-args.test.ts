import { test } from 'vitest';
import {
  assert,
  openclaw,
  withEnvSnapshot,
} from './helpers/test-helpers.js';

// Regression guard for PR #2556 review (@Siri-Ray). The OpenClaw adapter
// reads `OD_OPENCLAW_SESSION` from two places — `fetchModels` reads it
// from the env passed into the live model probe, and `buildArgs` reads
// it from `runtimeContext.env` (with a `process.env` fallback). The two
// paths must agree on the same source so that the session a user
// configures via OD's per-agent CLI env settings is the same session
// the model picker enumerates AND the spawned chat sends `session/new`
// against. Argv overrides env at the gateway, so if `buildArgs` read
// `process.env` while the user configured the override via OD agent
// env settings, real chat work would route to `agent:main:main` while
// model discovery enumerated the configured session.
//
// Assertions are intentionally written as invariants on the resolved
// session value (and the `--session` flag's presence) rather than as
// `deepEqual` checks against the full argv array. PR #2557 review
// (@PerishCode): invariant-style assertions "guard intent without
// making a future value tweak look like a regression" — adding an
// unrelated flag (`--quiet`, `--cwd`, etc.) to `buildArgs` later
// should not turn this suite red.

function sessionArgOf(args: readonly string[]): string | undefined {
  const i = args.indexOf('--session');
  if (i < 0) return undefined;
  return args[i + 1];
}

function modelArgOf(args: readonly string[]): string | undefined {
  const i = args.indexOf('--model');
  if (i < 0) return undefined;
  return args[i + 1];
}

test('openclaw buildArgs uses runtimeContext.env for OD_OPENCLAW_SESSION', () => {
  withEnvSnapshot(['OD_OPENCLAW_SESSION'], () => {
    // Intentionally clear the host env so we don't accidentally fall
    // through to `process.env` and pass the assertion for the wrong
    // reason.
    delete process.env.OD_OPENCLAW_SESSION;

    const args = openclaw.buildArgs(
      '',
      [],
      [],
      {},
      {
        cwd: '/tmp/od-project',
        env: { OD_OPENCLAW_SESSION: 'agent:designs:hero' },
      },
    );

    assert.equal(args[0], 'acp', 'first arg is the acp subcommand');
    assert.equal(
      sessionArgOf(args),
      'agent:designs:hero',
      'session value comes from runtimeContext.env',
    );
  });
});

test('openclaw buildArgs prefers runtimeContext.env over process.env', () => {
  // Demonstrates the bug @Siri-Ray flagged: if both are set and the
  // adapter reads `process.env`, the configured override is silently
  // dropped at argv-build time.
  withEnvSnapshot(['OD_OPENCLAW_SESSION'], () => {
    process.env.OD_OPENCLAW_SESSION = 'agent:host:main';

    const args = openclaw.buildArgs(
      '',
      [],
      [],
      {},
      {
        cwd: '/tmp/od-project',
        env: { OD_OPENCLAW_SESSION: 'agent:user:override' },
      },
    );

    assert.equal(
      sessionArgOf(args),
      'agent:user:override',
      'runtimeContext.env wins over process.env',
    );
  });
});

test('openclaw buildArgs falls back to process.env when runtimeContext.env is absent', () => {
  // Older callsites (connectionTest, memory-llm) still pass `{ cwd }`
  // only. Those code paths don't exercise OpenClaw today, but the
  // fallback keeps the adapter safe if someone wires a new caller
  // without populating `runtimeContext.env`.
  withEnvSnapshot(['OD_OPENCLAW_SESSION'], () => {
    process.env.OD_OPENCLAW_SESSION = 'agent:env:fallback';

    const args = openclaw.buildArgs(
      '',
      [],
      [],
      {},
      { cwd: '/tmp/od-project' },
    );

    assert.equal(sessionArgOf(args), 'agent:env:fallback');
  });
});

test('openclaw buildArgs falls back to agent:main:main with no override', () => {
  withEnvSnapshot(['OD_OPENCLAW_SESSION'], () => {
    delete process.env.OD_OPENCLAW_SESSION;

    const args = openclaw.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

    assert.equal(
      sessionArgOf(args),
      'agent:main:main',
      'canonical default session when neither env source supplies one',
    );
  });
});

test('openclaw buildArgs forwards model override when set', () => {
  withEnvSnapshot(['OD_OPENCLAW_SESSION'], () => {
    delete process.env.OD_OPENCLAW_SESSION;

    const args = openclaw.buildArgs(
      '',
      [],
      [],
      { model: 'anthropic/claude-sonnet-4-5' },
      {
        cwd: '/tmp/od-project',
        env: { OD_OPENCLAW_SESSION: 'agent:designs:hero' },
      },
    );

    assert.equal(sessionArgOf(args), 'agent:designs:hero');
    assert.equal(modelArgOf(args), 'anthropic/claude-sonnet-4-5');
  });
});

test('openclaw buildArgs skips --model when default is selected', () => {
  // The model picker surfaces "Default (CLI config)" as id `default`,
  // and OpenClaw's own routing config picks the real model. We must
  // not pass `--model default` through, which OpenClaw would treat as
  // a literal model id and fail to resolve.
  const args = openclaw.buildArgs(
    '',
    [],
    [],
    { model: 'default' },
    {
      cwd: '/tmp/od-project',
      env: { OD_OPENCLAW_SESSION: 'agent:main:main' },
    },
  );

  assert.equal(
    args.includes('--model'),
    false,
    '`--model default` would route to a literal model id; must be elided',
  );
});

// PR #2556 review (@mrcfps): connectionTest.ts also calls buildArgs —
// verify that it honours runtimeContext.env the same way server.ts does,
// so "Test connection" targets the user-configured session rather than
// falling back to process.env / agent:main:main.
test('openclaw buildArgs honours runtimeContext.env in connection-test shape (cwd + env)', () => {
  withEnvSnapshot(['OD_OPENCLAW_SESSION'], () => {
    // Simulate connectionTest.ts passing merged env — the same shape
    // the fix now threads through.
    process.env.OD_OPENCLAW_SESSION = 'agent:host:stale';

    const args = openclaw.buildArgs(
      '',
      [],
      [],
      { model: null, reasoning: null },
      {
        cwd: '/tmp/od-connection-test',
        env: { OD_OPENCLAW_SESSION: 'agent:conntest:override' },
      },
    );

    assert.equal(
      sessionArgOf(args),
      'agent:conntest:override',
      'connection-test buildArgs must prefer runtimeContext.env over process.env',
    );
  });
});
