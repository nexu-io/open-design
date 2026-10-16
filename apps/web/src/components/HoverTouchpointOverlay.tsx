import type { TouchpointLoadAttempt } from "./touchpoint-load-observability";
import type { TouchpointTimeContext } from "@open-design/contracts";
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
import {
	isTouchpointVisible,
	watchTouchpointVisibility,
} from "./touchpoint-lifecycle";
import styles from "./HoverTouchpointOverlay.module.css";
import { useI18n } from "../i18n";

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
	margin: number = VIEWPORT_MARGIN,
): HoverOverlayPosition {
	const maxWidth = Math.max(0, viewport.width - margin * 2);
	const maxHeight = Math.max(0, viewport.height - margin * 2);
	const below = viewport.bottom - anchor.bottom - GAP;
	const above = anchor.top - viewport.top - GAP;
	const placement =
		below >= Math.min(layer.height, maxHeight) || below >= above
			? "below"
			: "above";
	const height = Math.min(layer.height, maxHeight);
	const top =
		placement === "below"
			? Math.max(viewport.top + margin, Math.min(
					anchor.bottom + GAP,
					viewport.bottom - height - margin,
				))
			: Math.max(viewport.top + margin, anchor.top - GAP - height);
	return Object.freeze({
		left: Math.max(
			viewport.left + margin,
			Math.min(
				anchor.left,
				viewport.right - Math.min(layer.width, maxWidth) - margin,
			),
		),
		top,
		maxWidth,
		maxHeight:
			placement === "below"
				? Math.max(0, viewport.bottom - top - margin)
				: Math.max(0, anchor.top - GAP - viewport.top - margin),
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

function viewportRect(contentViewport = false): Rect {
	const visual = window.visualViewport;
	const left = visual?.offsetLeft ?? 0;
	const top = visual?.offsetTop ?? 0;
	const width = visual?.width ?? window.innerWidth;
	const height = visual?.height ?? window.innerHeight;
	if (contentViewport) {
		const content = document.querySelector("[data-cms-content-viewport]");
		if (content) {
			const bounds = content.getBoundingClientRect();
			const x = Math.max(left, bounds.left);
			const y = Math.max(top, bounds.top);
			const right = Math.max(x, Math.min(left + width, bounds.right));
			const bottom = Math.max(y, Math.min(top + height, bounds.bottom));
			return {left:x,top:y,right,bottom,width:right-x,height:bottom-y};
		}
	}
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
	entryAttempt?: TouchpointLoadAttempt;
	layerAttempt?: TouchpointLoadAttempt;
	entryTime?: TouchpointTimeContext;
	layerTime?: TouchpointTimeContext;
	isAuthorized: () => boolean;
	onFencedMount?: () => void;
	mode?: "test" | "production";
	onDiagnostic?: (code: string) => void;
	onEntryVisible?: () => void;
	onLayerVisible?: () => void;
	onLayerClose?: () => void;
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
	entryTime,
	layerTime,
	entryAttempt,
	layerAttempt,
	isAuthorized,
	onFencedMount,
	mode = "production",
	onDiagnostic,
	onEntryVisible,
	onLayerVisible,
	onLayerClose,
	entryActionIds = EMPTY_ACTION_IDS,
	layerActionIds = EMPTY_ACTION_IDS,
	dispatchEntryAction,
	dispatchLayerAction,
}: HoverTouchpointOverlayProps) {
	const layerVisibleRef = useRef<WebTouchpointContent | null>(null);
	const layerCloseRef = useRef(onLayerClose);
	layerCloseRef.current = onLayerClose;
	const entryTimeRef = useRef(entryTime);
	const layerTimeRef = useRef(layerTime);
	entryTimeRef.current = entryTime;
	layerTimeRef.current = layerTime;
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const [readyPair, setReadyPair] = useState<Readonly<{
		entry: WebTouchpointContent;
		layer: WebTouchpointContent;
	}> | null>(null);
	const ready = readyPair?.entry === entry && readyPair.layer === layer;
	const rootRef = useRef<HTMLDivElement>(null);
	const entryRef = useRef<HTMLElement>(null);
	const layerRef = useRef<HTMLElement>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const restoringFocusRef = useRef(false);
	const pointerIsInBridgeRef = useRef(false);
	const [position, setPosition] = useState<
		HoverOverlayPosition & { overflow: "auto" | "visible" }
	>();
	const [elementReady, setElementReady] = useState(
		() =>
			typeof customElements !== "undefined" &&
			customElements.get("opend-touchpoint") !== undefined,
	);
	useEffect(() => {
		ensureWebTouchpointElement();
		setElementReady(true);
	}, []);

	const close = useCallback((restoreFocus = false) => {
		layerVisibleRef.current = null;
		pointerIsInBridgeRef.current = false;
		setOpen(false);
		if (restoreFocus) {
			restoringFocusRef.current = true;
			(restoreFocusRef.current ?? entryRef.current)?.focus();
			restoringFocusRef.current = false;
		}
	}, []);
	const openHover = useCallback(
		(trigger: "hover" | "click" = "hover") => {
			layerAttempt?.trigger(trigger);
			pointerIsInBridgeRef.current = false;
			setOpen(true);
		},
		[layerAttempt],
	);
	const pointerIsInBridge = useCallback(
		(event: Pick<PointerEvent, "clientX" | "clientY">) => {
			const anchor = entryRef.current?.getBoundingClientRect();
			const layer = layerRef.current?.getBoundingClientRect();
			return Boolean(
				anchor && layer && pointIsInRect(event, hoverBridgeRect(anchor, layer)),
			);
		},
		[],
	);
	const schedulePointerClose = useCallback(
		(event: React.PointerEvent) => {
			pointerIsInBridgeRef.current = pointerIsInBridge(event.nativeEvent);
			if (!pointerIsInBridgeRef.current) close();
		},
		[close, pointerIsInBridge],
	);
	useEffect(() => {
		const closeWhenLeavingBridge = (event: PointerEvent) => {
			if (pointerIsInBridgeRef.current && !pointerIsInBridge(event)) close();
		};
		document.addEventListener("pointermove", closeWhenLeavingBridge);
		return () =>
			document.removeEventListener("pointermove", closeWhenLeavingBridge);
	}, [close, pointerIsInBridge]);
	const useContentViewport = [7,8].includes(layer.manifest.material?.templateVersion ?? 0);
	const viewportMargin = layer.manifest.material?.sourceDslVersion === 3 && ["T2", "T3"].includes(layer.manifest.material.templateId) ? 16 : VIEWPORT_MARGIN;
	const refreshPosition = useCallback(() => {
		const anchor = entryRef.current?.getBoundingClientRect();
		const element = layerRef.current;
		if (!anchor || !element) return;
		const { scrollTop, scrollLeft } = element;
		// Probe without old limits or scrollbars so viewport growth and content
		// shrink can leave scroll mode. Box shadows are not scrollable overflow.
		element.style.maxWidth = "none";
		element.style.maxHeight = "none";
		element.style.overflow = "visible";
		const viewport = viewportRect(useContentViewport);
		const natural = placeHoverOverlay(
			anchor,
			element.getBoundingClientRect(),
			viewport,
			viewportMargin,
		);
		element.style.maxWidth = `${natural.maxWidth}px`;
		// Width reflow also changes the height used for placement and its bounds.
		const next = placeHoverOverlay(
			anchor,
			element.getBoundingClientRect(),
			viewport,
			viewportMargin,
		);
		element.style.maxHeight = `${next.maxHeight}px`;
		// Read after applying limits: responsive material can reflow at maxWidth.
		// Both axes must fit; one auto axis forces the other visible axis to auto.
		const overflow =
			element.scrollWidth > element.clientWidth ||
			element.scrollHeight > element.clientHeight
				? "auto"
				: "visible";
		element.style.overflow = overflow;
		if (overflow === "auto") {
			element.scrollTop = scrollTop;
			element.scrollLeft = scrollLeft;
		}
		setPosition((previous) =>
			previous &&
			previous.left === next.left &&
			previous.top === next.top &&
			previous.maxWidth === next.maxWidth &&
			previous.maxHeight === next.maxHeight &&
			previous.placement === next.placement &&
			previous.overflow === overflow
				? previous
				: { ...next, overflow },
		);
	}, [viewportMargin,useContentViewport]);

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
		layerVisibleRef.current = null;
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
		const abandon = () => {
			if (cancelled) return true;
			if (isAuthorized()) return false;
			entryAttempt?.cancel("page_left");
			layerAttempt?.cancel("page_left");
			onFencedMount?.();
			dispose();
			return true;
		};
		const mount = async () => {
			try {
				let decoding = performance.now();
				entryVerified = await verifyWebTouchpoint(entry);
				entryAttempt?.enrich({
					decode_validate_ms: Math.max(0, performance.now() - decoding),
				});
				if (disposed) entryVerified.dispose();
				if (abandon()) return;
				decoding = performance.now();
				layerVerified = await verifyWebTouchpoint(layer);
				layerAttempt?.enrich({
					decode_validate_ms: Math.max(0, performance.now() - decoding),
				});
				if (disposed) layerVerified.dispose();
				if (abandon()) return;
				const Element = ensureWebTouchpointElement();
				entryElement = entryRef.current as InstanceType<typeof Element> | null;
				layerElement = layerRef.current as InstanceType<typeof Element> | null;
				const entryContext = webTouchpointContext(
					entry,
					undefined,
					entryTimeRef.current,
				);
				const layerContext = webTouchpointContext(
					layer,
					undefined,
					layerTimeRef.current,
				);
				if (!entryElement || !layerElement || !entryContext || !layerContext)
					throw new Error("hover_context_unsupported");
				await entryElement.mount(
					entryVerified.entryUrl,
					entry.entryDigest,
					{ ...entryContext, mode },
					entryVerified.resourceUrls,
					entryActionIds,
					{
						runtimeApiVersion: entry.runtime.apiVersion,
						attempt: entryAttempt,
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
						runtimeApiVersion: layer.runtime.apiVersion,
						attempt: layerAttempt,
						dispatchAction: dispatchLayerAction
							? async (id) => {
									await dispatchLayerAction(id);
									if (isAuthorized()) close(true);
								}
							: undefined,
						requestClose: (reason) => {
							if (cancelled || disposed || !isAuthorized()) return;
							if (
								reason === "close" &&
								layerVisibleRef.current === layer &&
								layerElement &&
								isTouchpointVisible(layerElement)
							) {
								layerCloseRef.current?.();
							}
							close(true);
						},
						onDiagnostic: (d) => onDiagnostic?.(d.code),
					},
				);
				if (abandon()) return;
				// Visibility is decided by the effect below, once React has
				// committed `hidden`. Sampling it here races that commit.
				entryAttempt?.ready();
				layerAttempt?.ready();
				setReadyPair({ entry, layer });
			} catch (error) {
				dispose();
				if (!cancelled) {
					entryAttempt?.fail(error, "mount");
					layerAttempt?.fail(error, "mount");
					onFencedMount?.();
					setReadyPair(null);
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
			layerVisibleRef.current = null;
			entryAttempt?.cancel("page_left");
			layerAttempt?.cancel("page_left");
			setReadyPair(null);
			dispose();
		};
	}, [
		close,
		dispatchEntryAction,
		dispatchLayerAction,
		elementReady,
		entry,
		entryActionIds,
		isAuthorized,
		layer,
		layerActionIds,
		mode,
		onDiagnostic,
		onFencedMount,
	]);

	useEffect(() => {
		if (!ready || !isAuthorized()) return;
		const updates: Promise<void>[] = [];
		if (entryTime && entry.runtime.apiVersion === 2)
			updates.push(
				(
					entryRef.current as InstanceType<
						ReturnType<typeof ensureWebTouchpointElement>
					> | null
				)?.updateTime(entryTime) ?? Promise.resolve(),
			);
		if (layerTime && layer.runtime.apiVersion === 2)
			updates.push(
				(
					layerRef.current as InstanceType<
						ReturnType<typeof ensureWebTouchpointElement>
					> | null
				)?.updateTime(layerTime) ?? Promise.resolve(),
			);
		void Promise.all(updates).catch(() => {
			setReadyPair(null);
			close();
			onDiagnostic?.("touchpoint_update_failed");
		});
	}, [
		close,
		entry.runtime.apiVersion,
		entryTime,
		isAuthorized,
		layer.runtime.apiVersion,
		layerTime,
		onDiagnostic,
		ready,
	]);

	useLayoutEffect(() => {
		if (open && ready) refreshPosition();
	}, [open, ready, refreshPosition]);
	useEffect(() => {
		const element = entryRef.current;
		if (!ready || !element || !onEntryVisible) return;
		return watchTouchpointVisibility({
			element,
			isCurrent: isAuthorized,
			onVisible: onEntryVisible,
			onSlow: onDiagnostic,
		});
	}, [isAuthorized, onDiagnostic, onEntryVisible, ready]);
	useEffect(() => {
		const element = layerRef.current;
		if (!open || !ready || !element) return;
		return watchTouchpointVisibility({
			element,
			isCurrent: isAuthorized,
			onVisible: () => {
				layerVisibleRef.current = layer;
				onLayerVisible?.();
			},
			onSlow: onDiagnostic,
		});
	}, [isAuthorized, layer, onDiagnostic, onLayerVisible, open, ready]);
	useEffect(() => {
		if (!open || !ready) return;
		let frame: number | undefined;
		const reposition = () => {
			if (frame !== undefined) return;
			frame = requestAnimationFrame(() => {
				frame = undefined;
				refreshPosition();
			});
		};
		const visual = window.visualViewport;
		const observer = new ResizeObserver(reposition);
		const element = layerRef.current;
		// A capped host can stay the same size while its material grows/shrinks.
		const observeMaterial = () => {
			observer.disconnect();
			if (entryRef.current) observer.observe(entryRef.current);
			if (element) observer.observe(element);
			for (const child of (element?.shadowRoot ?? element)?.querySelectorAll(
				"*",
			) ?? [])
				observer.observe(child);
		};
		observeMaterial();
		const mutations = new MutationObserver(() => {
			observeMaterial();
			reposition();
		});
		if (element)
			mutations.observe(element.shadowRoot ?? element, {
				childList: true,
				subtree: true,
				characterData: true,
			});
		// Scrolling within the fixed layer cannot move its anchor; ignore the
		// scroll events produced when restoring offsets after measurement too.
		const onScroll = (event: Event) => {
			if (!element || !event.composedPath().includes(element)) reposition();
		};
		window.addEventListener("scroll", onScroll, true);
		window.addEventListener("resize", reposition);
		visual?.addEventListener("resize", reposition);
		visual?.addEventListener("scroll", reposition);
		return () => {
			if (frame !== undefined) cancelAnimationFrame(frame);
			mutations.disconnect();
			observer.disconnect();
			window.removeEventListener("scroll", onScroll, true);
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
			onPointerEnter: () => openHover("hover"),
			onPointerLeave: (event: React.PointerEvent) => {
				if (!relatedTargetIsInUnion(event.relatedTarget))
					schedulePointerClose(event);
			},
			// ENT-4: Tab only focuses the entry; Enter/Space (or a click) expands it.
			// Focus is still remembered so Escape returns to the entry.
			onFocus: () => {
				restoreFocusRef.current = entryRef.current;
			},
			onBlur: closeIfOutsideUnion,
			// Hover may already have opened the layer before a click.
			// Activation always opens; Escape/outside focus remain the close paths.
			onClick: () => openHover("click"),
			onKeyDown: (event: React.KeyboardEvent) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					openHover("click");
				}
			},
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
				"aria-label": t("campaign.dialogLabel"),
				style: position
					? {
							left: position.left,
							top: position.top,
							maxWidth: position.maxWidth,
							maxHeight: position.maxHeight,
							overflow: position.overflow,
						}
					: undefined,
				onPointerEnter: () => openHover("hover"),
				onPointerLeave: (event: React.PointerEvent) => {
					if (!relatedTargetIsInUnion(event.relatedTarget))
						schedulePointerClose(event);
				},
				// The layer is only focusable while open, so focus moving into it keeps it
				// open without re-tagging how it became visible (hover must stay hover).
				onFocus: () => {
					pointerIsInBridgeRef.current = false;
					setOpen(true);
				},
				onBlur: closeIfOutsideUnion,
			}),
		),
	);
}
