import { AUDIO_EXT, IMAGE_EXT, VIDEO_EXT, FONT_EXT } from "../../utils/mediaTypes";

export type MediaCategory = "audio" | "images" | "video" | "fonts";

export function getCategory(path: string): MediaCategory | null {
  if (AUDIO_EXT.test(path)) return "audio";
  if (IMAGE_EXT.test(path)) return "images";
  if (VIDEO_EXT.test(path)) return "video";
  if (FONT_EXT.test(path)) return "fonts";
  return null;
}

export function getAudioSubtype(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes("/bgm/") || lower.includes("/music/")) return "BGM";
  if (lower.includes("/sfx/") || lower.includes("/sound")) return "SFX";
  if (lower.includes("/voice/") || lower.includes("/narrat")) return "Voice";
  return "Audio";
}

export function basename(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Last path segment WITH its extension (basename() strips it). */
export function filename(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Feedback shown on an asset row/card after a copy-path attempt. */
export type CopyFeedback = { path: string; ok: boolean } | null;

export function ext(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : "";
}

/**
 * Truncate a string to at most `maxLen` chars, preserving the start and end.
 * Middle characters are replaced with an ellipsis. If the string is short
 * enough it is returned unchanged.
 *
 * @example truncateMiddle("2a37eabf-long-uuid-887d8.mp4", 20) → "2a37eabf-…887d8.mp4"
 *
 * Pure — unit-tested.
 */
export function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const keep = maxLen - 1; // 1 char for ellipsis
  const tail = Math.floor(keep / 3);
  const head = keep - tail;
  return str.slice(0, head) + "…" + str.slice(str.length - tail);
}

/**
 * Format a duration in seconds as MM:SS. Returns an empty string for
 * non-positive, NaN, or Infinity values. Pure — unit-tested.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const CATEGORY_LABELS: Record<MediaCategory, string> = {
  audio: "Audio",
  images: "Images",
  video: "Video",
  fonts: "Fonts",
};

export const FILTER_ORDER: MediaCategory[] = ["audio", "images", "video", "fonts"];
