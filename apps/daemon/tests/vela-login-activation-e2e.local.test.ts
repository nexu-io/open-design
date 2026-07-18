import { describe, expect, it, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  spawnVelaLogin,
  readVelaLoginStatus,
  cancelVelaLogin,
  isVelaLoginInFlight,
} from '../src/integrations/vela.js';

// REAL end-to-end of the daemon capture seam: spawn an actual `vela login`
// child, let it print the device-authorization URL/code to stdout, and assert
// readVelaLoginStatus() surfaces them while in flight. Then cancel — we never
// approve, so the user's existing login is untouched (vela only writes config
// on approval). Skipped automatically where the vela CLI isn't installed.
function shouldRunRealVelaE2E(): boolean {
  if (process.env.OD_RUN_REAL_VELA_LOGIN_E2E !== '1') return false;
  try {
    execFileSync('vela', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const maybe = shouldRunRealVelaE2E() ? describe : describe.skip;

maybe('vela login activation capture (real vela child)', () => {
  afterAll(() => {
    if (isVelaLoginInFlight()) cancelVelaLogin();
  });

  it('surfaces the real activation URL + code through readVelaLoginStatus', async () => {
    // Use the test profile so we exercise a non-prod endpoint.
    const baseEnv = { ...process.env, VELA_PROFILE: 'test' };
    await spawnVelaLogin({ baseEnv });
    expect(isVelaLoginInFlight()).toBe(true);

    // Poll up to ~12s for the daemon to capture vela's printed URL.
    let status = readVelaLoginStatus(baseEnv);
    const deadline = Date.now() + 12_000;
    while (!status.activationUrl && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
      status = readVelaLoginStatus(baseEnv);
    }

    expect(status.loginInFlight).toBe(true);
    expect(status.activationUrl).toMatch(/^https?:\/\//);
    expect(status.userCode && status.userCode.length).toBeGreaterThan(0);

    const result = cancelVelaLogin();
    expect(result.canceled).toBe(true);
  }, 20_000);
});
