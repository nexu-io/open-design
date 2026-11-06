import { describe, expect, test } from "vitest";

import {
  extractDefaultMailtoHandlerBundleId,
  hasProtocolHandler,
  isBrowserBundleId,
  mailtoAddress,
  noMailClientNotice,
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

  // OPEND-2799: on Windows the button did nothing when no mail client is
  // registered — `shell.openExternal(mailto:)` resolves without opening
  // anything. The main process now pre-checks the mailto handler and, when
  // there is none (or the launch is refused), copies the address and tells the
  // user, so the click always has a visible outcome.
  test("win32: copies the address and notifies when no mailto handler is registered", async () => {
    const calls: string[] = [];
    const notified: string[] = [];
    const opened = await openFirstPartyMailto(MAILTO, {
      platform: "win32",
      readHandlerBundleId: async () => null,
      readProtocolHandlerName: () => "",
      openWithAppleMail: async (url) => void calls.push(`mail:${url}`),
      openExternal: async (url) => void calls.push(`external:${url}`),
      notifyNoMailClient: async (address) => void notified.push(address),
    });
    expect(opened).toBe(false);
    expect(calls).toEqual([]);
    expect(notified).toEqual(["support@open-design.ai"]);
  });

  test("win32: copies the address and notifies when the registered handler refuses the launch", async () => {
    const notified: string[] = [];
    const opened = await openFirstPartyMailto(MAILTO, {
      platform: "win32",
      readHandlerBundleId: async () => null,
      readProtocolHandlerName: () => "Outlook",
      openWithAppleMail: async () => {},
      openExternal: async () => {
        throw new Error("Application not found");
      },
      notifyNoMailClient: async (address) => void notified.push(address),
    });
    expect(opened).toBe(false);
    expect(notified).toEqual(["support@open-design.ai"]);
  });

  test("win32: a registered handler that accepts the launch shows no notice", async () => {
    const calls: string[] = [];
    const notified: string[] = [];
    const opened = await openFirstPartyMailto(MAILTO, {
      platform: "win32",
      readHandlerBundleId: async () => null,
      readProtocolHandlerName: () => "Outlook",
      openWithAppleMail: async () => {},
      openExternal: async (url) => void calls.push(`external:${url}`),
      notifyNoMailClient: async (address) => void notified.push(address),
    });
    expect(opened).toBe(true);
    expect(calls).toEqual([`external:${MAILTO}`]);
    expect(notified).toEqual([]);
  });

  test("darwin: the LaunchServices path is untouched — no protocol pre-check, no notice", async () => {
    const calls: string[] = [];
    const notified: string[] = [];
    let protocolChecked = false;
    const opened = await openFirstPartyMailto(MAILTO, {
      platform: "darwin",
      readHandlerBundleId: async () => "com.google.chrome",
      readProtocolHandlerName: () => {
        protocolChecked = true;
        return "";
      },
      openWithAppleMail: async (url) => void calls.push(`mail:${url}`),
      openExternal: async (url) => void calls.push(`external:${url}`),
      notifyNoMailClient: async (address) => void notified.push(address),
    });
    expect(opened).toBe(true);
    expect(protocolChecked).toBe(false);
    expect(calls).toEqual([`mail:${MAILTO}`]);
    expect(notified).toEqual([]);
  });

  test("reports failure when even openExternal throws, after telling the user", async () => {
    const notified: string[] = [];
    const opened = await openFirstPartyMailto(MAILTO, {
      platform: "linux",
      readHandlerBundleId: async () => null,
      readProtocolHandlerName: () => "Thunderbird",
      openWithAppleMail: async () => {},
      openExternal: async () => {
        throw new Error("no handler");
      },
      notifyNoMailClient: async (address) => void notified.push(address),
    });
    expect(opened).toBe(false);
    expect(notified).toEqual(["support@open-design.ai"]);
  });

  test("a failing notice never escapes to the caller", async () => {
    const opened = await openFirstPartyMailto(MAILTO, {
      platform: "win32",
      readHandlerBundleId: async () => null,
      readProtocolHandlerName: () => "",
      openWithAppleMail: async () => {},
      openExternal: async () => {},
      notifyNoMailClient: async () => {
        throw new Error("dialog unavailable");
      },
    });
    expect(opened).toBe(false);
  });
});

describe("mailto fallback helpers (OPEND-2799)", () => {
  test("mailtoAddress reads the recipient and ignores query parameters", () => {
    expect(mailtoAddress("mailto:support@open-design.ai")).toBe("support@open-design.ai");
    expect(mailtoAddress("mailto:support@open-design.ai?subject=%E5%8F%8D%E9%A6%88")).toBe(
      "support@open-design.ai",
    );
    expect(mailtoAddress("https://open-design.ai")).toBeNull();
    expect(mailtoAddress("mailto:")).toBeNull();
    expect(mailtoAddress("not a url")).toBeNull();
  });

  test("hasProtocolHandler treats an empty handler name as missing and a throwing lookup as unknown", () => {
    expect(hasProtocolHandler("mailto:", () => "Outlook")).toBe(true);
    expect(hasProtocolHandler("mailto:", () => "")).toBe(false);
    expect(hasProtocolHandler("mailto:", () => "   ")).toBe(false);
    expect(
      hasProtocolHandler("mailto:", () => {
        throw new Error("not ready");
      }),
    ).toBe(true);
  });

  test("noMailClientNotice names the copied address in the OS language", () => {
    const zh = noMailClientNotice("support@open-design.ai", "zh-CN");
    expect(zh.detail).toContain("已复制 support@open-design.ai 到剪贴板");
    expect(zh.button).toBe("好");
    const en = noMailClientNotice("support@open-design.ai", "en-US");
    expect(en.detail).toContain("support@open-design.ai has been copied to your clipboard");
    expect(en.button).toBe("OK");
    expect(noMailClientNotice("a@b.c", "fr-FR").button).toBe("OK");
  });
});
