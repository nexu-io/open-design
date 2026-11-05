import { it, expect } from "vitest";
import {
	referralNoticeKind,
	referralCountdown,
	parseReferralSummary,
	type ReferralSummary,
} from "@open-design/contracts";
const now = Date.parse("2026-10-26T00:00:00Z");
const base: ReferralSummary = {
	serverTime: new Date(now).toISOString(),
	campaignStatus: "active",
	canShare: true,
	shareBlockReason: null,
	inviteUrl: "https://example.com/register?ref=a",
	inviterIssuedCount: 0,
	inviterRewardLimit: 5,
	inviteeIssuedCount: 0,
	availableCardCount: 0,
	invitee: null,
};
it("never invents an invitation from unavailable or ended data", () => {
	equal(referralNoticeKind(null, true, now), null);
	equal(
		referralNoticeKind({ ...base, campaignStatus: "ended" }, true, now),
		null,
	);
	equal(
		referralNoticeKind(
			{ ...base, canShare: false, shareBlockReason: "cap_reached" },
			true,
			now,
		),
		null,
	);
});
it("gives qualified first subscription and pending rewards priority over exhaustion", () => {
	equal(
		referralNoticeKind(
			{
				...base,
				invitee: {
					status: "registered",
					purchaseDeadline: new Date(now + 1000).toISOString(),
					dueAt: null,
				},
			},
			true,
			now,
		),
		"registered",
	);
	equal(
		referralNoticeKind(
			{
				...base,
				invitee: { status: "pending", purchaseDeadline: null, dueAt: null },
			},
			true,
			now,
		),
		"pending",
	);
	equal(referralNoticeKind(base, true, now), "exhausted");
});
it("stops the first-subscription notice at the server deadline", () => {
	equal(
		referralNoticeKind(
			{
				...base,
				canShare: false,
				invitee: {
					status: "registered",
					purchaseDeadline: new Date(now).toISOString(),
					dueAt: null,
				},
			},
			false,
			now,
		),
		null,
	);
	equal(
		referralCountdown(
			new Date(now + 47 * 3600000 + 58 * 60000 + 3000).toISOString(),
			now,
		),
		"47:58:03",
	);
	equal(referralCountdown(new Date(now - 1).toISOString(), now), "00:00:00");
});

function equal(actual: unknown, expected: unknown) {
	expect(actual).toBe(expected);
}


it('validates the server limit without a fixed five or ten card assumption', () => {
 expect(parseReferralSummary({ ...base, inviterRewardLimit: 12, inviterIssuedCount: 11 })).toEqual({ ...base, inviterRewardLimit: 12, inviterIssuedCount: 11 });
 expect(parseReferralSummary({ ...base, inviterRewardLimit: 0, canShare: false, shareBlockReason: 'cap_reached', inviteUrl: null })).not.toBeNull();
 expect(parseReferralSummary({ ...base, inviterRewardLimit: undefined })).toBeNull();
 expect(parseReferralSummary({ ...base, inviterRewardLimit: 5, inviterIssuedCount: 5 })).toBeNull();
 expect(parseReferralSummary({ ...base, serverTime: 'not-a-date' })).toBeNull();
 expect(parseReferralSummary({ ...base, canShare: 'yes' })).toBeNull();
});

it('keeps pending rewards visible after due time until the server returns a terminal state', () => {
 const pending = { ...base, invitee: { status: 'pending' as const, purchaseDeadline: null, dueAt: new Date(now - 1000).toISOString() } };
 expect(referralNoticeKind(pending, false, now)).toBe('pending');
 expect(referralNoticeKind({ ...pending, invitee: { ...pending.invitee, status: 'issued' } }, false, now)).toBeNull();
});
