import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
	createTouchpointSdk,
	canonicalMaterialActionRoles,
	selectMaterialActionRoles,
	parseTouchpointComponentV2Fixture,
	TOUCHPOINT_COMPONENT_V2_FIXTURE_SHA256,
	TOUCHPOINT_COMPONENT_V2_PROTOCOL,
	TOUCHPOINT_COMPONENT_V2_UPSTREAM_PROVENANCE,
	TouchpointComponentV2ManifestSchema,
	touchpointComponentV2ConformanceVectors,
	touchpointComponentV2Fixture,
} from "../src/index.js";

describe("touchpoint component v2 controlled mirror", () => {
	it.each([1, 2] as const)("preserves typed source provenance independently of runtime API %s", (runtimeApiVersion) => {
		const material = {
			version: 1, materialVersionId: "10000000-0000-4000-8000-000000000001",
			sourceHash: "a".repeat(64), templateId: "locale-test", templateVersion: 1,
			rendererDigest: `sha256:${"b".repeat(64)}`, compilerIdentity: "test-compiler",
			sourceDslVersion: 3,
		};
		const input = { ...touchpointComponentV2Fixture.manifest, runtimeApiVersion, material };
		expect(TouchpointComponentV2ManifestSchema.parse(input).material).toEqual(material);
		for (const invalid of [
			null, {}, { ...material, sourceDslVersion: undefined },
			{ ...material, sourceDslVersion: "3" }, { ...material, sourceDslVersion: 4 },
			{ ...material, sourceHash: "bad" }, { ...material, unexpected: true },
		]) expect(TouchpointComponentV2ManifestSchema.safeParse({ ...input, material: invalid }).success).toBe(false);
		expect(TouchpointComponentV2ManifestSchema.parse({ ...input, material: { ...material, sourceDslVersion: 2 } }).material?.sourceDslVersion).toBe(2);
	});

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

	it("rejects ambiguous internal paths after browser URL normalization", () => {
		const withInternalPath = (path: string) => ({
			...structuredClone(touchpointComponentV2Fixture.manifest),
			placements: [
				{
					...touchpointComponentV2Fixture.manifest.placements[0],
					staticActions: [{ id: "action", target: { kind: "internal", path } }],
				},
			],
		});

		const rejectedPaths = [
			String.raw`/\evil.example`,
			String.raw`/foo\bar`,
			`/${"\t"}/evil.example`,
			`/${"\n"}/evil.example`,
		];
		for (const path of rejectedPaths)
			expect(
				TouchpointComponentV2ManifestSchema.safeParse(withInternalPath(path))
					.success,
			).toBe(false);

		expect(
			TouchpointComponentV2ManifestSchema.safeParse(
				withInternalPath("/projects?view=active#recent"),
			).success,
		).toBe(true);
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
					"be26f9c4e5cfe6e0a0eedee3d31dc70df8f1c8ee61704e765d4f5c89879fc2f0",
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

it("reads legacy runtime 1 and phase 2 manifests without rewriting the frozen ZIP fixture", () => {
  const legacy = TouchpointComponentV2ManifestSchema.parse(touchpointComponentV2Fixture.manifest);
  expect(legacy.runtimeApiVersion).toBe(1);
  const phase2 = {
    ...structuredClone(legacy), runtimeApiVersion: 2,
    placements: [{ ...legacy.placements[0], requiredCapabilities: ["countdown-v1", "action-console-pricing-v1"], staticActions: [{ id: "upgrade", target: { kind: "console-pricing" } }] }],
  };
  expect(TouchpointComponentV2ManifestSchema.parse(phase2).runtimeApiVersion).toBe(2);
  expect(TouchpointComponentV2ManifestSchema.safeParse({ ...phase2, runtimeApiVersion: 1 }).success).toBe(false);
  expect(TouchpointComponentV2ManifestSchema.safeParse({ ...phase2, placements: [{ ...phase2.placements[0], requiredCapabilities: ["countdown-v1"] }] }).success).toBe(false);
  expect(TouchpointComponentV2ManifestSchema.safeParse({ ...phase2, placements: [{ ...phase2.placements[0], staticActions: [{ id: "upgrade", target: { kind: "console-pricing", url: "https://evil.example" } }] }] }).success).toBe(false);
});

// Existing callers did not negotiate a runtime version before API 2 existed.
it("preserves the API-1 SDK unless the host explicitly negotiates API 2", () => {
  for (const version of [undefined, 1, 2] as const) {
    const lifecycle = createTouchpointSdk({
      signal: new AbortController().signal,
      actionIds: new Set<string>(),
      resources: new Map<string, string>(),
      now: () => 0,
      ...(version === undefined ? {} : { runtimeApiVersion: version }),
    });
    expect(lifecycle.sdk.runtimeApiVersion).toBe(version ?? 1);
    lifecycle.revoke();
  }
});

it('preserves API 1 default close, forwards explicit reasons, sanitizes invalid reasons and fences revoked SDKs', () => {
  const closed: unknown[] = [];
  const controller = new AbortController();
  const runtime = createTouchpointSdk({ signal: controller.signal, actionIds: new Set(), resources: new Map(), now: () => 0, requestClose: reason => closed.push(reason) });
  expect(runtime.sdk.runtimeApiVersion).toBe(1);
  runtime.sdk.requestClose();
  runtime.sdk.requestClose('secondary_close');
  runtime.sdk.requestClose('close');
  // @ts-expect-error Simulates an untyped component attempting to forge a reason.
  runtime.sdk.requestClose('primary_cta');
  expect(closed).toEqual([undefined, 'secondary_close', 'close', undefined]);
  runtime.revoke();
  runtime.sdk.requestClose('secondary_close');
  expect(closed).toHaveLength(4);
});

const roleMaterial = {
	version: 1,
	materialVersionId: "10000000-0000-4000-8000-000000000001",
	sourceHash: "a".repeat(64),
	templateId: "roles",
	templateVersion: 1,
	rendererDigest: `sha256:${"b".repeat(64)}`,
	compilerIdentity: "roles",
	sourceDslVersion: 3,
};
const roleBinding = {
	placementKey: "opend.home.campaign-modal",
	fieldKey: "buttons",
	buttonId: "learn",
	role: "primary",
};
const roleManifest = () => ({
	...structuredClone(touchpointComponentV2Fixture.manifest),
	material: roleMaterial,
	roleBindings: { version: 1, bindings: [roleBinding] },
	placements: [
		{
			...touchpointComponentV2Fixture.manifest.placements[0],
			staticActions: [
				{
					id: "learn",
					target: { kind: "https", url: "https://example.com/learn" },
				},
			],
		},
	],
});
describe("registered role manifest", () => {
	it("preserves strict owner roles and exact absent legacy shape", () => {
		const manifest = roleManifest();
		expect(TouchpointComponentV2ManifestSchema.parse(manifest)).toEqual(
			manifest,
		);
		expect(
			TouchpointComponentV2ManifestSchema.parse(
				touchpointComponentV2Fixture.manifest,
			),
		).not.toHaveProperty("roleBindings");
	});
	it.each([
		{ version: 2, bindings: [roleBinding] },
		{ version: 1, bindings: [] },
		{ version: 1, bindings: [roleBinding], extra: true },
		...[
			{ role: "tertiary" },
			{ placementKey: "unknown" },
			{ fieldKey: "1buttons" },
			{ fieldKey: "button_group" },
			{ buttonId: "!bad" },
			{ buttonId: "a".repeat(129) },
			{ extra: true },
		].map((change) => ({
			version: 1,
			bindings: [{ ...roleBinding, ...change }],
		})),
		{ version: 1, bindings: [roleBinding, roleBinding] },
		{
			version: 1,
			bindings: [
				roleBinding,
				{ ...roleBinding, fieldKey: "other", role: "secondary" },
			],
		},
	])("rejects invalid roles %j", (roleBindings) => {
		expect(
			TouchpointComponentV2ManifestSchema.safeParse({
				...roleManifest(),
				roleBindings,
			}).success,
		).toBe(false);
	});
	it("requires material3, selected placement and static ID, without extending static actions", () => {
		const input = roleManifest();
		for (const material of [
			undefined,
			{ ...roleMaterial, sourceDslVersion: 2 },
		])
			expect(
				TouchpointComponentV2ManifestSchema.safeParse({ ...input, material })
					.success,
			).toBe(false);
		for (const change of [
			{ placementKey: "opend.home.hover-layer" },
			{ buttonId: "unknown" },
		])
			expect(
				TouchpointComponentV2ManifestSchema.safeParse({
					...input,
					roleBindings: {
						version: 1,
						bindings: [{ ...roleBinding, ...change }],
					},
				}).success,
			).toBe(false);
		expect(
			TouchpointComponentV2ManifestSchema.safeParse({
				...input,
				placements: [
					{
						...input.placements[0],
						staticActions: [
							{ ...input.placements[0]!.staticActions[0], role: "primary" },
						],
					},
				],
			}).success,
		).toBe(false);
	});
});

it("canonical roles use ASCII tuples, do not mutate caller input and omit unmatched selections", () => {
	const bindings = ["a", "Z", "A", "z"].map((buttonId) => ({
		placementKey: "opend.home.campaign-modal" as const,
		fieldKey: "buttons",
		buttonId,
		role: "primary" as const,
	}));
	const input = { version: 1 as const, bindings };
	expect(
		canonicalMaterialActionRoles(input).bindings.map((b) => b.buttonId),
	).toEqual(["A", "Z", "a", "z"]);
	expect(input.bindings.map((b) => b.buttonId)).toEqual(["a", "Z", "A", "z"]);
	expect(
		canonicalMaterialActionRoles({
			...input,
			bindings: [...bindings].reverse(),
		}),
	).toEqual(canonicalMaterialActionRoles(input));
	expect(
		selectMaterialActionRoles(input, ["opend.home.hover-layer"]),
	).toBeUndefined();
	expect(selectMaterialActionRoles(undefined, [])).toBeUndefined();
});
