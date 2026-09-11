import { z } from "zod";

/**
 * Controlled mirror of @vela/shared's CMS v2 fixture. It is intentionally
 * copied, rather than imported from a sibling worktree, so host builds retain
 * a versioned contract even when Vela is not present locally.
 */
export const TOUCHPOINT_COMPONENT_V2_PROTOCOL =
	"vela-touchpoint-component/v2" as const;
export const TOUCHPOINT_COMPONENT_V2_UPSTREAM_PROVENANCE = Object.freeze({
	package: "@vela/shared",
	packageVersion: "0.0.0",
	sourceFiles: Object.freeze([
		"packages/shared/src/touchpoints.ts",
		"packages/shared/src/touchpoint-fixture.ts",
	]),
	sourceSha256: Object.freeze({
		touchpoints:
			"be26f9c4e5cfe6e0a0eedee3d31dc70df8f1c8ee61704e765d4f5c89879fc2f0",
		fixture: "278a40cd787dc74544aa785f85d218d8a51820d2d0e14c7b8d7c6eced10b4c92",
	}),
});

export const TOUCHPOINT_COMPONENT_V2_RUNTIME_KIND = "web-component" as const;
export const TOUCHPOINT_COMPONENT_V2_RUNTIME_API_VERSION = 1 as const;
export const TOUCHPOINT_COMPONENT_V2_WRAPPER_VERSION =
	"vela-touchpoint-wrapper-v1" as const;
export const TOUCHPOINT_COMPONENT_V2_SDK_VERSION =
	"vela-touchpoint-sdk-v1" as const;

const INTERNAL_ACTION_SENTINEL_ORIGIN = "https://vela.invalid";

/**
 * Mirrors browser URL normalization without depending on the current host. The
 * raw path restrictions remain separate so shared manifests reject both
 * ambiguous spellings and normalized origin escapes.
 */
function hasSentinelInternalOrigin(path: string): boolean {
	try {
		return (
			new URL(path, INTERNAL_ACTION_SENTINEL_ORIGIN).origin ===
			INTERNAL_ACTION_SENTINEL_ORIGIN
		);
	} catch {
		return false;
	}
}

const placementKeySchema = z.enum([
	"opend.home.campaign-modal",
	"opend.home.account-badge",
	"opend.home.hover-layer",
	"opend.home.hover-entry",
	"vela.web.console-overlay",
]);
const packagePathSchema = z
	.string()
	.min(1)
	.max(512)
	.regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*$/u);
const staticActionSchema = z.object({
	id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u),
	target: z.discriminatedUnion("kind", [
		z.object({
			kind: z.literal("https"),
			url: z
				.string()
				.max(2048)
				.superRefine((value, context) => {
					try {
						const parsed = new URL(value);
						if (
							parsed.protocol !== "https:" ||
							parsed.username ||
							parsed.password
						)
							context.addIssue({
								code: z.ZodIssueCode.custom,
								message: "action URL must be static HTTPS without credentials",
							});
					} catch {
						context.addIssue({
							code: z.ZodIssueCode.custom,
							message: "action URL must be valid HTTPS",
						});
					}
				}),
		}),
		z.object({
			/** Parsed across hosts; only the Vela host may execute this action. */
			kind: z.literal("vela-personal-subscription"),
			resourceId: z.literal("vela.dashboard.personal-subscription"),
		}),
		z.object({
			kind: z.literal("internal"),
			path: z
				.string()
				.max(1024)
				.regex(/^\/(?!\/).*$/u)
				.refine(
					(value) => !value.includes("\\"),
					"internal action path must not contain backslashes",
				)
				.refine(
					(value) => !value.split("/").includes(".."),
					"internal action path must not traverse",
				)
				.refine(
					hasSentinelInternalOrigin,
					"internal action path must resolve on the sentinel origin",
				),
		}),
	]),
});
const imageOptimizationSchema = z.object({
	source: packagePathSchema,
	output: packagePathSchema,
	format: z.enum(["webp", "png"]).default("webp"),
	displayWidth: z.number().int().positive().max(2048).optional(),
	displayHeight: z.number().int().positive().max(2048).optional(),
});

