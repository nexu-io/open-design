// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { getReferralEntryCopy } from '../../src/components/referral-entry-copy';
import { I18nProvider, LOCALES } from '../../src/i18n';
import { ReferralEntry, ReferralEntryProvider } from '../../src/components/ReferralEntry';

const track = vi.hoisted(() => vi.fn());
vi.mock('../../src/analytics/provider', () => ({ useAnalytics: () => ({ track }) }));
const open = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../../src/providers/registry', () => ({ openExternalUrl: open }));
vi.mock('../../src/runtime/amr-guidance', () => ({ amrReferralUrlForProfile: (_profile: string, id: string) => `https://example.test/cloud/reset?source=open_design&campaign=x&expectedAppUserId=${id}` }));
const summary = { serverTime: new Date().toISOString(), campaignStatus: 'active', canShare: false, shareBlockReason: 'free', inviteUrl: null, inviterIssuedCount: 0, inviterRewardLimit: 5, inviteeIssuedCount: 0, availableCardCount: 0, invitee: null };
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; vi.clearAllMocks(); });

it('shows an active campaign and opens the current environment activity page', async () => {
  globalThis.fetch = vi.fn(async (url: unknown) => Response.json(String(url).endsWith('referral-account') ? { appUserId: 'account-a' } : summary)) as typeof fetch;
  render(<I18nProvider initial="zh-CN"><ReferralEntryProvider accountId="a" profile="test"><ReferralEntry /></ReferralEntryProvider></I18nProvider>);
  fireEvent.click(await screen.findByTestId('referral-entry'));
  expect(track).toHaveBeenCalledWith('ui_click', expect.objectContaining({
    area: 'referral_entry', element: 'invite', entry_source: 'client_entry',
  }));
  await waitFor(() => expect(open).toHaveBeenCalledWith('https://example.test/cloud/reset?source=open_design&campaign=x&expectedAppUserId=account-a&entry_source=client_entry'));
});

it('hides the entry when the activity is ended or the account changes before a new response', async () => {
  globalThis.fetch = vi.fn(async (url: unknown) => Response.json(String(url).endsWith('referral-account') ? { appUserId: 'account-a' } : summary)) as typeof fetch;
  const { rerender } = render(<I18nProvider initial="en"><ReferralEntryProvider accountId="a" profile="test"><ReferralEntry /></ReferralEntryProvider></I18nProvider>);
  await screen.findByTestId('referral-entry');
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ...summary, campaignStatus: 'ended', shareBlockReason: 'ended' }))) as typeof fetch;
  rerender(<I18nProvider initial="en"><ReferralEntryProvider accountId="b" profile="test"><ReferralEntry /></ReferralEntryProvider></I18nProvider>);
  expect(screen.queryByTestId('referral-entry')).toBeNull();
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  expect(screen.queryByTestId('referral-entry')).toBeNull();
});

it('does not infer activity from an incomplete summary or failed response', async () => {
 globalThis.fetch = vi.fn(async () => Response.json({ campaignStatus: 'active' })) as typeof fetch;
 render(<I18nProvider initial="en"><ReferralEntryProvider accountId="a" profile="local"><ReferralEntry /></ReferralEntryProvider></I18nProvider>);
 await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledOnce());
 expect(screen.queryByTestId('referral-entry')).toBeNull();
});

it('hides while navigation is collapsed and restores the entry on expansion', async () => {
  globalThis.fetch = vi.fn(async () => Response.json(summary)) as typeof fetch;
  const view = (compact: boolean) => <I18nProvider initial="en"><ReferralEntryProvider accountId="a" profile="local"><ReferralEntry compact={compact} /></ReferralEntryProvider></I18nProvider>;
  const { rerender } = render(view(false));
  await screen.findByTestId('referral-entry');
  rerender(view(true));
  expect(screen.queryByTestId('referral-entry')).toBeNull();
  rerender(view(false));
  expect(screen.getAllByTestId('referral-entry')).toHaveLength(1);
});

it('OPEND-4677 localizes account lookup failures without navigating', async () => {
 globalThis.fetch = vi.fn(async (url: unknown) => String(url).endsWith('referral-account') ? new Response('',{status:503}) : Response.json(summary)) as typeof fetch;
 render(<I18nProvider initial="id"><ReferralEntryProvider accountId="a" profile="local"><ReferralEntry /></ReferralEntryProvider></I18nProvider>);
 fireEvent.click(await screen.findByTestId('referral-entry'));
 expect((await screen.findByRole('alert')).textContent).toBe('Halaman tidak dapat dibuka. Coba lagi.');
 expect(open).not.toHaveBeenCalled();
});

it.each(LOCALES.filter(locale => locale !== 'en'))('OPEND-4676/4677 provides translated entry and error in %s', async (locale) => {
 globalThis.fetch = vi.fn(async (url: unknown) => String(url).endsWith('referral-account') ? new Response('', { status: 503 }) : Response.json(summary)) as typeof fetch;
 render(<I18nProvider initial={locale}><ReferralEntryProvider accountId="localized" profile="local"><ReferralEntry /></ReferralEntryProvider></I18nProvider>);
 const entry = await screen.findByTestId('referral-entry');
 const [title, subtitle] = getReferralEntryCopy(locale);
 expect(title).not.toBe('Share OpenDesign');
 expect(subtitle).not.toBe('Earn reset cards');
 expect(entry.textContent).toContain(title);
 fireEvent.click(entry);
 const alert = await screen.findByRole('alert');
 expect(alert.textContent).toBeTruthy();
 expect(alert.textContent).not.toBe('Unable to open the page. Please try again.');
 expect(open).not.toHaveBeenCalled();
});
