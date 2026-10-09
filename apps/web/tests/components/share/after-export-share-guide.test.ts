import { describe, expect, it } from 'vitest';
import { advanceShareGuideClock, canOfferAfterExportShareGuide, createExportSuccessGate, createShareGuidePreference, startShareGuideClock } from '../../../src/components/share/after-export-share-guide';

const eligible = { result: 'success' as const, originScope: 'account/project/file', currentScope: 'account/project/file', hasEverShared: false, neverShow: false, canOpenShare: true };

describe('after-export share guide eligibility', () => {
  it('accepts only a confirmed successful export of the current eligible scope', () => {
    expect(canOfferAfterExportShareGuide(eligible)).toBe(true);
  });
  it.each(['cancelled', 'failed'] as const)('does not show for %s', result => {
    expect(canOfferAfterExportShareGuide({ ...eligible, result })).toBe(false);
  });
  it.each([true, null] as const)('does not guess never-shared from history %s', hasEverShared => {
    expect(canOfferAfterExportShareGuide({ ...eligible, hasEverShared })).toBe(false);
  });
  it.each(['other-account/project/file', 'account/other-project/file', 'account/project/other-file'])('fences stale completion for %s', currentScope => {
    expect(canOfferAfterExportShareGuide({ ...eligible, currentScope })).toBe(false);
  });
  it('respects preference and unavailable share entry independently', () => {
    expect(canOfferAfterExportShareGuide({ ...eligible, neverShow: true })).toBe(false);
    expect(canOfferAfterExportShareGuide({ ...eligible, canOpenShare: false })).toBe(false);
  });
});

describe('after-export share guide clock', () => {
  const idle = { hovered: false, focused: false };
  it('expires at exactly ten seconds, not before', () => {
    const initial = startShareGuideClock(100);
    const before = advanceShareGuideClock(initial, 10_099, idle);
    expect(before.remainingMs).toBe(1);
    expect(advanceShareGuideClock(before, 10_100, idle).remainingMs).toBe(0);
  });
  it('pauses while either hover or focus remains and resumes the remainder', () => {
    let clock = advanceShareGuideClock(startShareGuideClock(0), 3_000, { hovered: true, focused: false });
    expect(clock.remainingMs).toBe(7_000);
    clock = advanceShareGuideClock(clock, 20_000, { hovered: true, focused: true });
    clock = advanceShareGuideClock(clock, 30_000, { hovered: false, focused: true });
    expect(clock.remainingMs).toBe(7_000);
    clock = advanceShareGuideClock(clock, 40_000, idle);
    expect(clock.remainingMs).toBe(7_000);
    expect(advanceShareGuideClock(clock, 46_999, idle).remainingMs).toBe(1);
    expect(advanceShareGuideClock(clock, 47_000, idle).remainingMs).toBe(0);
  });
  it('does not revive an expired guide when focus arrives', () => {
    const expired = advanceShareGuideClock(startShareGuideClock(0), 11_000, idle);
    expect(advanceShareGuideClock(expired, 12_000, { hovered: true, focused: true }).remainingMs).toBe(0);
  });
});


describe('one export completion', () => {
  it('notifies a success once even if completion is repeated', () => {
    const accept = createExportSuccessGate('scope-A', () => 'scope-A');
    expect(accept('success')).toBe(true);
    expect(accept('success')).toBe(false);
  });
  it.each(['cancelled', 'failed'] as const)('never promotes %s to a later success', result => {
    const accept = createExportSuccessGate('scope-A', () => 'scope-A');
    expect(accept(result)).toBe(false);
    expect(accept('success')).toBe(false);
  });
  it('does not deliver into another identity, project, or file', () => {
    let current = 'scope-A';
    const accept = createExportSuccessGate(current, () => current);
    current = 'scope-B';
    expect(accept('success')).toBe(false);
  });
});

describe('identity-isolated never-show preference adapter', () => {
  function memoryStorage() {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  }
  it('persists only explicit opt-out across instances without leaking to another identity', () => {
    const storage = memoryStorage();
    const first = createShareGuidePreference(() => storage, 'account-a');
    expect(first.read()).toBe(false);
    // Closing a single guide never calls suppress().
    expect(createShareGuidePreference(() => storage, 'account-a').read()).toBe(false);
    expect(first.suppress()).toBe(true);
    expect(createShareGuidePreference(() => storage, 'account-a').read()).toBe(true);
    expect(createShareGuidePreference(() => storage, 'account-b').read()).toBe(false);
  });
  it('does not persist when identity is unavailable', () => {
    const preference = createShareGuidePreference(() => memoryStorage(), null);
    expect(preference.read()).toBeNull();
    expect(preference.suppress()).toBe(false);
  });
  it('contains storage access failures and treats unreadable preference as unknown', () => {
    const preference = createShareGuidePreference(() => { throw new Error('storage blocked'); }, 'account');
    expect(preference.read()).toBeNull();
    expect(preference.suppress()).toBe(false);
    expect(canOfferAfterExportShareGuide({ ...eligible, neverShow: null })).toBe(false);
  });
});
