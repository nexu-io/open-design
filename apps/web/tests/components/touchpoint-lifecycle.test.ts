// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mountTouchpoint, REQUEST_TIMEOUT_MS, TEST_MAX_AUTHORIZATION_MS, touchpointLeaseValue, resolveAuthorizationDeadline, RETRY_BACKOFF_MS, useTouchpointLifecycle, type TouchpointLifecycleLoad, type TouchpointLifecycleOptions } from "../../src/components/touchpoint-lifecycle";
import * as host from "../../src/components/touchpoint-component";

const content: host.WebTouchpointContent = {
	id: "content-1",
	placementKey: "opend.home.campaign-modal",
	locale: "en-US",
	manifestHash: "sha256:manifest",
	entryPath: "entry.js",
	entryDigest: "sha256:entry",
	entryModule: "",
	resources: [],
	buildIdentity: { fingerprint: "test" },
	runtime: {
		kind: "web-component",
		apiVersion: 1,
		wrapperVersion: "vela-touchpoint-wrapper-v1",
		sdkVersion: "vela-touchpoint-sdk-v1",
	},
	manifest: {
		formatVersion: 2,
		runtimeKind: "web-component",
		runtimeApiVersion: 1,
		platformWrapperVersion: "vela-touchpoint-wrapper-v1",
		sdkVersion: "vela-touchpoint-sdk-v1",
		contentLine: "test",
		resources: ["entry.js"],
		images: [],
		placements: [
			{
				key: "opend.home.campaign-modal",
				entry: "entry.js",
				resources: [],
				locales: ["en-US"],
				requiredCapabilities: [],
				staticActions: [],
			},
		],
	},
};
let releases: Array<() => void>;
beforeEach(() => {
	vi.useFakeTimers();
	releases = [];
	vi.spyOn(document, "hidden", "get").mockReturnValue(false);
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(
		Object.assign([], { item: () => null }),
	);
});
afterEach(() => {
	releases.forEach((release) => release());
	document.body.replaceChildren();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

// Both delivery adapters cross exactly the same lifecycle interface. Transport,
// authorization and receipt differences do not select a second DOM implementation.
describe.each(["test", "production"] as const)(
	"shared %s lifecycle",
	(mode) => {
		const setup = () => {
			const container = document.createElement("div");
			document.body.append(container);
			const resources = {
				entryUrl: "blob:content",
				resourceUrls: new Map<string, string>(),
				dispose: vi.fn(),
			};
			const verify = vi
				.spyOn(host, "verifyWebTouchpoint")
				.mockResolvedValue(resources);
			const dispose = vi
				.spyOn(host.OpenDesignTouchpointElement.prototype, "dispose")
				.mockResolvedValue();
			const mount = vi
				.spyOn(host.OpenDesignTouchpointElement.prototype, "mount")
				.mockImplementation(async function (
					this: host.OpenDesignTouchpointElement,
				) {
					this.shadowRoot?.replaceChildren(document.createTextNode("campaign"));
				});
			const onVisible = vi.fn(),
				dispatchAction = vi.fn(async () => {}),
				requestClose = vi.fn();
			let authorized = true;
			const start = () => {
				const release = mountTouchpoint(container, {
					content,
					placementKey: content.placementKey,
					staticActions: [],
					mode,
					locale: "en-US",
					isCurrent: () => authorized,
					dispatchAction,
					requestClose,
					onVisible,
				});
				releases.push(release);
				return release;
			};
			return {
				container,
				resources,
				verify,
				dispose,
				mount,
				onVisible,
				dispatchAction,
				requestClose,
				start,
				revoke: () => {
					authorized = false;
				},
			};
		};
		it("uses the common host and reports visibility only once after it becomes visible", async () => {
			const s = setup();
			let visible = false;
			vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() =>
				Object.assign(visible ? [new DOMRect()] : [], { item: () => null }),
			);
			s.start();
			await vi.advanceTimersByTimeAsync(16);
			expect(
				s.container.querySelector("opend-touchpoint")?.shadowRoot?.textContent,
			).toBe("campaign");
			expect(s.mount.mock.calls[0]?.[2].mode).toBe(mode);
			expect(s.onVisible).not.toHaveBeenCalled();
			visible = true;
			document.dispatchEvent(new Event("visibilitychange"));
			await vi.advanceTimersByTimeAsync(16);
			expect(s.onVisible).toHaveBeenCalledTimes(1);
			document.dispatchEvent(new Event("visibilitychange"));
			await vi.advanceTimersByTimeAsync(16);
			expect(s.onVisible).toHaveBeenCalledTimes(1);
		});
		it("disposes late verification once and never mounts after cleanup", async () => {
			const s = setup();
			let resolve!: (value: typeof s.resources) => void;
			s.verify.mockReturnValue(
				new Promise((r) => {
					resolve = r;
				}),
			);
			const release = s.start();
			release();
			resolve(s.resources);
			await vi.advanceTimersByTimeAsync(0);
			expect(s.mount).not.toHaveBeenCalled();
			expect(s.resources.dispose).toHaveBeenCalledTimes(1);
			expect(s.dispose).toHaveBeenCalledTimes(1);
			expect(s.container.childNodes.length).toBe(0);
		});
		it("does not report or authorize actions after a pending mount is released", async () => {
			const s = setup();
			let finish!: () => void;
			s.mount.mockImplementation(
				() =>
					new Promise<void>((resolve) => {
						finish = resolve;
					}),
			);
			const release = s.start();
			await vi.advanceTimersByTimeAsync(0);
			release();
			finish();
			await vi.advanceTimersByTimeAsync(16);
			const callbacks = s.mount.mock.calls[0]?.[5];
			await callbacks?.dispatchAction?.("learn");
			callbacks?.requestClose?.();
			expect(s.dispatchAction).not.toHaveBeenCalled();
			expect(s.requestClose).not.toHaveBeenCalled();
			expect(s.onVisible).not.toHaveBeenCalled();
			expect(s.resources.dispose).toHaveBeenCalledTimes(1);
		});
		it("consults the adapter's live authorization for actions and visibility", async () => {
			const s = setup();
			s.start();
			await vi.advanceTimersByTimeAsync(0);
			const callbacks = s.mount.mock.calls[0]?.[5];
			await callbacks?.dispatchAction?.("learn");
			expect(s.dispatchAction).toHaveBeenCalledOnce();
			s.revoke();
			await callbacks?.dispatchAction?.("learn");
			callbacks?.requestClose?.();
			await vi.advanceTimersByTimeAsync(16);
			expect(s.dispatchAction).toHaveBeenCalledOnce();
			expect(s.requestClose).not.toHaveBeenCalled();
			expect(s.onVisible).not.toHaveBeenCalled();
		});
		it("rejects action identities not declared by the content manifest", async () => {
			const s = setup();
			const onError = vi.fn();
			releases.push(
				mountTouchpoint(s.container, {
					content,
					placementKey: content.placementKey,
					staticActions: [
						{
							id: "unexpected",
							target: { kind: "https", url: "https://example.com" },
						},
					],
					mode,
					locale: "en-US",
					isCurrent: () => true,
					dispatchAction: s.dispatchAction,
					onError,
				}),
			);
			await vi.advanceTimersByTimeAsync(0);
			expect(onError).toHaveBeenCalledWith("touchpoint_decision_mismatch");
			expect(s.mount).not.toHaveBeenCalled();
			expect(s.resources.dispose).toHaveBeenCalledOnce();
		});
	},
);

const timing = {
	serverTime: "2030-01-01T00:00:00.000Z",
	endsAt: "2030-01-01T00:05:00.000Z",
	authorizationExpiresAt: "2030-01-01T01:00:00.000Z",
};

describe("resolveAuthorizationDeadline", () => {
	// Production passes no maximum at all, so the activity end is the only thing
	// that can shorten a grant. There used to be a client cap in this minimum;
	// the helper's docblock records why no value for it was ever correct.
	it("bounds a production authorization by the activity end and nothing else", () => {
		expect(resolveAuthorizationDeadline(timing)).toBe(Date.parse(timing.endsAt));
	});
	it("rejects Test authorization beyond its sixty-second contract or activity window", () => {
		expect(resolveAuthorizationDeadline(timing, TEST_MAX_AUTHORIZATION_MS)).toBeNull();
		expect(resolveAuthorizationDeadline({ ...timing, endsAt: "2030-01-01T00:00:10.000Z", authorizationExpiresAt: "2030-01-01T00:00:30.000Z" }, TEST_MAX_AUTHORIZATION_MS)).toBeNull();
	});
	// The Test contract REJECTS an oversized grant; it never shortens one. That
	// distinction is the whole reason a maximum may still appear in this
	// signature at all.
	it("expires at a valid authorization before the activity end", () => {
		expect(resolveAuthorizationDeadline({ ...timing, authorizationExpiresAt: "2030-01-01T00:00:30.000Z" }, TEST_MAX_AUTHORIZATION_MS)).toBe(Date.parse("2030-01-01T00:00:30.000Z"));
	});
	// OPEND-3366, first tier. Until A3 the server never granted more than a
	// minute, so no case existed for an authorization longer than the client's
	// own cap — five minutes, the POLL interval, simply truncated it in silence.
	it("keeps a server authorization that outlives the old five-minute client cap", () => {
		const long = { serverTime: "2030-01-01T00:00:00.000Z", endsAt: "2030-01-01T06:00:00.000Z", authorizationExpiresAt: "2030-01-01T02:00:00.000Z" };
		expect(resolveAuthorizationDeadline(long)).toBe(Date.parse(long.authorizationExpiresAt));
	});
	it("never lets an authorization outlive the activity itself", () => {
		const past = { serverTime: "2030-01-01T00:00:00.000Z", endsAt: "2030-01-01T00:20:00.000Z", authorizationExpiresAt: "2030-01-01T06:00:00.000Z" };
		expect(resolveAuthorizationDeadline(past)).toBe(Date.parse(past.endsAt));
	});
	// OPEND-3366, second tier. What a single `setTimeout` can name bounds one
	// timer SEGMENT, which `armExpiry` already handles; it says nothing about how
	// long the server may authorize. Setting the cap equal to it made the timer
	// limit a policy again, one tier up from the five minutes that started this:
	// a schedule longer than ~24.9 days came back silently truncated, so a device
	// that could not reach the server for that long treated the wake as a new
	// presentation and the device impression retired a campaign the server was
	// still running.
	it("does not truncate a schedule longer than a single timer can name", () => {
		const twoMonths = { serverTime: "2030-01-01T00:00:00.000Z", endsAt: "2030-03-01T00:00:00.000Z", authorizationExpiresAt: "2030-03-01T00:00:00.000Z" };
		expect(resolveAuthorizationDeadline(twoMonths)).toBe(Date.parse(twoMonths.endsAt));
	});
	// OPEND-3366, third tier, and the case this regression matrix was missing.
	// Ten years was picked as "far enough that no operator's schedule reaches
	// it". These are the server's OWN production-runtime fixture bounds
	// (`touchpoints-runtime-attribution.test.ts`: 2020-01-01 -> 2100-01-01), so
	// the premise was false the day it was written: a real schedule reached it,
	// and the client would have withdrawn a campaign the server still
	// authorized. The numbers here are the fixture's, not ours.
	it("does not truncate the multi-year schedules the server actually runs", () => {
		const fixture = { serverTime: "2026-01-01T00:00:00.000Z", endsAt: "2100-01-01T00:00:00.000Z", authorizationExpiresAt: "2100-01-01T00:00:00.000Z" };
		expect(resolveAuthorizationDeadline(fixture)).toBe(Date.parse(fixture.endsAt));
	});
	// The clause the cap used to justify itself with. A lagging `serverTime`
	// does inflate `validForMs` (`deadline - serverTime`), and `endsAt` cannot
	// catch it. A duration cap cannot either: it only ever sees the SUM of the
	// skew and the schedule, so every value small enough to matter truncated a
	// real campaign. The grant therefore stands, and the two terms that DO
	// survive skew carry it — the credential window, whose offset cancels
	// because both readings come off the same clock, and the already-ended
	// check.
	it("does not shorten a grant from a server clock that has fallen behind", () => {
		const skewed = { serverTime: "2020-01-01T00:00:00.000Z", endsAt: "2099-01-01T00:00:00.000Z", authorizationExpiresAt: "2099-01-01T00:00:00.000Z" };
		expect(resolveAuthorizationDeadline(skewed)).toBe(Date.parse(skewed.endsAt));
	});
	it("cancels clock offset out of a credential window and still refuses an ended activity", () => {
		const credential = { serverTime: "2020-01-01T00:00:00.000Z", endsAt: "2099-01-01T00:00:00.000Z", authorizationExpiresAt: "2020-01-01T00:01:00.000Z" };
		expect(resolveAuthorizationDeadline(credential)! - Date.parse(credential.serverTime)).toBe(60_000);
		expect(resolveAuthorizationDeadline({ serverTime: "2030-01-01T00:00:00.000Z", endsAt: "2029-12-31T23:59:00.000Z", authorizationExpiresAt: "2030-01-01T00:01:00.000Z" })).toBeNull();
	});
	// Three copies of a cap is exactly how the Badge and the Hover kept a
	// five-minute lease after the Modal was fixed. There is no shared cap left
	// to drift now, so the invariant is stronger: production hands this helper a
	// timing and nothing else. A second argument in any of these files is a
	// fourth attempt at the number the docblock explains away.
	it("passes no lease bound from any of the three production placements", () => {
		for (const file of ["ProductionCampaignModal.tsx", "ProductionCampaignBadge.tsx", "ProductionCampaignHover.tsx"]) {
			const source = readFileSync(resolve(process.cwd(), "src/components", file), "utf8");
			expect(source, `${file} must not redeclare a local lease cap`).not.toMatch(/const\s+\w*MAX_LEASE\w*\s*=/u);
			expect(source, `${file} must not resurrect the shared production cap`).not.toContain("PRODUCTION_MAX_LEASE_MS");
			expect(source, `${file} must call resolveAuthorizationDeadline with no maximum`).not.toMatch(/resolveAuthorizationDeadline\([^()]*,/u);
		}
	});
});

type Content = { text: string };
type Load = TouchpointLifecycleOptions<Content>["load"];
// Match the web suite's deferred-I/O helper: its TypeScript lib predates Promise.withResolvers.
function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>(next => { resolve = next; });
	return { promise, resolve };
}
const first = { text: "campaign" };
const second = { text: "campaign-renewed" };

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
	vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

// OPEND-3377. A lease carries two different things: a STABLE content identity,
// which decides whether to re-mount, and a FRESH authorization window, which
// decides how long display may last. Since OPEND-3374 a matching key retains the
// previous decision object, so anything time-shaped inside it is the value from
// an older response — `endsAt` that an operator may since have brought forward.
//
// Nothing reads those fields today, which is exactly the problem: that is a
// property of who happens to have written the consumers, not of the code. These
// assertions make it a property of the types. Each `@ts-expect-error` below is
// itself checked — if the field came back, TypeScript would report the directive
// as unused and `pnpm typecheck` would fail on this file.
//
// What they do NOT cover is every consumer of the hook. `touchpointLeaseValue`
// is applied at the three production placements; `TestCampaignModal` is a
// fourth consumer and retains whole decisions, timing included, on purpose —
// see the helper's own docblock. So this describes the helper's contract, not a
// property of `useTouchpointLifecycle`.
describe("the lease value carries content identity, never authorization timing", () => {
	type ServerDecision = Readonly<{
		activityId: string;
		deploymentId: string;
		placementKey: string;
		touchpointDecisionId: string;
		content: { id: string };
		serverTime: string;
		endsAt: string;
		authorizationExpiresAt: string;
	}>;
	const response: ServerDecision = {
		activityId: "activity-1",
		deploymentId: "deployment-1",
		placementKey: "opend.home.campaign-modal",
		touchpointDecisionId: "decision-1",
		content: { id: "version-1" },
		serverTime: "2030-01-01T00:00:00.000Z",
		endsAt: "2030-01-01T00:05:00.000Z",
		authorizationExpiresAt: "2030-01-01T00:01:00.000Z",
	};

	it("keeps content identity and the credential", () => {
		const retained = touchpointLeaseValue(response);
		expect(retained.activityId).toBe("activity-1");
		expect(retained.deploymentId).toBe("deployment-1");
		expect(retained.placementKey).toBe("opend.home.campaign-modal");
		expect(retained.content.id).toBe("version-1");
		// Deliberately stale and safe: OPEND-3372 answers for aged ids and
		// OPEND-3364 binds settlement to the deployment window.
		expect(retained.touchpointDecisionId).toBe("decision-1");
	});

	it("does not carry authorization timing, at the type level or at runtime", () => {
		const retained = touchpointLeaseValue(response);
		// @ts-expect-error a retained lease value has no `serverTime`
		void retained.serverTime;
		// @ts-expect-error a retained lease value has no `endsAt`
		void retained.endsAt;
		// @ts-expect-error a retained lease value has no `authorizationExpiresAt`
		void retained.authorizationExpiresAt;
		// The stripping is real, not just a type assertion, so a consumer reaching
		// around the types with a cast still finds nothing to read.
		expect(Object.keys(retained).sort()).toEqual([
			"activityId",
			"content",
			"deploymentId",
			"placementKey",
			"touchpointDecisionId",
		]);
	});

	it("leaves how long display may last to the lease's own window", async () => {
		// `validForMs` always comes from the newest response; the retained value
		// is not where that answer lives. Pinned here next to the type assertions
		// so the two halves of the split are stated in one place.
		const load = vi.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 })
			.mockResolvedValueOnce({ kind: "decision", value: { ...first }, key: "same", validForMs: 45_000 })
			.mockRejectedValue(new Error("touchpoint_test_load_failed"));
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		// Same key: the previous value object is retained, so no re-mount...
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		// ...and the shortened window still governs, 45s from the second response.
		await act(async () => { await vi.advanceTimersByTimeAsync(44_999); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
	});
});

describe("shared display lifecycle", () => {
	it("keeps an unexpired visible decision mounted while focus revalidation is pending", async () => {
		const pending = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockReturnValue(pending.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		act(() => { window.dispatchEvent(new Event("focus")); });
		expect(load).toHaveBeenCalledTimes(2);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
		expect(result.current.current).toBe(first);
		act(() => { window.dispatchEvent(new Event("focus")); });
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => { pending.resolve({ kind: "decision", value: { ...first }, key: "same", validForMs: 60_000 }); });
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
	});

	// OPEND-3363 contract change: hiding the page fences `isCurrent`, which is what
	// gates receipts and actions, but it is not evidence the activity ended. The
	// lease it was granted survives the page being backgrounded.
	it("fences a hidden page without withdrawing the lease it was granted", async () => {
		const load = vi.fn<Load>().mockResolvedValue({ kind: "decision", value: first, key: "same", validForMs: 60_000 });
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		vi.spyOn(document, "hidden", "get").mockReturnValue(true);
		act(() => { document.dispatchEvent(new Event("visibilitychange")); });
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		expect(result.current.isCurrent(generation)).toBe(false);
	});
	it("renews authority without replacing a visible decision, then expires even after no-decision polls", async () => {
		const load = vi.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 })
			.mockResolvedValueOnce({ kind: "decision", value: { text: "campaign" }, key: "same", validForMs: 60_000 })
			.mockResolvedValue({ kind: "retain" });
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		expect(result.current.isCurrent(generation)).toBe(true);
		await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
		expect(result.current.isCurrent(generation)).toBe(false);
		expect(result.current.status).toBe("active");
	});

	// OPEND-3366: the whole remaining activity window, not five minutes. Thirty
	// minutes offline with every single check failing, and the display never
	// flickers — then it retires exactly on the deadline it was granted.
	it("displays for a whole thirty-minute authorization while every check fails, then retires on the deadline", async () => {
		const validForMs = 30 * 60_000;
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs }).mockRejectedValue(new Error("touchpoint_test_load_failed"));
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		for (let minute = 5; minute <= 30; minute += 5) {
			await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000 - (minute === 30 ? 1 : 0)); });
			expect(result.current.current, `must still display at ${minute} minutes`).toBe(first);
			expect(result.current.generation).toBe(generation);
		}
		expect(load.mock.calls.length).toBeGreaterThan(30);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
		expect(result.current.isCurrent(generation)).toBe(false);
	});

	// A lease can now outlast the largest delay `setTimeout` can name, where a
	// single timer would overflow and fire immediately. `armExpiry` segments it;
	// this pins that on the virtual clock rather than waiting out the segment.
	it("arms a lease longer than one timer can name in segments", async () => {
		const MAX_TIMER_MS = 2_147_483_647;
		const timer = vi.spyOn(globalThis, "setTimeout");
		const load = vi.fn<Load>().mockResolvedValue({ kind: "decision", value: first, key: "same", validForMs: MAX_TIMER_MS + 60_000 });
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		expect(result.current.current).toBe(first);
		expect(timer.mock.calls.some(([, delay]) => delay === MAX_TIMER_MS)).toBe(true);
		expect(timer.mock.calls.every(([, delay]) => (delay ?? 0) <= MAX_TIMER_MS)).toBe(true);
	});

	// OPEND-3369 → OPEND-3374. This case was written to measure what a rotating
	// `touchpointDecisionId` cost the client; OPEND-3374 took that id out of the
	// lease key, so the id is no longer what drives this. The measurement it was
	// written for still matters and is unchanged — it is a property of the KEY,
	// which is now content identity: a key that changes every poll is a remount
	// every poll, and a stable one is none. Which inputs produce a changing key
	// is now decided in the three placements, and asserted in their own suites.
	it("remounts once per poll when the lease key rotates, and not at all when it is stable", async () => {
		const POLLS = 120; // one hour at the 30s interval
		let issued = 0;
		const rotating = vi.fn<Load>().mockImplementation(async () => ({
			kind: "decision",
			value: { text: "campaign" },
			key: `activity-1:deployment-1:version-${++issued}`,
			validForMs: 60_000,
		}));
		const rotatingHook = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load: rotating }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const firstGeneration = rotatingHook.result.current.generation;
		const firstValue = rotatingHook.result.current.current;
		let remounts = 0;
		let previousGeneration = firstGeneration;
		let previousValue = firstValue;
		for (let poll = 1; poll <= POLLS; poll += 1) {
			await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
			const { generation, current } = rotatingHook.result.current;
			if (generation !== previousGeneration) remounts += 1;
			// A new generation carries a new decision object, so the host is rebuilt
			// rather than merely re-rendered.
			expect(generation === previousGeneration || current !== previousValue).toBe(true);
			previousGeneration = generation;
			previousValue = current;
		}
		expect(rotating).toHaveBeenCalledTimes(POLLS + 1);
		expect(remounts).toBe(POLLS);
		expect(rotatingHook.result.current.generation).toBe(firstGeneration + POLLS);
		rotatingHook.unmount();

		// The control: the same hour, the same responses, one stable decision id.
		const stable = vi.fn<Load>().mockImplementation(async () => ({
			kind: "decision",
			value: { text: "campaign" },
			key: "activity-1:deployment-1:version-1",
			validForMs: 60_000,
		}));
		const stableHook = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load: stable }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const stableGeneration = stableHook.result.current.generation;
		const stableValue = stableHook.result.current.current;
		await act(async () => { await vi.advanceTimersByTimeAsync(POLLS * 30_000); });
		expect(stable).toHaveBeenCalledTimes(POLLS + 1);
		expect(stableHook.result.current.generation).toBe(stableGeneration);
		expect(stableHook.result.current.current).toBe(stableValue);
	});

	// OPEND-3378. `elapsed()` is `max(monotonic, wall)` and is therefore not
	// monotonic: a wall clock that steps FORWARD and is corrected BACK makes it
	// rise and then fall. Every point that consumes it was audited; this is the
	// one whose answer was not acceptable.
	//
	// `same` asks whether the previous lease is still within its window, and a
	// forward step makes a perfectly live lease answer no. The response that
	// arrives during the step then counts as a new presentation: `++generation`,
	// a rebuilt host, a replayed entry animation — the exact flicker OPEND-3374
	// was written to remove, now triggered by an NTP step instead of a credential
	// rotation. A3 made leases run for the whole activity, so the window in which
	// a clock step can land grew from a minute to days.
	//
	// The display is still on screen when this happens: a step alone tears
	// nothing down, because nothing evaluates `elapsed` until something asks.
	// So there is no teardown for the re-mount to be consistent with.
	it("a clock step forward does not re-mount a campaign that is still on screen", async () => {
		const mounted = { text: "campaign" };
		const renewed = { text: "campaign" };
		const load = vi.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: mounted, key: "same", validForMs: 30 * 60_000 })
			.mockResolvedValue({ kind: "decision", value: renewed, key: "same", validForMs: 30 * 60_000 });
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		expect(result.current.current).toBe(mounted);
		await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

		// The clock steps an hour forward. Nothing has asked `elapsed` anything
		// yet, so the campaign is still mounted and still authorized.
		vi.setSystemTime(new Date("2030-01-01T01:00:10Z"));
		expect(result.current.current).toBe(mounted);

		// The next poll renews the same decision. It must renew the lease, not
		// replace the presentation.
		await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
		expect(load).toHaveBeenCalledTimes(2);
		expect(result.current.generation).toBe(generation);
		expect(result.current.current).toBe(mounted);
	});

	it("refetches at the start boundary but cannot activate until the server grants authority", async () => {
		const grant = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "waiting", retryAfterMs: 500 }).mockReturnValue(grant.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(499); });
		expect(result.current.current).toBeNull();
		expect(result.current.status).toBe("before");
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
		await act(async () => { grant.resolve({ kind: "decision", value: first, key: "first", validForMs: 1000 }); });
		expect(result.current.current).toBe(first);
	});

	it("ignores an old environment response after selection changes", async () => {
		const old = deferred<TouchpointLifecycleLoad<Content>>();
		const oldLoad: Load = () => old.promise;
		const nextLoad: Load = async () => ({ kind: "decision", value: first, key: "next", validForMs: 60_000 });
		const { result, rerender } = renderHook(({ identity, load }) => useTouchpointLifecycle({ enabled: true, identity, load }), { initialProps: { identity: "old", load: oldLoad } });
		rerender({ identity: "next", load: nextLoad });
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		await act(async () => { old.resolve({ kind: "decision", value: { text: "stale" }, key: "old", validForMs: 60_000 }); });
		expect(result.current.current).toBe(first);
	});

	it("expiry fences a renewal response still in flight", async () => {
		const late = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 31_000 }).mockReturnValue(late.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
		expect(result.current.current).toBeNull();
		await act(async () => { late.resolve({ kind: "decision", value: first, key: "same", validForMs: 60_000 }); });
		expect(result.current.current).toBeNull();
	});

	it("subtracts response latency and does not extend leases when the local clock moves backwards", async () => {
		const response = deferred<TouchpointLifecycleLoad<Content>>();
		const load: Load = () => response.promise;
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(400); response.resolve({ kind: "decision", value: first, key: "same", validForMs: 1000 }); });
		expect(result.current.current).toBe(first);
		vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
		await act(async () => { await vi.advanceTimersByTimeAsync(599); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
	});

	// OPEND-3363, deliberate contract change. This case previously pinned the
	// destructive `wake()`: `online` withdrew authority synchronously, before any
	// evidence had arrived, and a single timed-out revalidation then made the loss
	// permanent. Page recovery is now non-destructive, so the same events are
	// asserted here with the opposite outcome.
	it("keeps an unexpired visible decision mounted while an online revalidation is pending", async () => {
		const pending = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockReturnValue(pending.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		act(() => { window.dispatchEvent(new Event("online")); });
		// Inside the pending window: the revalidation has been issued and has NOT
		// resolved, which is exactly where the old shape had already gone blank.
		expect(load).toHaveBeenCalledTimes(2);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		expect(result.current.isCurrent(generation)).toBe(true);
		// A revalidation that never answers is still not a withdrawal.
		await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS); });
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		expect(result.current.status).toBe("active");
	});

	it("keeps an unexpired visible decision mounted while a pageshow revalidation is pending", async () => {
		const pending = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockReturnValue(pending.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		act(() => { window.dispatchEvent(new Event("pageshow")); });
		expect(load).toHaveBeenCalledTimes(2);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		expect(result.current.isCurrent(generation)).toBe(true);
	});

	it("keeps an unexpired visible decision mounted while a visibilitychange revalidation is pending", async () => {
		const pending = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockReturnValue(pending.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		act(() => { document.dispatchEvent(new Event("visibilitychange")); });
		expect(load).toHaveBeenCalledTimes(2);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		expect(result.current.isCurrent(generation)).toBe(true);
	});

	// The permanent-loss path, end to end. `wake()` emptied the lease, the very
	// next failure short-circuited on `!lease.current` and dropped the saved
	// revalidation lease too, and the retry that DID succeed had nothing left to
	// restore. Nothing here should ever need restoring: it never goes away.
	it("rides out one failed recovery revalidation and never has to restore the display", async () => {
		const load = vi.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 })
			.mockRejectedValueOnce(new Error("touchpoint_test_load_failed"))
			.mockResolvedValue({ kind: "retain" });
		const onError = vi.fn();
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load, onError }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		act(() => { window.dispatchEvent(new Event("online")); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(result.current.current).toBe(first);
		expect(result.current.status).toBe("active");
		await act(async () => { await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0] ?? 0); });
		expect(load).toHaveBeenCalledTimes(3);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		expect(result.current.isCurrent(generation)).toBe(true);
	});

	it("cancels only the in-flight request while the page is hidden, then revalidates once on return", async () => {
		let aborted = false;
		const pending = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 120_000 })
			.mockImplementationOnce(async signal => { signal.addEventListener("abort", () => { aborted = true; }); return pending.promise; })
			.mockResolvedValue({ kind: "retain" });
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(load).toHaveBeenCalledTimes(2);
		const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
		act(() => { document.dispatchEvent(new Event("visibilitychange")); });
		expect(aborted).toBe(true);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		hidden.mockReturnValue(false);
		act(() => { document.dispatchEvent(new Event("visibilitychange")); });
		expect(load).toHaveBeenCalledTimes(3);
		expect(result.current.current).toBe(first);
		expect(result.current.isCurrent(generation)).toBe(true);
	});

	// The other half of hiding, which the case above does not reach: a lease that
	// lapses WHILE the page is hidden. `armExpiry` does not consult
	// `document.hidden` — a grant retires on the server's deadline whether anyone
	// is watching or not — so the return has nothing left to revalidate and must
	// go through `wake`, exactly once, producing a genuinely new presentation.
	//
	// `generation` is asserted as changed rather than as a number: this path steps
	// it three times (the expiry `revoke`, `wake`'s own `revoke`, and the new
	// lease failing `same`), and pinning the count would pin the route instead of
	// the outcome.
	it("retires a lease that lapses while the page is hidden, then rebuilds on return", async () => {
		const load = vi.fn<Load>().mockResolvedValue({ kind: "decision", value: first, key: "same", validForMs: 60_000 });
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		expect(result.current.current).toBe(first);

		const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
		act(() => { document.dispatchEvent(new Event("visibilitychange")); });
		await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
		expect(result.current.current).toBeNull();
		expect(result.current.isCurrent(generation)).toBe(false);
		// The thirty-second ticks inside that span are fenced, so nothing was asked.
		const callsWhileHidden = load.mock.calls.length;
		expect(callsWhileHidden).toBe(1);

		hidden.mockReturnValue(false);
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(load.mock.calls.length).toBe(callsWhileHidden + 1);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).not.toBe(generation);
	});

	it("closes at once when a recovery revalidation carries the server's own withdrawal", async () => {
		const withdrawal = Object.assign(new Error("touchpoint_load_failed"), { touchpointWithdrawal: true });
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockRejectedValue(withdrawal);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		act(() => { window.dispatchEvent(new Event("online")); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		expect(result.current.current).toBeNull();
		expect(result.current.status).toBe("error");
	});

	it("retires a lease at its own deadline when recovery revalidation keeps failing, and never restores it", async () => {
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockRejectedValue(new Error("touchpoint_test_load_failed"));
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		act(() => { window.dispatchEvent(new Event("online")); });
		await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
		expect(result.current.isCurrent(generation)).toBe(false);
		act(() => { window.dispatchEvent(new Event("online")); });
		await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
		expect(result.current.current).toBeNull();
	});
	it("keeps a visible lease when a polling refresh times out, then retires it at its own deadline", async () => {
		const stalled = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockReturnValue(stalled.promise);
		const onError = vi.fn();
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load, onError }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS); });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		expect(result.current.isCurrent(generation)).toBe(true);
		// The lease still retires on the server's deadline, not on the retries:
		// every attempt after t=30s stays pending, so none of them can renew it.
		await act(async () => { await vi.advanceTimersByTimeAsync(60_000 - 30_000 - REQUEST_TIMEOUT_MS - 1); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
	});

	it("keeps a visible lease when a polling refresh fails, and clears once it lapses", async () => {
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockRejectedValue(new Error("touchpoint_test_load_failed"));
		const onError = vi.fn();
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load, onError }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(onError).toHaveBeenCalledTimes(1);
		expect(result.current.current).toBe(first);
		expect(result.current.generation).toBe(generation);
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(result.current.current).toBeNull();
		expect(result.current.status).toBe("error");
	});

	it("rides out consecutive polling failures inside the lease, then clears at the granted deadline", async () => {
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 120_000 }).mockRejectedValue(new Error("touchpoint_test_load_failed"));
		const onError = vi.fn();
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load, onError }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		const generation = result.current.generation;
		for (const tick of [30_000, 60_000, 90_000]) {
			await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
			expect(result.current.current, `lease must survive the failure at ${tick}ms`).toBe(first);
			expect(result.current.generation).toBe(generation);
			expect(result.current.isCurrent(generation)).toBe(true);
		}
		// Let the final cycle's retries run: the loop stops on the 90s tick itself.
		// Backoffs are sequential: each retry is scheduled from the previous
		// failure, so the cycle's last retry lands at their SUM.
		const lastRetryAt = RETRY_BACKOFF_MS.reduce((total, delay) => total + delay, 0);
		await act(async () => { await vi.advanceTimersByTimeAsync(lastRetryAt); });
		// Each cycle is one attempt plus its full retry budget, and every cycle gets
		// that budget back — an earlier exhausted cycle must not silence later ones.
		expect(onError).toHaveBeenCalledTimes(3 * (1 + RETRY_BACKOFF_MS.length));
		expect(result.current.current).toBe(first);
		// The lease still retires on the deadline the server granted, never later.
		await act(async () => { await vi.advanceTimersByTimeAsync(120_000 - 90_000 - lastRetryAt - 1); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); });
		expect(result.current.current).toBeNull();
		expect(result.current.isCurrent(generation)).toBe(false);
	});

	it("retries a fast failure within seconds instead of waiting out the poll interval", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "one", validForMs: 60_000 })
			.mockRejectedValueOnce(new Error("touchpoint_test_load_failed"))
			.mockResolvedValue({ kind: "decision", value: second, key: "two", validForMs: 60_000 });
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(load).toHaveBeenCalledTimes(2);
		// The failure must not have to wait for the next 30s tick: at that point
		// only one poll would remain before the sixty-second lease expires.
		await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
		expect(load).toHaveBeenCalledTimes(3);
		expect(result.current.current).toBe(second);
	});

	it("bounds the retries and returns to the poll interval", async () => {
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "one", validForMs: 60_000 })
			.mockRejectedValue(new Error("touchpoint_test_load_failed"));
		renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
		expect(load).toHaveBeenCalledTimes(3);
		await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
		expect(load).toHaveBeenCalledTimes(4);
		// Exhausted: no third retry, and nothing further until the next tick.
		await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
		expect(load).toHaveBeenCalledTimes(4);
	});

	it("never lets a retry chain run into — and swallow — the next poll", async () => {
		// `refresh` declines to start while a request is in flight, so a retry that
		// outlives its cycle does not just arrive late: it costs the next tick.
		const stalling = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi
			.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "one", validForMs: 300_000 })
			.mockReturnValue(stalling.promise);
		renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		// Cycle at 30s stalls and is abandoned at its budget; no room is left for a
		// retry plus another full budget inside this cycle, so none is scheduled.
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000 + REQUEST_TIMEOUT_MS); });
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => { await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0] ?? 0); });
		expect(load, "a timed-out attempt must not be retried").toHaveBeenCalledTimes(2);
		// The next tick therefore still lands on schedule.
		await act(async () => { await vi.advanceTimersByTimeAsync(60_000 - 30_000 - REQUEST_TIMEOUT_MS - (RETRY_BACKOFF_MS[0] ?? 0)); });
		expect(load, "the 60s poll must not have been swallowed").toHaveBeenCalledTimes(3);
	});

	it("gives a slow response the full fifteen-second budget before abandoning it", async () => {
		const slow = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockReturnValue(slow.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "test", load }));
		// The retest measured an 11.5s round against the old ten-second budget.
		await act(async () => { await vi.advanceTimersByTimeAsync(11_500); });
		expect(result.current.status).not.toBe("error");
		await act(async () => { slow.resolve({ kind: "decision", value: first, key: "same", validForMs: 60_000 }); });
		expect(result.current.current).toBe(first);
	});

	it("clears a visible lease when the failure carries the server's own withdrawal", async () => {
		const withdrawal = Object.assign(new Error("touchpoint_load_failed"), { touchpointWithdrawal: true });
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 }).mockRejectedValue(withdrawal);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect(result.current.current).toBeNull();
		expect(result.current.status).toBe("error");
	});

	// OPEND-3376. The P1 permanent-loss shape, stated as an invariant rather than
	// as the absence of one path to it: no single failure may discard display
	// authority that is still recoverable.
	//
	// `abandonAttempt` used to decide that by asking whether there was an ACTIVE
	// lease, treating "none" as "expired". `wake` withdraws the active lease and
	// sets it aside first, so the very next failure met that branch, dropped the
	// set-aside lease too, and the retry that finally succeeded came back
	// `{kind:"retain"}` with nothing left to restore — gone for the session.
	//
	// A1 removed the call site that reached this every day; the wall clock can
	// still reach it. `elapsed` is `max(monotonic, wall)`, so a clock that jumps
	// FORWARD makes a live lease read as expired — `resume` then takes the `wake`
	// branch — and a correction BACK makes it read as live again. That is a real
	// NTP step, a VM resume, a dual-boot clock. The lease set aside here is
	// inside its own window when the failure lands, and must survive it.
	it("no single failure can discard display authority that is still recoverable", async () => {
		const failed = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>()
			.mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 60_000 })
			.mockReturnValueOnce(failed.promise)
			.mockResolvedValue({ kind: "retain" });
		const onError = vi.fn();
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load, onError }));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

		// The wall clock steps an hour forward: the live lease reads as expired.
		vi.setSystemTime(new Date("2030-01-01T01:00:10Z"));
		act(() => { window.dispatchEvent(new Event("online")); });
		expect(result.current.current).toBeNull();
		expect(load).toHaveBeenCalledTimes(2);

		// Corrected before the revalidation answers. The set-aside lease is once
		// again inside the window the server granted.
		vi.setSystemTime(new Date("2030-01-01T00:00:11Z"));
		await act(async () => { failed.resolve(Promise.reject(new Error("touchpoint_test_load_failed")) as never); });
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		expect(onError).toHaveBeenCalledTimes(1);

		// One failure must not have spent it. The next answer restores display.
		await act(async () => { await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS[0] ?? 0); });
		expect(result.current.current).toBe(first);
		expect(result.current.status).toBe("active");
	});

	it("cannot restore an original lease that expires while a wake request is pending", async () => {
		const pending = deferred<TouchpointLifecycleLoad<Content>>();
		const load = vi.fn<Load>().mockResolvedValueOnce({ kind: "decision", value: first, key: "same", validForMs: 3000 }).mockReturnValue(pending.promise);
		const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "production", load }));
		await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
		act(() => { window.dispatchEvent(new Event("focus")); });
		expect(result.current.current).toBe(first);
		await act(async () => { await vi.advanceTimersByTimeAsync(2000); pending.resolve({ kind: "retain" }); });
		expect(result.current.current).toBeNull();
	});
});
