import { useI18n } from "../../i18n/I18n";
import { useMediaGateway } from "../../motion/MediaGatewayContext";
import { buildProjectApiPath } from "../../utils/projectRouting";
// fallow-ignore-file code-duplication
import { memo, useState, useCallback, useRef, useMemo, useEffect } from "react";
import { SearchInput } from "../ui/SearchInput";
import { MEDIA_EXT, FONT_EXT } from "../../utils/mediaTypes";
import { copyTextToClipboard } from "../../utils/clipboard";
import { usePlayerStore } from "../../player/store/playerStore";
import {
  type MediaCategory,
  type CopyFeedback,
  getCategory,
  basename,
  CATEGORY_LABELS,
  FILTER_ORDER,
} from "./assetHelpers";
import { AudioRow } from "./AudioRow";
import { GlobalAssetsView } from "./GlobalAssetsView";
import { AssetCard, FontRow } from "./AssetCard";
import { studioApiFetch } from "../../utils/studioApiFetch";

interface AssetsTabProps {
  projectId: string;
  assets: string[];
  onImport?: (files: FileList) => void | Promise<void>;
  onDelete?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onAddAssetToTimeline?: (path: string) => void;
}

export type UsageFilter = "all" | "used" | "unused";

/** Filter assets by whether the composition references them. Pure — unit-tested. */
export function filterByUsage(
  assets: string[],
  usedPaths: Set<string>,
  usageFilter: UsageFilter,
): string[] {
  if (usageFilter === "used") return assets.filter((a) => usedPaths.has(a));
  if (usageFilter === "unused") return assets.filter((a) => !usedPaths.has(a));
  return assets;
}

/** Count used vs unused over a media set. Pure — unit-tested. */
export function countUsage(
  assets: string[],
  usedPaths: Set<string>,
): { used: number; unused: number } {
  let used = 0;
  for (const a of assets) if (usedPaths.has(a)) used++;
  return { used, unused: assets.length - used };
}

/**
 * Project-relative asset paths referenced by composition elements — the set the
 * "in use" badge, used-first sort, and usage filter all key on. Element src is
 * populated from the core runtime's `resolveNodeAssetUrl` which calls
 * `new URL(raw, document.baseURI).toString()`, turning authored relative paths
 * into fully-absolute URLs with percent-encoded characters, e.g.
 *   "assets/my file (1).mp4"
 *   → "http://localhost:3012/api/projects/demo/preview/assets/my%20file%20(1).mp4"
 *
 * This function normalizes every src shape to the bare project-relative path so
 * it matches the asset-list entries:
 *   - Absolute URL  → strip origin + /api/projects/<id>/preview/ prefix, decode %XX
 *   - Server-relative /api/…preview/… → same strip + decode
 *   - Relative "./"-prefixed or bare → strip leading ./ or /
 *   - ?query / #hash → dropped
 *
 * Pure — unit-tested.
 */
