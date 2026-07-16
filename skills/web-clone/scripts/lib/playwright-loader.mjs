import path from "node:path";
import { createRequire } from "node:module";

// Resolve Playwright from wherever it can actually be found:
//   1. relative to this script (covers a checkout that has its own dep);
//   2. relative to the process cwd (covers `npm i -D playwright` in the
//      project — the normal fix inside Open Design, where these scripts are
//      staged under `.od-skills/<plugin>/scripts/` but run from the project
//      root);
//   3. OD_PLAYWRIGHT_PATH — an explicit package-dir escape hatch.
export function loadPlaywright() {
  const requireFromScript = createRequire(import.meta.url);
  const requireFromCwd = createRequire(path.join(process.cwd(), "noop.js"));
  const attempts = [
    () => requireFromScript("playwright"),
    () => requireFromCwd("playwright"),
    () => {
      const p = process.env.OD_PLAYWRIGHT_PATH;
      if (!p) throw new Error("OD_PLAYWRIGHT_PATH unset");
      return requireFromScript(p);
    },
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      // Try next candidate.
    }
  }
  throw new Error(
    "Playwright not found. Fix (run in the project root, once per project):\n" +
      "  npm install -D playwright\n" +
      "Then re-run this script. If launch later fails with a missing-browser " +
      "error AND no local Chrome exists, also run: npx playwright install chromium " +
      "(with a system Chrome installed the scripts fall back to channel:\"chrome\" " +
      "automatically — no download needed). OD_PLAYWRIGHT_PATH=<playwright package dir> " +
      "also works when a shared install exists.",
  );
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
