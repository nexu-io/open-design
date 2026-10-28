// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type { WebTouchpointContent } from "../../src/components/touchpoint-component";

const mounts = vi.fn(async () => undefined);
const disposes = vi.fn(async () => undefined);
const verify = vi.fn();
vi.mock("../../src/components/touchpoint-component", async () => ({
	ensureWebTouchpointElement: () => {
		if (!customElements.get("opend-touchpoint")) {
			customElements.define(
				"opend-touchpoint",
				class extends HTMLElement {
					mount = mounts;
					dispose = disposes;
				},
			);
		}
		return customElements.get("opend-touchpoint");
	},
	verifyWebTouchpoint: verify,
	webTouchpointContext: vi.fn(() => ({
		instanceId: "instance",
		contentVersionId: "version",
		placementKey: "opend.home.hover-entry",
		locale: "en-US",
		theme: "light",
		fontFamily: "sans",
		cssVariables: {},
		mode: "production",
	})),
}));

const { HoverTouchpointOverlay, hoverBridgeRect, placeHoverOverlay } = await import(
	"../../src/components/HoverTouchpointOverlay"
);
const content = (placementKey: string): WebTouchpointContent => ({
	id: placementKey,
	placementKey,
	locale: "en-US",
	manifestHash: "sha256:x",
	entryPath: "component.js",
	entryDigest: "sha256:y",
	entryModule: "",
	resources: [],
	manifest: {
		formatVersion: 2,
		runtimeKind: "web-component",
		runtimeApiVersion: 1,
		platformWrapperVersion: "vela-touchpoint-wrapper-v1",
		sdkVersion: "vela-touchpoint-sdk-v1",
		contentLine: "test",
		placements: [
			{
				key: placementKey as never,
				entry: "component.js",
				resources: [],
				locales: ["en-US"],
				requiredCapabilities: [],
				staticActions: [],
			},
		],
		resources: [],
		images: [],
	},
	runtime: {
		kind: "web-component",
		apiVersion: 1,
		wrapperVersion: "vela-touchpoint-wrapper-v1",
		sdkVersion: "vela-touchpoint-sdk-v1",
	},
	buildIdentity: { fingerprint: "test" },
});
const verified = (dispose = vi.fn()) => ({
	entryUrl: "blob:entry",
	resourceUrls: new Map(),
	dispose,
});

beforeEach(() => {
	mounts.mockReset();
	mounts.mockResolvedValue(undefined);
	disposes.mockReset();
	disposes.mockResolvedValue(undefined);
	verify.mockReset();
	verify.mockResolvedValue(verified());
});
afterEach(() => cleanup());