/** Controlled mirror of Vela's frozen v2 manifest contract, including defaults and cross-field checks. */
export const TouchpointComponentV2ManifestSchema = z
	.object({
		formatVersion: z.literal(2),
		runtimeKind: z.literal(TOUCHPOINT_COMPONENT_V2_RUNTIME_KIND),
		runtimeApiVersion: z.literal(TOUCHPOINT_COMPONENT_V2_RUNTIME_API_VERSION),
		platformWrapperVersion: z.literal(TOUCHPOINT_COMPONENT_V2_WRAPPER_VERSION),
		sdkVersion: z.literal(TOUCHPOINT_COMPONENT_V2_SDK_VERSION),
		contentLine: z.string().min(1).max(128),
		placements: z
			.array(
				z.object({
					key: placementKeySchema,
					entry: packagePathSchema.refine(
						(value) => value.endsWith(".js"),
						"web-component entry must be an ESM JavaScript module",
					),
					resources: z.array(packagePathSchema).max(2048).default([]),
					locales: z.array(z.string().min(2).max(35)).min(1),
					requiredCapabilities: z.array(z.string().min(1).max(64)).default([]),
					staticActions: z.array(staticActionSchema).max(64).default([]),
				}),
			)
			.min(1)
			.max(5),
		resources: z.array(packagePathSchema).min(1).max(2048),
		images: z.array(imageOptimizationSchema).max(2048).default([]),
	})
	.superRefine((manifest, context) => {
		const declared = new Set(manifest.resources);
		const claimed = new Set<string>();
		const entries = new Set<string>();
		for (const [index, resource] of manifest.resources.entries())
			if (
				declared.size !== manifest.resources.length &&
				manifest.resources.indexOf(resource) !== index
			)
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["resources", index],
					message: "manifest resources must be unique",
				});
		const outputs = new Set<string>();
		const sources = new Set<string>();
		for (const [imageIndex, image] of manifest.images.entries()) {
			if (image.source === image.output)
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["images", imageIndex],
					message: "optimized image output must be distinct from its source",
				});
			if (sources.has(image.source) || outputs.has(image.output))
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["images", imageIndex],
					message: "each image source and output must be declared once",
				});
			if (!declared.has(image.output))
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["images", imageIndex, "output"],
					message: "optimized image output must be a declared runtime resource",
				});
			sources.add(image.source);
			outputs.add(image.output);
		}
		const placementKeys = new Set<string>();
		for (const [index, placement] of manifest.placements.entries()) {
			if (placementKeys.has(placement.key))
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["placements", index, "key"],
					message:
						"each PlacementKey may appear only once in a content version",
				});
			placementKeys.add(placement.key);
			if (entries.has(placement.entry))
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["placements", index, "entry"],
					message: "each placement must have its own entry",
				});
			entries.add(placement.entry);
			const locales = new Set<string>();
			const actionIds = new Set<string>();
			for (const [localeIndex, locale] of placement.locales.entries()) {
				if (locales.has(locale.toLowerCase()))
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["placements", index, "locales", localeIndex],
						message:
							"placement locales must be unique without case distinctions",
					});
				locales.add(locale.toLowerCase());
			}
			for (const [actionIndex, action] of placement.staticActions.entries()) {
				if (actionIds.has(action.id))
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["placements", index, "staticActions", actionIndex, "id"],
						message: "placement static action IDs must be unique",
					});
				actionIds.add(action.id);
			}
			for (const value of [placement.entry, ...placement.resources]) {
				if (!declared.has(value))
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["placements", index, "resources"],
						message:
							"placement resource must be declared in manifest resources",
					});
				claimed.add(value);
			}
		}
		for (const [index, value] of manifest.resources.entries())
			if (!claimed.has(value))
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["resources", index],
					message: "manifest resource must belong to a placement closure",
				});
	});
export type TouchpointComponentV2Manifest = z.infer<
	typeof TouchpointComponentV2ManifestSchema
>;

