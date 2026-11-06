import { useI18n } from "../../i18n/I18n";
import { useState, useRef, useEffect, useCallback } from "react";
import { classifyWebAudioMediaRoute } from "@hyperframes/core/runtime/web-audio-route";
import { ContextMenu } from "./AssetContextMenu";
import { basename, getAudioSubtype, type CopyFeedback } from "./assetHelpers";
import { TIMELINE_ASSET_MIME } from "../../utils/timelineAssetDrop";
import { usePlayerStore } from "../../player/store/playerStore";
import { useAssetPreviewStore } from "../../utils/assetPreviewStore";
import { findClipForAsset, isPointerClick } from "../../utils/assetClickBehavior";
import { resolveMediaPreviewUrl } from "../../player/components/thumbnailUtils";
import { timelineClipFocusId } from "../../player/components/timelineNavigationIdentity";

// Only one preview should play at a time; starting a row stops the previous one.
let stopCurrentPreview: (() => void) | null = null;

export function AudioRow({
  projectId,
  asset,
  used,
  meta,
  onCopy,
  copyFeedback,
  onDelete,
  onRename,
  onAddAssetToTimeline,
}: {
  projectId: string;
  asset: string;
  used: boolean;
  meta?: { description?: string; duration?: number };
  onCopy: (path: string) => void;
  copyFeedback: CopyFeedback;
  onDelete?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onAddAssetToTimeline?: (path: string) => void;
}) {
  const { t } = useI18n();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [bars, setBars] = useState<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animRef = useRef<number>(0);
  const name = basename(asset);
  const subtype = getAudioSubtype(asset);
  const serveUrl = resolveMediaPreviewUrl(asset, projectId);
  const isCopied = copyFeedback?.path === asset && copyFeedback.ok;
  const copyFailed = copyFeedback?.path === asset && !copyFeedback.ok;

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
    cancelAnimationFrame(animRef.current);
  }, []);

  // CapCut-style click behavior: drag-threshold gate.
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const setSelectedElementId = usePlayerStore((s) => s.setSelectedElementId);
  const requestTimelineFocus = usePlayerStore((s) => s.requestTimelineFocus);
  const elements = usePlayerStore((s) => s.elements);
  const setPreviewAsset = useAssetPreviewStore((s) => s.setPreviewAsset);
  const clearPreviewAsset = useAssetPreviewStore((s) => s.clearPreviewAsset);

  // Reveal the clip when the asset is already on the timeline, otherwise open
  // the preview overlay. Shared by pointer-up and keyboard activation so the
  // row does the same thing however it is operated.
  const activateRow = useCallback(() => {
    if (used) {
      const clip = findClipForAsset(elements, asset);
      if (clip) {
        // Dismiss any open preview overlay (from another asset) — the reveal
        // must not leave a stale preview card floating over the canvas.
        clearPreviewAsset();
        const clipKey = clip.key ?? clip.id;
        setSelectedElementId(clipKey);
        // Scroll the timeline so the selected clip is actually visible.
        requestTimelineFocus(timelineClipFocusId(clipKey));
        return;
      }
    }
    // Not added → preview overlay (audio player)
    setPreviewAsset(asset, projectId);
  }, [
    used,
    elements,
    asset,
    projectId,
    setSelectedElementId,
    requestTimelineFocus,
    setPreviewAsset,
    clearPreviewAsset,
  ]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const origin = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!origin) return;
      if (!isPointerClick(e.clientX - origin.x, e.clientY - origin.y)) return;
      activateRow();
    },
    [activateRow],
  );

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      audioRef.current?.pause();
      actxRef.current?.close();
      if (stopCurrentPreview === stopPlayback) stopCurrentPreview = null;
    };
  }, [stopPlayback]);

  useEffect(() => {
    if (playing) {
      const barCount = 24;
      const loop = () => {
        const analyser = analyserRef.current;
        if (!analyser) {
          animRef.current = requestAnimationFrame(loop);
          return;
        }
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / barCount);
        const next: number[] = [];
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += data[i * step + j];
          next.push(sum / step / 255);
        }
        setBars(next);
        if (audioRef.current && !audioRef.current.paused)
          animRef.current = requestAnimationFrame(loop);
      };
      animRef.current = requestAnimationFrame(loop);
    } else {
      setBars([]);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [playing]);

  const togglePlay = useCallback(async () => {
    if (playing) {
      stopPlayback();
      if (stopCurrentPreview === stopPlayback) stopCurrentPreview = null;
      return;
    }

    // Stop whichever other row is currently previewing.
    if (stopCurrentPreview && stopCurrentPreview !== stopPlayback) stopCurrentPreview();
    stopCurrentPreview = stopPlayback;

    if (!actxRef.current) {
      actxRef.current = new AudioContext();
      analyserRef.current = actxRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.7;
    }

    if (!audioRef.current) {
      const el = new Audio();
      el.onended = () => {
        setPlaying(false);
        cancelAnimationFrame(animRef.current);
      };
      // `src` must be set BEFORE classifying: the check reads `currentSrc`/
      // `src`, and a same-origin `serveUrl` mustn't be judged from a blank
      // element.
      el.src = serveUrl;
      audioRef.current = el;
      const analyser = analyserRef.current;
      // Same hazard `webAudioRoute.ts` documents for the timeline runtime
      // (#3458): `createMediaElementSource` on a cross-origin element without
      // a `crossorigin` opt-in permanently reroutes it to a node that outputs
      // SILENCE per the Web Audio spec, without throwing. Classify first so
      // this preview player can't reintroduce that bug — skipping the Web
      // Audio graph here only costs the frequency-bar visualizer; native
      // `<audio>` playback below stays audible either way.
      if (analyser && classifyWebAudioMediaRoute(el).kind === "web-audio") {
        sourceRef.current = actxRef.current.createMediaElementSource(el);
        sourceRef.current.connect(analyser);
        analyser.connect(actxRef.current.destination);
      }
    }

    if (actxRef.current.state === "suspended") await actxRef.current.resume();
    audioRef.current.currentTime = 0;
    try {
      await audioRef.current.play();
      setPlaying(true);
    } catch {
      // Playback refused (e.g. decode failure) — reset instead of a stuck state.
      setPlaying(false);
      if (stopCurrentPreview === stopPlayback) stopCurrentPreview = null;
    }
  }, [serveUrl, playing, stopPlayback]);

  return (
    <>
      <div
        draggable
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        role="button"
        tabIndex={0}
        aria-label={t("{name}: open, drag to timeline, right-click for actions", { name: name })}
        onKeyDown={(e) => {
          // Only when the row itself is focused — keydowns bubbling from the
          // inner controls (play button) must keep their native activation.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activateRow();
          }
        }}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "copy";
          e.dataTransfer.setData(TIMELINE_ASSET_MIME, JSON.stringify({ path: asset }));
          e.dataTransfer.setData("text/plain", asset);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        className={`group w-full text-left px-4 py-1.5 flex items-center gap-2.5 transition-colors cursor-pointer outline-hidden focus-visible:bg-neutral-800/60 ${
          playing
            ? "bg-panel-accent/6"
            : isCopied
              ? "bg-panel-accent/10"
              : "hover:bg-panel-surface-hover"
        }`}
      >
        <button
          aria-label={playing ? t("Pause preview of {name}", { name: name }) : t("Play preview of {name}", { name: name })}
          aria-pressed={playing}
          className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center transition-colors active:scale-[0.95] ${
            playing
              ? "bg-panel-accent/15 text-accent-ink"
              : "text-panel-text-5 group-hover:text-panel-text-3"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
        >
          {playing ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[12px] font-medium truncate ${used ? "text-panel-text-1" : "text-panel-text-3"}`}
            >
              {name}
            </span>
            {!playing && (
              <span className="text-[11px] text-panel-text-5 shrink-0">
                {meta?.duration ? `${meta.duration}s · ` : ""}
                {t(subtype)}
              </span>
            )}
            {used && (
              <span className="text-[9px] font-medium text-accent-ink bg-panel-accent/10 px-1.5 py-px rounded-sm shrink-0">
                {t("in use")}</span>
            )}
            {(isCopied || copyFailed) && (
              <span
                role="status"
                className={`shrink-0 text-[9px] font-medium px-1.5 py-px rounded ${
                  copyFailed
                    ? "text-danger-ink bg-red-500/10"
                    : "text-accent-ink bg-panel-accent/10"
                }`}
              >
                {copyFailed ? t("Copy failed") : t("Copied")}
              </span>
            )}
          </div>
          {bars.length > 0 && (
            <div className="flex items-end gap-[2px] h-[14px] mt-0.5">
              {bars.map((v, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-[1px]"
                  style={{
                    height: `${Math.max(10, v * 100)}%`,
                    background: `linear-gradient(to top, rgba(60, 230, 172, ${0.3 + v * 0.5}), rgba(60, 230, 172, ${0.5 + v * 0.5}))`,
                    transition: "height 80ms ease-out",
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <button type="button" className="motion-audio-menu-button" aria-label={t("Actions for {value0}", { value0: name })} aria-haspopup="menu" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setContextMenu({ x: rect.left, y: rect.bottom }); }}>…</button>
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          asset={asset}
          onClose={() => setContextMenu(null)}
          onCopy={onCopy}
          onDelete={onDelete}
          onRename={onRename}
          onAddAtPlayhead={onAddAssetToTimeline}
          onPreview={path => setPreviewAsset(path, projectId)}
          downloadUrl={serveUrl}
        />
      )}
    </>
  );
}