describe("HoverTouchpointOverlay measured clipping", () => {
	let resize: () => void;
	let observed: Element[];
	let frames: FrameRequestCallback[];
	beforeEach(() => {
		observed = [];
		frames = [];
		vi.stubGlobal("ResizeObserver", class {
			constructor(callback: () => void) { resize = callback; }
			observe(element: Element) { observed.push(element); }
			disconnect() {}
		});
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
		vi.spyOn(window, "innerWidth", "get").mockReturnValue(400);
		vi.spyOn(window, "innerHeight", "get").mockReturnValue(300);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});
	const flushLayout = () => act(() => {
		const pending = frames.splice(0);
		for (const callback of pending) callback(0);
	});
	const setup = async (width = 120, height = 60) => {
		const { container } = render(createElement(HoverTouchpointOverlay, {
			entry: content("opend.home.hover-entry"),
			layer: content("opend.home.hover-layer"),
			isAuthorized: () => true,
		}));
		const [entry, layer] = Array.from(container.querySelectorAll("opend-touchpoint")) as [HTMLElement, HTMLElement];
		const size = { width, height };
		const card = document.createElement("div");
		layer.attachShadow({ mode: "open" }).appendChild(card);
		vi.spyOn(entry, "getBoundingClientRect").mockReturnValue({ left: 40, top: 20, right: 64, bottom: 44, width: 24, height: 24 } as DOMRect);
		const constrained = (axis: "Width" | "Height") => Math.min(size[axis === "Width" ? "width" : "height"], Number.parseFloat(layer.style[`max${axis}`]) || Infinity);
		vi.spyOn(layer, "getBoundingClientRect").mockImplementation(() => ({ left: 40, top: 52, right: 40 + constrained("Width"), bottom: 52 + constrained("Height"), width: constrained("Width"), height: constrained("Height") }) as DOMRect);
		Object.defineProperties(layer, {
			clientWidth: { get: () => constrained("Width") },
			clientHeight: { get: () => constrained("Height") },
			scrollWidth: { get: () => Math.max(size.width, constrained("Width")) },
			scrollHeight: { get: () => Math.max(size.height, constrained("Height")) },
		});
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		fireEvent.pointerEnter(entry);
		flushLayout();
		return { entry, layer, card, size };
	};

	it("leaves fitting material shadows unclipped", async () => {
		const { layer } = await setup();
		expect(layer.style.overflow).toBe("visible");
		expect(layer.style.maxWidth).toBe("384px");
		expect(layer.style.maxHeight).toBe("240px");
	});

	it.each([[600, 60], [120, 600]])("scrolls content constrained in either axis (%i × %i) and recovers after content shrink", async (width, height) => {
		const { layer, card, size } = await setup(width, height);
		expect(layer.style.overflow).toBe("auto");
		expect(observed).toContain(card);
		layer.scrollTop = 30;
		layer.scrollLeft = 20;
		act(() => resize());
		flushLayout();
		expect(layer.scrollTop).toBe(30);
		expect(layer.scrollLeft).toBe(20);
		size.width = 120;
		size.height = 60;
		act(() => resize());
		flushLayout();
		expect(layer.style.overflow).toBe("visible");
	});

	it("remeasures natural content on viewport growth instead of retaining old scroll constraints", async () => {
		const { layer } = await setup(600, 600);
		expect(layer.style.overflow).toBe("auto");
		vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
		vi.spyOn(window, "innerHeight", "get").mockReturnValue(1000);
		fireEvent.resize(window);
		flushLayout();
		expect(layer.style.overflow).toBe("visible");
		expect(layer.style.maxWidth).toBe("984px");
		expect(layer.style.maxHeight).toBe("940px");
	});

	it("checks overflow after width constraints reflow the material, then recovers when the viewport grows", async () => {
		const { layer, size } = await setup(600, 60);
		Object.defineProperty(size, "height", {
			get: () => Number.parseFloat(layer.style.maxWidth) < 600 ? 600 : 60,
		});
		act(() => resize());
		flushLayout();
		expect(layer.clientHeight).toBe(284);
		expect(layer.style.overflow).toBe("auto");
		vi.spyOn(window, "innerWidth", "get").mockReturnValue(1000);
		fireEvent.resize(window);
		flushLayout();
		expect(layer.style.overflow).toBe("visible");
		// Material growth while the host is open must re-enter scroll mode.
		size.width = 1200;
		act(() => resize());
		flushLayout();
		expect(layer.style.overflow).toBe("auto");
	});

	it("keeps width-reflowed content above a low anchor within viewport bounds", async () => {
		const { entry, layer, size } = await setup(600, 60);
		vi.spyOn(entry, "getBoundingClientRect").mockReturnValue({ left: 40, top: 250, right: 64, bottom: 274, width: 24, height: 24 } as DOMRect);
		Object.defineProperty(size, "height", {
			get: () => Number.parseFloat(layer.style.maxWidth) < 600 ? 600 : 60,
		});
		act(() => resize());
		flushLayout();
		expect(layer.style.top).toBe("8px");
		expect(layer.style.maxHeight).toBe("234px");
		expect(layer.style.overflow).toBe("auto");
	});
});

