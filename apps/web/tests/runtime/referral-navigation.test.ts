import { afterEach, expect, it, vi } from 'vitest';
import { openReferralActivity } from '../../src/runtime/referral-navigation';
const open = vi.hoisted(() => vi.fn(async (_url: string) => true));
vi.mock('../../src/providers/registry', () => ({ openExternalUrl: open }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('does not open the browser when the client account changed during identity lookup', async () => {
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({ appUserId: 'prior-account' })));
 expect(await openReferralActivity('local', 'client_entry', () => false)).toBe(false);
 expect(open).not.toHaveBeenCalled();
});
it('does not open an unguarded activity URL if current identity cannot be verified', async () => {
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'unavailable' }, { status: 401 })));
 await expect(openReferralActivity('local', 'client_entry')).rejects.toThrow('Referral account unavailable');
 expect(open).not.toHaveBeenCalled();
});

it.each(['client_entry', 'client_home'] as const)('carries %s into the activity URL', async (source) => {
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({ appUserId: 'current-account' })));
 expect(await openReferralActivity('local', source)).toBe(true);
 const url = new URL(open.mock.calls[0]?.[0] ?? '');
 expect(url.origin).toBe('http://localhost:5173');
 expect(url.pathname).toBe('/reset');
 expect(url.searchParams.get('source')).toBe('open_design');
 expect(url.searchParams.get('entry_source')).toBe(source);
 expect(url.searchParams.get('expectedAppUserId')).toBe('current-account');
});
