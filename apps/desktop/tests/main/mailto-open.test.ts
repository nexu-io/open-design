import { describe, expect, test } from "vitest";

import {
  extractDefaultMailtoHandlerBundleId,
  isBrowserBundleId,
  openFirstPartyMailto,
  readDefaultMailtoHandlerBundleId,
  resolveMailtoLaunch,
} from "../../src/main/mailto-open.js";

// Shape produced by:
// `defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers`
// on a machine whose "default email reader" was switched to Chrome. The nested
// LSHandlerPreferredVersions dict carries its own LSHandlerRoleAll = "-" that
// a depth-blind scan would return instead of the real bundle id.
const LS_HANDLERS_CHROME_MAILTO = `(
        {
        LSHandlerContentType = "public.html";
        LSHandlerPreferredVersions =         {
            LSHandlerRoleAll = "-";
        };
        LSHandlerRoleAll = "com.apple.safari";
    },
        {
        LSHandlerPreferredVersions =         {
            LSHandlerRoleAll = "-";
        };
        LSHandlerRoleAll = "com.google.chrome";
        LSHandlerURLScheme = mailto;
    },
        {
        LSHandlerPreferredVersions =         {
            LSHandlerRoleAll = "-";
        };
        LSHandlerRoleAll = "com.google.chrome";
        LSHandlerURLScheme = https;
    }
)`;

const LS_HANDLERS_MAIL_APP_MAILTO = `(
        {
        LSHandlerPreferredVersions =         {
            LSHandlerRoleAll = "-";
        };
        LSHandlerRoleAll = "com.readdle.smartemail-Mac";
        LSHandlerURLScheme = "mailto";
    }
)`;

const LS_HANDLERS_EDGE_MAILTO = `(
        {
        LSHandlerContentType = "com.apple.default-app.mail-client";
        LSHandlerRoleAll = "com.microsoft.edgemac";
    },
        {
        LSHandlerRoleAll = "com.microsoft.edgemac";
        LSHandlerURLScheme = mailto;
    }
)`;

describe("extractDefaultMailtoHandlerBundleId", () => {
  test("returns the mailto entry's own bundle id, not the nested placeholder", () => {
    expect(extractDefaultMailtoHandlerBundleId(LS_HANDLERS_CHROME_MAILTO)).toBe(
      "com.google.chrome",
    );
  });

  test("handles quoted scheme values and mixed-case bundle ids", () => {
    expect(extractDefaultMailtoHandlerBundleId(LS_HANDLERS_MAIL_APP_MAILTO)).toBe(
      "com.readdle.smartemail-mac",
    );
  });

  test("returns null when no mailto entry exists", () => {
    const text = `(
        {
        LSHandlerRoleAll = "com.google.chrome";
        LSHandlerURLScheme = https;
    }
)`;
    expect(extractDefaultMailtoHandlerBundleId(text)).toBeNull();
  });

  test("returns null for empty or non-plist text", () => {
    expect(extractDefaultMailtoHandlerBundleId("")).toBeNull();
    expect(extractDefaultMailtoHandlerBundleId("not a plist")).toBeNull();
  });

  test("returns null when the mailto entry has a placeholder role", () => {
    const text = `(
        {
        LSHandlerRoleAll = "-";
        LSHandlerURLScheme = mailto;
    }
)`;
    expect(extractDefaultMailtoHandlerBundleId(text)).toBeNull();
  });
});

describe("isBrowserBundleId", () => {
  test.each([
    "com.google.chrome",
    "com.google.Chrome.beta",
    "com.apple.Safari",
    "com.microsoft.edgemac.Beta",
    "org.mozilla.firefox",
    "com.brave.Browser",
    "company.thebrowser.Browser",
    "com.duckduckgo.macos.browser",
  ])("classifies %s as a browser", (id) => {
    expect(isBrowserBundleId(id)).toBe(true);
  });

  test.each([
    "com.apple.mail",
    "com.microsoft.Outlook",
    "com.readdle.smartemail-Mac",
    "org.airmailapp.airmail",
    "it.bloop.airmail2",
    "",
  ])("does not classify %s as a browser", (id) => {
    expect(isBrowserBundleId(id)).toBe(false);
  });
});

describe("resolveMailtoLaunch", () => {
  test("no override means the system default (Apple Mail) is fine", () => {
    expect(resolveMailtoLaunch(null)).toBe("system-default");
  });

  test("a real mail client override is respected", () => {
    expect(resolveMailtoLaunch("com.microsoft.outlook")).toBe("system-default");
  });

  test("a browser override forces Apple Mail", () => {
    expect(resolveMailtoLaunch("com.google.chrome")).toBe("apple-mail");
  });
});

