import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderMacPackagedMainEntry } from "@/mac/prebundle.js";
import { renderWinPackagedMainEntry } from "@/win/prebundle.js";

describe.each([
  ["mac", renderMacPackagedMainEntry], ["win", renderWinPackagedMainEntry],
] as const)("%s entry import failure recovery", (_platform, render) => {
  it.each(["desktop", "headless", "node", "healthy"])("handles %s without application dependencies", async (mode) => {
    const root = await mkdtemp(join(tmpdir(), "od-entry-recovery-"));
    try {
      await mkdir(join(root, "node_modules/electron"), {recursive:true});
      await mkdir(join(root, "node_modules/.ignored"), {recursive:true});
      const record = join(root, "dialog.json");
      await writeFile(join(root, "node_modules/electron/index.js"),
        `exports.dialog={showErrorBox:(...args)=>require('node:fs').writeFileSync(${JSON.stringify(record)},JSON.stringify(args))};`);
      if (mode === "healthy") {
        await mkdir(join(root, "prebundled"));
        await writeFile(join(root, "prebundled/packaged-main.mjs"), "export const ready = true;");
      }
      await writeFile(join(root, "main.cjs"),
        `Object.defineProperty(process.versions,'electron',{value:'41.0.0'});\n${render(true)}`);
      const result = await new Promise<{code: string | number; stderr:string}>((resolve) => {
        execFile(process.execPath, [join(root, "main.cjs"), ...(mode === "headless" ? ["--headless"] : [])],
          {timeout:5000, env:{...process.env, ELECTRON_RUN_AS_NODE:mode === "node" ? "1" : ""}},
          (error, _stdout, stderr) => resolve({code:error?.code ?? 0, stderr}));
      });
      expect(result.code).toBe(mode === "healthy" ? 0 : 1);
      if (mode !== "healthy") {
        expect(result.stderr).toContain("ERR_MODULE_NOT_FOUND");
        expect(result.stderr).toContain("reinstall");
        expect(result.stderr).toContain("same release channel");
        expect(result.stderr).toContain("node_modules/.ignored");
      } else expect(result.stderr).toBe("");
      if (mode === "desktop") expect(await readFile(record, "utf8")).toContain("reinstall");
      else await expect(readFile(record)).rejects.toThrow();
    } finally { await rm(root, {recursive:true, force:true}); }
  });
});
