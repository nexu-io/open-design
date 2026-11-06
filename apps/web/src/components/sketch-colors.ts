export const DEFAULT_SKETCH_LIGHT_TOOL_COLOR = '#1c1b1a';
export const DEFAULT_SKETCH_DARK_TOOL_COLOR = '#ffffff';

export function resolveDefaultSketchToolColor(
  theme: string | null,
  prefersDark: boolean,
): string {
  if (theme === 'dark') return DEFAULT_SKETCH_DARK_TOOL_COLOR;
  if (theme === 'light') return DEFAULT_SKETCH_LIGHT_TOOL_COLOR;
  return prefersDark ? DEFAULT_SKETCH_DARK_TOOL_COLOR : DEFAULT_SKETCH_LIGHT_TOOL_COLOR;
}

export function readDefaultSketchToolColor(): string {
  if (typeof document === 'undefined') return DEFAULT_SKETCH_LIGHT_TOOL_COLOR;
  const theme = document.documentElement.getAttribute('data-theme');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  return resolveDefaultSketchToolColor(theme, prefersDark);
}
