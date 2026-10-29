// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { ReferralEntry, ReferralEntryProvider } from '../../src/components/ReferralEntry';

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
  await waitFor(() => expect(open).toHaveBeenCalledWith('https://example.test/cloud/reset?source=open_design&campaign=x&expectedAppUserId=account-a'));
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