describe("HoverTouchpointOverlay interaction boundary", () => {
	beforeAll(() => {
		(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
			observe() {}
			disconnect() {}
		};
	});
	it("keeps default action sets stable and handles pointer focus before click without reopening after Escape", async () => {
		const {container}=render(createElement(HoverTouchpointOverlay, {
			entry:content("opend.home.hover-entry"),
			layer:content("opend.home.hover-layer"),
			isAuthorized: () => true,
		}));
		const [entry,layer]=Array.from(container.querySelectorAll<HTMLElement>("opend-touchpoint"));
		await waitFor(()=>expect(entry).not.toHaveAttribute("hidden"));
		expect(entry).toHaveAttribute("class");
		expect(entry).not.toHaveAttribute("classname");
		fireEvent.pointerDown(entry!);
		act(()=>entry!.focus());
		fireEvent.click(entry!);
		expect(layer!.parentElement).not.toHaveAttribute("hidden");
		const action=document.createElement("button");
		layer!.appendChild(action);
		act(()=>action.focus());
		fireEvent.keyDown(window,{key:"Escape"});
		expect(layer!.parentElement).toHaveAttribute("hidden");
		expect(document.activeElement).toBe(entry);
		expect(mounts).toHaveBeenCalledTimes(2);
	});
	it("keeps the entry/layer pointer-focus union open, supports touch click and Escape, then disposes both adapter instances", async () => {
		const dispatchEntryAction = vi.fn(async () => undefined);
		const dispatchLayerAction = vi.fn(async () => undefined);
		const { container, unmount } = render(
			createElement(HoverTouchpointOverlay, {
				entry: content("opend.home.hover-entry"),
				layer: content("opend.home.hover-layer"),
				isAuthorized: () => true,
				entryActionIds: new Set(["entry-action"]),
				layerActionIds: new Set(["layer-action"]),
				dispatchEntryAction,
				dispatchLayerAction,
			}),
		);
		const [entry, layer] = Array.from(
			container.querySelectorAll("opend-touchpoint"),
		) as HTMLElement[];
		expect(entry).toHaveAttribute("hidden");
		expect(layer).toHaveAttribute("hidden");
		await waitFor(() => expect(mounts).toHaveBeenCalledTimes(2));
		const [entryMount, layerMount] = mounts.mock.calls as unknown as Array<[
			string, string, unknown, unknown, ReadonlySet<string>, { dispatchAction: (id: string) => Promise<void> },
		]>;
		expect([...entryMount![4]]).toEqual(["entry-action"]);
		expect([...layerMount![4]]).toEqual(["layer-action"]);
		await entryMount![5].dispatchAction("entry-action");
		await layerMount![5].dispatchAction("layer-action");
		expect(dispatchEntryAction).toHaveBeenCalledWith("entry-action");
		expect(dispatchLayerAction).toHaveBeenCalledWith("layer-action");
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		fireEvent.pointerEnter(entry!);
		expect(layer!.parentElement).not.toHaveAttribute("hidden");
		fireEvent.pointerLeave(entry!, { relatedTarget: layer });
		expect(layer!.parentElement).not.toHaveAttribute("hidden");
		fireEvent.click(entry!);
		expect(layer!.parentElement).not.toHaveAttribute("hidden");
		fireEvent.click(entry!);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(layer!.parentElement).toHaveAttribute("hidden");
		unmount();
		await waitFor(() => expect(disposes).toHaveBeenCalledTimes(2));
	});

	it("keeps the union open across the measured 8px bridge over multiple frames three times so a layer action can be clicked", async () => {
		const { container } = render(
			createElement(HoverTouchpointOverlay, {
				entry: content("opend.home.hover-entry"),
				layer: content("opend.home.hover-layer"),
				isAuthorized: () => true,
			}),
		);
		const [entry, layer] = Array.from(container.querySelectorAll("opend-touchpoint")) as [HTMLElement, HTMLElement];
		const entryRect = { left: 40, top: 20, right: 64, bottom: 44, width: 24, height: 24 };
		const layerRect = { left: 40, top: 52, right: 160, bottom: 112, width: 120, height: 60 };
		vi.spyOn(entry, "getBoundingClientRect").mockReturnValue(entryRect as unknown as DOMRect);
		vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(layerRect as unknown as DOMRect);
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		expect(hoverBridgeRect(entryRect, layerRect)).toMatchObject({ top: 44, bottom: 52, left: 40, right: 64 });
		for (let crossing = 0; crossing < 3; crossing += 1) {
			fireEvent.pointerEnter(entry);
			fireEvent.pointerLeave(entry, { clientX: 52, clientY: 46 });
			// Slow diagonal movement can spend several paints in the physical gap.
			await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			fireEvent.pointerMove(document, { clientX: 54, clientY: 50 });
			fireEvent.pointerEnter(layer, { clientX: 56, clientY: 54 });
			expect(layer.parentElement).not.toHaveAttribute("hidden");
		}
		// The same measured corridor must work when returning from the layer.
		fireEvent.pointerLeave(layer, { clientX: 52, clientY: 50 });
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		fireEvent.pointerMove(document, { clientX: 52, clientY: 46 });
		fireEvent.pointerEnter(entry, { clientX: 52, clientY: 42 });
		expect(layer.parentElement).not.toHaveAttribute("hidden");
		const action = document.createElement("button");
		const click = vi.fn();
		action.addEventListener("click", click);
		layer.appendChild(action);
		fireEvent.click(action);
		expect(click).toHaveBeenCalledOnce();
		expect(layer.parentElement).not.toHaveAttribute("hidden");
		fireEvent.pointerLeave(layer, { clientX: 200, clientY: 130 });
		expect(layer.parentElement).toHaveAttribute("hidden");
	});

	it("flips above and clamps to a narrow viewport without changing keyboard dismissal", async () => {
		const position = placeHoverOverlay(
			{ left: 70, top: 80, right: 94, bottom: 104, width: 24, height: 24 },
			{ width: 120, height: 60 },
			{ left: 0, top: 0, right: 100, bottom: 110, width: 100, height: 110 },
		);
		expect(position).toMatchObject({ placement: "above", left: 8, maxWidth: 84 });
		const { container } = render(createElement(HoverTouchpointOverlay, {
			entry: content("opend.home.hover-entry"),
			layer: content("opend.home.hover-layer"),
			isAuthorized: () => true,
		}));
		const [entry, layer] = Array.from(container.querySelectorAll("opend-touchpoint")) as [HTMLElement, HTMLElement];
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		act(() => entry.focus());
		expect(layer.parentElement).not.toHaveAttribute("hidden");
		fireEvent.keyDown(window, { key: "Escape" });
		expect(layer.parentElement).toHaveAttribute("hidden");
		expect(document.activeElement).toBe(entry);
	});

	it("disposes a resource acquired after unmount during first verification", async () => {
		let resolveEntry!: (value: ReturnType<typeof verified>) => void;
		const entryDispose = vi.fn();
		verify.mockImplementationOnce(
			() =>
				new Promise<ReturnType<typeof verified>>((resolve) => {
					resolveEntry = resolve;
				}),
		);
		const { unmount } = render(
			createElement(HoverTouchpointOverlay, {
				entry: content("opend.home.hover-entry"),
				layer: content("opend.home.hover-layer"),
				isAuthorized: () => true,
			}),
		);
		unmount();
		resolveEntry(verified(entryDispose));
		await waitFor(() => expect(entryDispose).toHaveBeenCalledOnce());
		expect(disposes).not.toHaveBeenCalled();
		expect(verify).toHaveBeenCalledOnce();
	});

	it("disposes every resource acquired after unmount during second verification", async () => {
		let resolveLayer!: (value: ReturnType<typeof verified>) => void;
		const entryDispose = vi.fn();
		const layerDispose = vi.fn();
		verify
			.mockResolvedValueOnce(verified(entryDispose))
			.mockImplementationOnce(
				() =>
					new Promise<ReturnType<typeof verified>>((resolve) => {
						resolveLayer = resolve;
					}),
			);
		const { unmount } = render(
			createElement(HoverTouchpointOverlay, {
				entry: content("opend.home.hover-entry"),
				layer: content("opend.home.hover-layer"),
				isAuthorized: () => true,
			}),
		);
		await waitFor(() => expect(verify).toHaveBeenCalledTimes(2));
		unmount();
		resolveLayer(verified(layerDispose));
		await waitFor(() => expect(layerDispose).toHaveBeenCalledOnce());
		expect(entryDispose).toHaveBeenCalledOnce();
		expect(disposes).not.toHaveBeenCalled();
	});

	it("disposes acquired element and verified Blob resources when unmounted during a deferred mount", async () => {
		let resolveEntryMount!: (value: undefined) => void;
		mounts.mockImplementationOnce(
			() =>
				new Promise<undefined>((resolve) => {
					resolveEntryMount = resolve;
				}),
		);
		const entryDispose = vi.fn();
		const layerDispose = vi.fn();
		verify
			.mockResolvedValueOnce(verified(entryDispose))
			.mockResolvedValueOnce(verified(layerDispose));
		const { unmount } = render(
			createElement(HoverTouchpointOverlay, {
				entry: content("opend.home.hover-entry"),
				layer: content("opend.home.hover-layer"),
				isAuthorized: () => true,
			}),
		);
		await waitFor(() => expect(mounts).toHaveBeenCalledTimes(1));
		unmount();
		resolveEntryMount(undefined);
		await waitFor(() => expect(disposes).toHaveBeenCalledTimes(2));
		expect(entryDispose).toHaveBeenCalledOnce();
		expect(layerDispose).toHaveBeenCalledOnce();
		expect(mounts).toHaveBeenCalledTimes(1);
	});

	it("disposes both verified Blob resources and both elements when the second mount fails", async () => {
		const entryDispose = vi.fn();
		const layerDispose = vi.fn();
		verify
			.mockResolvedValueOnce(verified(entryDispose))
			.mockResolvedValueOnce(verified(layerDispose));
		mounts
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("layer_mount_failed"));
		render(
			createElement(HoverTouchpointOverlay, {
				entry: content("opend.home.hover-entry"),
				layer: content("opend.home.hover-layer"),
				isAuthorized: () => true,
			}),
		);
		await waitFor(() => expect(disposes).toHaveBeenCalledTimes(2));
		expect(entryDispose).toHaveBeenCalledOnce();
		expect(layerDispose).toHaveBeenCalledOnce();
	});
});
