/**
 * workspace-root.ts — single source of truth for finding the workspace
 * root directory from any starting point. Used by the auto-start helpers
 * (which walk up from the resolved Electron binary) and by daemon-manager
 * (which walks up from the node binary or __dirname). The hardcoded
 * 7-level / 4-level walks that used to live inline drift on every pnpm
 * layout change; this bounded walk survives both pnpm-hoisted and
 * non-hoisted layouts because it stops at the first ancestor containing
 * an `apps/` directory.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const MAX_ASCENT_HOPS = 12;

export function findAncestorWithApps(startDir: string): string | null {
  let cursor = startDir;
  for (let i = 0; i < MAX_ASCENT_HOPS; i++) {
    if (existsSync(join(cursor, "apps"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
  return null;
}
