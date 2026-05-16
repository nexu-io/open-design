import { execFile } from "node:child_process";
import { appendFile, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import type { ToolPackConfig } from "../config.js";
import { pathExists } from "./fs.js";
import { resolveWinUninstallLocalDataRoot } from "./paths.js";
import type { WinPaths } from "./types.js";

const execFileAsync = promisify(execFile);

function escapeNsisString(value: string): string {
  return value.replace(/"/g, '$\\"').replace(/\r?\n/g, "$\\r$\\n");
}

export async function writeNsisInclude(config: ToolPackConfig, paths: WinPaths): Promise<void> {
  const localDataRoot = escapeNsisString(resolveWinUninstallLocalDataRoot(config));
  await mkdir(dirname(paths.nsisIncludePath), { recursive: true });
  await writeFile(
    paths.nsisIncludePath,
    `!include LogicLib.nsh
!include nsDialogs.nsh

Var /GLOBAL odRemoveLocalData
Var /GLOBAL odRemoveLocalDataCheckbox
Var /GLOBAL odLocalDataRoot

LangString OD_REMOVE_LOCAL_DATA_TITLE 1033 "Remove local data"
LangString OD_REMOVE_LOCAL_DATA_TITLE 2052 "删除本地数据"
LangString OD_REMOVE_LOCAL_DATA_TITLE 1028 "刪除本機資料"
LangString OD_REMOVE_LOCAL_DATA_TITLE 1046 "Remover dados locais"
LangString OD_REMOVE_LOCAL_DATA_TITLE 1049 "Удалить локальные данные"
LangString OD_REMOVE_LOCAL_DATA_TITLE 1065 "حذف داده‌های محلی"

LangString OD_REMOVE_LOCAL_DATA_HINT 1033 "Choose whether the uninstaller should remove Open Design data stored on this computer."
LangString OD_REMOVE_LOCAL_DATA_HINT 2052 "请选择卸载程序是否删除此电脑上保存的 Open Design 数据。"
LangString OD_REMOVE_LOCAL_DATA_HINT 1028 "請選擇解除安裝程式是否刪除此電腦上儲存的 Open Design 資料。"
LangString OD_REMOVE_LOCAL_DATA_HINT 1046 "Escolha se o desinstalador deve remover os dados do Open Design armazenados neste computador."
LangString OD_REMOVE_LOCAL_DATA_HINT 1049 "Выберите, должен ли деинсталлятор удалить данные Open Design, сохраненные на этом компьютере."
LangString OD_REMOVE_LOCAL_DATA_HINT 1065 "انتخاب کنید که حذف‌کننده داده‌های Open Design ذخیره‌شده در این رایانه را حذف کند یا نه."

LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 1033 "Remove local Open Design data:"
LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 2052 "删除本地 Open Design 数据："
LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 1028 "刪除本機 Open Design 資料："
LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 1046 "Remover dados locais do Open Design:"
LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 1049 "Удалить локальные данные Open Design:"
LangString OD_REMOVE_LOCAL_DATA_CHECKBOX 1065 "حذف داده‌های محلی Open Design:"

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.OpenDesignLocalDataPage un.OpenDesignLocalDataPageLeave
!macroend

Function un.OpenDesignLocalDataPage
  StrCpy $odRemoveLocalData "1"
  StrCpy $odLocalDataRoot "${localDataRoot}"
  nsDialogs::Create 1018
  Pop $0
  \${If} $0 == error
    Abort
  \${EndIf}

  \${NSD_CreateLabel} 0 0 100% 24u "$(OD_REMOVE_LOCAL_DATA_HINT)"
  Pop $0
  \${NSD_CreateCheckbox} 0 34u 100% 36u "$(OD_REMOVE_LOCAL_DATA_CHECKBOX) $odLocalDataRoot"
  Pop $odRemoveLocalDataCheckbox
  \${NSD_Check} $odRemoveLocalDataCheckbox
  nsDialogs::Show
FunctionEnd

Function un.OpenDesignLocalDataPageLeave
  \${NSD_GetState} $odRemoveLocalDataCheckbox $0
  \${If} $0 == \${BST_CHECKED}
    StrCpy $odRemoveLocalData "1"
  \${Else}
    StrCpy $odRemoveLocalData "0"
  \${EndIf}
FunctionEnd

!macro customUnInstall
  \${If} $odLocalDataRoot == ""
    StrCpy $odLocalDataRoot "${localDataRoot}"
  \${EndIf}
  \${If} $odRemoveLocalData != "0"
    DetailPrint "Removing local Open Design data: $odLocalDataRoot"
    RMDir /r "$odLocalDataRoot"
  \${EndIf}
!macroend
`,
    "utf8",
  );
}


async function listChildDirectories(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name));
  } catch {
    return [];
  }
}

