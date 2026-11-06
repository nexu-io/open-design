/** @deprecated Superseded by `src/styles/theme.css` (published as
 * `@hyperframes/studio/theme.css`); kept one more major for Tailwind v3
 * consumers, frozen at the colours before Graphite (theme.css is light-dark() and colour-mix
 * now, which v3 cannot read). */
const studioPreset = {
  theme: {
    extend: {
      colors: {
        studio: {
          bg: "#0a0a0a",
          surface: "#141414",
          border: "#262626",
          text: "#e5e5e5",
          muted: "#737373",
          accent: "#3CE6AC",
        },
        panel: {
          bg: "#0C0C0E",
          // Open inspector-section body — slightly lighter than headers (bg)
          // so the recessed scrollable region reads distinct.
          "bg-inset": "#121214",
          input: "#161618",
          surface: "#18181B",
          hover: "#27272A",
          border: "#1E1E1E",
          "border-input": "#27272A",
          hairline: "#1A1A1C",
          "text-0": "#FAFAFA",
          "text-1": "#E4E4E7",
          "text-2": "#A1A1AA",
          "text-3": "#71717A",
          "text-4": "#52525B",
          "text-5": "#3F3F46",
          accent: "#3CE6AC",
          danger: "#EF4444",
          media: "#00E3FF",
          container: "#F5A623",
        },
      },
    },
  },
  plugins: [],
};

export default studioPreset;
