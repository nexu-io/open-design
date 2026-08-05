import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { shell } from "electron";

const execFileAsync = promisify(execFile);

// How long we let `defaults read` run before giving up and falling back to
// `shell.openExternal`. The read is a tiny local prefs lookup; anything slower
// means something is wrong and the click must not feel dead while we wait.
const HANDLER_LOOKUP_TIMEOUT_MS = 1_500;

// Bundle-id shapes that identify a WEB BROWSER registered as the macOS
// "default email reader". Explicit prefixes for the browsers we know, plus
// conservative substrings for renamed/forked builds (e.g. `com.google.Chrome.beta`,
// `com.duckduckgo.macos.browser`). A mail client must never match: the whole
// point of the check is to tell "mailto goes to a real mail app" apart from
// "mailto goes to a browser that will swallow it".
const BROWSER_BUNDLE_ID_PREFIXES = [
  "com.apple.safari",
  "com.google.chrome",
  "org.chromium.chromium",
  "com.microsoft.edgemac",
  "org.mozilla.firefox",
  "org.mozilla.nightly",
  "com.brave.browser",
  "com.operasoftware.",
  "com.vivaldi.vivaldi",
  "company.thebrowser.",
  "ru.yandex.desktop.yandex-browser",
];

const BROWSER_BUNDLE_ID_SUBSTRINGS = ["chrome", "chromium", "firefox", "edgemac", "browser"];

export function isBrowserBundleId(bundleId: string): boolean {
  const normalized = bundleId.trim().toLowerCase();
  if (!normalized) return false;
  if (BROWSER_BUNDLE_ID_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  return BROWSER_BUNDLE_ID_SUBSTRINGS.some((needle) => normalized.includes(needle));
}

// Parse the old-style plist text printed by:
// `defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers`
// and return the bundle id registered for the `mailto` scheme, lowercased, or
// null when no override exists (macOS then routes mailto to Apple Mail, the
// built-in default). Entries look like:
//
//     {
//         LSHandlerPreferredVersions =         {
//             LSHandlerRoleAll = "-";
//         };
//         LSHandlerRoleAll = "com.google.chrome";
//         LSHandlerURLScheme = mailto;
//     },
//
// The nested `LSHandlerPreferredVersions` dict also carries an
// `LSHandlerRoleAll` key, so the scan must only read keys at the entry's own
// depth — a flat regex over the whole entry would happily return `-`.
export function extractDefaultMailtoHandlerBundleId(lsHandlersText: string): string | null {
  for (const entry of topLevelDictEntries(lsHandlersText)) {
    const flattened = blankNestedDicts(entry);
    if (!/LSHandlerURLScheme\s*=\s*"?mailto"?\s*;/i.test(flattened)) continue;
    const role = /LSHandlerRoleAll\s*=\s*"?([^";\n]+)"?\s*;/.exec(flattened);
    if (!role) return null;
    const bundleId = role[1].trim().toLowerCase();
    return bundleId && bundleId !== "-" ? bundleId : null;
  }
  return null;
}

// Split the printed LSHandlers array into its top-level `{ ... }` entries,
// keeping nested braces balanced inside each entry.
function topLevelDictEntries(text: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        entries.push(text.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return entries;
}

// Replace the CONTENT of any nested `{ ... }` inside a single entry with
// blanks so key lookups only see the entry's own depth.
function blankNestedDicts(entry: string): string {
  const inner = entry.slice(1, -1);
  let depth = 0;
  let out = "";
  for (const ch of inner) {
    if (ch === "{") {
      depth += 1;
      out += " ";
    } else if (ch === "}") {
      depth -= 1;
      if (depth < 0) depth = 0;
      out += " ";
    } else {
      out += depth === 0 ? ch : " ";
    }
  }
  return out;
}

// Where a validated first-party mailto should be launched.
//
// - `system-default`: hand the URL to the OS (`shell.openExternal`). Used when
//   no mailto override exists (Apple Mail is the built-in default) or when the
//   override is a genuine mail client the user chose.
// - `apple-mail`: the user's OS-level "default email reader" is a web browser.
//   `shell.openExternal(mailto:)` then just focuses that browser, which drops
//   the mailto unless a webmail handler happens to be configured — the exact
//   dead-end of recvpZzUroEPUT ("click the mail button, the browser comes to
//   the front on whatever page it was on, no compose window ever appears").
//   Launch Apple Mail with the mailto explicitly instead: the product intent
//   of the button is "open the local mail client".
export type MailtoLaunch = "system-default" | "apple-mail";

export function resolveMailtoLaunch(handlerBundleId: string | null): MailtoLaunch {
  if (handlerBundleId && isBrowserBundleId(handlerBundleId)) return "apple-mail";
  return "system-default";
}

type RunCommand = (
  file: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

const defaultRunCommand: RunCommand = async (file, args) => {
  const { stdout, stderr } = await execFileAsync(file, args, {
    timeout: HANDLER_LOOKUP_TIMEOUT_MS,
    windowsHide: true,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
};

export async function readDefaultMailtoHandlerBundleId(
  runCommand: RunCommand = defaultRunCommand,
): Promise<string | null> {
  try {
    const { stdout } = await runCommand("defaults", [
      "read",
      "com.apple.LaunchServices/com.apple.launchservices.secure",
      "LSHandlers",
    ]);
    return extractDefaultMailtoHandlerBundleId(stdout);
  } catch {
    // Missing key/domain (no overrides — Apple Mail is the default), or a
    // slow/failed read: both mean "trust the system default".
    return null;
  }
}

export interface OpenFirstPartyMailtoDeps {
  platform: NodeJS.Platform;
  readHandlerBundleId: () => Promise<string | null>;
  openWithAppleMail: (url: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
}

const defaultDeps: OpenFirstPartyMailtoDeps = {
  platform: process.platform,
  readHandlerBundleId: () => readDefaultMailtoHandlerBundleId(),
  openWithAppleMail: async (url) => {
    await execFileAsync("open", ["-b", "com.apple.mail", url], {
      timeout: HANDLER_LOOKUP_TIMEOUT_MS,
    });
  },
  openExternal: (url) => shell.openExternal(url),
};

// Open a first-party mailto in the user's LOCAL mail client. Callers must have
// already validated the URL against the first-party allowlist
// (`isFirstPartyMailtoUrl` / `isSupportMailtoUrl` in runtime.ts); this function
// re-checks only the scheme so nothing but a mailto can ever reach the shell.
//
// On macOS, when the OS-level mailto handler is a web browser, the URL is
// handed to Apple Mail directly (see `resolveMailtoLaunch`); every failure path
// degrades to plain `shell.openExternal`, which is the pre-existing behavior.
export async function openFirstPartyMailto(
  url: string,
  deps: Partial<OpenFirstPartyMailtoDeps> = {},
): Promise<boolean> {
  const { platform, readHandlerBundleId, openWithAppleMail, openExternal } = {
    ...defaultDeps,
    ...deps,
  };
  try {
    if (new URL(url).protocol !== "mailto:") return false;
  } catch {
    return false;
  }
  if (platform === "darwin") {
    const launch = resolveMailtoLaunch(await readHandlerBundleId());
    if (launch === "apple-mail") {
      try {
        await openWithAppleMail(url);
        return true;
      } catch {
        // Apple Mail missing or `open` failed — fall through to the OS default.
      }
    }
  }
  try {
    await openExternal(url);
    return true;
  } catch {
    return false;
  }
}