/** A versioned copy of Vela's vectors; hash is compared by maintainer cross-repo verification. */
export const touchpointComponentV2ConformanceVectors = {
	positive: {
		populated: {
			formatVersion: 2,
			runtimeKind: "web-component",
			runtimeApiVersion: 1,
			platformWrapperVersion: "vela-touchpoint-wrapper-v1",
			sdkVersion: "vela-touchpoint-sdk-v1",
			contentLine: "conformance-component",
			placements: [
				{
					key: "opend.home.campaign-modal",
					entry: "component.js",
					resources: ["component.css", "source.png", "output.webp"],
					locales: ["en-US"],
					requiredCapabilities: ["static-action"],
					staticActions: [
						{
							id: "learn-more",
							target: { kind: "https", url: "https://example.com/learn" },
						},
					],
				},
			],
			resources: ["component.js", "component.css", "source.png", "output.webp"],
			images: [
				{
					source: "source.png",
					output: "output.webp",
					format: "webp",
					displayWidth: 320,
				},
			],
		},
		multiPlacement: {
			formatVersion: 2,
			runtimeKind: "web-component",
			runtimeApiVersion: 1,
			platformWrapperVersion: "vela-touchpoint-wrapper-v1",
			sdkVersion: "vela-touchpoint-sdk-v1",
			contentLine: "multi-placement-component",
			placements: [
				{
					key: "opend.home.campaign-modal",
					entry: "modal.js",
					resources: ["shared.css"],
					locales: ["en-US"],
				},
				{
					key: "opend.home.account-badge",
					entry: "badge.js",
					resources: ["shared.css"],
					locales: ["en-US"],
				},
				{
					key: "opend.home.hover-entry",
					entry: "hover-entry.js",
					resources: ["shared.css"],
					locales: ["en-US"],
				},
				{
					key: "opend.home.hover-layer",
					entry: "hover-layer.js",
					resources: ["shared.css"],
					locales: ["en-US"],
				},
			],
			resources: [
				"modal.js",
				"badge.js",
				"hover-entry.js",
				"hover-layer.js",
				"shared.css",
			],
		},
		defaults: {
			formatVersion: 2,
			runtimeKind: "web-component",
			runtimeApiVersion: 1,
			platformWrapperVersion: "vela-touchpoint-wrapper-v1",
			sdkVersion: "vela-touchpoint-sdk-v1",
			contentLine: "default-component",
			placements: [
				{
					key: "opend.home.account-badge",
					entry: "component.js",
					locales: ["en-US"],
				},
			],
			resources: ["component.js"],
		},
	},
	negative: {
		invalidPath: {
			formatVersion: 2,
			runtimeKind: "web-component",
			runtimeApiVersion: 1,
			platformWrapperVersion: "vela-touchpoint-wrapper-v1",
			sdkVersion: "vela-touchpoint-sdk-v1",
			contentLine: "invalid-path",
			placements: [
				{
					key: "opend.home.account-badge",
					entry: "../component.js",
					locales: ["en-US"],
				},
			],
			resources: ["../component.js"],
		},
		duplicateEntry: {
			formatVersion: 2,
			runtimeKind: "web-component",
			runtimeApiVersion: 1,
			platformWrapperVersion: "vela-touchpoint-wrapper-v1",
			sdkVersion: "vela-touchpoint-sdk-v1",
			contentLine: "duplicate-entry",
			placements: [
				{
					key: "opend.home.campaign-modal",
					entry: "component.js",
					locales: ["en-US"],
				},
				{
					key: "opend.home.account-badge",
					entry: "component.js",
					locales: ["en-US"],
				},
			],
			resources: ["component.js"],
		},
		invalidKey: {
			formatVersion: 2,
			runtimeKind: "web-component",
			runtimeApiVersion: 1,
			platformWrapperVersion: "vela-touchpoint-wrapper-v1",
			sdkVersion: "vela-touchpoint-sdk-v1",
			contentLine: "invalid-key",
			placements: [
				{ key: "unknown.host", entry: "component.js", locales: ["en-US"] },
			],
			resources: ["component.js"],
		},
		imageOutputUndeclared: {
			formatVersion: 2,
			runtimeKind: "web-component",
			runtimeApiVersion: 1,
			platformWrapperVersion: "vela-touchpoint-wrapper-v1",
			sdkVersion: "vela-touchpoint-sdk-v1",
			contentLine: "bad-image",
			placements: [
				{
					key: "opend.home.account-badge",
					entry: "component.js",
					locales: ["en-US"],
				},
			],
			resources: ["component.js", "source.png"],
			images: [{ source: "source.png", output: "output.webp" }],
		},
	},
} as const;

export const TouchpointComponentV2FixtureSchema = z
	.object({
		manifest: z
			.object({
				formatVersion: z.literal(2),
				runtimeKind: z.literal("web-component"),
				runtimeApiVersion: z.literal(1),
				platformWrapperVersion: z.literal("vela-touchpoint-wrapper-v1"),
				sdkVersion: z.literal("vela-touchpoint-sdk-v1"),
				contentLine: z.literal("fixture-component"),
				placements: z.tuple([
					z
						.object({
							key: z.literal("opend.home.campaign-modal"),
							entry: z.literal("component.js"),
							resources: z.tuple([z.literal("component.css")]),
							locales: z.tuple([z.literal("en-US")]),
							requiredCapabilities: z.tuple([]),
							staticActions: z.tuple([]),
						})
						.strict(),
				]),
				resources: z.tuple([
					z.literal("component.js"),
					z.literal("component.css"),
				]),
				images: z.tuple([]),
			})
			.strict(),
		files: z
			.object({
				"component.js": z.literal(
					"export function mount(root, context, sdk) { root.dataset.cmsRuntime = String(sdk.runtimeApiVersion); return root; }\nexport function update() {}\nexport function dispose() {}\n",
				),
				"component.css": z.literal(":host { display: block; }\n"),
			})
			.strict(),
	})
	.strict();
