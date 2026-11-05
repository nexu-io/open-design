import { afterEach, expect, it, vi } from 'vitest';
import { openReferralActivity } from '../../src/runtime/referral-navigation';
const open = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../src/providers/registry', () => ({ openExternalUrl: open }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('does not open the browser when the client account changed during identity lookup', async () => {
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({ appUserId: 'prior-account' })));
 expect(await openReferralActivity('local', () => false)).toBe(false);
 expect(open).not.toHaveBeenCalled();
});
it('does not open an unguarded activity URL if current identity cannot be verified', async () => {
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'unavailable' }, { status: 401 })));
 await expect(openReferralActivity('local')).rejects.toThrow('Referral account unavailable');
 expect(open).not.toHaveBeenCalled();
});
