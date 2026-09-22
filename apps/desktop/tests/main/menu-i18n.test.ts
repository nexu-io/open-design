import { describe, expect, it } from "vitest";

import { resolveDesktopMenuLabels, type DesktopMenuLabels } from "../../src/main/menu-i18n.js";

const ENGLISH_MENU_LABELS: DesktopMenuLabels = {
  contactUs: "Contact Us",
  develop: "Develop",
  documentation: "Documentation",
  edit: "Edit",
  exportDiagnostics: "Export Diagnostics…",
  file: "File",
  help: "Help",
  hideDevelopMenu: "Hide Develop Menu",
  joinDiscord: "Join Discord",
  reportIssue: "Report Issue",
  showDevelopMenu: "Show Develop Menu",
  view: "View",
  window: "Window",
};

const SIMPLIFIED_CHINESE_MENU_LABELS: DesktopMenuLabels = {
  contactUs: "联系我们",
  develop: "开发",
  documentation: "文档",
  edit: "编辑",
  exportDiagnostics: "导出诊断信息…",
  file: "文件",
  help: "帮助",
  hideDevelopMenu: "隐藏开发菜单",
  joinDiscord: "加入 Discord",
  reportIssue: "报告问题",
  showDevelopMenu: "显示开发菜单",
  view: "查看",
  window: "窗口",
};

const TRADITIONAL_CHINESE_MENU_LABELS: DesktopMenuLabels = {
  contactUs: "聯絡我們",
  develop: "開發",
  documentation: "文件",
  edit: "編輯",
  exportDiagnostics: "匯出診斷資訊…",
  file: "檔案",
  help: "說明",
  hideDevelopMenu: "隱藏開發選單",
  joinDiscord: "加入 Discord",
  reportIssue: "回報問題",
  showDevelopMenu: "顯示開發選單",
  view: "檢視",
  window: "視窗",
};

describe("desktop native menu i18n", () => {
  it("uses the complete Simplified Chinese label set for zh-CN and Hans locales", () => {
    for (const locale of ["zh-CN", "zh-Hans-CN", "zh_CN"]) {
      expect(resolveDesktopMenuLabels(locale)).toEqual(SIMPLIFIED_CHINESE_MENU_LABELS);
    }
  });

  it("uses the complete Traditional Chinese label set for Hant, Taiwan, Hong Kong, and Macao", () => {
    for (const locale of ["zh-Hant", "zh-TW", "zh-HK", "zh-MO"]) {
      expect(resolveDesktopMenuLabels(locale)).toEqual(TRADITIONAL_CHINESE_MENU_LABELS);
    }
  });

  it("lets an explicit script subtag win over a conflicting region", () => {
    expect(resolveDesktopMenuLabels("zh-Hans-TW")).toEqual(SIMPLIFIED_CHINESE_MENU_LABELS);
    expect(resolveDesktopMenuLabels("zh-Hant-CN")).toEqual(TRADITIONAL_CHINESE_MENU_LABELS);
  });

  it("keeps the complete existing English label set for unsupported or empty locales", () => {
    for (const locale of ["en-US", "fr-FR", ""]) {
      expect(resolveDesktopMenuLabels(locale)).toEqual(ENGLISH_MENU_LABELS);
    }
  });
});
