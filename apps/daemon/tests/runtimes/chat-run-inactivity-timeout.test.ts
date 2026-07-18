/**
 * Per-agent inactivity-timeout resolution (#2467).
 *
 * The chat-run inactivity watchdog defaults to 10 minutes. Some agents
 * (GitHub Copilot CLI) genuinely stay silent for longer than that on
 * heavy deck-generation turns — the model is still working but emits
 * no stdout, so the watchdog used to kill the run as `stalled` even
 * though the agent was healthy.
 *
 * Runtime defs can now advertise a recommended `inactivityTimeoutMs`,
 * and the resolver merges it under the env override:
 *
 *   OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS   highest priority (operator override)
 *   def.inactivityTimeoutMs             next (agent-specific recommendation)
 *   DEFAULT_CHAT_RUN_INACTIVITY_TIMEOUT_MS (10 min)   global default
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  assertValidRuntimeDefInactivityTimeoutMs,
  resolveAcpStageTimeoutMs,
  resolveChatRunInactivityTimeoutMs,
} from '../../src/server.js';
import { amrAgentDef } from '../../src/runtimes/defs/amr.js';
import { copilotAgentDef } from '../../src/runtimes/defs/copilot.js';

const ENV_KEY = 'OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS';
const TEN_MINUTES_MS = 10 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

describe('resolveChatRunInactivityTimeoutMs', () => {
  const originalEnv = process.env[ENV_KEY];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
  });

  it('returns the 10-minute global default when no def hint and no env override are set', () => {
    delete process.env[ENV_KEY];
    expect(resolveChatRunInactivityTimeoutMs()).toBe(TEN_MINUTES_MS);
  });

  it('uses the def-level hint when env is unset', () => {
    delete process.env[ENV_KEY];
    expect(resolveChatRunInactivityTimeoutMs(THIRTY_MINUTES_MS)).toBe(THIRTY_MINUTES_MS);
  });

  it('lets the env override take precedence over the def hint (operator escape hatch)', () => {
    // Operators must be able to shrink or lengthen the watchdog for any
    // agent without editing source — diagnosing flaky CLIs, taming runaway
    // sessions, etc.
    process.env[ENV_KEY] = '900000'; // 15 min
    expect(resolveChatRunInactivityTimeoutMs(THIRTY_MINUTES_MS)).toBe(900_000);
  });

  it('falls back to the def hint when the env value is not a finite number', () => {
    process.env[ENV_KEY] = 'not-a-number';
    expect(resolveChatRunInactivityTimeoutMs(THIRTY_MINUTES_MS)).toBe(THIRTY_MINUTES_MS);
  });

  it('still honors env=0 to disable the watchdog entirely', () => {
    // Existing behavior the watchdog code already supports — preserve it
    // even when an agent def would otherwise contribute a larger value.
    process.env[ENV_KEY] = '0';
    expect(resolveChatRunInactivityTimeoutMs(THIRTY_MINUTES_MS)).toBe(0);
  });

  it('clamps an oversized env override to the 24-hour ceiling so Node does not fire the timer immediately', () => {
    process.env[ENV_KEY] = String(TWENTY_FOUR_HOURS_MS * 100);
    expect(resolveChatRunInactivityTimeoutMs()).toBe(TWENTY_FOUR_HOURS_MS);
  });

  it('clamps an oversized def hint to the 24-hour ceiling for the same reason', () => {
    delete process.env[ENV_KEY];
    expect(resolveChatRunInactivityTimeoutMs(TWENTY_FOUR_HOURS_MS * 100)).toBe(TWENTY_FOUR_HOURS_MS);
  });

  it('throws RangeError on a non-finite def hint — runtime defs are checked-in source and a typo must fail loudly, not silently disable the watchdog', () => {
    // The previous draft normalized NaN/Infinity to the global default,
    // which made a runtime def like `inactivityTimeoutMs: Number.NaN`
    // look fine in source review while quietly losing the agent-specific
    // ceiling at runtime. The reviewer-correctness fix: fast-fail on the
    // checked-in side so the bug surfaces in dev, not in production logs.
    delete process.env[ENV_KEY];
    expect(() => resolveChatRunInactivityTimeoutMs(Number.NaN)).toThrow(
      /RuntimeAgentDef\.inactivityTimeoutMs/,
    );
  });

  it('throws RangeError on a negative def hint — `-1` would silently disable the agent-specific watchdog otherwise', () => {
    delete process.env[ENV_KEY];
    expect(() => resolveChatRunInactivityTimeoutMs(-1)).toThrow(
      /must be a non-negative integer/,
    );
  });

  it('throws RangeError on a fractional def hint — Math.floor would mask a wrong-units typo (e.g. seconds instead of ms)', () => {
    // A def value like `inactivityTimeoutMs: 30` (seconds, written
    // forgetting the unit is ms) is a real footgun; refusing
    // non-integer floats keeps such typos from getting silently
    // floored to a 0ms or 30ms timer. Operators can still pass
    // anything via the env override.
    delete process.env[ENV_KEY];
    expect(() => resolveChatRunInactivityTimeoutMs(60.5)).toThrow(
      /must be a non-negative integer/,
    );
  });

  it('keeps the env override lenient when its value is bogus and no def hint is provided (falls back to the global default)', () => {
    // env comes from operator-supplied configuration that can be
    // mistyped at any time. Unlike the def path it must not crash the
    // chat run — fall back to the 10-minute default instead.
    process.env[ENV_KEY] = 'not-a-number';
    expect(resolveChatRunInactivityTimeoutMs()).toBe(TEN_MINUTES_MS);
  });

  it('still throws on an invalid def hint when a finite env override is also set — the env must not hide a checked-in typo', () => {
    // Reviewer-correctness fix: an earlier ordering placed the env
    // early-return before the def validation, so a bad runtime def
    // could sit unnoticed in source whenever an operator had set
    // OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS. The fast-fail now runs first
    // and catches the typo regardless of which branch eventually
    // wins.
    process.env[ENV_KEY] = '15000';
    expect(() => resolveChatRunInactivityTimeoutMs(-1)).toThrow(
      /must be a non-negative integer/,
    );
  });

  it('returns the env override when both the env and a valid def hint are provided (env wins as operator escape hatch)', () => {
    // Sanity: validation order does not change priority — env still
    // wins when both are valid.
    process.env[ENV_KEY] = '15000';
    expect(resolveChatRunInactivityTimeoutMs(THIRTY_MINUTES_MS)).toBe(15_000);
  });
});

describe('resolveAcpStageTimeoutMs', () => {
  const originalEnv = process.env.OD_ACP_STAGE_TIMEOUT_MS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OD_ACP_STAGE_TIMEOUT_MS;
    } else {
      process.env.OD_ACP_STAGE_TIMEOUT_MS = originalEnv;
    }
  });

  it('leaves the ACP session default untouched when no env override or def hint is set', () => {
    delete process.env.OD_ACP_STAGE_TIMEOUT_MS;
    expect(resolveAcpStageTimeoutMs()).toBeUndefined();
  });

  it('uses the runtime inactivity hint when the ACP env override is unset', () => {
    delete process.env.OD_ACP_STAGE_TIMEOUT_MS;
    expect(resolveAcpStageTimeoutMs(THIRTY_MINUTES_MS)).toBe(THIRTY_MINUTES_MS);
  });

  it('lets the ACP env override take precedence over the runtime inactivity hint', () => {
    process.env.OD_ACP_STAGE_TIMEOUT_MS = '900000';
    expect(resolveAcpStageTimeoutMs(THIRTY_MINUTES_MS)).toBe(900_000);
  });

  it('throws on an invalid runtime inactivity hint so ACP and chat watchdog config cannot drift silently', () => {
    delete process.env.OD_ACP_STAGE_TIMEOUT_MS;
    expect(() => resolveAcpStageTimeoutMs(Number.NaN)).toThrow(
      /RuntimeAgentDef\.inactivityTimeoutMs/,
    );
  });
});

describe('copilotAgentDef.inactivityTimeoutMs', () => {
  it('ships a 30-minute inactivity hint so Copilot silent-thinking phases do not trip the default watchdog (#2467)', () => {
    expect(copilotAgentDef.inactivityTimeoutMs).toBe(THIRTY_MINUTES_MS);
  });
});

describe('amrAgentDef.inactivityTimeoutMs', () => {
  it('ships a 30-minute inactivity hint so the outer chat watchdog matches ACP stage timeouts for slow upstream providers', () => {
    expect(amrAgentDef.inactivityTimeoutMs).toBe(THIRTY_MINUTES_MS);
  });
});

describe('assertValidRuntimeDefInactivityTimeoutMs (#2579 fast-fail at def-select time)', () => {
  // Reviewer-correctness fix (#2579 non-blocking, round 3): the
  // strict checked-in-config check must run *immediately* after the
  // runtime def is selected, before any side-effectful setup
  // (`.mcp.json` write/unlink, prompt composition, file writes) so
  // that an invalid checked-in `inactivityTimeoutMs` aborts the run
  // before leaving partial state behind. The assert helper is the
  // pure entry point chat-run startup can call without also touching
  // env-resolution side effects.

  it('returns silently when the def hint is omitted (no-op for adapters without the field)', () => {
    expect(() => assertValidRuntimeDefInactivityTimeoutMs()).not.toThrow();
    expect(() => assertValidRuntimeDefInactivityTimeoutMs(undefined)).not.toThrow();
  });

  it('returns silently for a valid non-negative integer (e.g. Copilot 30 min)', () => {
    expect(() => assertValidRuntimeDefInactivityTimeoutMs(THIRTY_MINUTES_MS)).not.toThrow();
    expect(() => assertValidRuntimeDefInactivityTimeoutMs(0)).not.toThrow();
  });

  it('throws on NaN / Infinity — bad checked-in source must surface, not be silently normalized', () => {
    expect(() => assertValidRuntimeDefInactivityTimeoutMs(Number.NaN)).toThrow(
      /must be a non-negative integer/,
    );
    expect(() => assertValidRuntimeDefInactivityTimeoutMs(Number.POSITIVE_INFINITY)).toThrow(
      /must be a non-negative integer/,
    );
  });

  it('throws on a negative def value (typo footgun)', () => {
    expect(() => assertValidRuntimeDefInactivityTimeoutMs(-1)).toThrow(
      /must be a non-negative integer/,
    );
  });

  it('throws on a fractional def value (wrong-units typo, e.g. seconds instead of ms)', () => {
    expect(() => assertValidRuntimeDefInactivityTimeoutMs(60.5)).toThrow(
      /must be a non-negative integer/,
    );
  });

  it('throws specifically `RangeError` for every invalid def value — the chat-run startup wrapper relies on this to narrow its catch and only flag AGENT_RUNTIME_DEF_INVALID for genuine validation failures (#2579 round-5 review)', () => {
    // The wrapper in server.ts now does:
    //   try { assertValidRuntimeDefInactivityTimeoutMs(...) }
    //   catch (err) {
    //     if (err instanceof RangeError) → AGENT_RUNTIME_DEF_INVALID
    //     else throw err
    //   }
    // If the helper ever starts throwing TypeError / generic Error
    // (e.g. an unrelated bug inside it, or a refactor that wraps the
    // RangeError), the wrapper would either misroute the failure
    // (the old `err instanceof Error` catch did) or skip the
    // structured fail entirely. Pin the error class so the contract
    // between helper and wrapper cannot drift silently.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 60.5]) {
      expect(() => assertValidRuntimeDefInactivityTimeoutMs(bad)).toThrow(RangeError);
    }
  });

  it('runs independently of the env override — an env value cannot mask the typo', () => {
    const originalEnv = process.env[ENV_KEY];
    process.env[ENV_KEY] = '15000';
    try {
      expect(() => assertValidRuntimeDefInactivityTimeoutMs(-1)).toThrow(
        /must be a non-negative integer/,
      );
    } finally {
      if (originalEnv === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = originalEnv;
    }
  });
});
