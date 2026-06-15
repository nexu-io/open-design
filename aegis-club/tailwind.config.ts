import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base — tema escuro inspirado no Dota 2
        bg: {
          DEFAULT: "#0a0b0f",
          soft: "#101218",
          elevated: "#161922",
        },
        surface: {
          DEFAULT: "#14161d",
          hover: "#1b1e28",
          border: "#252934",
        },
        // Aegis = ouro (cor da Aegis of the Immortal)
        aegis: {
          DEFAULT: "#f5c451",
          soft: "#fbe19a",
          dark: "#b98e22",
        },
        // Dire / vermelho competitivo
        dire: {
          DEFAULT: "#e23636",
          soft: "#ff6b6b",
          dark: "#9b2020",
        },
        // Radiant / verde
        radiant: {
          DEFAULT: "#9bc53d",
          soft: "#c0e072",
          dark: "#5e7a1f",
        },
        // Reputação / comportamento
        behavior: {
          good: "#4ade80",
          warn: "#facc15",
          bad: "#f87171",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(245,196,81,0.18), 0 8px 30px -8px rgba(245,196,81,0.25)",
        card: "0 10px 30px -12px rgba(0,0,0,0.6)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.35s cubic-bezier(0.23,1,0.32,1)",
        "pulse-soft": "pulseSoft 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
