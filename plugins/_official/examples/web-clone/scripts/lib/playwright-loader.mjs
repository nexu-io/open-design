import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function loadPlaywright() {
  const candidates = [
    "playwright",
    process.env.OD_PLAYWRIGHT_PATH,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return require(candidate);
    } catch {
      // Try next candidate.
    }
  }
  throw new Error("Playwright not found. Run `npm install -D playwright` in the project, or set OD_PLAYWRIGHT_PATH to a Playwright package path.");
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
