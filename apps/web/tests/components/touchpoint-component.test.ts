// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	hasWebTouchpointCloseControl,
	trapWebTouchpointModalFocus,
	OpenDesignTouchpointElement,
	verifyWebTouchpoint,
	resolveWebTouchpointLocale,
	webTouchpointContext,
	type WebTouchpointContent,
} from "../../src/components/touchpoint-component";

const digest = (value: string) =>
	`sha256:${createHash("sha256").update(value).digest("hex")}`;
const encode = (value: string) => btoa(value);
const material = {
	version: 1 as const, materialVersionId: "10000000-0000-4000-8000-000000000001",
	sourceHash: "a".repeat(64), templateId: "locale-test", templateVersion: 1,
	rendererDigest: `sha256:${"b".repeat(64)}`, compilerIdentity: "test-compiler",
	sourceDslVersion: 3 as const,
};
const entries = {
	"modal.js": "export const placement = 'modal';",
	"badge.js": "export const placement = 'badge';",
	"hover-entry.js": "export const placement = 'hover-entry';",
	"hover-layer.js": "export const placement = 'hover-layer';",
};
const files = {
	...entries,
	"shared.css": ":host { display: block; }",
	"modal.png": "modal-image",
	"badge.png": "badge-image",
	"entry.png": "entry-image",
	"layer.png": "layer-image",
};
const manifest = {
	formatVersion: 2 as const,
	runtimeKind: "web-component" as const,
	runtimeApiVersion: 1 as const,
	platformWrapperVersion: "vela-touchpoint-wrapper-v1" as const,
	sdkVersion: "vela-touchpoint-sdk-v1" as const,
	contentLine: "four-placement-version",
	placements: [
		{
			key: "opend.home.campaign-modal" as const,
			entry: "modal.js",
			resources: ["shared.css", "modal.png"],
			locales: ["en-US"],
			requiredCapabilities: [],
			staticActions: [],
		},
		{
			key: "opend.home.account-badge" as const,
			entry: "badge.js",
			resources: ["shared.css", "badge.png"],
			locales: ["en-US"],
			requiredCapabilities: [],
			staticActions: [],
		},
		{
			key: "opend.home.hover-entry" as const,
			entry: "hover-entry.js",
			resources: ["shared.css", "entry.png"],
			locales: ["en-US"],
			requiredCapabilities: [],
			staticActions: [],
		},
		{
			key: "opend.home.hover-layer" as const,
			entry: "hover-layer.js",
			resources: ["shared.css", "layer.png"],
			locales: ["en-US"],
			requiredCapabilities: [],
			staticActions: [],
		},
	],
	resources: Object.keys(files),
	images: [],
};

function content(
	placementKey: WebTouchpointContent["placementKey"],
): WebTouchpointContent {
	const placement = manifest.placements.find(
		(candidate) => candidate.key === placementKey,
	)!;
	return {
		id: "version-four-points",
		placementKey,
		locale: "en-US",
		manifest,
		manifestHash: digest(JSON.stringify(manifest)),
		entryPath: placement.entry,
		entryDigest: digest(files[placement.entry as keyof typeof files]),
		entryModule: files[placement.entry as keyof typeof files],
		resources: [placement.entry, ...placement.resources].map((path) => ({
			path,
			digest: digest(files[path as keyof typeof files]),
			bytes: encode(files[path as keyof typeof files]),
		})),
		runtime: {
			kind: "web-component",
			apiVersion: 1,
			wrapperVersion: "vela-touchpoint-wrapper-v1",
			sdkVersion: "vela-touchpoint-sdk-v1",
		},
		buildIdentity: { fingerprint: "immutable-four-point-version" },
	};
}

afterEach(() => vi.restoreAllMocks());

