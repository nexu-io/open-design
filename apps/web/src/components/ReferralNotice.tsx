import { useEffect, useRef, useState } from "react";
import {
	referralCountdown,
	parseReferralSummary,
	referralNoticeKind,
	type ReferralSummary,
	type WorkspaceBillingResponse,
	type WorkspaceCollabContext,
} from "@open-design/contracts";
import { useI18n } from "../i18n";
import {
	amrConsoleUrlForProfile,
	AMR_CONSOLE_UPGRADE_INTENT,
} from "../runtime/amr-guidance";
import { openExternalUrl } from "../providers/registry";
import { openReferralActivity } from "../runtime/referral-navigation";
import styles from "./ReferralNotice.module.css";

const dismissed = new Set<string>();
export function ReferralNotice({
	accountId,
	profile,
	consoleOrigin,
	active,
	context,
	billing,
}: {
	accountId: string | null;
	profile: string | null;
	consoleOrigin?: string | null;
	active: boolean;
	context: WorkspaceCollabContext | null;
	billing: WorkspaceBillingResponse | null;
}) {
	const { t, locale } = useI18n();
	const scopeKey = `${profile}:${accountId}`;
	const currentScope = useRef(scopeKey);
	currentScope.current = scopeKey;
	const [snapshot, setSnapshot] = useState<{
		scopeKey: string;
		data: ReferralSummary;
		received: number;
	} | null>(null);
	const [clock, setClock] = useState(Date.now);
	const [, render] = useState(0);
	const [opening, setOpening] = useState(false);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		if (!accountId || !active) return;
		let current = true;
		let generation = 0;
		const controller = new AbortController();
		const read = async () => {
			const request = ++generation;
			try {
				const response = await fetch(
					"/api/integrations/vela/referral-summary",
					{ cache: "no-store", signal: controller.signal },
				);
				if (!response.ok) throw new Error("unavailable");
				const data = parseReferralSummary(await response.json());
				if (!data) throw new Error("invalid summary");
				if (current && request === generation)
					setSnapshot({ scopeKey, data, received: Date.now() });
			} catch {
				if (current && request === generation) setSnapshot(null);
			}
		};
		void read();
		const refresh = () => void read();
		const timer = window.setInterval(refresh, 30_000);
		window.addEventListener("focus", refresh);
		return () => {
			current = false;
			controller.abort();
			window.clearInterval(timer);
			window.removeEventListener("focus", refresh);
		};
	}, [accountId, profile, active, scopeKey]);
	useEffect(() => {
		if (!active) return;
		const timer = window.setInterval(() => setClock(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [active]);
	useEffect(() => {
		setOpening(false);
		setFailed(false);
	}, [accountId, profile]);
	const data = snapshot?.scopeKey === scopeKey ? snapshot.data : null;
	const serverNow =
		data && snapshot
			? Date.parse(data.serverTime) + Math.max(0, clock - snapshot.received)
			: clock;
	const preflight =
		context?.workspaceType === "personal" &&
		billing?.preflight?.workspaceId === context.workspaceId &&
		billing.preflight.workspaceMemberId === context.workspaceMemberId
			? billing.preflight
			: null;
	const plan = preflight?.codingPlan;
	const exhausted =
		plan?.eligible === true &&
		plan.windows.some(
			(window) =>
				Number.isFinite(Number(window.remainingCredits)) &&
				Number(window.remainingCredits) <= 0 &&
				Number(window.limitCredits) > 0,
		);
	const kind = referralNoticeKind(data, exhausted, serverNow);
	const key = `${profile}:${accountId}:${kind}`;
	const hidden = kind !== "pending" && dismissed.has(key);
	if (!active || !accountId || !kind) return null;
	const open = async () => {
		if (opening) return;
		setOpening(true);
		setFailed(false);
		try {
			if (kind === "exhausted") {
                const accepted = await openReferralActivity(profile, () => currentScope.current === scopeKey);
                if (!accepted && currentScope.current === scopeKey) setFailed(true);
                return;
            }
            const url = new URL(amrConsoleUrlForProfile(profile, consoleOrigin));
			url.searchParams.set("source", "open_design");
			url.searchParams.set("billing", AMR_CONSOLE_UPGRADE_INTENT);
			const accepted = await openExternalUrl(url.toString());
			if (!accepted && currentScope.current === scopeKey) setFailed(true);
		} catch {
			if (currentScope.current === scopeKey) setFailed(true);
		} finally {
			if (currentScope.current === scopeKey) setOpening(false);
		}
	};
	return (
		<div className={styles.slot}>
			<section
				className={`${styles.notice} ${hidden ? styles.dismissed : ""}`}
				aria-hidden={hidden || undefined}
				aria-label={t("referral.notice.label")}
				data-testid="referral-notice"
				data-state={kind}
			>
				<span className={styles.copy}>
					{kind === "pending" && data?.invitee?.dueAt
            ? t("referral.notice.pendingAt", { time: new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short"}).format(new Date(data.invitee.dueAt)) })
            : t(`referral.notice.${kind}`)}
					{kind === "registered" && data?.invitee?.purchaseDeadline ? (
						<span className={styles.countdown}>
							{t("referral.notice.remaining", {
								time: referralCountdown(
									data.invitee.purchaseDeadline,
									serverNow,
								),
							})}
						</span>
					) : null}
				</span>
				{kind !== "pending" ? (
					<button
						type="button"
						className={styles.action}
						disabled={opening}
						onClick={() => void open()}
					>
						{t(
							kind === "exhausted"
								? "referral.notice.invite"
								: "referral.notice.subscribe",
						)}
					</button>
				) : null}
				{kind !== "pending" ? <button
					type="button"
					className={styles.close}
					aria-label={t("referral.notice.dismiss")}
					onClick={() => {
						dismissed.add(key);
						render((value) => value + 1);
					}}
				>
					<svg
						aria-hidden="true"
						width="12"
						height="12"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.4"
						strokeLinecap="round"
					>
						<path d="m4.5 4.5 7 7m0-7-7 7" />
					</svg>
				</button> : null}
			</section>
			{failed ? (
				<p className={styles.error} role="alert">
					{t("referral.notice.openFailed")}
				</p>
			) : null}
		</div>
	);
}
