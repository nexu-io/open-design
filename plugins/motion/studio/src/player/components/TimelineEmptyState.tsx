import { useI18n } from "../../i18n/I18n";
import type { DragEventHandler } from "react";
import { GUTTER, RULER_H } from "./timelineLayout";
import { useMediaGateway } from "../../motion/MediaGatewayContext";
import { usePlayerStore } from "../store/playerStore";

function EmptyGenerationRange() {
  const range = usePlayerStore(s => s.rangeSelection);
  if (!range) return null;
  return <div className="motion-empty-generation-range" style={{ left: GUTTER + range.t0 * 14, width: Math.max(4, (range.t1 - range.t0) * 14) }} role="status" aria-label={`${range.t0.toFixed(1)}–${range.t1.toFixed(1)}s`}><span>{range.t0.toFixed(1)}–{range.t1.toFixed(1)}s</span></div>;
}

interface TimelineEmptyStateProps {
  isDragOver: boolean;
  onFileDrop?: boolean;
  onDragOver: DragEventHandler<HTMLDivElement>;
  onDragLeave: DragEventHandler<HTMLDivElement>;
  onDrop: DragEventHandler<HTMLDivElement>;
}

export function TimelineEmptyState({
  isDragOver,
  onFileDrop,
  onDragOver,
  onDragLeave,
  onDrop,
}: TimelineEmptyStateProps) {
  const { t } = useI18n();
  const gateway = useMediaGateway();
  return (
    <div
      className={`h-full border-t bg-[var(--timeline-shell-bg)] flex flex-col select-none transition-colors duration-150 ${
        isDragOver ? "border-studio-accent/50 bg-studio-accent/3" : "border-neutral-800/50"
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Ruler */}
      <div
        className="shrink-0 border-b border-neutral-800/40 flex items-end relative"
        style={{ height: RULER_H, paddingLeft: GUTTER }}
      >
        {[0, 10, 20, 30, 40, 50].map((s) => (
          <div
            key={s}
            className="flex flex-col items-center"
            style={{ position: "absolute", left: GUTTER + s * 14 }}
          >
            <span className="text-[9px] text-neutral-600 font-mono tabular-nums leading-none mb-0.5">
              {`${Math.floor(s / 60)
                .toString()
                .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`}
            </span>
            <div className="w-px h-[5px] bg-neutral-700/40" />
          </div>
        ))}
      </div>
      {/* Empty drop zone */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {onFileDrop && gateway?.generationOpen && <EmptyGenerationRange />}
        <div
          className={`flex items-center gap-3 px-6 py-3 border border-dashed rounded-lg transition-colors duration-150 ${
            isDragOver ? "border-studio-accent/60 bg-studio-accent/6" : "border-neutral-700/50"
          }`}
        >
          {isDragOver ? (
            <>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-accent-ink shrink-0"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="text-[13px] text-accent-ink">{t("Drop media files to import")}</span>
            </>
          ) : (
            <>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-neutral-600 shrink-0"
              >
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <path d="M7 2v20" />
                <path d="M17 2v20" />
                <path d="M2 7h20" />
                <path d="M2 17h20" />
              </svg>
              <div className="motion-empty-media-copy">
                <strong>{onFileDrop ? t("Drop video, audio or images here") : t("Describe your video to start creating")}</strong>
                {onFileDrop && <span>{t("Import files, generate media, or describe your video to your Agent.")}</span>}
              </div>
              {onFileDrop && gateway && <div className="motion-empty-media-actions">
                <button onClick={gateway.importFiles}>{t("Import files…")}</button>
                <button className="motion-media-primary" onClick={() => gateway.openGenerator()}>{t("Generate media")}</button>
              </div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
