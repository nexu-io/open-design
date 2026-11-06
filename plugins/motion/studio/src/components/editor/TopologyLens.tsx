import { useLivePreviewIframe } from "../../player/store/previewIframeStore";
import { onPreviewContentReplaced } from "../../player/sceneSwap";
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from "react";
import { studioEditLifecycle } from "../../webmcp/writeCoordinator";
import { HyperframesMark } from "../ui/HyperframesMark";
import { measureTopologyLensGeometry, type TopologyLensGeometry } from "./topologyLensGeometry";
import { reduceTopologyLens, type TopologyLensState } from "./topologyLensState";

const ACQUISITION_MS = 240;
const TERMINAL_RETRACT_MS = 180;
const SEAL_MS = 240;

interface TopologyLensProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  activeCompositionPath: string | null;
}

interface MeasuredLens {
  callId: string;
  geometry: TopologyLensGeometry;
}

function rectStyle(rect: TopologyLensGeometry["target"]["rect"]): CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function getReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function subscribeReducedMotion(listener: () => void): () => void {
  const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!query) return () => undefined;
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function useTopologyLensState(): TopologyLensState {
  const lifecycle = useSyncExternalStore(
    studioEditLifecycle.subscribe,
    studioEditLifecycle.getSnapshot,
    studioEditLifecycle.getSnapshot,
  );
  const [state, dispatch] = useReducer(
    reduceTopologyLens,
    lifecycle,
    (initialLifecycle): TopologyLensState =>
      reduceTopologyLens({ phase: "hidden" }, { type: "lifecycle", value: initialLifecycle }),
  );

  useEffect(() => dispatch({ type: "lifecycle", value: lifecycle }), [lifecycle]);
  useEffect(() => {
    if (state.phase === "hidden") return;
    const delay =
      state.phase === "acquiring"
        ? ACQUISITION_MS
        : state.phase === "sealing"
          ? SEAL_MS
          : state.terminal
            ? TERMINAL_RETRACT_MS
            : null;
    if (delay === null) return;
    const timeout = window.setTimeout(() => {
      if (state.phase === "acquiring") {
        dispatch({ type: "acquisition-elapsed", callId: state.callId });
        return;
      }
      studioEditLifecycle.dismiss(state.callId);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [state]);

  return state;
}

/** Studio-parent chrome driven by the same invocation and receipt as WebMCP. */
export function TopologyLens({ iframeRef, activeCompositionPath }: TopologyLensProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const state = useTopologyLensState();
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  const [measured, setMeasured] = useState<MeasuredLens | null>(null);
  const callId = state.phase === "hidden" ? null : state.callId;
  const handle = state.phase === "hidden" ? null : state.target.handle;
  const phase = state.phase;
  const ownedCallIdRef = useRef(callId);
  const pendingUnmountDismissRef = useRef<number | null>(null);
  ownedCallIdRef.current = callId;

  useLayoutEffect(() => {
    if (!callId || !handle) {
      setMeasured(null);
      return;
    }
    const overlay = overlayRef.current;
    const iframe = iframeRef.current;
    if (!overlay || !iframe) {
      setMeasured(null);
      return;
    }
    const geometry = measureTopologyLensGeometry({
      overlay,
      iframe,
      activeCompositionPath,
      handle,
    });
    setMeasured(geometry ? { callId, geometry } : null);
  }, [activeCompositionPath, callId, handle, iframeRef, phase]);

  const livePreviewIframe = useLivePreviewIframe();
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !callId) return;
    const dismiss = () => studioEditLifecycle.dismiss(callId);
    return onPreviewContentReplaced(iframe, dismiss);
  }, [callId, iframeRef, livePreviewIframe]);

  useEffect(() => {
    if (pendingUnmountDismissRef.current !== null) {
      window.clearTimeout(pendingUnmountDismissRef.current);
      pendingUnmountDismissRef.current = null;
    }
    return () => {
      const ownedCallId = ownedCallIdRef.current;
      if (!ownedCallId) return;
      pendingUnmountDismissRef.current = window.setTimeout(() => {
        pendingUnmountDismissRef.current = null;
        studioEditLifecycle.dismiss(ownedCallId);
      }, 0);
    };
  }, []);

  const geometry = measured?.callId === callId ? measured.geometry : null;
  const visible = state.phase !== "hidden" && geometry;
  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      data-topology-lens={visible ? state.phase : "hidden"}
      className="pointer-events-none absolute inset-0 z-58 overflow-hidden"
    >
      {visible && (
        <>
          {(state.phase === "acquiring" || state.phase === "sealing") && (
            <div
              data-topology-field="true"
              data-topology-node={geometry.field.label}
              data-topology-phase={state.phase}
              className="hf-topology-field pointer-events-none absolute overflow-hidden rounded-md"
              style={rectStyle(geometry.field.rect)}
            >
              {state.phase === "sealing" && (
                <HyperframesMark
                  data-topology-seal={state.receiptStage}
                  className="hf-topology-seal absolute right-2 top-2 h-7 w-11 overflow-visible"
                  viewBox="0 18 100 64"
                />
              )}
            </div>
          )}
          {(state.phase === "acquiring" || state.phase === "sealing") && (
            <>
              {geometry.contours.map(({ label, rect }, index) => (
                <div
                  key={index}
                  data-topology-contour="true"
                  data-topology-node={label}
                  className="hf-topology-contour pointer-events-none absolute z-1 rounded-sm"
                  style={{
                    ...rectStyle(rect),
                    animationDelay: `${Math.min(index, 5) * 28}ms`,
                  }}
                />
              ))}
              {!reducedMotion && (
                <div
                  data-topology-scan="true"
                  className="pointer-events-none absolute z-2 overflow-hidden rounded-sm"
                  style={rectStyle(geometry.field.rect)}
                >
                  <div className="hf-topology-scan absolute inset-y-0 left-0 w-1/4" />
                </div>
              )}
            </>
          )}
          <div
            data-topology-target="true"
            data-topology-node={geometry.target.label}
            data-topology-phase={state.phase}
            data-topology-terminal={
              state.phase === "localizing" ? (state.terminal ?? undefined) : undefined
            }
            className="hf-topology-target pointer-events-none absolute z-3 rounded-md"
            style={rectStyle(geometry.target.rect)}
          />
        </>
      )}
    </div>
  );
}
