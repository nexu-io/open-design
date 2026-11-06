// Caption Designer — Core Types
// Foundation types for the caption designer feature in HyperFrames Studio.

// ---------------------------------------------------------------------------
// Primitive visual style types
// ---------------------------------------------------------------------------

export interface CaptionGradient {
  type: "linear" | "radial";
  /** Angle in degrees (only meaningful for linear gradients) */
  angle: number;
  stops: Array<{ offset: number; color: string }>;
}

export interface CaptionShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

export interface CaptionGlow {
  blur: number;
  color: string;
  opacity: number;
}

// ---------------------------------------------------------------------------
// Style types
// ---------------------------------------------------------------------------

export interface CaptionStyle {
  // Typography
  fontFamily: string;
  fontSize: number; // px
  fontWeight: number | string;
  fontStyle: "normal" | "italic";
  textDecoration: "none" | "underline" | "line-through" | "underline line-through";
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
  letterSpacing: number; // em
  lineHeight: number; // unitless multiplier

  // Color / fill
  color: string;
  /** Color when the word is being spoken (karaoke active) */
  activeColor: string;
  /** Color before/after the word is spoken (dim/inactive) */
  dimColor: string;
  opacity: number; // 0–1
  gradientFill: CaptionGradient | null;

  // Stroke
  strokeWidth: number;
  strokeColor: string;

  // Effects
  shadows: CaptionShadow[];
  glow: CaptionGlow | null;

  // Transform
  x: number; // px
  y: number; // px
  rotation: number; // degrees
  scaleX: number;
  scaleY: number;
  skewX: number; // degrees
  skewY: number; // degrees
  transformOrigin: string; // e.g. "center center"

  // Composite
  blendMode: string; // CSS mix-blend-mode value
}

export interface CaptionContainerStyle {
  backgroundColor: string;
  backgroundOpacity: number; // 0–1
  paddingTop: number; // px
  paddingRight: number; // px
  paddingBottom: number; // px
  paddingLeft: number; // px
  borderRadius: number; // px
  borderWidth: number; // px
  borderColor: string;
  borderStyle: string; // CSS border-style value
  boxShadow: string; // raw CSS box-shadow value
}

// ---------------------------------------------------------------------------
// Animation types
// ---------------------------------------------------------------------------

export interface CaptionAnimation {
  preset: string; // e.g. "fade", "slide-up", "scale", "none"
  duration: number; // seconds
  ease: string; // GSAP ease string, e.g. "power2.out"
  stagger: number; // seconds between word animations
  staggerDirection: "start" | "end" | "center" | "random";
  intensity: number; // 0–1 scale factor for presets that support it
}

export interface CaptionAnimationSet {
  entrance: CaptionAnimation;
  highlight: CaptionAnimation | null;
  exit: CaptionAnimation;
}

// ---------------------------------------------------------------------------
// Segment & Group types
// ---------------------------------------------------------------------------

/** A single timed word / token within a caption group. */
export interface CaptionSegment {
  id: string;
  /** Stable word ID from transcript.json (e.g. "w0"). Used for caption-overrides.json. */
  wordId?: string;
  text: string;
  start: number; // seconds
  end: number; // seconds
  groupIndex: number; // index within its parent group
  style: Partial<CaptionStyle>;
  animation: Partial<CaptionAnimationSet>;
}

/** A group of segments rendered together as a caption line / block. */
export interface CaptionGroup {
  id: string;
  segmentIds: string[];
  style: CaptionStyle;
  animation: CaptionAnimationSet;
  containerStyle: CaptionContainerStyle;
}

// ---------------------------------------------------------------------------
// Top-level model
// ---------------------------------------------------------------------------

export interface CaptionModel {
  width: number; // composition width in px
  height: number; // composition height in px
  duration: number; // composition duration in seconds
  segments: Map<string, CaptionSegment>;
  groups: Map<string, CaptionGroup>;
  groupOrder: string[]; // ordered group ids
  defaultAnimation: CaptionAnimationSet;
}

// ---------------------------------------------------------------------------
// Default constants
// ---------------------------------------------------------------------------

export const DEFAULT_STYLE: CaptionStyle = {
  fontFamily: "sans-serif",
  fontSize: 48,
  fontWeight: 700,
  fontStyle: "normal",
  textDecoration: "none",
  textTransform: "none",
  letterSpacing: 0,
  lineHeight: 1.2,
  color: "#ffffff",
  activeColor: "#ffffff",
  dimColor: "rgba(255, 255, 255, 0.3)",
  opacity: 1,
  gradientFill: null,
  strokeWidth: 0,
  strokeColor: "#000000",
  shadows: [],
  glow: null,
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
  transformOrigin: "center center",
  blendMode: "normal",
};

export const DEFAULT_CONTAINER: CaptionContainerStyle = {
  backgroundColor: "transparent",
  backgroundOpacity: 0,
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  borderRadius: 0,
  borderWidth: 0,
  borderColor: "transparent",
  borderStyle: "solid",
  boxShadow: "none",
};

const DEFAULT_ANIMATION: CaptionAnimation = {
  preset: "fade",
  duration: 0.2,
  ease: "power2.out",
  stagger: 0,
  staggerDirection: "start",
  intensity: 1,
};

export const DEFAULT_ANIMATION_SET: CaptionAnimationSet = {
  entrance: DEFAULT_ANIMATION,
  highlight: null,
  exit: { ...DEFAULT_ANIMATION },
};
