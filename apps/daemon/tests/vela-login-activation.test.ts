import { describe, expect, it } from 'vitest';
import { parseVelaLoginActivation } from '../src/integrations/vela.js';

// `vela login` is a device-authorization flow: it prints the activation URL and
// user code to stdout BEFORE it best-effort opens the browser, and warns on
// stderr when the auto-open failed (see apps/cli/internal/commands/login.go in
// the vela repo). The daemon spawns vela login headless (piped stdio) and the
// UI only ever showed a spinner, so when the browser failed to open the user
// had no URL to fall back to and stared at a 5-minute dead spinner. This parser
// recovers the URL/code/warning so the host can surface them. The expected
// stdout matches vela's exact `Fprintf` format strings.
describe('parseVelaLoginActivation', () => {
  const stdout =
    'Open this URL to continue:\n' +
    'https://app.openalternative.ai/device?user_code=AB12-CD34\n' +
    '\n' +
    'Code: AB12-CD34\n';

  it('extracts the activation URL and user code from vela login stdout', () => {
    const activation = parseVelaLoginActivation(stdout, '');
    expect(activation.activationUrl).toBe(
      'https://app.openalternative.ai/device?user_code=AB12-CD34',
    );
    expect(activation.userCode).toBe('AB12-CD34');
    expect(activation.browserOpenFailed).toBe(false);
  });

  it('flags browserOpenFailed when vela warns it could not open the browser', () => {
    const stderr =
      'Warning: could not open browser automatically: exec: "open": executable file not found in $PATH\n';
    const activation = parseVelaLoginActivation(stdout, stderr);
    expect(activation.activationUrl).toBe(
      'https://app.openalternative.ai/device?user_code=AB12-CD34',
    );
    expect(activation.browserOpenFailed).toBe(true);
  });

  it('does not mistake the user_code query param inside the URL for the Code line', () => {
    const activation = parseVelaLoginActivation(stdout, '');
    // The URL itself contains `user_code=AB12-CD34`; the parser must read the
    // code from the dedicated `Code:` line, not from the URL.
    expect(activation.userCode).toBe('AB12-CD34');
    expect(activation.activationUrl).not.toContain(' ');
  });

  it('returns nulls before vela has printed anything (slow CreateDeviceAuthorization)', () => {
    const activation = parseVelaLoginActivation('', '');
    expect(activation.activationUrl).toBeNull();
    expect(activation.userCode).toBeNull();
    expect(activation.browserOpenFailed).toBe(false);
  });
});
