// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { watchTouchpointVisibility } from "../../src/components/touchpoint-lifecycle";

/**
 * These cover the frame the acceptance receipt used to be lost in. The old
 * callers sampled visibility once, right after the state update that removes
 * `hidden`; when that sample lost the race with React's commit the host was
 * still `display: none`, reported no box, and nothing ever looked again.
 */
describe("watchTouchpointVisibility", () => {
	let rectCount = 1;
	let hidden = false;
	const observerCallbacks: Array<() => void> = [];
	const notifyResize = () => {
		for (const trigger of [...observerCallbacks]) trigger();
	};
	const settleFrames = async () => {
		for (let i = 0; i < 3; i++)
			await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
	};
	const host = () => {
		const element = document.createElement("div");
		document.body.append(element);
		return element;
	};

	beforeEach(() => {
		rectCount = 1;
		hidden = false;
		observerCallbacks.length = 0;
		// Registering on `observe`, not on construction, is what makes these
		// tests able to tell an observed host from a merely constructed observer.
		vi.stubGlobal(
			"ResizeObserver",
			class {
				private trigger?: () => void;
				constructor(private readonly callback: ResizeObserverCallback) {}
				observe() {
					this.trigger = () =>
						this.callback([], this as unknown as ResizeObserver);
					observerCallbacks.push(this.trigger);
				}
				disconnect() {
					const index = this.trigger
						? observerCallbacks.indexOf(this.trigger)
						: -1;
					if (index >= 0) observerCallbacks.splice(index, 1);
				}
			},
		);
		vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
		vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
			() => ({ length: rectCount, item: () => null }) as unknown as DOMRectList,
		);
	});
	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("waits for a host that only gains its box after the first frame", async () => {
		rectCount = 0;
		const onVisible = vi.fn();
		const stop = watchTouchpointVisibility({
			element: host(),
			isCurrent: () => true,
			onVisible,
		});
		await settleFrames();
		expect(onVisible).not.toHaveBeenCalled();
		rectCount = 1;
		notifyResize();
		await settleFrames();
		expect(onVisible).toHaveBeenCalledTimes(1);
		stop();
	});

	it("reports a host at most once however often its layout changes", async () => {
		const onVisible = vi.fn();
		const stop = watchTouchpointVisibility({
			element: host(),
			isCurrent: () => true,
			onVisible,
		});
		await settleFrames();
		notifyResize();
		notifyResize();
		await settleFrames();
		expect(onVisible).toHaveBeenCalledTimes(1);
		stop();
	});

	it("does not report a laid-out host while the page is hidden, and recovers when it returns", async () => {
		hidden = true;
		const onVisible = vi.fn();
		const stop = watchTouchpointVisibility({
			element: host(),
			isCurrent: () => true,
			onVisible,
		});
		await settleFrames();
		expect(onVisible).not.toHaveBeenCalled();
		hidden = false;
		document.dispatchEvent(new Event("visibilitychange"));
		await settleFrames();
		expect(onVisible).toHaveBeenCalledTimes(1);
		stop();
	});

	it("never reports a host whose authority lapsed while it was waiting", async () => {
		rectCount = 0;
		let authorized = true;
		const onVisible = vi.fn();
		const stop = watchTouchpointVisibility({
			element: host(),
			isCurrent: () => authorized,
			onVisible,
		});
		await settleFrames();
		authorized = false;
		rectCount = 1;
		notifyResize();
		await settleFrames();
		expect(onVisible).not.toHaveBeenCalled();
		stop();
	});

	it("stops watching once released, so a later layout cannot report a released host", async () => {
		rectCount = 0;
		const onVisible = vi.fn();
		const stop = watchTouchpointVisibility({
			element: host(),
			isCurrent: () => true,
			onVisible,
		});
		stop();
		rectCount = 1;
		notifyResize();
		document.dispatchEvent(new Event("visibilitychange"));
		await settleFrames();
		expect(onVisible).not.toHaveBeenCalled();
	});

	it("reports a slow host without giving up on it", async () => {
		vi.useFakeTimers();
		try {
			rectCount = 0;
			const onVisible = vi.fn();
			const onSlow = vi.fn();
			const stop = watchTouchpointVisibility({
				element: host(),
				isCurrent: () => true,
				onVisible,
				onSlow,
				slowAfterMs: 1_000,
			});
			vi.advanceTimersByTime(1_500);
			expect(onSlow).toHaveBeenCalledWith("touchpoint_visibility_slow");
			expect(onVisible).not.toHaveBeenCalled();
			rectCount = 1;
			notifyResize();
			await vi.advanceTimersByTimeAsync(100);
			expect(onVisible).toHaveBeenCalledTimes(1);
			stop();
		} finally {
			vi.useRealTimers();
		}
	});
});