describe("declared content locale", () => {
	it("renders an en-only response to a French host using its actual declared locale", () => {
		const value = content("opend.home.campaign-modal");
		value.locale = "en";
		value.manifest = { ...value.manifest, placements: value.manifest.placements.map((p) => ({ ...p, locales: ["en"] })) };
		expect(resolveWebTouchpointLocale("fr", ["en"])).toBe("en");
		expect(webTouchpointContext(value, { locale: "fr", theme: "light", fontFamily: "sans-serif", cssVariables: {} })?.locale).toBe("en");
	});
	it.each([1, 2] as const)("uses typed source mode rather than runtime API %s or contentLine", async (apiVersion) => {
		vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:locale");
		const host = { locale: "ko-KR", theme: "light" as const, fontFamily: "sans-serif", cssVariables: {} };
		const value = content("opend.home.campaign-modal");
		value.runtime = { ...value.runtime, apiVersion };
		for (const sourceDslVersion of [undefined, 2, 3] as const) {
			value.locale = sourceDslVersion === 3 ? "en" : "ko";
			value.manifest = {
				...manifest, runtimeApiVersion: apiVersion,
				contentLine: sourceDslVersion === 3 ? "generic-line" : "material-v3-untrusted-name",
				...(sourceDslVersion === undefined ? {} : { material: { ...material, sourceDslVersion } }),
				placements: manifest.placements.map((p) => ({ ...p, locales: ["en", "ko"] })),
			};
			value.manifestHash = digest(JSON.stringify(value.manifest));
			const verified = await verifyWebTouchpoint(value);
			verified.dispose();
			expect(webTouchpointContext(value, host)?.locale).toBe(value.locale);
		}
	});
	it("rejects malformed material and altered provenance without loading bytes", async () => {
		const create = vi.spyOn(URL, "createObjectURL");
		const value = content("opend.home.campaign-modal");
		value.manifest = { ...value.manifest, material };
		// A valid marker still cannot authorize a manifest with a stale hash.
		await expect(verifyWebTouchpoint(value)).rejects.toThrow("touchpoint_integrity_failed");
		for (const invalid of [null, {}, { ...material, sourceDslVersion: "3" }, { ...material, sourceDslVersion: undefined }]) {
			const corrupted = { ...value.manifest, material: invalid } as unknown as WebTouchpointContent["manifest"];
			const bad = { ...value, manifest: corrupted, manifestHash: digest(JSON.stringify(corrupted)) };
			expect(webTouchpointContext(bad)).toBeUndefined();
			await expect(verifyWebTouchpoint(bad)).rejects.toThrow("touchpoint_integrity_failed");
		}
		expect(create).not.toHaveBeenCalled();
	});
	it("retains legacy English priority and actual declared case without creating missing translations", () => {
		expect(resolveWebTouchpointLocale("fr", ["en", "EN-us"])).toBe("EN-us");
		expect(resolveWebTouchpointLocale("zh-TW", ["en", "zh-CN"], "canonical-material-v3")).toBe("en");
		expect(resolveWebTouchpointLocale("fr", ["ko"], "canonical-material-v3")).toBeUndefined();
	});
});

describe("hasWebTouchpointCloseControl", () => {
	it("ignores disabled or hidden marker controls and accepts a usable control", () => {
		const element = document.createElement(
			"opend-touchpoint",
		) as OpenDesignTouchpointElement;
		const root = element.attachShadow({ mode: "open" });
		const hidden = document.createElement("button");
		hidden.dataset.touchpointClose = "true";
		hidden.disabled = true;
		root.append(hidden);
		expect(hasWebTouchpointCloseControl(element)).toBe(false);
		hidden.disabled = false;
		hidden.hidden = true;
		expect(hasWebTouchpointCloseControl(element)).toBe(false);
		hidden.hidden = false;
		expect(hasWebTouchpointCloseControl(element)).toBe(true);
		element.hidden = true;
		expect(hasWebTouchpointCloseControl(element)).toBe(false);
	});
});

