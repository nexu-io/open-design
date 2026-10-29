// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { ReferralNotice } from '../../src/components/ReferralNotice';
const base = {
 serverTime: new Date().toISOString(), campaignStatus: 'active', canShare: false,
 shareBlockReason: 'free', inviteUrl: null, inviterIssuedCount: 0, inviterRewardLimit: 5,
 inviteeIssuedCount: 0, availableCardCount: 0,
 invitee: { status: 'pending', purchaseDeadline: null, dueAt: new Date(Date.now() - 1000).toISOString() },
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('H02 pending notice has neither dismiss nor subscription action', async () => {
 vi.stubGlobal('fetch', vi.fn(async () => Response.json(base)));
 render(<I18nProvider initial="en"><ReferralNotice accountId="a" profile="local" active context={null} billing={null} /></I18nProvider>);
 const notice = await screen.findByTestId('referral-notice');
 expect(notice.getAttribute('data-state')).toBe('pending');
 expect(notice.querySelector('button')).toBeNull();
});
it('removes prior account pending data while the next account is still loading', async () => {
 const fetch = vi.fn(async () => Response.json(base)); vi.stubGlobal('fetch', fetch);
 const view = (id:string) => <I18nProvider initial="en"><ReferralNotice accountId={id} profile="local" active context={null} billing={null} /></I18nProvider>;
 const { rerender } = render(view('a')); await screen.findByTestId('referral-notice');
 fetch.mockImplementation(() => new Promise(() => {})); rerender(view('b'));
 expect(screen.queryByTestId('referral-notice')).toBeNull();
});

it.each(["2028-03-01T00:02:00Z", "2028-03-01T01:00:00Z"])("renders server due time %s rather than a fixed waiting period", async (dueAt) => {
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({...base, rewardDelaySeconds:120,invitee:{...base.invitee,dueAt}})));
 render(<I18nProvider initial="en"><ReferralNotice accountId="time" profile="local" active context={null} billing={null} /></I18nProvider>);
 const notice=await screen.findByTestId('referral-notice');
 expect(notice.textContent).toContain(new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(dueAt)));
 expect(notice.textContent).not.toContain('48 hours');
});
it('uses a truthful pending fallback when the server has no due time',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({...base,invitee:{...base.invitee,dueAt:null}})));
 render(<I18nProvider initial="en"><ReferralNotice accountId="missing" profile="local" active context={null} billing={null}/></I18nProvider>);
 expect((await screen.findByTestId('referral-notice')).textContent).toContain('awaiting issuance');
});

it('opens the selected environment for the subscription action', async () => {
 const openExternalUrl = vi.spyOn(await import('../../src/providers/registry'), 'openExternalUrl').mockResolvedValue(true);
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({...base, invitee: {...base.invitee, status:'registered', purchaseDeadline: new Date(Date.now() + 60000).toISOString(), dueAt:null}})));
 render(<I18nProvider initial="en"><ReferralNotice accountId="env-test" profile="local" consoleOrigin="http://localhost:5173" active context={null} billing={null} /></I18nProvider>);
 const { fireEvent, waitFor } = await import('@testing-library/react');
 fireEvent.click(await screen.findByRole('button', {name: 'Subscribe'}));
 await waitFor(() => expect(openExternalUrl).toHaveBeenCalled());
 const url = new URL(openExternalUrl.mock.calls[0]?.[0] ?? '');
 expect(url.origin).toBe('http://localhost:5173');
 expect(url.searchParams.get('billing')).toBe('plan');
 expect(url.searchParams.get('source')).toBe('open_design');
 openExternalUrl.mockRestore();
});