async function findNsisLanguageDirectories(root: string, depth = 4): Promise<string[]> {
  const languageDir = join(root, "Contrib", "Language files");
  if (await pathExists(join(languageDir, "Farsi.nlf"))) return [languageDir];
  if (depth <= 0) return [];
  const children = await listChildDirectories(root);
  const nested = await Promise.all(children.map((child) => findNsisLanguageDirectories(child, depth - 1)));
  return nested.flat();
}

export async function ensureNsisPersianLanguageAlias(config: ToolPackConfig): Promise<boolean> {
  const cacheRoots = [
    process.env.ELECTRON_BUILDER_CACHE,
    process.env.LOCALAPPDATA == null ? undefined : join(process.env.LOCALAPPDATA, "electron-builder", "Cache"),
    process.env.APPDATA == null ? undefined : join(process.env.APPDATA, "electron-builder", "Cache"),
    join(config.workspaceRoot, "node_modules", ".cache", "electron-builder"),
    process.env["ProgramFiles(x86)"] == null ? undefined : join(process.env["ProgramFiles(x86)"], "NSIS"),
    process.env.ProgramFiles == null ? undefined : join(process.env.ProgramFiles, "NSIS"),
    "C:\\Program Files (x86)\\NSIS",
    "C:\\Program Files\\NSIS",
  ].filter((entry): entry is string => entry != null && entry.length > 0);
  let updated = false;
  for (const cacheRoot of cacheRoots) {
    for (const languageDir of await findNsisLanguageDirectories(cacheRoot)) {
      let updatedLanguageDir = false;
      const farsiNlf = join(languageDir, "Farsi.nlf");
      const farsiNsh = join(languageDir, "Farsi.nsh");
      const persianNlf = join(languageDir, "Persian.nlf");
      const persianNsh = join(languageDir, "Persian.nsh");
      if ((await pathExists(farsiNlf)) && !(await pathExists(persianNlf))) {
        await cp(farsiNlf, persianNlf);
        updatedLanguageDir = true;
        updated = true;
      }
      if (await pathExists(farsiNsh)) {
        const farsiMessages = await readFile(farsiNsh, "utf8");
        const persianMessages = farsiMessages.replace('LANGFILE "Farsi"', 'LANGFILE "Persian"');
        const existingPersianMessages = await readFile(persianNsh, "utf8").catch(() => null);
        if (existingPersianMessages !== persianMessages) {
          await writeFile(persianNsh, persianMessages, "utf8");
          updatedLanguageDir = true;
          updated = true;
        }
      }
      if (updatedLanguageDir) {
        process.stderr.write(`[tools-pack] added NSIS Persian language alias in ${languageDir}\n`);
      }
    }
  }
  return updated;
}

export async function appendNsisLog(paths: WinPaths, message: string, meta: Record<string, unknown> = {}): Promise<void> {
  await mkdir(dirname(paths.nsisLogPath), { recursive: true });
  await appendFile(paths.nsisLogPath, `${JSON.stringify({ message, meta, timestamp: new Date().toISOString() })}\n`, "utf8");
}

export async function runTimed<T>(timingPath: string, action: string, task: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await task();
    await mkdir(dirname(timingPath), { recursive: true });
    await writeFile(timingPath, `${JSON.stringify({ action, durationMs: Date.now() - startedAt, status: "success" }, null, 2)}\n`, "utf8");
    return result;
  } catch (error) {
    await mkdir(dirname(timingPath), { recursive: true });
    await writeFile(
      timingPath,
      `${JSON.stringify({ action, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error), status: "failed" }, null, 2)}\n`,
      "utf8",
    );
    throw error;
  }
}

export async function invokeNsis(paths: WinPaths, command: string, args: string[], action: "install" | "uninstall"): Promise<void> {
  await appendNsisLog(paths, `${action} started`, { args, command });
  try {
    const directoryArg = args.at(-1);
    if (process.platform === "win32" && directoryArg?.startsWith("/D=")) {
      await execFileAsync(command, args, { cwd: dirname(command), windowsHide: true, windowsVerbatimArguments: true });
    } else {
      await execFileAsync(command, args, { cwd: dirname(command), windowsHide: true });
    }
    await appendNsisLog(paths, `${action} finished`, { code: 0, command });
  } catch (error) {
    const failure = error as { code?: unknown; stderr?: unknown; stdout?: unknown };
    await appendNsisLog(paths, `${action} failed`, {
      code: failure.code,
      command,
      stderr: typeof failure.stderr === "string" ? failure.stderr : undefined,
      stdout: typeof failure.stdout === "string" ? failure.stdout : undefined,
    });
    throw error;
  }
}