export type TouchpointComponentV2Fixture = z.infer<
	typeof TouchpointComponentV2FixtureSchema
>;

export const touchpointComponentV2Fixture: TouchpointComponentV2Fixture = {
	manifest: {
		formatVersion: 2,
		runtimeKind: "web-component",
		runtimeApiVersion: 1,
		platformWrapperVersion: "vela-touchpoint-wrapper-v1",
		sdkVersion: "vela-touchpoint-sdk-v1",
		contentLine: "fixture-component",
		placements: [
			{
				key: "opend.home.campaign-modal",
				entry: "component.js",
				resources: ["component.css"],
				locales: ["en-US"],
				requiredCapabilities: [],
				staticActions: [],
			},
		],
		resources: ["component.js", "component.css"],
		images: [],
	},
	files: {
		"component.js":
			"export function mount(root, context, sdk) { root.dataset.cmsRuntime = String(sdk.runtimeApiVersion); return root; }\nexport function update() {}\nexport function dispose() {}\n",
		"component.css": ":host { display: block; }\n",
	},
};

/** Hash of JSON.stringify(touchpointComponentV2Fixture), checked in tests. */
export const TOUCHPOINT_COMPONENT_V2_FIXTURE_SHA256 =
	"sha256:b29be1c55baa58b11375d3289b97b44d8d694755d8b400be8e67241b4449bf40" as const;

export function parseTouchpointComponentV2Fixture(
	input: unknown,
): TouchpointComponentV2Fixture {
	return TouchpointComponentV2FixtureSchema.parse(input);
}

/** Runtime primitives for the sole v2 Web Component contract. */
export type TouchpointDiagnostic = Readonly<{ code: string; detail?: string }>;
export type TouchpointSdk = Readonly<{
	runtimeApiVersion: typeof TOUCHPOINT_COMPONENT_V2_RUNTIME_API_VERSION;
	signal: AbortSignal;
	now: () => number;
	dispatchAction: (actionId: string) => Promise<void>;
	getResourceUrl: (resourceId: string) => string | undefined;
	requestClose: () => void;
	diagnose: (diagnostic: TouchpointDiagnostic) => void;
	onCleanup: (cleanup: () => void) => () => void;
}>;
export type TouchpointSdkHost = Readonly<{
	signal: AbortSignal;
	actionIds: ReadonlySet<string>;
	resources: ReadonlyMap<string, string>;
	now: () => number;
	dispatchAction?: (actionId: string) => Promise<void>;
	requestClose?: () => void;
	diagnose?: (diagnostic: TouchpointDiagnostic) => void;
}>;
export type RevocableTouchpointSdk = Readonly<{
	sdk: TouchpointSdk;
	revoke: () => void;
}>;

export function createTouchpointSdk(
	host: TouchpointSdkHost,
): RevocableTouchpointSdk {
	let revoked = false;
	const cleanups = new Set<() => void>();
	const diagnose = (diagnostic: TouchpointDiagnostic) =>
		host.diagnose?.(diagnostic);
	const live = () => !revoked && !host.signal.aborted;
	const sdk: TouchpointSdk = Object.freeze({
		runtimeApiVersion: TOUCHPOINT_COMPONENT_V2_RUNTIME_API_VERSION,
		signal: host.signal,
		now: host.now,
		dispatchAction: async (actionId) => {
			if (!live()) {
				diagnose({ code: "sdk_revoked_action", detail: actionId });
				return;
			}
			if (!host.actionIds.has(actionId)) {
				diagnose({ code: "sdk_unregistered_action", detail: actionId });
				return;
			}
			await host.dispatchAction?.(actionId);
		},
		getResourceUrl: (resourceId) =>
			live() ? host.resources.get(resourceId) : undefined,
		requestClose: () => {
			if (!live()) {
				diagnose({ code: "sdk_revoked_close" });
				return;
			}
			host.requestClose?.();
		},
		diagnose,
		onCleanup: (cleanup) => {
			if (!live()) {
				try {
					cleanup();
				} catch {
					diagnose({ code: "sdk_cleanup_failed" });
				}
				return () => undefined;
			}
			cleanups.add(cleanup);
			return () => cleanups.delete(cleanup);
		},
	});
	return Object.freeze({
		sdk,
		revoke: () => {
			if (revoked) return;
			revoked = true;
			for (const cleanup of cleanups) {
				try {
					cleanup();
				} catch {
					diagnose({ code: "sdk_cleanup_failed" });
				}
			}
			cleanups.clear();
		},
	});
}