describe("verifyWebTouchpoint multi-placement resource closure", () => {
	it("revokes every created Blob URL when entry byte verification fails", async () => {
		// Keep this oracle in the verifier suite: modal mounting starts async
		// verification that can outlive cleanup and contaminate global URL spies.
		const value = content("opend.home.campaign-modal");
		let sequence = 0;
		const create = vi.spyOn(URL, "createObjectURL")
			.mockImplementation(() => `blob:verified-${sequence++}`);
		const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
		await expect(verifyWebTouchpoint({ ...value, entryModule: "tampered" }))
			.rejects.toThrow("touchpoint_integrity_failed");
		expect(create).toHaveBeenCalledTimes(value.resources.length);
		expect(revoke.mock.calls.map(([url]) => url))
			.toEqual(create.mock.results.map(({ value: url }) => url));
	});

	it("loads only OD resources from a mixed package containing a Vela subscription action", async () => {
		const create = vi
			.spyOn(URL, "createObjectURL")
			.mockReturnValue("blob:od-only");
		const value = content("opend.home.campaign-modal");
		const mixed: WebTouchpointContent["manifest"] = {
			...value.manifest,
			resources: [...value.manifest.resources, "vela.js"],
			placements: [
				...value.manifest.placements,
				{
					key: "vela.web.console-overlay",
					entry: "vela.js",
					resources: [],
					locales: ["en-US"],
					requiredCapabilities: [],
					staticActions: [
						{
							id: "subscribe",
							target: {
								kind: "vela-personal-subscription",
								resourceId: "vela.dashboard.personal-subscription",
							},
						},
					],
				},
			],
		};
		const verified = await verifyWebTouchpoint({
			...value,
			manifest: mixed,
			manifestHash: digest(JSON.stringify(mixed)),
		});
		expect([...verified.resourceUrls.keys()]).toEqual([
			"modal.js",
			"shared.css",
			"modal.png",
		]);
		expect(create).toHaveBeenCalledTimes(3);
		verified.dispose();
	});
	it("rejects a Vela-only action on the selected OD placement before materializing resources", async () => {
		const create = vi.spyOn(URL, "createObjectURL");
		const value = content("opend.home.campaign-modal");
		const invalid: WebTouchpointContent["manifest"] = {
			...value.manifest,
			placements: value.manifest.placements.map((placement) =>
				placement.key === value.placementKey
					? {
							...placement,
							staticActions: [
								{
									id: "subscribe",
									target: {
										kind: "vela-personal-subscription",
										resourceId: "vela.dashboard.personal-subscription",
									},
								},
							],
						}
					: placement,
			),
		};
		await expect(
			verifyWebTouchpoint({
				...value,
				manifest: invalid,
				manifestHash: digest(JSON.stringify(invalid)),
			}),
		).rejects.toThrow("touchpoint_action_unsupported");
		expect(create).not.toHaveBeenCalled();
	});
	it.each(manifest.placements)(
		"accepts only the selected closure for $key",
		async (placement) => {
			const create = vi
				.spyOn(URL, "createObjectURL")
				.mockImplementation(() => `blob:created:${create.mock.calls.length}`);
			const verified = await verifyWebTouchpoint(content(placement.key));
			expect([...verified.resourceUrls.keys()]).toEqual([
				placement.entry,
				...placement.resources,
			]);
			expect(verified.entryUrl).toContain("blob:created:");
			verified.dispose();
		},
	);

	it.each([
		[
			"manifest digest",
			(value: WebTouchpointContent) => ({
				...value,
				manifestHash: digest("other"),
			}),
		],
		[
			"missing selected resource",
			(value: WebTouchpointContent) => ({
				...value,
				resources: value.resources.slice(0, -1),
			}),
		],
		[
			"undeclared foreign resource",
			(value: WebTouchpointContent) => ({
				...value,
				resources: [
					...value.resources,
					{
						path: "foreign.js",
						digest: digest("foreign"),
						bytes: encode("foreign"),
					},
				],
			}),
		],
		[
			"other placement entry",
			(value: WebTouchpointContent) => ({
				...value,
				entryPath: "badge.js",
				entryDigest: digest(entries["badge.js"]),
				entryModule: entries["badge.js"],
			}),
		],
		[
			"per-byte digest",
			(value: WebTouchpointContent) => ({
				...value,
				resources: value.resources.map((resource, index) =>
					index === 0 ? { ...resource, digest: digest("tampered") } : resource,
				),
			}),
		],
	] as const)("rejects %s injection", async (_name, mutate) => {
		await expect(
			verifyWebTouchpoint(mutate(content("opend.home.campaign-modal"))),
		).rejects.toThrow("touchpoint_integrity_failed");
	});
});


