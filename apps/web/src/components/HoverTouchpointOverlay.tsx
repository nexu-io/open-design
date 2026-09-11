import {
	createElement,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	ensureWebTouchpointElement,
	type WebTouchpointContent,
	webTouchpointContext,
	verifyWebTouchpoint,
} from "./touchpoint-component";
import styles from "./HoverTouchpointOverlay.module.css";

const ENTRY_PLACEMENT = "opend.home.hover-entry";
const LAYER_PLACEMENT = "opend.home.hover-layer";
const VIEWPORT_MARGIN = 8;
const GAP = 8;
const EMPTY_ACTION_IDS: ReadonlySet<string> = new Set();

export type HoverOverlayPosition = Readonly<{
	left: number;
	top: number;
	maxWidth: number;
	maxHeight: number;
	placement: "above" | "below";
}>;
type Rect = Readonly<{
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}>;

/** Calculates a fixed overlay position from CSS viewport coordinates, including visual viewport zoom offsets. */
export function placeHoverOverlay(
	anchor: Rect,
	layer: Pick<Rect, "width" | "height">,
	viewport: Rect,
): HoverOverlayPosition {
	const maxWidth = Math.max(0, viewport.width - VIEWPORT_MARGIN * 2);
	const maxHeight = Math.max(0, viewport.height - VIEWPORT_MARGIN * 2);
	const below = viewport.bottom - anchor.bottom - GAP;
	const above = anchor.top - viewport.top - GAP;
	const placement =
		below >= Math.min(layer.height, maxHeight) || below >= above
			? "below"
			: "above";
	const height = Math.min(layer.height, maxHeight);
	const top =
		placement === "below"
			? Math.min(
					anchor.bottom + GAP,
					viewport.bottom - height - VIEWPORT_MARGIN,
				)
			: Math.max(viewport.top + VIEWPORT_MARGIN, anchor.top - GAP - height);
	return Object.freeze({
		left: Math.max(
			viewport.left + VIEWPORT_MARGIN,
			Math.min(
				anchor.left,
				viewport.right - Math.min(layer.width, maxWidth) - VIEWPORT_MARGIN,
			),
		),
		top,
		maxWidth,
		maxHeight:
			placement === "below"
				? Math.max(0, viewport.bottom - top - VIEWPORT_MARGIN)
				: Math.max(0, anchor.top - GAP - viewport.top - VIEWPORT_MARGIN),
		placement,
	});
}

/**
 * Returns the physical gap shared by vertically adjacent entry and layer
 * rectangles. The overlap requirement prevents an unrelated side exit from
 * becoming a permissive hover region.
 */
export function hoverBridgeRect(anchor: Rect, layer: Rect): Rect | undefined {
	const left = Math.max(anchor.left, layer.left);
	const right = Math.min(anchor.right, layer.right);
	if (right <= left) return undefined;
	if (anchor.bottom <= layer.top) {
		return { left, right, top: anchor.bottom, bottom: layer.top, width: right - left, height: layer.top - anchor.bottom };
	}
	if (layer.bottom <= anchor.top) {
		return { left, right, top: layer.bottom, bottom: anchor.top, width: right - left, height: anchor.top - layer.bottom };
	}
	return undefined;
}

function pointIsInRect(point: Pick<PointerEvent, "clientX" | "clientY">, rect: Rect | undefined) {
	return Boolean(
		rect &&
			point.clientX >= rect.left && point.clientX <= rect.right &&
			point.clientY >= rect.top && point.clientY <= rect.bottom,
	);
}

function viewportRect(): Rect {
	const visual = window.visualViewport;
	const left = visual?.offsetLeft ?? 0;
	const top = visual?.offsetTop ?? 0;
	const width = visual?.width ?? window.innerWidth;
	const height = visual?.height ?? window.innerHeight;
	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
	};
}

export type HoverTouchpointOverlayProps = Readonly<{
	entry: WebTouchpointContent;
	layer: WebTouchpointContent;
	mode?: "test" | "production";
	onDiagnostic?: (code: string) => void;
	onEntryVisible?: () => void;
	onLayerVisible?: () => void;
	entryActionIds?: ReadonlySet<string>;
	layerActionIds?: ReadonlySet<string>;
	dispatchEntryAction?: (actionId: string) => Promise<void>;
	dispatchLayerAction?: (actionId: string) => Promise<void>;
}>;

/**
 * Host-owned union of separately authorized hover entry and layer components.
 * The layer stays in this shell-level overlay root, rather than the anchor's
 * stacking context, while both components retain their own ShadowRoot.
 */
