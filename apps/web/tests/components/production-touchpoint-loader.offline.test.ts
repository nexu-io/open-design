// @vitest-environment jsdom
//
// OPEND-3436, the classification half. Which failures mean "the runtime could
// not be reached" and therefore license offline fallback, and which are the
// server exercising its authority and therefore must not.
//
// Getting this wrong in either direction is a shipped bug: treat a 401 as
// offline and a signed-out client goes on showing the previous account's
// activity; treat a 503 as an answer and a client that could have kept the
// campaign up instead polls a runtime that is not there.

import { describe, expect, it, vi, afterEach } from "vitest";
import {
	ProductionTouchpointLoadError,
	loadProductionTouchpointDecision,
} from "../../src/components/production-touchpoint-loader";
import {
	touchpointEntersOfflineFallback,
	touchpointFallbackFromServerError,
} from "../../src/components/touchpoint-lifecycle";

afterEach(() => vi.unstubAllGlobals());

const failure = async (response: Response | Error) => {
	vi.stubGlobal(
		"fetch",
		vi.fn(response instanceof Error ? () => Promise.reject(response) : () => Promise.resolve(response)),
	);
	return loadProductionTouchpointDecision(
		"opend.home.campaign-modal",
		"en-US",
		new AbortController().signal,
	).then(
		() => null,
		(error: unknown) => error,
	);
};

describe("which failures mean the runtime was unreachable", () => {
	it("marks transport failures and temporary unavailability", async () => {
		for (const response of [
			new TypeError("fetch failed"),
			new Response("", { status: 500 }),
			new Response("", { status: 502 }),
			new Response("", { status: 503 }),
			new Response("", { status: 504 }),
		]) {
			const error = await failure(response);
			expect(error, `${String(response)} must be offline-eligible`).toBeInstanceOf(
				ProductionTouchpointLoadError,
			);
			expect(error).toMatchObject({ touchpointOfflineFallback: true });
			expect(touchpointEntersOfflineFallback(error)).toBe(true);
		}
	});

	it("never marks an answer the server actually gave", async () => {
		// 404 is absence and 410 is withdrawal; both are handled by their own
		// result kinds, so only the statuses that surface as errors are listed.
		for (const status of [400, 401, 403, 409, 422]) {
			const error = await failure(new Response("", { status }));
			expect(error, `http_${status} must not be offline-eligible`).toBeInstanceOf(
				ProductionTouchpointLoadError,
			);
			expect(error).toMatchObject({ touchpointOfflineFallback: false });
			expect(touchpointEntersOfflineFallback(error)).toBe(false);
		}
	});

	it("never marks a withdrawal, however unreadable its receipt", async () => {
		const error = await failure(new Response("", { status: 410 }));
		expect(error).toMatchObject({
			detail: "http_410",
			touchpointWithdrawal: true,
			touchpointOfflineFallback: false,
		});
	});

	// Both of these enter fallback, and for going quiet that is all that matters.
	// For coming back they are opposites: a broken transport announces its own
	// repair through `online`, and a 5xx announces nothing at all, because the
	// network it crossed never broke. Only the second needs a heartbeat, so the
	// loader has to say which one this was.
	it("separates a server that answered badly from a transport that failed", async () => {
		for (const status of [500, 502, 503, 504]) {
			const error = await failure(new Response("", { status }));
			expect(error, `http_${status} recovers unannounced`).toMatchObject({
				touchpointOfflineFallback: true,
				touchpointServerError: true,
			});
			expect(touchpointFallbackFromServerError(error)).toBe(true);
		}
		for (const response of [new TypeError("fetch failed"), new Response("", { status: 401 })]) {
			const error = await failure(response);
			expect(error, `${String(response)} must not claim a heartbeat`).toMatchObject({
				touchpointServerError: false,
			});
			expect(touchpointFallbackFromServerError(error)).toBe(false);
		}
	});

	it("does not mark a body it could not parse as a transport failure", async () => {
		// The bytes arrived. Whatever is wrong with them, the runtime was reached,
		// and replaying cached content over a live answer is not this ticket's job.
		const error = await failure(new Response("{", { status: 200 }));
		expect(error).toMatchObject({ detail: "malformed_json", touchpointOfflineFallback: false });
	});
});
