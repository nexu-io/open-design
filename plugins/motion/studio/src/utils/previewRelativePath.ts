import { buildProjectApiPath } from "./projectRouting";

/** Resolve a media src to its project-relative preview path, or null. */
export function resolvePreviewRelative(
  src: string | undefined,
  pid: string,
  origin: string,
): string | null {
  if (!src) return null;
  try {
    const parsed = new URL(src, origin);
    const base = new URL(buildProjectApiPath(pid, `/preview/`), origin).pathname;
    return parsed.pathname.startsWith(base)
      ? decodeURIComponent(parsed.pathname.slice(base.length))
      : null;
  } catch {
    return null;
  }
}
