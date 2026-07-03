import { createRequire } from "node:module";
import path from "node:path";

const skillRequire = createRequire(import.meta.url);

function requireFromWorkspace(specifier) {
  const workspaceRequire = createRequire(path.join(process.cwd(), "package.json"));
  return workspaceRequire(specifier);
}

export function loadPlaywright() {
  const candidates = [
    () => process.env.WEB_CLONE_PLAYWRIGHT_PATH
      ? skillRequire(process.env.WEB_CLONE_PLAYWRIGHT_PATH)
      : null,
    () => requireFromWorkspace("playwright"),
    () => skillRequire("playwright"),
  ];
  for (const candidate of candidates) {
    try {
      const loaded = candidate();
      if (loaded) return loaded;
    } catch {
      // Try next candidate.
    }
  }
  throw new Error("Playwright not found. Run `npm install -D playwright` in the workspace where you execute the web-clone scripts, or set WEB_CLONE_PLAYWRIGHT_PATH to an installed Playwright package.");
}

export async function launchChromium(chromium) {
  try {
    return await chromium.launch({ headless: true });
  } catch (firstError) {
    try {
      return await chromium.launch({ headless: true, channel: "chrome" });
    } catch {
      throw firstError;
    }
  }
}
