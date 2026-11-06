import { hasOnlyFormattingChildren } from "./domEditInlineText";

export type LayerKind = "image" | "video" | "audio" | "vector" | "group" | "text" | "shape";

export function isCompositionHost(el: Element): boolean {
  return el.hasAttribute("data-composition-src") || el.hasAttribute("data-composition-file");
}

/** What a Layers row tells a person an element is: its media tag, a group, text, or else a shape. */
export function layerKindOf(el: Element, hasChildren: boolean): LayerKind {
  const tag = el.tagName.toLowerCase();
  if (tag === "img" || tag === "picture") return "image";
  if (tag === "video") return "video";
  if (tag === "audio") return "audio";
  if (tag === "svg") return "vector";
  if (el.hasAttribute("data-hf-group") || isCompositionHost(el)) return "group";
  if (hasOnlyFormattingChildren(el as HTMLElement) && el.textContent?.trim()) return "text";
  return hasChildren ? "group" : "shape";
}
