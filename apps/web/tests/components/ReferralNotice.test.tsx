// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { ReferralNotice } from '../../src/components/ReferralNotice';
const track = vi.hoisted(() => vi.fn());
vi.mock('../../src/analytics/provider', () => ({ useAnalytics: () => ({ track }) }));
const base = {
 serverTime: new Date().toISOString(), campaignStatus: 'active', canShare: false,
 shareBlockReason: 'free', inviteUrl: null, inviterIssuedCount: 0, inviterRewardLimit: 5,
 inviteeIssuedCount: 0, availableCardCount: 0,
 invitee: { status: 'pending', purchaseDeadline: null, dueAt: new Date(Date.now() - 1000).toISOString() },
};
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); track.mockClear(); });
it.each([-1000, 60000])('OPEND-4675 never renders a pending reward notice at due offset %s', async (offset) => {
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({...base, invitee:{...base.invitee,dueAt:new Date(Date.now()+offset).toISOString()}})));
 render(<I18nProvider initial="en"><ReferralNotice accountId="pending" profile="local" active context={null} billing={null} /></I18nProvider>);
 const { act } = await import('@testing-library/react');
 await act(async () => {});
 expect(screen.queryByTestId('referral-notice')).toBeNull();
});
it('OPEND-4674 persists dismissal across remounts and isolates accounts', async () => {
 const { fireEvent } = await import('@testing-library/react');
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({...base,invitee:{...base.invitee,status:'registered',purchaseDeadline:new Date(Date.now()+60000).toISOString(),dueAt:null}})));
 const view = (id:string) => <I18nProvider initial="en"><ReferralNotice accountId={id} profile="local" active context={null} billing={null} /></I18nProvider>;
 const first = render(view('persist'));
 fireEvent.click(await screen.findByRole('button',{name:'Dismiss reset card notice'}));
 expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({
  area: 'referral_notice', entry_source: 'client_home', notice_state: 'registered', element: 'close',
 }));
 expect(localStorage.getItem('od:referral-notice:local:persist:registered')).toBe('dismissed');
 first.unmount();
 const second = render(view('persist'));
 expect((await screen.findByTestId('referral-notice')).getAttribute('aria-hidden')).toBe('true');
 second.unmount();
 render(view('other'));
 expect((await screen.findByTestId('referral-notice')).getAttribute('aria-hidden')).toBeNull();
});

it('opens the selected environment for the subscription action', async () => {
 const openExternalUrl = vi.spyOn(await import('../../src/providers/registry'), 'openExternalUrl').mockResolvedValue(true);
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({...base, invitee: {...base.invitee, status:'registered', purchaseDeadline: new Date(Date.now() + 60000).toISOString(), dueAt:null}})));
 render(<I18nProvider initial="en"><ReferralNotice accountId="env-test" profile="local" consoleOrigin="http://localhost:5173" active context={null} billing={null} /></I18nProvider>);
 const { fireEvent, waitFor } = await import('@testing-library/react');
 fireEvent.click(await screen.findByRole('button', {name: 'Subscribe'}));
 expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({
  area: 'referral_notice', entry_source: 'client_home', notice_state: 'registered', element: 'subscribe',
 }));
 await waitFor(() => expect(openExternalUrl).toHaveBeenCalled());
 const url = new URL(openExternalUrl.mock.calls[0]?.[0] ?? '');
 expect(url.origin).toBe('http://localhost:5173');
 expect(url.searchParams.get('billing')).toBe('plan');
 expect(url.searchParams.get('source')).toBe('open_design');
 openExternalUrl.mockRestore();
});

it('OPEND-4674 reads a dismissal saved by a previous client session', async () => {
 localStorage.setItem('od:referral-notice:local:previous-session:registered', 'dismissed');
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({...base, invitee: {...base.invitee,status:'registered',purchaseDeadline:new Date(Date.now()+60000).toISOString(),dueAt:null}})));
 render(<I18nProvider initial="en"><ReferralNotice accountId="previous-session" profile="local" active context={null} billing={null} /></I18nProvider>);
 expect((await screen.findByTestId('referral-notice')).getAttribute('aria-hidden')).toBe('true');
});

it('OPEND-4735 does not advertise time remaining after a delayed summary response', async () => {
 const { act } = await import('@testing-library/react');
 const wallClock = Date.now();
 let elapsed = 0;
 const monotonic = vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
 const wall = vi.spyOn(Date, 'now').mockReturnValue(wallClock);
 try {
  vi.stubGlobal('fetch', vi.fn(async () => {
   elapsed += 2500;
   wall.mockReturnValue(wallClock - 2000);
   return Response.json({
    ...base,
    serverTime: new Date(wallClock).toISOString(),
    invitee: { status: 'registered', purchaseDeadline: new Date(wallClock + 1500).toISOString(), dueAt: null },
   });
  }));
  render(<I18nProvider initial="en"><ReferralNotice accountId="delayed-summary" profile="local" active context={null} billing={null} /></I18nProvider>);
  await act(async () => {});
  expect(fetch).toHaveBeenCalled();
  expect(screen.queryByTestId('referral-notice')).toBeNull();
 } finally {
  monotonic.mockRestore();
  wall.mockRestore();
 }
});

it('records one exposure for a visible notice and skips a dismissed notice on remount', async () => {
 const observe = vi.fn();
 const disconnect = vi.fn();
 let notify: IntersectionObserverCallback | undefined;
 vi.stubGlobal('IntersectionObserver', class {
  constructor(callback: IntersectionObserverCallback) { notify = callback; }
  observe = observe;
  disconnect = disconnect;
 });
 const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
 try {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
   ...base,
   invitee: { ...base.invitee, status: 'registered', purchaseDeadline: new Date(Date.now() + 60000).toISOString() },
  })));
  const view = <I18nProvider initial="en"><ReferralNotice accountId="exposure" profile="local" active context={null} billing={null} /></I18nProvider>;
  const mounted = render(view);
  const notice = await screen.findByTestId('referral-notice');
  expect(observe).toHaveBeenCalledWith(notice);
  const intersect = () => notify?.(
   [{ isIntersecting: true } as IntersectionObserverEntry],
   {} as IntersectionObserver,
  );
  act(intersect);
  expect(track).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  fireEvent(document, new Event('visibilitychange'));
  act(intersect);
  expect(track).toHaveBeenCalledExactlyOnceWith('surface_view', expect.objectContaining({
   area: 'referral_notice', entry_source: 'client_home', notice_state: 'registered', element: 'notice',
   surface_instance_id: expect.any(String),
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss reset card notice' }));
  expect(disconnect).toHaveBeenCalled();
  mounted.unmount();
  render(view);
  expect((await screen.findByTestId('referral-notice')).getAttribute('aria-hidden')).toBe('true');
  expect(observe).toHaveBeenCalledOnce();
 } finally {
  visibility.mockRestore();
 }
});
