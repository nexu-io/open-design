import { describe, expect, it } from "vitest";

import { resolveDesktopMenuLabels } from "../../src/main/menu-i18n.js";

describe("desktop native menu i18n", () => {
  it("uses Simplified Chinese for zh-CN and Hans locales", () => {
    expect(resolveDesktopMenuLabels("zh-CN")).toMatchObject({
      file: "文件",
      edit: "编辑",
      view: "查看",
      window: "窗口",
      help: "帮助",
      documentation: "文档",
      reportIssue: "报告问题",
      exportDiagnostics: "导出诊断信息…",
    });
    expect(resolveDesktopMenuLabels("zh-Hans-CN").showDevelopMenu).toBe("显示开发菜单");
    expect(resolveDesktopMenuLabels("zh_CN").contactUs).toBe("联系我们");
  });

  it("uses Traditional Chinese for Hant, Taiwan, Hong Kong, and Macao", () => {
    for (const locale of ["zh-Hant", "zh-TW", "zh-HK", "zh-MO"]) {
      expect(resolveDesktopMenuLabels(locale)).toMatchObject({
        file: "檔案",
        edit: "編輯",
        help: "說明",
        reportIssue: "回報問題",
        exportDiagnostics: "匯出診斷資訊…",
      });
    }
  });

  it("lets an explicit script subtag win over a conflicting region", () => {
    expect(resolveDesktopMenuLabels("zh-Hans-TW").file).toBe("文件");
    expect(resolveDesktopMenuLabels("zh-Hant-CN").file).toBe("檔案");
  });

  it("keeps the existing English menu for unsupported or empty locales", () => {
    expect(resolveDesktopMenuLabels("en-US").file).toBe("File");
    expect(resolveDesktopMenuLabels("fr-FR").help).toBe("Help");
    expect(resolveDesktopMenuLabels("").documentation).toBe("Documentation");
  });
});
