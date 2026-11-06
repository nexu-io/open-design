import { useI18n } from "../../i18n/I18n";
// fallow-ignore-file code-duplication
import { memo, useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { SearchInput } from "../ui/SearchInput";
import { PromptPreviewModal } from "./PromptPreviewModal";
import { useBlockCatalog } from "../../hooks/useBlockCatalog";
import {
  BLOCK_CATEGORIES,
  getCategoryColors,
  type BlockCategory,
} from "../../utils/blockCategories";
import { usePlayerStore } from "../../player";
import { formatTime } from "../../player/lib/time";
import { useStudioShellContext } from "../../contexts/StudioContext";
import { TIMELINE_BLOCK_MIME } from "../../utils/timelineAssetDrop";
export interface BlockPreviewInfo {
  videoUrl?: string;
  posterUrl?: string;
  title: string;
}

interface BlocksTabProps {
  onAddBlock?: (blockName: string) => void | Promise<void>;
  onPreviewBlock?: (preview: BlockPreviewInfo | null) => void;
}

// fallow-ignore-next-line complexity
export const BlocksTab = memo(function BlocksTab({ onAddBlock, onPreviewBlock }: BlocksTabProps) {
  const { t } = useI18n();
  const { loading, error, search, setSearch, category, setCategory, filteredBlocks } =
    useBlockCatalog();
  const [promptModal, setPromptModal] = useState<{ title: string; prompt: string } | null>(null);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-neutral-600 text-xs">
        {t("Loading blocks…")}</div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-danger-ink text-xs px-4 text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search */}
      <div className="px-3 pt-2 pb-1 shrink-0">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search by name, category, or tag…")}
          aria-label={t("Search blocks")}
        />
      </div>

      {/* Category pills */}
      <div className="px-3 pt-1 pb-2 shrink-0 overflow-x-auto">
        <div className="flex gap-1">
          <CategoryPill label={t("All")} active={category === null} onClick={() => setCategory(null)} />
          {BLOCK_CATEGORIES.map((cat) => (
            <CategoryPill
              key={cat.id}
              label={t(cat.label)}
              category={cat.id}
              active={category === cat.id}
              onClick={() => setCategory(category === cat.id ? null : cat.id)}
            />
          ))}
        </div>
      </div>

      {/* Block grid */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2">
        {category === "vfx" && (
          <div className="mb-2 px-2 py-1.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-[9px] text-text-2 leading-relaxed">
            {t("VFX blocks use WebGL via HTML-in-Canvas. Enable")}{" "}
            <span className="font-mono text-text-0">chrome://flags/#html-in-canvas</span> {t("for preview.")}</div>
        )}
        {filteredBlocks.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-neutral-600 text-xs">
            {t("No blocks match your search")}</div>
        ) : (
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}
          >
            {filteredBlocks.map((block) => {
              const dur = "duration" in block ? (block.duration as number) : undefined;
              return (
                <BlockCard
                  key={block.name}
                  name={block.name}
                  title={block.title}
                  description={block.description}
                  blockType={block.type}
                  duration={dur}
                  category={block.category}
                  tags={block.tags}
                  posterUrl={block.preview?.poster}
                  videoUrl={block.preview?.video}
                  onPreview={onPreviewBlock}
                  onShowPrompt={setPromptModal}
                  onAdd={
                    block.category === "vfx" ||
                    block.category === "social" ||
                    block.category === "scenes"
                      ? () => onAddBlock?.(block.name)
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>
      {promptModal &&
        createPortal(
          <PromptPreviewModal
            title={promptModal.title}
            prompt={promptModal.prompt}
            onClose={() => setPromptModal(null)}
          />,
          document.body,
        )}
    </div>
  );
});

function CategoryPill({
  label,
  category,
  active,
  onClick,
}: {
  label: string;
  category?: BlockCategory;
  active: boolean;
  onClick: () => void;
}) {
  const colors = category ? getCategoryColors(category) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 px-2 py-1 rounded-full text-[10px] font-medium transition-colors active:scale-[0.98] ${
        active
          ? colors
            ? `${colors.bg} ${colors.text}`
            : "bg-neutral-700 text-neutral-200"
          : "bg-neutral-900 text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {label}
    </button>
  );
}

interface CompositionContext {
  currentTime: number;
  activeCompPath: string | null;
  elements: Array<{
    id: string;
    start: number;
    duration: number;
    track: number;
    label?: string;
    compositionSrc?: string;
  }>;
  compositionDimensions?: { width: number; height: number };
}

function formatCompositionContext(ctx: CompositionContext): string {
  const lines: string[] = [
    `Playback time: ${formatTime(ctx.currentTime)}`,
    `Active composition: ${ctx.activeCompPath || "index.html"}`,
  ];
  if (ctx.compositionDimensions) {
    lines.push(
      `Dimensions: ${ctx.compositionDimensions.width}x${ctx.compositionDimensions.height}`,
    );
  }
  const visibleNow = ctx.elements.filter(
    (el) => ctx.currentTime >= el.start && ctx.currentTime < el.start + el.duration,
  );
  if (visibleNow.length > 0) {
    lines.push(
      "",
      `Elements visible at ${formatTime(ctx.currentTime)}:`,
      ...visibleNow.map(
        (el) =>
          `- ${el.label || el.id} (track ${el.track}, ${formatTime(el.start)} to ${formatTime(el.start + el.duration)}${el.compositionSrc ? `, src: ${el.compositionSrc}` : ""})`,
      ),
    );
  }
  const maxZ = ctx.elements.length > 0 ? Math.max(...ctx.elements.map((_, i) => i + 1)) : 0;
  lines.push("", `Highest track index: ${maxZ}`);
  return lines.join("\n");
}

function buildAgentPrompt(
  title: string,
  name: string,
  description: string,
  category: BlockCategory,
  blockType: string,
  context: CompositionContext,
): string {
  const isComponent = blockType === "hyperframes:component";
  const kind = isComponent ? "component" : "block";
  const compositionInfo = formatCompositionContext(context);

  const categoryPrompts: Record<string, string> = {
    captions: [
      `Using /hyperframes, add the "${title}" caption style (registry: ${name}) to my composition.`,
      `${description}`,
      `Transcribe the audio with /media-use, then wire the transcript into this caption component. Match the font colors and animation timing to my composition's design tokens. Place it as an overlay above the main content with the highest z-index.`,
    ].join("\n\n"),
    vfx: [
      `Using /hyperframes, add the "${title}" VFX (registry: ${name}) as a full-screen overlay on my composition.`,
      `${description}`,
      `This is a WebGL effect that requires chrome://flags/#html-in-canvas. Layer it on top of all content, adjust the shader uniforms and color palette to complement my scene, and set the duration to match the composition length.`,
    ].join("\n\n"),
    transitions: [
      `Using /hyperframes, add the "${title}" transition (registry: ${name}) between my scenes.`,
      `${description}`,
      `Place this transition at the cut point between the current scene and the next. Set the duration to 0.5 to 1s, position it at the scene boundary on the timeline, and make sure the z-index is above both scenes. Adjust colors to match my palette.`,
    ].join("\n\n"),
    effects: [
      `Using /hyperframes, add the "${title}" effect (registry: ${name}) as an overlay on my composition.`,
      `${description}`,
      `Layer this on top of the current content. Adjust the opacity, colors, and animation timing to enhance the scene without overwhelming the main content.`,
    ].join("\n\n"),
    social: [
      `Using /hyperframes, add the "${title}" template (registry: ${name}) to my composition.`,
      `${description}`,
      `Replace the placeholder text, handle, and avatar with my actual content. Match the typography and colors to my brand. Adjust timing so the elements animate in sync with the voiceover.`,
    ].join("\n\n"),
    data: [
      `Using /hyperframes, add the "${title}" visualization (registry: ${name}) to my composition.`,
      `${description}`,
      `Replace the placeholder data with my actual values and labels. Adjust the color scale, animation stagger timing, and typography to match my composition's design system. Size it to fit the current viewport.`,
    ].join("\n\n"),
    scenes: [
      `Using /hyperframes, add the "${title}" scene (registry: ${name}) to my composition.`,
      `${description}`,
      `Replace all placeholder text, images, and content with my actual material. Match fonts, colors, and layout to my existing design tokens. Set the timeline position and duration to fit the narrative flow.`,
    ].join("\n\n"),
  };

  const instruction =
    categoryPrompts[category] ??
    [
      `Using /hyperframes, add the "${title}" ${kind} (registry: ${name}) to my composition.`,
      `${description}`,
      `Customize it to match my composition's design and timeline.`,
    ].join("\n\n");

  return [instruction, "", "## Current composition state", "", compositionInfo].join("\n");
}

function BlockCard({
  name,
  title,
  description,
  blockType,
  duration,
  category,
  tags,
  posterUrl,
  videoUrl,
  onAdd,
  onShowPrompt,
  onPreview,
}: {
  name: string;
  title: string;
  description: string;
  blockType: string;
  duration?: number;
  category: BlockCategory;
  tags?: string[];
  posterUrl?: string;
  videoUrl?: string;
  onAdd?: () => void | Promise<void>;
  onShowPrompt?: (info: { title: string; prompt: string }) => void;
  onPreview?: (preview: BlockPreviewInfo | null) => void;
}) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [addState, setAddState] = useState<"idle" | "adding" | "added" | "failed">("idle");
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colors = getCategoryColors(category);
  const needsWebGL = tags?.includes("html-in-canvas") || tags?.includes("webgl");

  const handleEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => {
      setHovered(true);
      onPreview?.({ videoUrl, posterUrl, title });
    }, 300);
  }, [onPreview, videoUrl, posterUrl, title]);

  const handleLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHovered(false);
    onPreview?.(null);
  }, [onPreview]);

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  const handleAdd = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (addState !== "idle" || !onAdd) return;
      setAddState("adding");
      try {
        // Confirm only what actually happened — no optimistic "Added!".
        await onAdd();
        setAddState("added");
      } catch {
        setAddState("failed");
      }
      setTimeout(() => setAddState("idle"), 1500);
    },
    [onAdd, addState],
  );

  const { activeCompPath, compositionDimensions } = useStudioShellContext();

  const handleShowPrompt = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const state = usePlayerStore.getState();
      const context: CompositionContext = {
        currentTime: state.currentTime,
        activeCompPath,
        elements: state.elements.map((el) => ({
          id: el.id,
          start: el.start,
          duration: el.duration,
          track: el.track,
          label: el.label,
          compositionSrc: el.compositionSrc,
        })),
        compositionDimensions: compositionDimensions ?? undefined,
      };
      const prompt = buildAgentPrompt(title, name, description, category, blockType, context);
      onShowPrompt?.({ title, prompt });
    },
    [
      title,
      name,
      description,
      category,
      blockType,
      activeCompPath,
      compositionDimensions,
      onShowPrompt,
    ],
  );

  return (
    <div
      className="group/card rounded-md overflow-hidden cursor-pointer transition-colors bg-neutral-900 hover:bg-neutral-800"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(TIMELINE_BLOCK_MIME, JSON.stringify({ name }));
        e.dataTransfer.setData("text/plain", name);
        handleLeave(); // cancel the hover-preview timer so it doesn't fire mid-drag
      }}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
    >
      <div className="aspect-video w-full overflow-hidden relative">
        {hovered && videoUrl ? (
          <video
            src={videoUrl}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        ) : posterUrl ? (
          <img src={posterUrl} alt={title} loading="lazy" className="w-full h-full object-cover" />
        ) : videoUrl ? (
          <video
            src={videoUrl}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${colors.bg}`}>
            <span className={`text-[9px] font-medium ${colors.text}`}>
              {category.toUpperCase()}
            </span>
          </div>
        )}

        {/* Action overlay — also revealed when a button inside receives focus */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 transition-opacity">
          {onAdd && (
            <button
              type="button"
              onClick={handleAdd}
              title={t("Add to composition at current time")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-semibold transition-colors active:scale-[0.97] ${
                addState === "failed"
                  ? "bg-danger text-on-danger"
                  : "bg-white text-black hover:bg-white/85"
              }`}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              {addState === "adding"
                ? t("Adding…")
                : addState === "added"
                  ? t("Added!")
                  : addState === "failed"
                    ? t("Failed")
                    : t("Add")}
            </button>
          )}
          <button
            type="button"
            onClick={handleShowPrompt}
            title={t("Generate a prompt to paste into your AI agent")}
            className={`flex items-center gap-1.5 px-3 ${onAdd ? "py-1" : "py-1.5"} rounded-md transition-colors active:scale-[0.97] ${
              onAdd
                ? "bg-white/15 text-white/90 hover:bg-white/25 text-[9px]"
                : "bg-text-0 text-bg-0 hover:bg-text-2 text-[10px] font-semibold"
            }`}
          >
            <svg
              width={onAdd ? 9 : 11}
              height={onAdd ? 9 : 11}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {t("Ask agent")}</button>
        </div>

        {/* Badges */}
        <div className="absolute top-1 right-1 flex items-center gap-0.5 pointer-events-none">
          {needsWebGL && (
            <span className="px-1 py-px rounded-sm text-[7px] font-semibold text-purple-300 bg-purple-900/70">
              WebGL
            </span>
          )}
          {duration != null && (
            <span className="px-1 py-px rounded-sm text-[8px] font-medium text-white/80 bg-black/50">
              {duration}s
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="px-1.5 py-1.5">
        <div className="text-[10px] font-medium text-neutral-200 truncate leading-tight">
          {title}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
          <span className={`text-[8px] ${colors.text}`}>
            {t(BLOCK_CATEGORIES.find((c) => c.id === category)?.label ?? category)}
          </span>
        </div>
      </div>
    </div>
  );
}
