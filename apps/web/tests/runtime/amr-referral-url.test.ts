import { afterEach, expect, it } from 'vitest';
import { amrReferralUrlForProfile, setRuntimeAmrConsoleOrigin } from '../../src/runtime/amr-guidance';
afterEach(() => setRuntimeAmrConsoleOrigin(null));
it('keeps the runtime console basename and source for the referral activity', () => {
 setRuntimeAmrConsoleOrigin('https://feature.example/cloud');
 expect(amrReferralUrlForProfile('feature-test')).toBe('https://feature.example/cloud/reset?source=open_design');
});
it('uses the established local console and production console origins', () => {
 expect(amrReferralUrlForProfile('local')).toBe('http://localhost:5173/reset?source=open_design');
 expect(amrReferralUrlForProfile('prod')).toBe('https://open-design.ai/cloud/reset?source=open_design');
});

it('carries a comparison-only app-user identity with no credentials', () => {
 const url = new URL(amrReferralUrlForProfile('local', 'app-user-id'));
 expect(url.searchParams.get('expectedAppUserId')).toBe('app-user-id');
 expect(url.searchParams.has('token')).toBe(false);
});
