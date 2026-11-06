import { describe, expect, it } from 'vitest';
import { sharedResourceIsMine } from '../../src/components/PluginsView';

const ME = 'member-me';
const OTHER = 'member-other';

describe('sharedResourceIsMine (Personal-tab ownership)', () => {
  it('is mine when the owner id matches my member id', () => {
    expect(sharedResourceIsMine({ id: 'r', ownerMemberId: ME, canUnshare: true }, ME)).toBe(true);
  });

  it('is NOT mine when someone else owns it — even if I can unshare it (admin)', () => {
    // A workspace owner/admin has canUnshare=true for anyone's resource, but that
    // does not make it their personal one. This is the reported bug: a teammate's
    // shared skill was showing in the admin's Personal tab.
    expect(sharedResourceIsMine({ id: 'r', ownerMemberId: OTHER, canUnshare: true }, ME)).toBe(false);
  });

  it('is NOT mine when the owner id matches nobody / I have no member id', () => {
    expect(sharedResourceIsMine({ id: 'r', ownerMemberId: OTHER, canUnshare: false }, ME)).toBe(false);
    expect(sharedResourceIsMine({ id: 'r', ownerMemberId: ME, canUnshare: true }, null)).toBe(false);
  });

  it('falls back to canUnshare only when the owner id is unknown', () => {
    expect(sharedResourceIsMine({ id: 'r', canUnshare: true }, ME)).toBe(true);
    expect(sharedResourceIsMine({ id: 'r', canUnshare: false }, ME)).toBe(false);
    expect(sharedResourceIsMine(undefined, ME)).toBe(false);
  });
});
