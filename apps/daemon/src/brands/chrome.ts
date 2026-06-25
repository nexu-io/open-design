import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolveOnPath } from "../runtimes/executables.js";

/**
 * Optional system-Chrome fallback for the prefetch pipeline.
 *
 * Brand extraction opens the target site in Open Design's in-product browser
 * tab so the user can clear Cloudflare / human checks there and the agent can
 * continue in the same product loop. Launching an unrelated local Chrome here
 * breaks that loop: cookies, user confirmation, and page state do not carry
 * over, so the deterministic harvester sees a different browser than the user.
 *
 * Keep this module as an explicit escape hatch for local diagnostics only.
 * Production extraction should stay inside the in-app browser path.
 */

const MAC_CHROMES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];
const PATH_BINS = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "msedge"];

let cached: { path: string | null; expiresAt: number } | null = null;

/** Locate a Chromium-family binary: env override → mac app bundles → PATH. */
export function findChrome(): string | null {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.path;
  const override = process.env.BRANDING_AGENT_CHROME?.trim();
  const enabled =
    process.env.OD_BRAND_ALLOW_SYSTEM_CHROME === '1'
    || Boolean(override);
  if (!enabled) {
    cached = { path: null, expiresAt: now + 5 * 60_000 };
    return null;
  }
  let found: string | null = null;
  if (override && existsSync(override)) {
    found = override;
  } else {
    if (process.platform === "darwin") {
      found = MAC_CHROMES.find((p) => existsSync(p)) ?? null;
    }
    if (!found) {
      for (const bin of PATH_BINS) {
        const p = resolveOnPath(bin);
        if (p) {
          found = p;
          break;
        }
      }
    }
  }
  cached = { path: found, expiresAt: now + 5 * 60_000 };
  return found;
}

const COMMON_FLAGS = [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  // Let the page settle (lazy CSS-in-JS injection, web fonts) without
  // waiting wall-clock time on fast pages.
  "--virtual-time-budget=6000",
  "--timeout=12000",
];

function runChrome(args: string[], timeoutMs: number): Promise<{ stdout: string; code: number | null }> {
  const bin = findChrome();
  if (!bin) return Promise.resolve({ stdout: "", code: null });
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    let done = false;
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      resolve({ stdout: out, code });
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c: string) => {
      // Cap the buffered DOM at 3MB — beyond that the harvest regexes have
      // plenty to chew on already.
      if (out.length < 3_000_000) out += c;
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code));
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      finish(null);
    }, timeoutMs);
  });
}

/** JS-rendered DOM of the page, or null when Chrome is unavailable/fails. */
export async function chromeDumpDom(url: string): Promise<string | null> {
  const { stdout } = await runChrome([...COMMON_FLAGS, "--dump-dom", url], 20_000);
  const html = stdout.trim();
  // A real render produces a full document; tiny output means an error page.
  return html.length > 500 && /<html/i.test(html) ? html : null;
}

/** Full-page-ish screenshot written to outPath. Returns success. */
export async function chromeScreenshot(url: string, outPath: string): Promise<boolean> {
  const { code } = await runChrome(
    [...COMMON_FLAGS, `--screenshot=${outPath}`, "--window-size=1280,2000", url],
    20_000,
  );
  return code === 0 && existsSync(outPath);
}
