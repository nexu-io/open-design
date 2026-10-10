import { useCallback, useEffect, useRef, useState } from "react";
import type { TestRuntimeDeploymentCatalogPage } from "@open-design/contracts/api/touchpointTestRuntime";
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

/** Validate every row, including non-OD rows, before accepting any part of a page. */
function readDirectory(value: unknown): TestRuntimeDeploymentCatalogPage<TestDeployment> {
	if (
		!record(value) ||
		!Array.isArray(value.deployments) ||
		!value.deployments.every(validDeployment)
	)
		throw new Error("touchpoint_test_catalog_invalid");
	if (
		"nextCursor" in value &&
		value.nextCursor !== null &&
		(typeof value.nextCursor !== "string" || !value.nextCursor.trim())
	)
		throw new Error("touchpoint_test_catalog_invalid");
	return value as unknown as TestRuntimeDeploymentCatalogPage<TestDeployment>;
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
export function sameTestDeployment(left: TestDeployment, right: TestDeployment): boolean {
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
	catalogCompleteness: "complete" | "unknown" | null;
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
	initialSelection = null,
	onSelection,
	pauseAutomaticRequests,
	onRequestResult,
}: {
	enabled: boolean;
	owner: string | null;
	manual: boolean;
	/** An already-authorized in-process selection, never an offline directory grant. */
	initialSelection?: TestDeployment | null;
	onSelection?: (selected: TestDeployment | null) => void;
	pauseAutomaticRequests?: () => boolean;
	/** Only a completed directory read clears its own failure state. */
	onRequestResult?: (failed: boolean) => void;
}) {
	const [state, setState] = useState<SelectionState>({
		owner,
		deployments: enabled && initialSelection ? [initialSelection] : empty,
		selected: enabled ? initialSelection : null,
		catalogCompleteness: null,
	});
	// Response acceptance and manual commands update this ref before publishing
	// React state. Their authority effects never run inside a replayable updater.
	const stateRef = useRef(state);
	useEffect(() => {
		if (!enabled || stateRef.current.owner !== owner) {
			stateRef.current = { owner, deployments: empty, selected: null, catalogCompleteness: null };
			setState(stateRef.current);
		}
		if (!enabled) return;
		let disposed = false;
		let request: AbortController | null = null;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let failed = false;
		const cancel = () => {
			request?.abort();
			request = null;
			clearTimeout(timeout);
		};
		const pause = () => {
			failed = true;
			onRequestResult?.(true);
		};
		const refresh = async () => {
			if (disposed || request || document.hidden || navigator.onLine === false) return;
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
				pause();
			}, REQUEST_TIMEOUT_MS);
			try {
				// One attempt, controller and deadline for the entire walk. Intermediate
				// pages cannot select, clear, or renew runtime authority.
				const deployments: TestDeployment[] = [];
				const ids = new Set<string>();
				const cursors = new Set<string>();
				let cursor: string | null = null;
				let catalogCompleteness: SelectionState["catalogCompleteness"] = "complete";
				do {
					const query = cursor === null ? "" : `?${new URLSearchParams({ cursor })}`;
					const response = await fetch(`/api/touchpoints/test-runtime/deployments${query}`, {
						cache: "no-store",
						signal: controller.signal,
					});
					if (!current()) return;
					if (!response.ok) {
						if ([401, 403, 410].includes(response.status)) {
							onSelection?.(null);
							stateRef.current = { owner, deployments: empty, selected: null, catalogCompleteness: null };
							setState(stateRef.current);
						}
						throw new Error("touchpoint_test_catalog_failed");
					}
					const body: unknown = await response.json();
					if (!current()) return;
					const page = readDirectory(body);
					// A legacy first page is accepted, but omission in a paginated walk
					// cannot establish that all remaining rows were read.
					if (page.nextCursor === undefined) {
						if (cursor !== null) throw new Error("touchpoint_test_catalog_invalid");
						catalogCompleteness = "unknown";
					}
					for (const deployment of page.deployments) {
						if (ids.has(deployment.id)) throw new Error("touchpoint_test_catalog_invalid");
						ids.add(deployment.id);
						if (TEST_CAMPAIGN_PLACEMENTS.some(key => deployment.snapshot.placementKeys.includes(key)))
							deployments.push(deployment);
					}
					cursor = page.nextCursor ?? null;
					if (cursor !== null) {
						if (cursors.has(cursor)) throw new Error("touchpoint_test_catalog_invalid");
						cursors.add(cursor);
					}
				} while (cursor !== null);
				if (!current()) return;
				failed = false;
				onRequestResult?.(false);
				{
					const previous = stateRef.current;
					const old =
						previous.owner === owner
							? previous
							: { owner, deployments: empty, selected: null, catalogCompleteness: null };
					const stable = deployments.map((next) => {
						const existing = old.deployments.find((value) => value.id === next.id);
						return existing && sameTestDeployment(existing, next) ? existing : next;
					});
					// Normal clients follow the server's newest-first order; debug selection stays manual.
					const selected =
						(manual
							? stable.find((value) => value.id === old.selected?.id)
							: stable[0]) ?? null;
					onSelection?.(selected);
					if (
						old.catalogCompleteness === catalogCompleteness &&
						old.selected === selected &&
						old.deployments.length === stable.length &&
						old.deployments.every((value, index) => value === stable[index])
					)
						return;
					stateRef.current = { owner, deployments: stable, selected, catalogCompleteness };
					setState(stateRef.current);
				}
			} catch (error) {
				if (current()) {
					emitWebTouchpointDiagnostic({
						code:
							error instanceof Error
								? error.message
								: "touchpoint_test_catalog_failed",
					});
					pause();
				}
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
		// OPEND-3436: a failed catalog or runtime round waits for one recovery
		// event. A successful empty directory still uses normal discovery polling.
		const interval = setInterval(() => {
			if (!failed && !pauseAutomaticRequests?.()) void refresh();
		}, POLL_MS);
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
	}, [enabled, owner, manual, onSelection, pauseAutomaticRequests, onRequestResult]);

	const select = useCallback(
		(id: string) => {
			if (!enabled || !manual) return;
			{
				const previous = stateRef.current;
				if (previous.owner !== owner) return;
				const selected =
					previous.deployments.find((deployment) => deployment.id === id) ?? null;
				if (previous.selected !== selected) onSelection?.(null);
				if (previous.selected !== selected) {
					stateRef.current = { ...previous, selected };
					setState(stateRef.current);
				}
			}
		},
		[enabled, owner, manual, onSelection],
	);
	const current = enabled && state.owner === owner;
	return {
		deployments: current ? state.deployments : empty,
		selected: current ? state.selected : null,
		/** Legacy one-page catalogs are accepted without claiming they are exhaustive. */
		catalogCompleteness: current ? state.catalogCompleteness : null,
		select,
	};
}
