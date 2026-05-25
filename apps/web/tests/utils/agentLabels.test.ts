import { describe, expect, it } from 'vitest';

import { friendlyStatusDetail } from '../../src/utils/agentLabels';

describe('friendlyStatusDetail', () => {
  // Locks the invariant from issue #2874: the daemon's chat `start` SSE event
  // carries the resolved agent binary as `detail`, and the visible status pill
  // must not surface that absolute filesystem path. Packaged-app paths leak
  // both the install root and (on custom homebrew installs) the user's home
  // directory, so a missing transform shows up as a privacy/UX regression in
  // the running-status surface.
  const PACKAGED_VELA =
    '/Applications/Open Design Beta.app/Contents/Resources/open-design/bin/vela';
  const PACKAGED_CLAUDE =
    '/Applications/Open Design Beta.app/Contents/Resources/open-design/bin/claude';

  it('replaces a starting-status absolute path with the known agent display name', () => {
    expect(friendlyStatusDetail('starting', PACKAGED_CLAUDE)).toBe('Claude');
  });

  it('drops a starting-status absolute path when the basename is not a known agent', () => {
    expect(friendlyStatusDetail('starting', PACKAGED_VELA)).toBeUndefined();
  });

  it('drops Windows-style absolute paths under starting status', () => {
    expect(
      friendlyStatusDetail(
        'starting',
        'C:\\Program Files\\Open Design\\resources\\open-design\\bin\\unknown.exe',
      ),
    ).toBeUndefined();
  });

  it('preserves non-path details verbatim', () => {
    expect(friendlyStatusDetail('starting', 'Claude')).toBe('Claude');
    expect(friendlyStatusDetail('starting', 'claude-opus-4-7')).toBe('claude-opus-4-7');
  });

  it('preserves details on other status labels (errors and friends can mention paths)', () => {
    expect(
      friendlyStatusDetail('error', `ENOENT: ${PACKAGED_VELA}`),
    ).toBe(`ENOENT: ${PACKAGED_VELA}`);
  });

  it('returns undefined when detail is undefined or empty', () => {
    expect(friendlyStatusDetail('starting', undefined)).toBeUndefined();
    expect(friendlyStatusDetail('starting', '')).toBeUndefined();
  });
});
