import {
	type TouchpointComponentV2Manifest as ContentPackageManifest,
	TouchpointComponentV2ManifestSchema as contentPackageManifestSchema,
	createTouchpointSdk,
	type TouchpointComponentContext,
	type TouchpointComponentModule,
	type TouchpointDiagnostic,
	TouchpointModuleCache,
	type TouchpointSdk,
	TouchpointUpdateQueue,
} from "@open-design/contracts";

export type WebTouchpointContent = {
	id: string;
	placementKey: string;
	locale: string;
	manifest: ContentPackageManifest;
	manifestHash: string;
	entryPath: string;
	entryDigest: string;
	entryModule: string;
	resources: Array<{ path: string; digest: string; bytes: string }>;
	runtime: {
		kind: "web-component";
		apiVersion: 1;
		wrapperVersion: "vela-touchpoint-wrapper-v1";
		sdkVersion: "vela-touchpoint-sdk-v1";
	};
	buildIdentity: { fingerprint: string };
};

const MAX_TOUCHPOINT_BYTES = 2 * 1024 * 1024;
export const TOUCHPOINT_TIMEOUT_MS = 5_000;

export type TouchpointLifecycleOptions = Readonly<{
	timeoutMs?: number;
	dispatchAction?: (actionId: string) => Promise<void>;
	requestClose?: () => void;
	onDiagnostic?: (diagnostic: TouchpointDiagnostic) => void;
}>;

/**
 * Close is a runtime UI capability. Manifest metadata only grants the SDK
 * callback, so the host fallback stays available unless the mounted component
 * exposes an explicit close control marker.
 */
const TOUCHPOINT_CLOSE_CONTROL_SELECTOR =
	'[data-touchpoint-close], [data-close], button[aria-label*="close" i], [role="button"][aria-label*="close" i]';

function isVisibleAndEnabled(element: Element): boolean {
	for (let current: Element | null = element; current; current = current.parentElement) {
		if (
			current.hasAttribute("hidden") ||
			current.getAttribute("aria-hidden") === "true" ||
			current.getAttribute("aria-disabled") === "true"
		)
			return false;
		if (
			current instanceof HTMLButtonElement ||
			current instanceof HTMLInputElement ||
			current instanceof HTMLSelectElement ||
			current instanceof HTMLTextAreaElement ||
			current instanceof HTMLOptGroupElement ||
			current instanceof HTMLOptionElement
		) {
			if (current.disabled) return false;
		}
		const style = getComputedStyle(current);
		if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse")
			return false;
	}
	return true;
}

export function hasWebTouchpointCloseControl(
	element: OpenDesignTouchpointElement,
): boolean {
	const root = element.shadowRoot;
	if (!root || !isVisibleAndEnabled(element)) return false;
	const controls = [
		...root.querySelectorAll(TOUCHPOINT_CLOSE_CONTROL_SELECTOR),
		...root.querySelectorAll("button, [role='button']"),
	];
	return controls.some(
		(control) =>
			isVisibleAndEnabled(control) &&
			(control.matches(TOUCHPOINT_CLOSE_CONTROL_SELECTOR) ||
				/^close(?:\b|\s)/iu.test(
					(
						control.getAttribute("aria-label") ??
						control.getAttribute("title") ??
						control.textContent ??
						""
					).trim(),
				)),
	);
}
const ELEMENT_NAME = "opend-touchpoint";

type ComponentModule = TouchpointComponentModule<
	ShadowRoot,
	WebTouchpointContext
>;
export type WebTouchpointContext = TouchpointComponentContext &
	Readonly<{ mode: "preview" | "test" | "production" }>;

export type WebTouchpointHostContext = Readonly<{
	locale: string;
	theme: "light" | "dark";
	fontFamily: string;
	cssVariables: Readonly<Record<string, string>>;
}>;

const WEB_HOST_VARIABLES = [
	"--background",
	"--foreground",
	"--card",
	"--surface-muted",
	"--border",
	"--border-strong",
	"--muted",
	"--muted-strong",
	"--primary",
	"--primary-hover",
	"--primary-foreground",
	"--ring",
	"--accent",
	"--accent-foreground",
	"--danger",
	"--success",
	"--warning",
] as const;

