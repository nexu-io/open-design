import { openExternalUrl } from '../providers/registry';
import { amrReferralUrlForProfile } from './amr-guidance';

/** Read the authenticated app-user identity rather than the cached auth-user ID.
 * The browser compares this hint with its own session; it grants no authority. */
export async function openReferralActivity(profile: string | null, isCurrent: () => boolean = () => true): Promise<boolean> {
  const response = await fetch('/api/integrations/vela/referral-account', {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Referral account unavailable');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || !('appUserId' in value)
    || typeof value.appUserId !== 'string' || !value.appUserId || value.appUserId.length > 128) {
    throw new Error('Invalid referral account');
  }
  if (!isCurrent()) return false;
  return openExternalUrl(amrReferralUrlForProfile(profile, value.appUserId));
}
