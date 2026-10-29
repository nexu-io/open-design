/** Account-owned projection from GET /api/v1/referrals/me. Unknown data is never eligibility. */
export interface ReferralSummary {
	serverTime: string;
	campaignStatus: "active" | "ended";
	canShare: boolean;
	shareBlockReason: "free" | "cap_reached" | "ended" | "restricted" | null;
	inviteUrl: string | null;
	inviterIssuedCount: number;
	inviterRewardLimit: number;
	inviteeIssuedCount: number;
	availableCardCount: number;
	invitee: {
		status:
			| "registered"
			| "pending"
			| "issued"
			| "expired"
			| "ineligible"
			| "review";
		purchaseDeadline: string | null;
		dueAt: string | null;
	} | null;
}

export type ReferralNoticeKind = "registered" | "pending" | "exhausted";

export function referralNoticeKind(
	summary: ReferralSummary | null,
	exhausted: boolean,
	now: number,
): ReferralNoticeKind | null {
	if (!summary || summary.campaignStatus !== "active") return null;
	if (
		summary.invitee?.status === "registered" &&
		summary.invitee.purchaseDeadline &&
		Date.parse(summary.invitee.purchaseDeadline) > now
	)
		return "registered";
	if (summary.invitee?.status === "pending") return "pending";
	return exhausted && summary.canShare ? "exhausted" : null;
}

export function referralCountdown(deadline: string, now: number): string {
	const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
	return [
		Math.floor(seconds / 3600),
		Math.floor(seconds / 60) % 60,
		seconds % 60,
	]
		.map((value) => String(value).padStart(2, "0"))
		.join(":");
}


/** Accept only an authoritative, internally consistent account projection. */
export function parseReferralSummary(value: unknown): ReferralSummary | null {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const data = value as Record<string, unknown>;
 const validTime = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
 const nullableTime = (v: unknown) => v === null || validTime(v);
 if (!validTime(data.serverTime) || !['active', 'ended'].includes(String(data.campaignStatus))
  || typeof data.canShare !== 'boolean'
  || ![null, 'free', 'cap_reached', 'ended', 'restricted'].includes(data.shareBlockReason as null | string)
  || ![data.inviterIssuedCount, data.inviterRewardLimit, data.inviteeIssuedCount, data.availableCardCount].every(v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0)
 ) return null;
 if (data.inviteUrl !== null) {
  if (typeof data.inviteUrl !== 'string') return null;
  try { if (!['http:', 'https:'].includes(new URL(data.inviteUrl).protocol)) return null; } catch { return null; }
 }
 if (data.canShare && (data.campaignStatus !== 'active' || data.shareBlockReason !== null || !data.inviteUrl
  || (data.inviterIssuedCount as number) >= (data.inviterRewardLimit as number))) return null;
 if (!data.canShare && data.shareBlockReason === null) return null;
 if (data.invitee !== null) {
  if (!data.invitee || typeof data.invitee !== 'object' || Array.isArray(data.invitee)) return null;
  const invitee = data.invitee as Record<string, unknown>;
  if (!['registered', 'pending', 'issued', 'expired', 'ineligible', 'review'].includes(String(invitee.status))
   || !nullableTime(invitee.purchaseDeadline) || !nullableTime(invitee.dueAt)) return null;
 }
 return data as unknown as ReferralSummary;
}
