import { createContext } from "react";
import { useI18n } from '../i18n/I18n';
import { setStudioTheme, useShownStudioTheme } from "../utils/studioTheme";
import { IconButton, Tooltip } from "./ui";

// hyperframes.dev's theme toggle: the same sun and moon, revealing the new theme in a circle from
// the button. A page that paints no frame aborts the transition; the theme is applied by then.
let latest: ViewTransition | null = null;

function reveal(transition: ViewTransition, at: string, radiusPct: number) {
  latest = transition;
  const done = () => {
    if (latest === transition) delete document.documentElement.dataset.themeReveal;
  };
  void transition.finished.then(done, done);
  void transition.ready.then(
    () => {
      document.documentElement.animate(
        { clipPath: [`circle(0% ${at})`, `circle(${radiusPct}% ${at})`] },
        { duration: 500, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" },
      );
    },
    () => {},
  );
}

function origin(e: React.MouseEvent<HTMLButtonElement>): [number, number] {
  if (e.detail > 0) return [e.clientX, e.clientY];
  const box = e.currentTarget.getBoundingClientRect();
  return [box.left + box.width / 2, box.top + box.height / 2];
}

/** On only in Studio's own app; a host that embeds Studio owns its theme. */
export const ShowThemeToggle = createContext(false);

function cannotReveal(): boolean {
  return (
    !document.startViewTransition ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

const iconProps = {
  width: "14",
  height: "14",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function ThemeToggle() {
  const { t } = useI18n();
  const isDark = useShownStudioTheme() === "dark";
  const label = t(isDark ? 'Switch to light theme' : 'Switch to dark theme');

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const apply = () => setStudioTheme(isDark ? "light" : "dark");
    if (cannotReveal()) return apply();
    const [x, y] = origin(e);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const maxRadius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
    const at = `at ${(x / w) * 100}% ${(y / h) * 100}%`;
    const radiusPct = (maxRadius / (Math.hypot(w, h) / Math.SQRT2)) * 100;
    // The switch stays synchronous inside the callback: rendering is paused during it.
    document.documentElement.dataset.themeReveal = "";
    reveal(document.startViewTransition(apply), at, radiusPct);
  }

  return (
    <Tooltip label={label} side="bottom">
      <IconButton
        onClick={toggle}
        aria-label={label}
        icon={
          isDark ? (
            <svg {...iconProps}>
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg {...iconProps}>
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )
        }
      />
    </Tooltip>
  );
}
