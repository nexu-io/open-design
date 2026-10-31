// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	focusWebTouchpointModal,
	hasWebTouchpointCloseControl,
	lockWebTouchpointModalScroll,
	resolveWebTouchpointLocale,
	trapWebTouchpointModalFocus,
	OpenDesignTouchpointElement,
	verifyWebTouchpoint,
	type WebTouchpointContent,
} from "../../src/components/touchpoint-component";

const digest = (value: string) =>
	`sha256:${createHash("sha256").update(value).digest("hex")}`;
const encode = (value: string) => btoa(value);
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

describe("modal keyboard stack ownership", () => {
	it.each([false, true])("ignores a covered CMS even without inert (higher first: %s)", higherFirst => {
		const campaign = document.createElement("div");
		campaign.setAttribute("role", "dialog");
		campaign.setAttribute("aria-modal", "true");
		Object.assign(campaign.style, { position: "fixed", zIndex: "1000" });
		const modal = document.createElement("div");
		modal.tabIndex = -1;
		const action = document.createElement("button");
		modal.append(action);
		campaign.append(modal);
		const higher = document.createElement("div");
		higher.setAttribute("role", "alertdialog");
		higher.setAttribute("aria-modal", "true");
		higher.tabIndex = -1;
		Object.assign(higher.style, { position: "fixed", zIndex: "1700" });
		document.body.append(...(higherFirst ? [higher, campaign] : [campaign, higher]));
		try {
			higher.focus();
			focusWebTouchpointModal(modal);
			for (const shiftKey of [false, true]) {
				const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, cancelable: true });
				trapWebTouchpointModalFocus(event, modal);
				expect(event.defaultPrevented).toBe(false);
				expect(document.activeElement).toBe(higher);
			}
			higher.remove();
			focusWebTouchpointModal(modal);
			expect(document.activeElement).toBe(action);
			const tab = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
			trapWebTouchpointModalFocus(tab, modal);
			expect(tab.defaultPrevented).toBe(true);
			expect(document.activeElement).toBe(action);
		} finally {
			campaign.remove();
			higher.remove();
		}
	});
});

describe("lockWebTouchpointModalScroll", () => {
	const root = () => document.documentElement;

	afterEach(() => {
		document.body.style.overflow = "";
		root().style.overflow = "";
		vi.restoreAllMocks();
	});

	it("locks the viewport root, not just the body the fixed backdrop cannot cover", () => {
		const release = lockWebTouchpointModalScroll();
		expect(document.body).toHaveAttribute("data-web-modal-scroll-lock");
		expect(root().style.overflow).toBe("hidden");
		release();
		expect(document.body.style.overflow).toBe("");
		expect(root().style.overflow).toBe("");
	});

	it("keeps the root locked until every concurrent modal releases, and ignores a double release", () => {
		const first = lockWebTouchpointModalScroll();
		const second = lockWebTouchpointModalScroll();
		expect(root().style.overflow).toBe("hidden");
		first();
		first();
		expect(document.body).toHaveAttribute("data-web-modal-scroll-lock");
		expect(root().style.overflow).toBe("hidden");
		second();
		expect(document.body.style.overflow).toBe("");
		expect(root().style.overflow).toBe("");
	});

	it("restores inline overflow the page already had before the modal opened", () => {
		document.body.style.overflow = "auto";
		root().style.overflow = "clip";
		const release = lockWebTouchpointModalScroll();
		expect(document.body).toHaveAttribute("data-web-modal-scroll-lock");
		expect(root().style.overflow).toBe("hidden");
		release();
		expect(document.body.style.overflow).toBe("auto");
		expect(root().style.overflow).toBe("clip");
	});

	it("pins a scrolled background in place and restores only owned styles", () => {
		const scrolling = document.scrollingElement ?? document.documentElement;
		scrolling.scrollTop = 17;
		document.body.style.color = "red";
		document.body.style.position = "relative";
		const release = lockWebTouchpointModalScroll();
		try {
			expect(document.body.style.position).toBe("fixed");
			expect(document.body.style.top).toBe("-17px");
			expect(document.body.hasAttribute("data-web-modal-scroll-lock")).toBe(true);
			document.body.style.color = "blue";
		} finally {
			release();
		}
		expect(document.body.style.position).toBe("relative");
		expect(document.body.style.top).toBe("");
		expect(document.body.style.color).toBe("blue");
		expect(document.body.hasAttribute("data-web-modal-scroll-lock")).toBe(false);
		expect(scrolling.scrollTop).toBe(17);
		document.body.style.position = "";
		document.body.style.color = "";
		scrolling.scrollTop = 0;
	});

	it("restores independent overflow axes and inline priorities", () => {
		document.body.style.setProperty("overflow-x", "clip", "important");
		document.body.style.setProperty("overflow-y", "auto");
		root().style.setProperty("overflow-x", "hidden");
		root().style.setProperty("overflow-y", "scroll", "important");
		const release = lockWebTouchpointModalScroll();
		release();
		expect(document.body.style.overflowX).toBe("clip");
		expect(document.body.style.overflowY).toBe("auto");
		expect(document.body.style.getPropertyPriority("overflow-x")).toBe("important");
		expect(root().style.overflowY).toBe("scroll");
		expect(root().style.getPropertyPriority("overflow-y")).toBe("important");
	});

	it.each([0, 15])("keeps locked width viewport-relative with a %ipx scrollbar and restores its inline priority", (gutter) => {
		vi.spyOn(window, "innerWidth", "get").mockReturnValue(1280);
		vi.spyOn(root(), "clientWidth", "get").mockReturnValue(1280 - gutter);
		vi.spyOn(document.body, "getBoundingClientRect").mockReturnValue({ width: 1280 - gutter } as DOMRect);
		document.body.style.setProperty("width", "100%", "important");
		const first = lockWebTouchpointModalScroll();
		const second = lockWebTouchpointModalScroll();
		try {
			// jsdom checks the CSS contract; the browser reproduction checks layout on resize.
			expect(document.body.style.width).toBe(`calc(100vw - ${gutter}px)`);
			expect(document.body.style.getPropertyValue("--web-modal-scrollbar-width")).toBe(`${gutter}px`);
			first();
			expect(document.body.style.width).toBe(`calc(100vw - ${gutter}px)`);
		} finally {
			first();
			second();
		}
		expect(document.body.style.width).toBe("100%");
		expect(document.body.style.getPropertyPriority("width")).toBe("important");
		document.body.style.removeProperty("width");
	});

	it("leaves no lock behind across repeated open and close cycles", () => {
		for (let cycle = 0; cycle < 3; cycle += 1) {
			const release = lockWebTouchpointModalScroll();
			expect(root().style.overflow).toBe("hidden");
			release();
			expect(document.body.style.overflow).toBe("");
			expect(root().style.overflow).toBe("");
		}
	});
});

it("falls back to generated en material for a different client locale", () => {
 expect(resolveWebTouchpointLocale("fr-FR", ["en"])).toBe("en");
});
