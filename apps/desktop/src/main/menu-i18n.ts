export type DesktopMenuLabels = {
  contactUs: string;
  develop: string;
  documentation: string;
  edit: string;
  exportDiagnostics: string;
  file: string;
  help: string;
  hideDevelopMenu: string;
  joinDiscord: string;
  reportIssue: string;
  showDevelopMenu: string;
  view: string;
  window: string;
};

const ENGLISH_MENU_LABELS: DesktopMenuLabels = Object.freeze({
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
});

const SIMPLIFIED_CHINESE_MENU_LABELS: DesktopMenuLabels = Object.freeze({
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
});

const TRADITIONAL_CHINESE_MENU_LABELS: DesktopMenuLabels = Object.freeze({
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
});

function usesTraditionalChinese(tag: string): boolean {
  const subtags = tag.toLowerCase().replaceAll("_", "-").split("-");
  if (subtags.includes("hant")) return true;
  if (subtags.includes("hans")) return false;
  return subtags.some((subtag) => ["tw", "hk", "mo"].includes(subtag));
}

/**
 * Resolve labels for the Electron-owned application menu from the same BCP-47
 * OS locale that bootstraps the desktop renderer. Chinese variants get native
 * Simplified/Traditional labels; every other locale keeps the existing English
 * menu until it has an explicit native-menu translation.
 */
export function resolveDesktopMenuLabels(locale: string): DesktopMenuLabels {
  const normalized = locale.trim();
  if (!normalized) return ENGLISH_MENU_LABELS;
  const language = normalized.toLowerCase().replaceAll("_", "-").split("-")[0];
  if (language !== "zh") return ENGLISH_MENU_LABELS;
  return usesTraditionalChinese(normalized)
    ? TRADITIONAL_CHINESE_MENU_LABELS
    : SIMPLIFIED_CHINESE_MENU_LABELS;
}