function bytesFromBase64(value: string): Uint8Array {
	const decoded = atob(value);
	return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function sha256(bytes: Uint8Array): Promise<string> {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
	return `sha256:${[...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function mimeType(path: string): string {
	if (path.endsWith(".css")) return "text/css";
	if (path.endsWith(".js")) return "text/javascript";
	if (path.endsWith(".svg")) return "image/svg+xml";
	if (path.endsWith(".png")) return "image/png";
	if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
	if (path.endsWith(".webp")) return "image/webp";
	return "application/octet-stream";
}

/** Verifies the registered runtime manifest and creates only session-owned Blob URLs. */
export async function verifyWebTouchpoint(touchpoint: WebTouchpointContent) {
	const parsedManifest = contentPackageManifestSchema.safeParse(
		touchpoint.manifest,
	);
	if (!parsedManifest.success || parsedManifest.data.formatVersion !== 2)
		throw new Error("touchpoint_integrity_failed");
	const manifestBytes = new TextEncoder().encode(
		JSON.stringify(touchpoint.manifest),
	);
	if ((await sha256(manifestBytes)) !== touchpoint.manifestHash)
		throw new Error("touchpoint_integrity_failed");
	const manifest = parsedManifest.data;
	if (
		touchpoint.runtime.kind !== "web-component" ||
		touchpoint.runtime.apiVersion !== 1 ||
		touchpoint.runtime.wrapperVersion !== "vela-touchpoint-wrapper-v1" ||
		touchpoint.runtime.sdkVersion !== "vela-touchpoint-sdk-v1" ||
		manifest.runtimeKind !== touchpoint.runtime.kind ||
		manifest.runtimeApiVersion !== touchpoint.runtime.apiVersion ||
		manifest.platformWrapperVersion !== touchpoint.runtime.wrapperVersion ||
		manifest.sdkVersion !== touchpoint.runtime.sdkVersion
	)
		throw new Error("touchpoint_runtime_unsupported");
	const placement = manifest.placements.find(
		(candidate) => candidate.key === touchpoint.placementKey,
	);
	if (!placement || placement.entry !== touchpoint.entryPath)
		throw new Error("touchpoint_integrity_failed");
	// Parse the shared manifest completely, but never load another host's action
	// into the selected Open Design placement.
	if (
		placement.staticActions.some(
			(action) =>
				action.target.kind !== "https" && action.target.kind !== "internal",
		)
	)
		throw new Error("touchpoint_action_unsupported");
	// A multi-placement version declares a global resource union. Only the selected
	// placement's entry and closure may be materialized or imported in this host.
	const expectedPaths = [placement.entry, ...placement.resources];
	const expectedPathSet = new Set(expectedPaths);
	const manifestPathSet = new Set(manifest.resources);
	if (
		expectedPathSet.size !== expectedPaths.length ||
		manifestPathSet.size !== manifest.resources.length ||
		[...expectedPathSet].some((path) => !manifestPathSet.has(path))
	)
		throw new Error("touchpoint_integrity_failed");

	let totalBytes = 0;
	const resourceUrls = new Map<string, string>();
	const resourceBytes = new Map<string, Uint8Array>();
	const resourceDigests = new Map<string, string>();
	const blobs: string[] = [];
	try {
		for (const resource of touchpoint.resources) {
			if (
				resourceUrls.has(resource.path) ||
				!expectedPathSet.has(resource.path)
			)
				throw new Error("touchpoint_integrity_failed");
			const bytes = bytesFromBase64(resource.bytes);
			totalBytes += bytes.byteLength;
			if (
				totalBytes > MAX_TOUCHPOINT_BYTES ||
				(await sha256(bytes)) !== resource.digest
			)
				throw new Error("touchpoint_integrity_failed");
			const blobBytes = new Uint8Array(bytes.byteLength);
			blobBytes.set(bytes);
			const url = URL.createObjectURL(
				new Blob([blobBytes], { type: mimeType(resource.path) }),
			);
			resourceUrls.set(resource.path, url);
			resourceBytes.set(resource.path, bytes);
			resourceDigests.set(resource.path, resource.digest);
			blobs.push(url);
		}
		if (resourceUrls.size !== expectedPathSet.size)
			throw new Error("touchpoint_integrity_failed");
		const entryBytes = new TextEncoder().encode(touchpoint.entryModule);
		const registeredEntryBytes = resourceBytes.get(touchpoint.entryPath);
		if (
			!registeredEntryBytes ||
			resourceDigests.get(touchpoint.entryPath) !== touchpoint.entryDigest ||
			(await sha256(entryBytes)) !== touchpoint.entryDigest ||
			entryBytes.byteLength !== registeredEntryBytes.byteLength ||
			entryBytes.some((value, index) => value !== registeredEntryBytes[index])
		)
			throw new Error("touchpoint_integrity_failed");
		return {
			resourceUrls,
			entryUrl: resourceUrls.get(touchpoint.entryPath) as string,
			dispose: () => {
				for (const url of blobs) URL.revokeObjectURL(url);
			},
		};
	} catch (error) {
		for (const url of blobs) URL.revokeObjectURL(url);
		throw error;
	}
}

/** The Web browser session imports at most this many distinct module digests. */
export const webTouchpointModuleCache =
	new TouchpointModuleCache<ComponentModule>(32);

// Keep modules that share the host adapter importable in Node-only tests and
// SSR. The real browser global remains the base class whenever the DOM exists;
// DOM methods are only used by the browser mount lifecycle below.
const TouchpointElementBase: typeof HTMLElement =
	typeof HTMLElement === "undefined"
		? (class {} as typeof HTMLElement)
		: HTMLElement;

export class OpenDesignTouchpointElement extends TouchpointElementBase {
	private generation = 0;
	private disposed = true;
	private disposing?: Promise<void>;
	private instance: unknown;
	private module?: ComponentModule;
	private controller?: AbortController;
	private sdkLifecycle?: ReturnType<typeof createTouchpointSdk>;
	private readonly diagnostics: TouchpointDiagnostic[] = [];
	private onDiagnostic?: (diagnostic: TouchpointDiagnostic) => void;
	private readonly lifecycleTimers = new Set<ReturnType<typeof setTimeout>>();
	private contextGeneration = 0;
	private updateQueue?: TouchpointUpdateQueue<WebTouchpointContext>;

	/** Applies host styling only to the open ShadowRoot; it never writes global styles. */
	private applyHostContext(context: WebTouchpointContext) {
		this.style.setProperty("--vela-touchpoint-font-family", context.fontFamily);
		this.style.setProperty("--vela-touchpoint-theme", context.theme);
		for (const [name, value] of Object.entries(context.cssVariables)) {
			if (
				WEB_HOST_VARIABLES.includes(name as (typeof WEB_HOST_VARIABLES)[number])
			)
				this.style.setProperty(name, value);
		}
		let style = this.shadowRoot?.querySelector<HTMLStyleElement>(
			"style[data-vela-touchpoint-host]",
		);
		if (!style && this.shadowRoot) {
			style = document.createElement("style");
			style.dataset.velaTouchpointHost = "";
			style.textContent =
				":host { color-scheme: var(--vela-touchpoint-theme); font-family: var(--vela-touchpoint-font-family); color: var(--foreground); background: var(--background); } *, *::before, *::after { box-sizing: border-box; }";
			this.shadowRoot.prepend(style);
		}
	}

	private recordDiagnostic(diagnostic: TouchpointDiagnostic) {
		this.diagnostics.push(diagnostic);
		this.dispatchEvent(
			new CustomEvent("touchpointdiagnostic", { detail: diagnostic }),
		);
		this.onDiagnostic?.(diagnostic);
	}

	private isCurrent(generation: number) {
		return generation === this.generation && !this.disposed;
	}

	private clearLifecycleTimers() {
		for (const timer of this.lifecycleTimers) clearTimeout(timer);
		this.lifecycleTimers.clear();
	}

	constructor() {
		super();
		this.attachShadow({ mode: "open" });
	}

	getDiagnostics(): readonly TouchpointDiagnostic[] {
		return this.diagnostics;
	}

	async mount(
		entryUrl: string,
		entryDigest: string,
		context: WebTouchpointContext,
		resourceUrls: Map<string, string>,
		actionIds: ReadonlySet<string> = new Set(),
		options: TouchpointLifecycleOptions = {},
	) {
		await this.dispose();
		const generation = ++this.generation;
		this.contextGeneration++;
		this.updateQueue?.cancel();
		this.disposed = false;
		this.onDiagnostic = options.onDiagnostic;
		const controller = new AbortController();
		this.controller = controller;
		const lifecycle = createTouchpointSdk({
			signal: controller.signal,
			actionIds,
			resources: resourceUrls,
			now: () => Date.now(),
			dispatchAction: async (actionId) => {
				if (options.dispatchAction) return options.dispatchAction(actionId);
				this.recordDiagnostic({
					code: "touchpoint_action_denied",
					detail: actionId,
				});
			},
			requestClose: () => {
				if (options.requestClose) return options.requestClose();
				this.recordDiagnostic({
					code: "touchpoint_close_denied",
					detail: context.placementKey,
				});
			},
			diagnose: (diagnostic) => this.recordDiagnostic(diagnostic),
		});
		this.sdkLifecycle = lifecycle;
		this.updateQueue = new TouchpointUpdateQueue(
			async (nextContext) => {
				if (
					!this.isCurrent(generation) ||
					!this.module?.update ||
					!this.sdkLifecycle
				)
					return;
				this.applyHostContext(nextContext);
				await this.module.update(
					this.instance,
					nextContext,
					this.sdkLifecycle.sdk,
				);
				if (!this.isCurrent(generation))
					this.recordDiagnostic({ code: "component_update_expired" });
			},
			(code) => this.recordDiagnostic({ code }),
		);
		this.applyHostContext(context);
		const timeoutMs = options.timeoutMs ?? TOUCHPOINT_TIMEOUT_MS;
		if (!Number.isFinite(timeoutMs) || timeoutMs < 1)
			throw new Error("touchpoint_mount_timeout_invalid");
		let component: ComponentModule | undefined;
		let lateMount: Promise<unknown> | undefined;
		let adoptedLateMount = false;
		try {
			component = await this.withTimeout(
				webTouchpointModuleCache.import(
					entryDigest,
					() =>
						import(
							/* @vite-ignore */ /* webpackIgnore: true */ entryUrl
						) as Promise<ComponentModule>,
				),
				generation,
				"import",
				timeoutMs,
			);
			if (!this.isCurrent(generation)) return;
			const mount = component.mount;
			const shadowRoot = this.shadowRoot;
			if (typeof mount !== "function" || !shadowRoot)
				throw new Error("component_mount_missing");
			lateMount = Promise.resolve().then(() =>
				mount(shadowRoot, context, lifecycle.sdk),
			);
			const instance = await this.withTimeout(
				lateMount,
				generation,
				"mount",
				timeoutMs,
			);
			if (!this.isCurrent(generation)) {
				await this.disposeInstance(component, instance, lifecycle.sdk);
				return;
			}
			adoptedLateMount = true;
			this.module = component;
			this.instance = instance;
		} catch (error) {
			if (lateMount && !adoptedLateMount) {
				void lateMount.then(
					(instance) =>
						this.disposeInstance(component, instance, lifecycle.sdk),
					() => undefined,
				);
			}
			this.recordDiagnostic({
				code:
					error instanceof Error ? error.message : "touchpoint_mount_failed",
			});
			await this.dispose();
			throw error;
		}
	}

	private async withTimeout<T>(
		operation: Promise<T>,
		generation: number,
		phase: "import" | "mount",
		timeoutMs: number,
	): Promise<T> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				operation,
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => {
						if (timer) this.lifecycleTimers.delete(timer);
						if (this.isCurrent(generation)) {
							this.recordDiagnostic({ code: `touchpoint_${phase}_timeout` });
							++this.generation;
							this.disposed = true;
							this.controller?.abort();
							this.sdkLifecycle?.revoke();
							this.controller = undefined;
							this.sdkLifecycle = undefined;
							this.shadowRoot?.replaceChildren();
						}
						reject(new Error("touchpoint_mount_timeout"));
					}, timeoutMs);
					this.lifecycleTimers.add(timer);
				}),
			]);
		} finally {
			if (timer) {
				clearTimeout(timer);
				this.lifecycleTimers.delete(timer);
			}
		}
	}

	async update(
		context: WebTouchpointContext,
		resourceUrls: Map<string, string>,
	) {
		void resourceUrls;
		if (this.disposed || !this.module?.update || !this.updateQueue) return;
		await this.updateQueue.schedule(context).catch((error) => {
			this.recordDiagnostic({
				code:
					error instanceof Error ? error.message : "component_update_failed",
			});
			// Synchronously detach/revoke, but never let component disposal delay the
			// update rejection the React caller needs in order to release its host.
			void this.dispose().catch(() =>
				this.recordDiagnostic({ code: "component_dispose_failed" }),
			);
			throw error;
		});
	}

	async dispose(resourceUrls = new Map<string, string>()) {
		if (this.disposing) return this.disposing;
		if (this.disposed) return;
		const component = this.module;
		const instance = this.instance;
		const sdk = this.sdkLifecycle?.sdk;
		this.disposed = true;
		++this.generation;
		++this.contextGeneration;
		this.updateQueue?.cancel();
		this.updateQueue = undefined;
		this.clearLifecycleTimers();
		this.controller?.abort();
		this.sdkLifecycle?.revoke();
		this.instance = undefined;
		this.module = undefined;
		this.sdkLifecycle = undefined;
		this.controller = undefined;
		// Detach owned DOM now; an uncooperative component dispose promise cannot retain this host.
		this.shadowRoot?.replaceChildren();
		const disposing = (async () => {
			try {
				if (sdk && component && instance !== undefined)
					await this.disposeInstance(component, instance, sdk);
			} finally {
				void resourceUrls;
			}
		})();
		this.disposing = disposing;
		try {
			await disposing;
		} finally {
			if (this.disposing === disposing) this.disposing = undefined;
			this.onDiagnostic = undefined;
		}
	}

	private async disposeInstance(
		component: ComponentModule | undefined,
		instance: unknown,
		sdk: TouchpointSdk,
	) {
		try {
			await component?.dispose?.(instance, sdk);
		} catch {
			this.recordDiagnostic({ code: "component_dispose_failed" });
		}
	}
}

export function ensureWebTouchpointElement(): typeof OpenDesignTouchpointElement {
	const current = customElements.get(ELEMENT_NAME);
	if (current) return current as typeof OpenDesignTouchpointElement;
	customElements.define(ELEMENT_NAME, OpenDesignTouchpointElement);
	return OpenDesignTouchpointElement;
}

/** Resolves the verified placement locale without inventing unsupported locales. */
export function resolveWebTouchpointLocale(
	requestedLocale: string,
	placementLocales: readonly string[],
): string | undefined {
	const normalized = requestedLocale.replace(/_/g, "-");
	const baseLanguage = normalized.split("-")[0] ?? normalized;
	const candidates = [normalized, baseLanguage, "en-US"];
	return candidates.find((candidate) => placementLocales.includes(candidate));
}

/** Reads the current Web theme/font tokens for one isolated component instance. */
export function readWebTouchpointHostContext(
	locale: string,
	theme: "light" | "dark",
): WebTouchpointHostContext {
	const styles = getComputedStyle(document.documentElement);
	const cssVariables = Object.fromEntries(
		WEB_HOST_VARIABLES.map((name) => [
			name,
			styles.getPropertyValue(name).trim(),
		]),
	);
	return Object.freeze({
		locale,
		theme,
		fontFamily:
			styles.getPropertyValue("--font-sans").trim() || styles.fontFamily,
		cssVariables,
	});
}

/** Requires the server decision to exactly describe the immutable placement requirements. */
export function supportsWebTouchpointCapabilities(
	touchpoint: WebTouchpointContent,
	requiredCapabilities: unknown,
	supportedCapabilities: ReadonlySet<string>,
): boolean {
	const placement = touchpoint.manifest.placements.find(
		(candidate) => candidate.key === touchpoint.placementKey,
	);
	if (
		!placement ||
		!Array.isArray(requiredCapabilities) ||
		!requiredCapabilities.every(
			(capability) => typeof capability === "string",
		) ||
		new Set(requiredCapabilities).size !== requiredCapabilities.length
	)
		return false;
	const required = new Set(requiredCapabilities);
	return (
		required.size === placement.requiredCapabilities.length &&
		placement.requiredCapabilities.every((capability) =>
			required.has(capability),
		) &&
		requiredCapabilities.every((capability) =>
			supportedCapabilities.has(capability),
		)
	);
}

/** Emits a host-visible diagnostic when an optional immutable package is skipped. */
export function emitWebTouchpointDiagnostic(diagnostic: TouchpointDiagnostic) {
	document.dispatchEvent(
		new CustomEvent("touchpointdiagnostic", { detail: diagnostic }),
	);
}

const FOCUSABLE_SELECTOR =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Returns host controls in composed-tree order, including open component ShadowRoots. */
function composedFocusableElements(root: ParentNode): HTMLElement[] {
	const focusable: HTMLElement[] = [];
	for (const child of Array.from(root.children)) {
		if (!(child instanceof HTMLElement) || child.hidden) continue;
		if (child.matches(FOCUSABLE_SELECTOR)) focusable.push(child);
		if (child.shadowRoot)
			focusable.push(...composedFocusableElements(child.shadowRoot));
		focusable.push(...composedFocusableElements(child));
	}
	return focusable;
}

function composedActiveElement(): Element | null {
	let active: Element | null = document.activeElement;
	while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
		active = active.shadowRoot.activeElement;
	}
	return active;
}

const modalScrollLocks = new WeakMap<
	HTMLElement,
	{ count: number; overflow: string }
>();

/** Keeps a concurrent CMS modal from releasing the host scroll lock owned by another modal. */
export function lockWebTouchpointModalScroll(
	body: HTMLElement = document.body,
): () => void {
	const existing = modalScrollLocks.get(body);
	if (existing) {
		existing.count += 1;
	} else {
		modalScrollLocks.set(body, { count: 1, overflow: body.style.overflow });
		body.style.overflow = "hidden";
	}
	let released = false;
	return () => {
		if (released) return;
		released = true;
		const lock = modalScrollLocks.get(body);
		if (!lock) return;
		lock.count -= 1;
		if (lock.count === 0) {
			body.style.overflow = lock.overflow;
			modalScrollLocks.delete(body);
		}
	};
}

/** Keeps keyboard focus inside a host-owned modal without exposing host DOM to content. */
export function trapWebTouchpointModalFocus(
	event: KeyboardEvent,
	modal: HTMLElement | null,
) {
	if (event.key !== "Tab" || !modal) return;
	const focusable = composedFocusableElements(modal);
	if (focusable.length === 0) {
		event.preventDefault();
		modal.focus();
		return;
	}
	const first = focusable[0]!;
	const last = focusable[focusable.length - 1]!;
	const active = composedActiveElement();
	if (event.shiftKey && active === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && active === last) {
		event.preventDefault();
		first.focus();
	}
}

export function webTouchpointContext(
	touchpoint: WebTouchpointContent,
	host: WebTouchpointHostContext = readWebTouchpointHostContext(
		touchpoint.locale,
		document.documentElement.classList.contains("dark") ? "dark" : "light",
	),
): WebTouchpointContext | undefined {
	const placement = touchpoint.manifest.placements.find(
		(candidate) => candidate.key === touchpoint.placementKey,
	);
	const locale = placement
		? resolveWebTouchpointLocale(host.locale, placement.locales)
		: undefined;
	if (!locale) return undefined;
	return Object.freeze({
		instanceId: crypto.randomUUID(),
		contentVersionId: touchpoint.id,
		placementKey: touchpoint.placementKey,
		locale,
		theme: host.theme,
		fontFamily: host.fontFamily,
		cssVariables: host.cssVariables,
		mode: "production",
	});
}