export function HoverTouchpointOverlay({
	entry,
	layer,
	mode = "production",
	onDiagnostic,
	onEntryVisible,
	onLayerVisible,
	entryActionIds = EMPTY_ACTION_IDS,
	layerActionIds = EMPTY_ACTION_IDS,
	dispatchEntryAction,
	dispatchLayerAction,
}: HoverTouchpointOverlayProps) {
	const [open, setOpen] = useState(false);
	const [ready, setReady] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const entryRef = useRef<HTMLElement>(null);
	const layerRef = useRef<HTMLElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const restoringFocusRef = useRef(false);
	const pointerIsInBridgeRef = useRef(false);
	const [position, setPosition] = useState<HoverOverlayPosition>();
	const [elementReady, setElementReady] = useState(() =>
		typeof customElements !== "undefined" && customElements.get("opend-touchpoint") !== undefined,
	);
	useEffect(() => {
		ensureWebTouchpointElement();
		setElementReady(true);
	}, []);

	const close = useCallback((restoreFocus = false) => {
		pointerIsInBridgeRef.current = false;
		setOpen(false);
		if (restoreFocus) {
			restoringFocusRef.current = true;
			restoreFocusRef.current?.focus();
			restoringFocusRef.current = false;
		}
	}, []);
	const openHover = useCallback(() => {
		pointerIsInBridgeRef.current = false;
		setOpen(true);
	}, []);
	const pointerIsInBridge = useCallback((event: Pick<PointerEvent, "clientX" | "clientY">) => {
		const anchor = entryRef.current?.getBoundingClientRect();
		const layer = layerRef.current?.getBoundingClientRect();
		return Boolean(anchor && layer && pointIsInRect(event, hoverBridgeRect(anchor, layer)));
	}, []);
	const schedulePointerClose = useCallback((event: React.PointerEvent) => {
		pointerIsInBridgeRef.current = pointerIsInBridge(event.nativeEvent);
		if (!pointerIsInBridgeRef.current) close();
	}, [close, pointerIsInBridge]);
	useEffect(() => {
		const closeWhenLeavingBridge = (event: PointerEvent) => {
			if (pointerIsInBridgeRef.current && !pointerIsInBridge(event)) close();
		};
		document.addEventListener("pointermove", closeWhenLeavingBridge);
		return () => document.removeEventListener("pointermove", closeWhenLeavingBridge);
	}, [close, pointerIsInBridge]);
	const refreshPosition = useCallback(() => {
		const anchor = entryRef.current?.getBoundingClientRect();
		const overlay = layerRef.current?.getBoundingClientRect();
		if (!anchor || !overlay) return;
		setPosition(placeHoverOverlay(anchor, overlay, viewportRect()));
	}, []);

	useEffect(() => {
		if (!elementReady) return;
		if (
			entry.placementKey !== ENTRY_PLACEMENT ||
			layer.placementKey !== LAYER_PLACEMENT
		) {
			onDiagnostic?.("hover_placement_mismatch");
			return;
		}
		let cancelled = false;
		let entryVerified:
			| Awaited<ReturnType<typeof verifyWebTouchpoint>>
			| undefined;
		let layerVerified:
			| Awaited<ReturnType<typeof verifyWebTouchpoint>>
			| undefined;
		let entryElement: InstanceType<
			ReturnType<typeof ensureWebTouchpointElement>
		> | null = null;
		let layerElement: InstanceType<
			ReturnType<typeof ensureWebTouchpointElement>
		> | null = null;
		let disposed = false;
		const dispose = () => {
			if (disposed) return;
			disposed = true;
			// Each disposer is retained at acquisition, not after the pair completes.
			void entryElement?.dispose();
			void layerElement?.dispose();
			entryVerified?.dispose();
			layerVerified?.dispose();
		};
		const abandon = () => cancelled;
		const mount = async () => {
			try {
				entryVerified = await verifyWebTouchpoint(entry);
				if (abandon()) {
					entryVerified.dispose();
					return;
				}
				layerVerified = await verifyWebTouchpoint(layer);
				if (abandon()) {
					layerVerified.dispose();
					return;
				}
				const Element = ensureWebTouchpointElement();
				entryElement = entryRef.current as InstanceType<typeof Element> | null;
				layerElement = layerRef.current as InstanceType<typeof Element> | null;
				const entryContext = webTouchpointContext(entry);
				const layerContext = webTouchpointContext(layer);
				if (!entryElement || !layerElement || !entryContext || !layerContext)
					throw new Error("hover_context_unsupported");
				await entryElement.mount(
					entryVerified.entryUrl,
					entry.entryDigest,
					{ ...entryContext, mode },
					entryVerified.resourceUrls,
					entryActionIds,
					{
						dispatchAction: dispatchEntryAction,
						onDiagnostic: (d) => onDiagnostic?.(d.code),
					},
				);
				if (abandon()) return;
				await layerElement.mount(
					layerVerified.entryUrl,
					layer.entryDigest,
					{ ...layerContext, mode },
					layerVerified.resourceUrls,
					layerActionIds,
					{
						dispatchAction: dispatchLayerAction,
						requestClose: () => close(true),
						onDiagnostic: (d) => onDiagnostic?.(d.code),
					},
				);
				if (abandon()) return;
				setReady(true);
				requestAnimationFrame(() => {
					if (!cancelled && !document.hidden && entryElement?.getClientRects().length)
						onEntryVisible?.();
				});
			} catch (error) {
				dispose();
				if (!cancelled) {
					onDiagnostic?.(
						error instanceof Error ? error.message : "hover_mount_failed",
					);
					close();
				}
			}
		};
		void mount();
		return () => {
			cancelled = true;
			setReady(false);
			dispose();
		};
	}, [close, dispatchEntryAction, dispatchLayerAction, elementReady, entry, entryActionIds, layer, layerActionIds, mode, onDiagnostic, onEntryVisible, onLayerVisible]);

	useLayoutEffect(() => {
		if (open && ready) refreshPosition();
	}, [open, ready, refreshPosition]);
	useEffect(() => {
		if (!open || !ready) return;
		const frame = requestAnimationFrame(() => {
			if (!document.hidden && layerRef.current?.getClientRects().length)
				onLayerVisible?.();
		});
		return () => cancelAnimationFrame(frame);
	}, [onLayerVisible, open, ready]);
	useEffect(() => {
		if (!open || !ready) return;
		const reposition = () => refreshPosition();
		const visual = window.visualViewport;
		const observer = new ResizeObserver(reposition);
		if (entryRef.current) observer.observe(entryRef.current);
		if (layerRef.current) observer.observe(layerRef.current);
		window.addEventListener("scroll", reposition, true);
		window.addEventListener("resize", reposition);
		visual?.addEventListener("resize", reposition);
		visual?.addEventListener("scroll", reposition);
		return () => {
			observer.disconnect();
			window.removeEventListener("scroll", reposition, true);
			window.removeEventListener("resize", reposition);
			visual?.removeEventListener("resize", reposition);
			visual?.removeEventListener("scroll", reposition);
		};
	}, [open, ready, refreshPosition]);
	useEffect(() => {
		const keydown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && open) {
				event.stopPropagation();
				close(true);
			}
		};
		window.addEventListener("keydown", keydown);
		return () => window.removeEventListener("keydown", keydown);
	}, [open, close]);

	const relatedTargetIsInUnion = (relatedTarget: EventTarget | null) =>
		relatedTarget instanceof Node && rootRef.current?.contains(relatedTarget);
	const closeIfOutsideUnion = () =>
		queueMicrotask(() => {
			const active = document.activeElement;
			if (!rootRef.current?.contains(active)) close();
		});
	if (!ready && !entryRef.current) {
		// Elements must exist for the adapter mount effect; visibility follows ready.
	}
	if (!elementReady) return null;
	return createElement(
		"div",
		{
			ref: rootRef,
			className: styles.root,
			"data-testid": "cms-hover-overlay-root",
		},
		createElement("opend-touchpoint", {
			ref: entryRef,
			class: styles.entry,
			hidden: ready ? undefined : true,
			tabIndex: 0,
			"aria-expanded": open,
			"aria-haspopup": "dialog",
			onPointerEnter: openHover,
			onPointerLeave: (event: React.PointerEvent) => {
				if (!relatedTargetIsInUnion(event.relatedTarget))
					schedulePointerClose(event);
			},
			onFocus: () => {
				restoreFocusRef.current = entryRef.current;
				if (!restoringFocusRef.current) openHover();
			},
			onBlur: closeIfOutsideUnion,
			// Hover and focus may already have opened the layer before a click.
			// Activation always opens; Escape/outside focus remain the close paths.
			onClick: openHover,
		}),
		createElement(
			"div",
			{
				className: styles.overlayRoot,
				hidden: !open || !ready,
				"aria-hidden": !open,
			},
			createElement("opend-touchpoint", {
				ref: layerRef,
				class: styles.layer,
				hidden: ready ? undefined : true,
				role: "dialog",
				"aria-label": "Campaign",
				style: position
					? {
							left: position.left,
							top: position.top,
							maxWidth: position.maxWidth,
							maxHeight: position.maxHeight,
						}
					: undefined,
				onPointerEnter: openHover,
				onPointerLeave: (event: React.PointerEvent) => {
					if (!relatedTargetIsInUnion(event.relatedTarget))
						schedulePointerClose(event);
				},
				onFocus: openHover,
				onBlur: closeIfOutsideUnion,
			}),
		),
	);
}
