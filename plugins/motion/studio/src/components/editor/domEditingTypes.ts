import type { PatchTarget } from "../../utils/sourcePatcher";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";

export const CURATED_STYLE_PROPERTIES = [
  "position",
  "display",
  "top",
  "left",
  "right",
  "bottom",
  "inset",
  "width",
  "height",
  "gap",
  "justify-content",
  "align-items",
  "flex-direction",
  "font-size",
  "font-style",
  "font-weight",
  "font-family",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "color",
  "background-color",
  "background-image",
  "opacity",
  "mix-blend-mode",
  "border-radius",
  "border-width",
  "border-style",
  "border-color",
  "border-top-width",
  "border-top-style",
  "border-top-color",
  "outline-color",
  "overflow",
  "clip-path",
  "box-shadow",
  "filter",
  "backdrop-filter",
  "z-index",
  "transform",
  "object-fit",
  "object-position",
] as const;

export interface DomEditCapabilities {
  canSelect: boolean;
  canEditStyles: boolean;
  /** Can take a non-destructive `clip-path: inset()` crop — broader than
   *  canEditStyles (a sub-composition host is croppable from the parent view). */
  canCrop: boolean;
  /** Directly editable authored left/top style fields. Canvas drag uses manual edits instead. */
  canMove: boolean;
  /** Directly editable authored width/height style fields. Canvas resize uses manual edits instead. */
  canResize: boolean;
  canApplyManualOffset: boolean;
  canApplyManualSize: boolean;
  canApplyManualRotation: boolean;
  reasonIfDisabled?: string;
  commitCheckPending?: boolean;
}

export interface DomEditTextField {
  key: string;
  label: string;
  value: string;
  tagName: string;
  attributes: Array<{ name: string; value: string }>;
  inlineStyles: Record<string, string>;
  computedStyles: Record<string, string>;
  source: "self" | "child" | "text-node";
  sourceChildIndex?: number;
}

export interface DomEditSelection extends PatchTarget {
  element: HTMLElement;
  label: string;
  tagName: string;
  sourceFile: string;
  compositionPath: string;
  compositionSrc?: string;
  isCompositionHost: boolean;
  isInsideLockedComposition: boolean;
  boundingBox: { x: number; y: number; width: number; height: number };
  textContent: string | null;
  dataAttributes: Record<string, string>;
  inlineStyles: Record<string, string>;
  computedStyles: Record<string, string>;
  textFields: DomEditTextField[];
  capabilities: DomEditCapabilities;
  existsInSource?: boolean;
  gsapAnimations?: GsapAnimation[];
}

export interface DomEditLayerItem {
  key: string;
  element: HTMLElement;
  label: string;
  tagName: string;
  depth: number;
  childCount: number;
  id?: string;
  hfId?: string;
  selector?: string;
  selectorIndex?: number;
  sourceFile: string;
}

export interface DomEditContextOptions {
  activeCompositionPath: string | null;
  isMasterView: boolean;
  preferClipAncestor?: boolean;
  /** The group wrapper the user has drilled into (null = top level). Selection
   * resolution treats groups as a unit unless drilled into one. */
  activeGroupElement?: HTMLElement | null;
}

export interface DomEditViewport {
  width: number;
  height: number;
}

export interface TimelineElementDomTarget {
  id?: string;
  domId?: string;
  selector?: string;
  selectorIndex?: number;
  sourceFile?: string;
  compositionSrc?: string;
}

export interface TimelineElementDomTargetOptions {
  activeCompositionPath: string | null;
  compIdToSrc?: ReadonlyMap<string, string>;
  isMasterView: boolean;
}