describe("readDefaultMailtoHandlerBundleId", () => {
  test("reads the real macOS LaunchServices domain and detects an Edge mailto handler", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const result = await readDefaultMailtoHandlerBundleId(async (file, args) => {
      calls.push({ file, args });
      return {
        stdout: LS_HANDLERS_EDGE_MAILTO,
        stderr: "",
      };
    });

    expect(calls).toEqual([{
      file: "defaults",
      args: [
        "read",
        "com.apple.LaunchServices/com.apple.launchservices.secure",
        "LSHandlers",
      ],
    }]);
    expect(result).toBe("com.microsoft.edgemac");
    expect(resolveMailtoLaunch(result)).toBe("apple-mail");
  });

  test("returns null when the read fails (no overrides recorded)", async () => {
    const result = await readDefaultMailtoHandlerBundleId(async () => {
      throw new Error("The domain/default pair does not exist");
    });
    expect(result).toBeNull();
  });
});

const expectedRealMailtoHandler = process.env.OD_EXPECT_REAL_MAILTO_HANDLER;
const realMacLaunchServicesTest =
  process.platform === "darwin" && expectedRealMailtoHandler ? test : test.skip;

realMacLaunchServicesTest(
  "reads this machine's real mailto handler through the macOS LaunchServices domain",
  async () => {
    const handler = await readDefaultMailtoHandlerBundleId();
    expect(handler).toBe(expectedRealMailtoHandler);
    expect(resolveMailtoLaunch(handler)).toBe("apple-mail");
  },
);

describe("openFirstPartyMailto", () => {
  const MAILTO = "mailto:support@open-design.ai";

  test("refuses anything that is not a mailto", async () => {
    const calls: string[] = [];
    const opened = await openFirstPartyMailto("https://open-design.ai", {
      platform: "darwin",
      readHandlerBundleId: async () => null,
      openWithAppleMail: async (url) => void calls.push(`mail:${url}`),
      openExternal: async (url) => void calls.push(`external:${url}`),
    });
    expect(opened).toBe(false);
    expect(calls).toEqual([]);
  });

  test("uses the OS default when no browser owns mailto", async () => {
    const calls: string[] = [];
    const opened = await openFirstPartyMailto(MAILTO, {
      platform: "darwin",
      readHandlerBundleId: async () => null,
      openWithAppleMail: async (url) => void calls.push(`mail:${url}`),
      openExternal: async (url) => void calls.push(`external:${url}`),
    });
    expect(opened).toBe(true);
    expect(calls).toEqual([`external:${MAILTO}`]);
  });

  test("routes to Apple Mail when a browser owns the mailto scheme", async () => {
    const calls: string[] = [];
    const opened = await openFirstPartyMailto(MAILTO, {
      platform: "darwin",
      readHandlerBundleId: async () => "com.google.chrome",
      openWithAppleMail: async (url) => void calls.push(`mail:${url}`),
      openExternal: async (url) => void calls.push(`external:${url}`),
    });
    expect(opened).toBe(true);
    expect(calls).toEqual([`mail:${MAILTO}`]);
  });

  test("falls back to the OS default when Apple Mail fails to launch", async () => {
    const calls: string[] = [];
    const opened = await openFirstPartyMailto(MAILTO, {
      platform: "darwin",
      readHandlerBundleId: async () => "com.google.chrome",
      openWithAppleMail: async () => {
        throw new Error("Unable to find application");
      },
      openExternal: async (url) => void calls.push(`external:${url}`),
    });
    expect(opened).toBe(true);
    expect(calls).toEqual([`external:${MAILTO}`]);
  });

  test("keeps plain openExternal on non-mac platforms", async () => {
    const calls: string[] = [];
    let lookedUp = false;
    const opened = await openFirstPartyMailto(MAILTO, {
      platform: "win32",
      readHandlerBundleId: async () => {
        lookedUp = true;
        return "com.google.chrome";
      },
      openWithAppleMail: async (url) => void calls.push(`mail:${url}`),
      openExternal: async (url) => void calls.push(`external:${url}`),
    });
    expect(opened).toBe(true);
    expect(lookedUp).toBe(false);
    expect(calls).toEqual([`external:${MAILTO}`]);
  });

  test("reports failure when even openExternal throws", async () => {
    const opened = await openFirstPartyMailto(MAILTO, {
      platform: "linux",
      readHandlerBundleId: async () => null,
      openWithAppleMail: async () => {},
      openExternal: async () => {
        throw new Error("no handler");
      },
    });
    expect(opened).toBe(false);
  });
});
