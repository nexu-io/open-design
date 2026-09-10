import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
	parseTouchpointComponentV2Fixture,
	TOUCHPOINT_COMPONENT_V2_FIXTURE_SHA256,
	TOUCHPOINT_COMPONENT_V2_PROTOCOL,
	TOUCHPOINT_COMPONENT_V2_UPSTREAM_PROVENANCE,
	TouchpointComponentV2ManifestSchema,
	touchpointComponentV2ConformanceVectors,
	touchpointComponentV2Fixture,
} from "../src/index.js";

describe("touchpoint component v2 controlled mirror", () => {
	it("parses a mixed OD/Vela package without executing Vela-owned actions", () => {
		const manifest = structuredClone(touchpointComponentV2Fixture.manifest);
		const velaPlacement = (resourceId: string) => ({
			key: "vela.web.console-overlay",
			entry: "vela.js",
			resources: [],
			locales: ["en-US"],
			staticActions: [
				{
					id: "subscribe",
					target: { kind: "vela-personal-subscription", resourceId },
				},
			],
		});
		const mixed = {
			...manifest,
			resources: [...manifest.resources, "vela.js"],
			placements: [
				...manifest.placements,
				velaPlacement("vela.dashboard.personal-subscription"),
			],
		};
		expect(TouchpointComponentV2ManifestSchema.safeParse(mixed).success).toBe(
			true,
		);
		expect(
			TouchpointComponentV2ManifestSchema.safeParse({
				...mixed,
				placements: [
					...manifest.placements,
					velaPlacement("untrusted-resource"),
				],
			}).success,
		).toBe(false);
	});

	it("imports and parses the frozen Vela v2 fixture through the public contract package", () => {
		expect(TOUCHPOINT_COMPONENT_V2_PROTOCOL).toBe(
			"vela-touchpoint-component/v2",
		);
		expect(
			parseTouchpointComponentV2Fixture(touchpointComponentV2Fixture),
		).toEqual(touchpointComponentV2Fixture);
		expect(
			TouchpointComponentV2ManifestSchema.parse(
				touchpointComponentV2Fixture.manifest,
			),
		).toEqual(touchpointComponentV2Fixture.manifest);
		expect(TOUCHPOINT_COMPONENT_V2_UPSTREAM_PROVENANCE).toMatchObject({
			package: "@vela/shared",
			packageVersion: "0.0.0",
			sourceFiles: [
				"packages/shared/src/touchpoints.ts",
				"packages/shared/src/touchpoint-fixture.ts",
			],
			sourceSha256: {
				touchpoints:
					"1b5f6fb5e52d8cc522649c723b829240b729727e04806fc237732163c5ebb58e",
				fixture:
					"278a40cd787dc74544aa785f85d218d8a51820d2d0e14c7b8d7c6eced10b4c92",
			},
		});
	});

	it("parses canonical populated/default vectors and rejects canonical invalid vectors", () => {
		const { positive, negative } = touchpointComponentV2ConformanceVectors;
		const populated = TouchpointComponentV2ManifestSchema.parse(
			positive.populated,
		);
		const defaults = TouchpointComponentV2ManifestSchema.parse(
			positive.defaults,
		);
		const multiPlacement = TouchpointComponentV2ManifestSchema.parse(
			positive.multiPlacement,
		);
		expect(populated.images[0]).toMatchObject({
			format: "webp",
			displayWidth: 320,
		});
		expect(defaults.images).toEqual([]);
		expect(multiPlacement.placements).toHaveLength(4);
		expect(negative.duplicateEntry).toBeDefined();
		expect(defaults.placements[0]?.resources).toEqual([]);
		expect(defaults.placements[0]?.staticActions).toEqual([]);
		for (const vector of Object.values(negative))
			expect(
				TouchpointComponentV2ManifestSchema.safeParse(vector).success,
			).toBe(false);
	});

	it("detects deterministic fixture drift and rejects unsupported protocol identities", () => {
		const actualDigest = `sha256:${createHash("sha256")
			.update(JSON.stringify(touchpointComponentV2Fixture))
			.digest("hex")}`;
		expect(actualDigest).toBe(TOUCHPOINT_COMPONENT_V2_FIXTURE_SHA256);

		expect(() =>
			parseTouchpointComponentV2Fixture({
				...touchpointComponentV2Fixture,
				manifest: {
					...touchpointComponentV2Fixture.manifest,
					runtimeApiVersion: 2,
				},
			}),
		).toThrow(/Invalid literal value/i);
	});
});

it("accepts one v2 version with up to five unique placements whose global resources are their union", () => {
	const manifest = {
		formatVersion: 2,
		runtimeKind: "web-component",
		runtimeApiVersion: 1,
		platformWrapperVersion: "vela-touchpoint-wrapper-v1",
		sdkVersion: "vela-touchpoint-sdk-v1",
		contentLine: "four-placement-version",
		placements: [
			{
				key: "opend.home.campaign-modal",
				entry: "modal.js",
				resources: ["shared.css", "modal.png"],
				locales: ["en-US"],
			},
			{
				key: "opend.home.account-badge",
				entry: "badge.js",
				resources: ["shared.css", "badge.png"],
				locales: ["en-US"],
			},
			{
				key: "opend.home.hover-entry",
				entry: "hover-entry.js",
				resources: ["shared.css", "entry.png"],
				locales: ["en-US"],
			},
			{
				key: "opend.home.hover-layer",
				entry: "hover-layer.js",
				resources: ["shared.css", "layer.png"],
				locales: ["en-US"],
			},
		],
		resources: [
			"modal.js",
			"badge.js",
			"hover-entry.js",
			"hover-layer.js",
			"shared.css",
			"modal.png",
			"badge.png",
			"entry.png",
			"layer.png",
		],
		images: [],
	};
	expect(TouchpointComponentV2ManifestSchema.parse(manifest)).toMatchObject({
		placements: expect.arrayContaining([
			expect.objectContaining({ key: "opend.home.hover-entry" }),
			expect.objectContaining({ key: "opend.home.hover-layer" }),
		]),
	});
});
