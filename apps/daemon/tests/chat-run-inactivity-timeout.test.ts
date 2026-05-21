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
import { resolveChatRunInactivityTimeoutMs } from '../src/server.js';
import { copilotAgentDef } from '../src/runtimes/defs/copilot.js';

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

  it('treats a non-finite def hint as if it were absent (defends against bad runtime configs)', () => {
    delete process.env[ENV_KEY];
    expect(resolveChatRunInactivityTimeoutMs(Number.NaN)).toBe(TEN_MINUTES_MS);
  });

  it('floors negative def hints to 0 rather than scheduling a negative-delay timer', () => {
    delete process.env[ENV_KEY];
    expect(resolveChatRunInactivityTimeoutMs(-1)).toBe(0);
  });
});

describe('copilotAgentDef.inactivityTimeoutMs', () => {
  it('ships a 30-minute inactivity hint so Copilot silent-thinking phases do not trip the default watchdog (#2467)', () => {
    expect(copilotAgentDef.inactivityTimeoutMs).toBe(THIRTY_MINUTES_MS);
  });
});
