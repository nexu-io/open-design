import path from "node:path";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import { systemChromium } from "./system-browser.mjs";

// Reuse an already-provided Playwright runtime when one is available: explicit
// package paths first, then dependencies visible from the script or process
// cwd. Product runs otherwise fall back to the zero-dependency CDP adapter, so
// a web-clone task never mutates the user's project or downloads a browser.
export function loadPlaywright() {
  const requireFromScript = createRequire(import.meta.url);
  const requireFromCwd = createRequire(path.join(process.cwd(), "noop.js"));
  const attempts = [
    () => {
      const p = process.env.OD_PLAYWRIGHT_PACKAGE;
      if (!p) throw new Error("OD_PLAYWRIGHT_PACKAGE unset");
      return requireFromScript(p);
    },
    () => {
      const p = process.env.OD_PLAYWRIGHT_PATH;
      if (!p) throw new Error("OD_PLAYWRIGHT_PATH unset");
      return requireFromScript(p);
    },
    () => requireFromScript("playwright"),
    () => requireFromScript("playwright-core"),
    () => requireFromCwd("playwright"),
    () => requireFromCwd("playwright-core"),
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      // Try next candidate.
    }
  }
  return { chromium: systemChromium };
}

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function executableFromPath(names, env = process.env, platform = process.platform) {
  const pathValue = env.PATH || env.Path || "";
  const extensions = platform === "win32"
    ? (env.PATHEXT || ".EXE;.CMD;.BAT").split(";")
    : [""];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      for (const extension of extensions) {
        const candidate = path.join(directory, `${name}${extension}`);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

export function findSystemChromiumExecutable({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
} = {}) {
  const configured = env.OD_BROWSER_EXECUTABLE_PATH;
  if (configured) {
    if (fs.existsSync(configured)) return configured;
    throw new Error(`OD_BROWSER_EXECUTABLE_PATH does not exist: ${configured}`);
  }

  if (platform === "darwin") {
    return firstExisting([
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(homeDir, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
      path.join(homeDir, "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
    ]);
  }

  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
    return firstExisting(roots.flatMap((root) => [
      path.join(root, "Google/Chrome/Application/chrome.exe"),
      path.join(root, "Microsoft/Edge/Application/msedge.exe"),
      path.join(root, "Chromium/Application/chrome.exe"),
    ]));
  }

  return executableFromPath([
    "google-chrome-stable",
    "google-chrome",
    "microsoft-edge-stable",
    "microsoft-edge",
    "chromium",
    "chromium-browser",
  ], env, platform);
}

export async function launchChromium(chromium, options = {}) {
  // A staged skill can still see Playwright from a source checkout (notably in
  // CI). That must not bypass the product path: agent sandboxes frequently
  // cannot spawn Chrome, while the daemon owns a trusted browser process. Use
  // the zero-dependency adapter for daemon brokering even when the caller's
  // chromium object came from an already-installed Playwright package.
  const daemonChromium = typeof chromium.connectOverDaemon === "function"
    ? chromium
    : systemChromium;
  if (
    typeof daemonChromium.connectOverDaemon === "function"
    && process.env.OD_DAEMON_URL
    && process.env.OD_PROJECT_ID
  ) {
    try {
      return await daemonChromium.connectOverDaemon({
        daemonUrl: process.env.OD_DAEMON_URL,
        projectId: process.env.OD_PROJECT_ID,
      });
    } catch {
      // Older daemons may not expose the broker. Fall back to direct launch.
    }
  }
  const executablePath = findSystemChromiumExecutable(options.discovery);
  let systemBrowserError = null;
  if (executablePath) {
    try {
      return await chromium.launch({ headless: true, executablePath });
    } catch (error) {
      systemBrowserError = error;
    }
  }

  // Source checkouts may already have a Playwright-managed browser. Trying it
  // is safe: launch never downloads a browser; it only uses an existing one.
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(
      "No compatible Chrome, Edge, or Chromium executable is available. " +
        "Open Design does not download a browser during web-clone tasks. " +
        "Install a system browser or set OD_BROWSER_EXECUTABLE_PATH to its executable. " +
        `Browser launch detail: ${systemBrowserError?.message || error.message}`,
    );
  }
}