export type TouchpointModuleCacheMetrics = Readonly<{
	count: number;
	limit: number;
	nativeEsmCount: number;
	refused: number;
	failed: number;
}>;
type ModuleEntry<T> = { promise: Promise<T>; failed: boolean };

/** Bounded session cache; retaining failed digests prevents unbounded retry churn. */
export class TouchpointModuleCache<T = unknown> {
	private readonly entries = new Map<string, ModuleEntry<T>>();
	private nativeEsmCount = 0;
	private refused = 0;
	constructor(private readonly limit: number) {
		if (!Number.isInteger(limit) || limit < 1)
			throw new Error("touchpoint_module_cache_invalid_limit");
	}
	import(digest: string, load: () => Promise<T>): Promise<T> {
		const existing = this.entries.get(digest);
		if (existing) return existing.promise;
		if (this.entries.size >= this.limit) {
			this.refused++;
			return Promise.reject(new Error("touchpoint_module_cache_capacity"));
		}
		this.nativeEsmCount++;
		const entry: ModuleEntry<T> = {
			failed: false,
			promise: Promise.resolve().then(load),
		};
		entry.promise = entry.promise.catch((error: unknown) => {
			entry.failed = true;
			throw error;
		});
		this.entries.set(digest, entry);
		return entry.promise;
	}
	metrics(): TouchpointModuleCacheMetrics {
		let failed = 0;
		for (const entry of this.entries.values()) if (entry.failed) failed++;
		return Object.freeze({
			count: this.entries.size,
			limit: this.limit,
			nativeEsmCount: this.nativeEsmCount,
			refused: this.refused,
			failed,
		});
	}
}

/** Latest-wins update queue for the sole v2 component runtime. */
export type TouchpointComponentContext = Readonly<{
	instanceId: string;
	contentVersionId: string;
	placementKey: string;
	locale: string;
	theme: "light" | "dark";
	fontFamily: string;
	cssVariables: Readonly<Record<string, string>>;
	mode: "preview" | "test" | "production";
}>;
export type TouchpointComponentModule<
	Root = unknown,
	Context = TouchpointComponentContext,
> = Readonly<{
	mount?: (
		root: Root,
		context: Context,
		sdk: import("./touchpoint-component-v2.js").TouchpointSdk,
	) => unknown;
	update?: (
		instance: unknown,
		context: Context,
		sdk: import("./touchpoint-component-v2.js").TouchpointSdk,
	) => unknown;
	dispose?: (
		instance: unknown,
		sdk: import("./touchpoint-component-v2.js").TouchpointSdk,
	) => unknown;
}>;
/** Serial latest-wins context queue; cancellation fences queued and late completion. */
export class TouchpointUpdateQueue<Context> {
	private revision = 0;
	private queued: { context: Context; revision: number } | undefined;
	private running: Promise<void> | undefined;
	private cancelled = false;
	private failure: unknown;
	private hasFailure = false;
	constructor(
		private readonly apply: (context: Context) => Promise<void>,
		private readonly diagnose?: (code: string) => void,
	) {}
	schedule(context: Context): Promise<void> {
		if (this.hasFailure) return Promise.reject(this.failure);
		if (this.cancelled) return Promise.resolve();
		this.queued = { context, revision: ++this.revision };
		if (!this.running) this.running = this.drain();
		return this.running;
	}
	cancel() {
		this.cancelled = true;
		++this.revision;
		this.queued = undefined;
	}
	private async drain() {
		try {
			while (!this.cancelled && this.queued) {
				const next = this.queued;
				this.queued = undefined;
				await this.apply(next.context);
				if (this.cancelled || next.revision !== this.revision)
					this.diagnose?.("component_update_expired");
			}
		} catch (error) {
			this.failure = error;
			this.hasFailure = true;
			this.cancelled = true;
			++this.revision;
			this.queued = undefined;
			throw error;
		} finally {
			this.running = undefined;
		}
	}
}