export function deriveUsedPaths(elements: Array<{ src?: string }>): Set<string> {
  const paths = new Set<string>();
  for (const el of elements) {
    if (!el.src) continue;
    let s = el.src;

    // Strip absolute origin if present (http://host/path → /path)
    try {
      const u = new URL(s);
      s = u.pathname + (u.search ? u.search : "") + (u.hash ? u.hash : "");
    } catch {
      // Not a valid absolute URL — leave as-is (relative path)
    }

    s = s
      .replace(/^\/api\/projects\/[^/]+\/preview\//, "") // strip the dev serve prefix
      .replace(/^\.?\//, "") // strip leading ./ or /
      .split(/[?#]/)[0]; // drop query / hash

    // Decode percent-encoded characters (spaces, parens, etc.) so the path
    // matches the plain-text asset-list entries the server returns.
    try {
      s = decodeURIComponent(s);
    } catch {
      // Malformed encoding — use as-is
    }

    if (s) paths.add(s);
  }
  return paths;
}

/** Import trigger. An import is an await, so the button owns the pending state
 *  instead of leaving the author clicking a control that looks idle. */
function ImportButton({ importing, onClick }: { importing: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      disabled={importing}
      aria-busy={importing}
      className="w-full flex items-center justify-center gap-1.5 rounded-md bg-panel-input px-3 py-[7px] text-[11px] font-medium text-panel-text-3 enabled:hover:text-panel-text-1 enabled:active:scale-[0.98] disabled:opacity-60 transition-colors mb-2.5"
    >
      {importing ? (
        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
      {importing ? t("Importing…") : t("Import media")}
    </button>
  );
}

/** Empty list body. A query that matched nothing says so and offers a way out;
 *  a genuinely empty project gets the drop hint. */
function EmptyState({
  searchQuery,
  onClearSearch,
}: {
  searchQuery: string;
  onClearSearch: () => void;
}) {
  const { t } = useI18n();
  if (searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 gap-2">
        <p className="text-[11px] text-neutral-500 text-center">
          {t("No assets match “")}{searchQuery}&rdquo;
        </p>
        <button
          type="button"
          onClick={onClearSearch}
          className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-panel-input text-panel-text-3 hover:text-panel-text-1 active:scale-[0.98] transition-colors"
        >
          {t("Clear search")}</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 gap-2">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-text-off"
      >
        <path
          d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" />
      </svg>
      <p className="text-[10px] text-neutral-600 text-center">{t("Drop media files here")}</p>
    </div>
  );
}

export const AssetsTab = memo(function AssetsTab({
  projectId,
  assets,
  onImport,
  onDelete,
  onRename,
  onAddAssetToTimeline,
}: AssetsTabProps) {
  const { t } = useI18n();
  const mediaGateway = useMediaGateway();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null);
  const [importing, setImporting] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MediaCategory | "all">("all");
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "unused">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"local" | "global">("local");
  const [manifest, setManifest] = useState<
    Map<string, { description?: string; duration?: number; width?: number; height?: number }>
  >(new Map());

  const manifest404Ref = useRef<Set<string>>(new Set());
  const assetsKey = assets.join("|");
  useEffect(() => {
    if (manifest404Ref.current.has(projectId)) return;
    let cancelled = false;
    studioApiFetch(buildProjectApiPath(projectId, `/preview/.media/manifest.jsonl`))
      .then((r) => {
        if (!r.ok) {
          manifest404Ref.current.add(projectId);
          return "";
        }
        return r.text();
      })
      .then((text) => {
        if (cancelled || !text) return;
        const m = new Map<
          string,
          { description?: string; duration?: number; width?: number; height?: number }
        >();
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            const rec = JSON.parse(line);
            if (rec.path) m.set(rec.path, rec);
          } catch {
            /* skip */
          }
        }
        setManifest(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId, assetsKey]);

  const handleImport = useCallback(
    async (files: FileList) => {
      if (!onImport) return;
      setImporting(true);
      try {
        await onImport(files);
      } finally {
        setImporting(false);
      }
    },
    [onImport],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) void handleImport(e.dataTransfer.files);
    },
    [handleImport],
  );

  const handleCopyPath = useCallback(async (path: string) => {
    const copied = await copyTextToClipboard(path);
    setCopyFeedback({ path, ok: copied });
    setTimeout(() => setCopyFeedback(null), copied ? 1500 : 3000);
  }, []);
  const elements = usePlayerStore((s) => s.elements);
  const usedPaths = useMemo(() => deriveUsedPaths(elements), [elements]);

  // Unfiltered pool — header controls (search, chips) are gated on THIS, not
  // the search-filtered list, so a no-match query can't unmount its own input.
  const allMediaAssets = useMemo(
    () => assets.filter((a) => MEDIA_EXT.test(a) || FONT_EXT.test(a)),
    [assets],
  );

  const mediaAssets = useMemo(() => {
    const all = filterByUsage(allMediaAssets, usedPaths, usageFilter);
    if (!searchQuery) return all;
    const q = searchQuery.toLowerCase();
    return all.filter((a) => {
      if (basename(a).toLowerCase().includes(q)) return true;
      const rec = manifest.get(a);
      return rec?.description?.toLowerCase().includes(q);
    });
  }, [allMediaAssets, searchQuery, manifest, usageFilter, usedPaths]);

  const categorized = useMemo(() => {
    const groups: Record<MediaCategory, string[]> = { audio: [], images: [], video: [], fonts: [] };
    for (const a of mediaAssets) {
      const cat = getCategory(a);
      if (cat) groups[cat].push(a);
    }
    // Sort: used assets first within each category
    for (const cat of FILTER_ORDER) {
      groups[cat].sort((a, b) => {
        const aUsed = usedPaths.has(a) ? 0 : 1;
        const bUsed = usedPaths.has(b) ? 0 : 1;
        return aUsed - bUsed;
      });
    }
    return groups;
  }, [mediaAssets, usedPaths]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: mediaAssets.length };
    for (const cat of FILTER_ORDER) c[cat] = categorized[cat].length;
    return c;
  }, [mediaAssets, categorized]);
  const usageCounts = useMemo(
    () =>
      countUsage(
        assets.filter((a) => MEDIA_EXT.test(a) || FONT_EXT.test(a)),
        usedPaths,
      ),
    [assets, usedPaths],
  );
  const visibleCategories =
    activeFilter === "all"
      ? FILTER_ORDER.filter((c) => categorized[c].length > 0)
      : [activeFilter as MediaCategory].filter((c) => categorized[c].length > 0);
  return (
    <div
      className={`flex-1 flex flex-col min-h-0 transition-colors ${dragOver ? "bg-studio-accent/5" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Header — matches design panel Section pattern */}
      <div className="px-4 pt-2.5 pb-1.5 shrink-0">
        {/* Scope toggle */}
        <div className="flex gap-1 mb-2.5 p-0.5 rounded-md bg-panel-input">
          {(["local", "global"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`flex-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                viewMode === m
                  ? "bg-panel-accent/15 text-accent-ink"
                  : "text-panel-text-3 hover:text-panel-text-1"
              }`}
            >
              {m === "local" ? t("This project") : t("All projects")}
            </button>
          ))}
        </div>
        {/* Import */}
        {onImport && mediaGateway && <button className="motion-asset-generate" onClick={() => mediaGateway.openGenerator()}>{t("Generate media")}</button>}
        {onImport && (
          <>
            <ImportButton importing={importing} onClick={() => fileInputRef.current?.click()} />
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,image/*,audio/*,font/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void handleImport(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </>
        )}

        {/* Search — gated on the UNFILTERED pool so it never unmounts itself */}
        {allMediaAssets.length > 0 && (
          <SearchInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("Search assets...")}
            aria-label={t("Search assets")}
            className="mb-2"
          />
        )}

        {/* Filter chips */}
        {viewMode === "local" && allMediaAssets.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveFilter("all")}
              aria-pressed={activeFilter === "all"}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors active:scale-[0.98] ${
                activeFilter === "all"
                  ? "bg-panel-accent/15 text-accent-ink"
                  : "bg-panel-input text-panel-text-3 hover:text-panel-text-1"
              }`}
            >
              {t("All")}{" "}{counts.all}
            </button>
            {FILTER_ORDER.map((cat) =>
              counts[cat] > 0 ? (
                <button
                  key={cat}
                  onClick={() => setActiveFilter(activeFilter === cat ? "all" : cat)}
                  aria-pressed={activeFilter === cat}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors active:scale-[0.98] ${
                    activeFilter === cat
                      ? "bg-panel-accent/15 text-accent-ink"
                      : "bg-panel-input text-panel-text-3 hover:text-panel-text-1"
                  }`}
                >
                  {t(CATEGORY_LABELS[cat])} {counts[cat]}
                </button>
              ) : null,
            )}
            {usageCounts.used > 0 && usageCounts.unused > 0 && (
              <>
                <span className="w-px self-stretch bg-panel-input mx-0.5" aria-hidden="true" />
                <button
                  onClick={() => setUsageFilter(usageFilter === "used" ? "all" : "used")}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    usageFilter === "used"
                      ? "bg-panel-accent/15 text-accent-ink"
                      : "bg-panel-input text-panel-text-3 hover:text-panel-text-1"
                  }`}
                >
                  {t("In use")}{" "}{usageCounts.used}
                </button>
                <button
                  onClick={() => setUsageFilter(usageFilter === "unused" ? "all" : "unused")}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    usageFilter === "unused"
                      ? "bg-panel-accent/15 text-accent-ink"
                      : "bg-panel-input text-panel-text-3 hover:text-panel-text-1"
                  }`}
                >
                  {t("Unused")}{" "}{usageCounts.unused}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto mt-1">
        {viewMode === "global" ? (
          <GlobalAssetsView searchQuery={searchQuery} />
        ) : mediaAssets.length === 0 ? (
          <EmptyState searchQuery={searchQuery} onClearSearch={() => setSearchQuery("")} />
        ) : (
          visibleCategories.map((cat) => (
            <div key={cat} className="mb-1">
              {activeFilter === "all" && (
                <div className="flex items-center gap-2 px-4 py-2 border-t border-panel-border">
                  <h3 className="text-[12px] font-semibold text-panel-text-1">
                    {t(CATEGORY_LABELS[cat])}
                  </h3>
                  <span className="text-[11px] text-panel-text-5">{categorized[cat].length}</span>
                </div>
              )}
              {cat === "audio" &&
                categorized[cat].map((a) => (
                  <AudioRow
                    key={a}
                    projectId={projectId}
                    asset={a}
                    used={usedPaths.has(a)}
                    meta={manifest.get(a)}
                    onCopy={handleCopyPath}
                    copyFeedback={copyFeedback}
                    onDelete={onDelete}
                    onRename={onRename}
                    onAddAssetToTimeline={onAddAssetToTimeline}
                  />
                ))}
              {(cat === "images" || cat === "video") && (
                <div className="grid grid-cols-2 gap-1 px-2 pb-1">
                  {categorized[cat].map((a) => (
                    <AssetCard
                      key={a}
                      projectId={projectId}
                      asset={a}
                      used={usedPaths.has(a)}
                      duration={manifest.get(a)?.duration}
                      onCopy={handleCopyPath}
                      copyFeedback={copyFeedback}
                      onDelete={onDelete}
                      onRename={onRename}
                      onAddAssetToTimeline={onAddAssetToTimeline}
                    />
                  ))}
                </div>
              )}
              {cat === "fonts" &&
                categorized[cat].map((a) => (
                  <FontRow
                    key={a}
                    asset={a}
                    used={usedPaths.has(a)}
                    onCopy={handleCopyPath}
                    copyFeedback={copyFeedback}
                    onDelete={onDelete}
                    onRename={onRename}
                    onAddAssetToTimeline={onAddAssetToTimeline}
                  />
                ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
});