describe("modal tab traversal", () => {
  it("skips negative-tabIndex shadow controls in both directions and wraps", () => {
    const modal = document.createElement("div");
    modal.tabIndex = -1;
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const [a, b, c] = [0, -1, 0].map(tabIndex => {
      const button = document.createElement("button");
      button.tabIndex = tabIndex;
      return button;
    });
    shadow.append(a!, b!, c!);
    modal.append(host);
    document.body.append(modal);
    try {
      a!.focus();
      for (const [shiftKey, expected] of [[false, c], [true, a], [true, c], [false, a]] as const) {
        const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, cancelable: true });
        trapWebTouchpointModalFocus(event, modal);
        expect(event.defaultPrevented).toBe(true);
        expect(shadow.activeElement).toBe(expected);
      }
      a!.remove();
      c!.remove();
      trapWebTouchpointModalFocus(new KeyboardEvent("keydown", { key: "Tab", cancelable: true }), modal);
      expect(document.activeElement).toBe(modal);
    } finally {
      modal.remove();
    }
  });
});

it.each([1, 2] as const)("mounts the actual runtime %s SDK and keeps time renewals in the same instance", async (apiVersion) => {
  const { ensureWebTouchpointElement, webTouchpointModuleCache, webTouchpointContext } = await import('../../src/components/touchpoint-component');
  const { touchpointCountdownMs } = await import('@open-design/contracts');
  const value = content('opend.home.campaign-modal');
  value.runtime = { ...value.runtime, apiVersion };
  value.manifest = { ...value.manifest, runtimeApiVersion: apiVersion };
  value.manifestHash = digest(JSON.stringify(value.manifest));
  const mount = vi.fn((_root, _context, _sdk) => ({ stable: true }));
  const requestClose = vi.fn();
  const update = vi.fn(async () => undefined);
  const key = `runtime-${apiVersion}-${crypto.randomUUID()}`;
  await webTouchpointModuleCache.import(key, async () => ({ mount, update }));
  const Element = ensureWebTouchpointElement();
  const element = new Element(); document.body.append(element);
  const time = { schedule: { endsAt: '2030-01-02T00:00:00Z' }, serverOffsetMs: -3_600_000 };
  const context = webTouchpointContext(value, { locale: 'en-US', theme: 'light', fontFamily: 'sans-serif', cssVariables: {} }, time)!;
  await element.mount('unused', key, context, new Map(), new Set(), { runtimeApiVersion: apiVersion, requestClose });
  expect(mount.mock.calls[0]![2].runtimeApiVersion).toBe(apiVersion);
  const sdk = mount.mock.calls[0]![2];
  sdk.requestClose(); sdk.requestClose('secondary_close'); sdk.requestClose('close');
  expect(requestClose.mock.calls.map(([reason]) => reason)).toEqual([undefined, 'secondary_close', 'close']);
  expect(mount.mock.calls[0]![1].schedule).toEqual(apiVersion === 2 ? time.schedule : undefined);
  if (apiVersion === 2) {
    const renewed = { schedule: { endsAt: '2030-01-01T00:00:10Z' }, serverOffsetMs: -3_600_000 };
    await element.updateTime(renewed);
    expect(update).toHaveBeenCalledWith(mount.mock.results[0]!.value, expect.objectContaining(renewed), mount.mock.calls[0]![2]);
    expect(touchpointCountdownMs(renewed, Date.parse('2030-01-01T01:00:11Z'))).toBe(0);
    expect(mount).toHaveBeenCalledTimes(1);
  }
  await element.dispose();
  sdk.requestClose("secondary_close");
  expect(requestClose).toHaveBeenCalledTimes(3);
  element.remove();
});

it("verifies a phase 2 action package and rejects runtime identity mismatch", async () => {
  const value = content('opend.home.campaign-modal');
  value.runtime = { ...value.runtime, apiVersion: 2 };
  value.manifest = { ...value.manifest, runtimeApiVersion: 2, placements: value.manifest.placements.map(placement => placement.key === value.placementKey ? { ...placement, requiredCapabilities: ['countdown-v1', 'action-console-pricing-v1'], staticActions: [{ id: 'upgrade', target: { kind: 'console-pricing' } }] } : placement) };
  value.manifestHash = digest(JSON.stringify(value.manifest));
  const verified = await verifyWebTouchpoint(value); verified.dispose();
  await expect(verifyWebTouchpoint({ ...value, runtime: { ...value.runtime, apiVersion: 1 } })).rejects.toThrow('touchpoint_runtime_unsupported');
});
