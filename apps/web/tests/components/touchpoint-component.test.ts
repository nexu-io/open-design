// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
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

describe("verifyWebTouchpoint multi-placement resource closure", () => {
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
