export const EASE_PRESETS = [
  { id: "linear", label: "Linear", ease: "none", kind: "curve" },
  { id: "ease-in", label: "Ease In", ease: "power1.in", kind: "curve" },
  { id: "quad-in", label: "Quad In", ease: "power2.in", kind: "curve" },
  { id: "cubic-in", label: "Cubic In", ease: "power3.in", kind: "curve" },
  { id: "ease-out", label: "Ease Out", ease: "power1.out", kind: "curve" },
  { id: "quad-out", label: "Quad Out", ease: "power2.out", kind: "curve" },
  { id: "cubic-out", label: "Cubic Out", ease: "power3.out", kind: "curve" },
  { id: "ease", label: "Ease In & Out", ease: "power1.inOut", kind: "curve" },
  { id: "quad-ease", label: "Quad Ease", ease: "power2.inOut", kind: "curve" },
  { id: "cubic-ease", label: "Cubic Ease", ease: "power3.inOut", kind: "curve" },
  { id: "circular-ease", label: "Circular Ease", ease: "circ.inOut", kind: "curve" },
  { id: "rebound-in", label: "Ease In Back", ease: "back.in", kind: "curve" },
  { id: "rebound-out", label: "Ease Out Back", ease: "back.out", kind: "curve" },
  { id: "flow-1", label: "Flow 1", ease: "wiggle(1,easeInOut,0.20)", kind: "wiggle" },
  { id: "flow-2", label: "Flow 2", ease: "wiggle(2,easeInOut,0.15)", kind: "wiggle" },
  { id: "flow-3", label: "Flow 3", ease: "wiggle(3,easeInOut,0.12)", kind: "wiggle" },
  { id: "flow-4", label: "Flow 4", ease: "wiggle(4,easeInOut,0.10)", kind: "wiggle" },
  { id: "flow-5", label: "Flow 5", ease: "wiggle(5,easeInOut,0.08)", kind: "wiggle" },
  { id: "flow-6", label: "Flow 6", ease: "wiggle(6,easeInOut,0.07)", kind: "wiggle" },
  { id: "flow-7", label: "Flow 7", ease: "wiggle(7,easeInOut,0.06)", kind: "wiggle" },
  { id: "bounce-1", label: "Bounce 1", ease: "wiggle(4,easeOut,0.22)", kind: "wiggle" },
  { id: "bounce-2", label: "Bounce 2", ease: "wiggle(6,easeOut,0.26)", kind: "wiggle" },
  { id: "bounce-3", label: "Bounce 3", ease: "wiggle(9,uniform,0.32)", kind: "wiggle" },
  { id: "bounce-4", label: "Bounce 4", ease: "wiggle(5,anticipate,0.28)", kind: "wiggle" },
  { id: "hold", label: "Hold", ease: "hold", kind: "curve" },
  {
    id: "rebound-ease",
    label: "Ease In & Out Back",
    ease: "back.inOut",
    kind: "curve",
  },
  { id: "expo-in", label: "Expo In", ease: "expo.in", kind: "curve" },
  { id: "expo-out", label: "Expo Out", ease: "expo.out", kind: "curve" },
  // Runtime spring(bounce) approximates Figma stiffness and damping with bounce alone.
  { id: "spring-gentle", label: "Gentle", ease: "spring(0.15)", kind: "spring" },
  { id: "spring-quick", label: "Quick", ease: "spring(0.4)", kind: "spring" },
  { id: "spring-bouncy", label: "Bouncy", ease: "spring(0.6)", kind: "spring" },
  { id: "spring-slow", label: "Slow", ease: "spring(0.25)", kind: "spring" },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  ease: string;
  kind: "curve" | "spring" | "wiggle";
}>;

export function easePresetLabel(ease: string): string | null {
  return EASE_PRESETS.find((preset) => preset.ease === ease)?.label ?? null;
}
