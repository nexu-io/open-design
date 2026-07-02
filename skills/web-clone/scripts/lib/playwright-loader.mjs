import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function loadPlaywright() {
  const candidates = [
    "playwright",
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try next candidate.
    }
  }
  throw new Error("Playwright not found. Run `npm install -D playwright` in the clone project, or install the Browser skill dependencies.");
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
