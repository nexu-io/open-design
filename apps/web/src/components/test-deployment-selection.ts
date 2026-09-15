import { useCallback, useEffect, useState } from "react";
import { emitWebTouchpointDiagnostic } from "./touchpoint-component";
import type { TouchpointStaticAction } from "./touchpoint-static-actions";

export const TEST_CAMPAIGN_PLACEMENTS = [
	"opend.home.account-badge",
	"opend.home.campaign-modal",
	"opend.home.hover-entry",
	"opend.home.hover-layer",
] as const;
export type TestCampaignPlacement = (typeof TEST_CAMPAIGN_PLACEMENTS)[number];

/** Directory metadata selects a deployment; only runtime decisions grant display authority. */
export type TestDeployment = {
	id: string;
	activityId: string;
	snapshot: {
		contentVersionId?: string;
		manifestHash?: string;
		artifactHash?: string;
		placementKeys: string[];
		placements?: Array<{
			key: string;
			requiredCapabilities: string[];
			staticActions: TouchpointStaticAction[];
		}>;
	};
	snapshotHash?: string;
};

const POLL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
const empty: TestDeployment[] = [];
const record = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

function validDeployment(value: unknown): value is TestDeployment {
	if (
		!record(value) ||
		typeof value.id !== "string" ||
		!value.id ||
		typeof value.activityId !== "string" ||
		!value.activityId ||
		!record(value.snapshot)
	)
		return false;
	const snapshot = value.snapshot;
	return (
		(value.snapshotHash === undefined ||
			typeof value.snapshotHash === "string") &&
		["contentVersionId", "manifestHash", "artifactHash"].every(
			(key) => snapshot[key] === undefined || typeof snapshot[key] === "string",
		) &&
		Array.isArray(snapshot.placementKeys) &&
		snapshot.placementKeys.every((key) => typeof key === "string") &&
		(snapshot.placements === undefined ||
			(Array.isArray(snapshot.placements) &&
				snapshot.placements.every(
					(placement) =>
						record(placement) &&
						typeof placement.key === "string" &&
						Array.isArray(placement.requiredCapabilities) &&
						placement.requiredCapabilities.every(
							(capability) => typeof capability === "string",
						) &&
						Array.isArray(placement.staticActions),
				)))
	);
}

/** Malformed responses are failures, not authoritative empty directories. Preserve server ordering. */
function readDirectory(value: unknown): TestDeployment[] {
	if (
		!record(value) ||
		!Array.isArray(value.deployments) ||
		!value.deployments.every(validDeployment)
	)
		throw new Error("touchpoint_test_catalog_invalid");
	const deployments: TestDeployment[] = value.deployments;
	if (
		new Set(deployments.map((deployment) => deployment.id)).size !==
		deployments.length
	)
		throw new Error("touchpoint_test_catalog_invalid");
	return deployments.filter((deployment) =>
		TEST_CAMPAIGN_PLACEMENTS.some((key) =>
			deployment.snapshot.placementKeys.includes(key),
		),
	);
}

// JSON object key ordering is not a deployment change; array order remains meaningful.
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (record(value))
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
			.join(",")}}`;
	return JSON.stringify(value) ?? "null";
}
function sameDeployment(left: TestDeployment, right: TestDeployment): boolean {
	return (
		left.id === right.id &&
		left.activityId === right.activityId &&
		left.snapshotHash === right.snapshotHash &&
		canonical(left.snapshot) === canonical(right.snapshot)
	);
}

type SelectionState = {
	owner: string | null;
	deployments: TestDeployment[];
	selected: TestDeployment | null;
};

/**
 * Discovery outlives every individual lease, including empty, future and ended selections.
 * Unchanged snapshots preserve the selected object, so directory polling cannot restart
 * the runtime adapter or remount its hosts. Failure retains selection, never renews authority.
 */
export function useTestDeploymentSelection({
	enabled,
	owner,
	manual,
}: {
	enabled: boolean;
	owner: string | null;
	manual: boolean;
}) {
	const [state, setState] = useState<SelectionState>({
		owner: null,
		deployments: empty,
		selected: null,
	});
	useEffect(() => {
		setState({ owner, deployments: empty, selected: null });
		if (!enabled) return;
		let disposed = false;
		let request: AbortController | null = null;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const cancel = () => {
			request?.abort();
			request = null;
			clearTimeout(timeout);
		};
		const refresh = async () => {
			if (disposed || request || document.hidden) return;
			const controller = new AbortController();
			request = controller;
			const current = () =>
				!disposed && request === controller && !controller.signal.aborted;
			timeout = setTimeout(() => {
				if (!current()) return;
				cancel();
				emitWebTouchpointDiagnostic({
					code: "touchpoint_test_catalog_timeout",
				});
			}, REQUEST_TIMEOUT_MS);
			try {
				const response = await fetch("/api/touchpoints/test-runtime/deployments", {
					cache: "no-store",
					signal: controller.signal,
				});
				if (!current()) return;
				if (!response.ok) throw new Error("touchpoint_test_catalog_failed");
				const deployments = readDirectory(await response.json());
				if (!current()) return;
				setState((previous) => {
					if (disposed) return previous;
					const old =
						previous.owner === owner
							? previous
							: { owner, deployments: empty, selected: null };
					const stable = deployments.map((next) => {
						const existing = old.deployments.find((value) => value.id === next.id);
						return existing && sameDeployment(existing, next) ? existing : next;
					});
					// Normal clients follow the server's newest-first order; debug selection stays manual.
					const selected =
						(manual
							? stable.find((value) => value.id === old.selected?.id)
							: stable[0]) ?? null;
					if (
						old.selected === selected &&
						old.deployments.length === stable.length &&
						old.deployments.every((value, index) => value === stable[index])
					)
						return previous;
					return { owner, deployments: stable, selected };
				});
			} catch (error) {
				if (current())
					emitWebTouchpointDiagnostic({
						code:
							error instanceof Error
								? error.message
								: "touchpoint_test_catalog_failed",
					});
			} finally {
				if (request === controller) {
					request = null;
					clearTimeout(timeout);
				}
			}
		};
		const wake = () => {
			if (!document.hidden) void refresh();
		};
		const visibility = () => {
			if (document.hidden) cancel();
			else wake();
		};
		void refresh();
		const interval = setInterval(() => void refresh(), POLL_MS);
		window.addEventListener("focus", wake);
		window.addEventListener("online", wake);
		window.addEventListener("pageshow", wake);
		window.addEventListener("offline", cancel);
		document.addEventListener("visibilitychange", visibility);
		return () => {
			disposed = true;
			cancel();
			clearInterval(interval);
			window.removeEventListener("focus", wake);
			window.removeEventListener("online", wake);
			window.removeEventListener("pageshow", wake);
			window.removeEventListener("offline", cancel);
			document.removeEventListener("visibilitychange", visibility);
		};
	}, [enabled, owner, manual]);

	const select = useCallback(
		(id: string) => {
			if (!enabled || !manual) return;
			setState((previous) => {
				if (previous.owner !== owner) return previous;
				const selected =
					previous.deployments.find((deployment) => deployment.id === id) ?? null;
				return previous.selected === selected
					? previous
					: { ...previous, selected };
			});
		},
		[enabled, owner, manual],
	);
	const current = enabled && state.owner === owner;
	return {
		deployments: current ? state.deployments : empty,
		selected: current ? state.selected : null,
		select,
	};
}
