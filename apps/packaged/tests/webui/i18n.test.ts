import { describe, expect, it } from "vitest";

import { resolveWebuiLocale, webuiMessages, type WebuiLocale } from "../../src/webui/i18n.js";

describe("resolveWebuiLocale", () => {
  it("prefers explicit --lang over config and env", () => {
    expect(
      resolveWebuiLocale({ flagLang: "zh-CN", configLang: "en", env: { LANG: "en_US.UTF-8" } }),
    ).toBe("zh-CN");
  });

  it("uses config.lang when no flag", () => {
    expect(resolveWebuiLocale({ configLang: "zh", env: { LANG: "en_US.UTF-8" } })).toBe("zh-CN");
  });

  it("falls back through the POSIX env chain", () => {
    expect(resolveWebuiLocale({ env: { LANG: "zh_CN.UTF-8" } })).toBe("zh-CN");
    expect(resolveWebuiLocale({ env: { LC_ALL: "zh_CN.UTF-8", LANG: "en_US" } })).toBe("zh-CN");
    expect(resolveWebuiLocale({ env: { LANG: "fr_FR.UTF-8" } })).toBe("en");
  });

  it("defaults to en when nothing is set", () => {
    expect(resolveWebuiLocale({ env: {} })).toBe("en");
  });
});

describe("webuiMessages", () => {
  const locales: WebuiLocale[] = ["en", "zh-CN"];

  it("returns a complete catalog for every locale with no empty strings", () => {
    for (const locale of locales) {
      const m = webuiMessages(locale);
      expect(m.started.length).toBeGreaterThan(0);
      expect(m.accessAt.length).toBeGreaterThan(0);
      expect(m.tokenLine("odtoken_x")).toContain("odtoken_x");
      expect(m.daemonDirect("http://h:7457")).toContain("http://h:7457");
      expect(m.configCreated("/tmp/c.json")).toContain("/tmp/c.json");
      expect(m.notRunning("default")).toContain("default");
      expect(m.runningInBackground.length).toBeGreaterThan(0);
      expect(m.hintStop("./open-design.sh")).toContain("./open-design.sh stop");
      expect(m.hintForeground("./open-design.sh")).toContain("--foreground");
      expect(m.alreadyRunning("http://localhost:7456")).toContain("http://localhost:7456");
    }
  });

  it("localizes the started banner per locale", () => {
    expect(webuiMessages("zh-CN").started).toContain("已启动");
    expect(webuiMessages("en").started).toBe("Open Design is running");
  });
});
