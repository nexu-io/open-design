import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportWorkspaceOutputs, importWorkspaceOutputs } from "@/workspace/products.js";

vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, renameSync: vi.fn(fs.renameSync) };
});

const roots: string[] = [];
const files = ["cli.js", "cli.d.ts", "sidecar/index.js"];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "workspace-product-"));
  roots.push(root);
  for (const file of files) {
    const path = join(root, "apps/daemon/dist", file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "export {};\n");
  }
  const output = { schemaVersion: 2, kind: "javascript", unit: "daemon" as const, outputPaths: ["apps/daemon/dist"] };
  return { root, output, scratch: join(root, "scratch") };
}

function source(root: string, archive: string, unit: "daemon" | "web" = "daemon") {
  const zip = join(root, "source.zip");
  execFileSync("python3", ["-c", "import zipfile,sys; z=zipfile.ZipFile(sys.argv[2],'w'); z.write(sys.argv[1],'workspace.tar.gz'); z.close()", archive, zip]);
  const bytes = readFileSync(zip);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { headers: { "content-length": String(bytes.length) } })));
  return { unit, url: "https://cache.example/source.zip", sha256: createHash("sha256").update(bytes).digest("hex") };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(renameSync).mockReset();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workspace product boundary", () => {
  it("recovers repeated transient connection failures within the bounded retry window", async () => {
    const f = fixture();
    const archive = exportWorkspaceOutputs(f.root, join(f.root, "export"), [f.output], ["daemon"]);
    const descriptor = source(f.root, archive);
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("fetch failed", { cause: Object.assign(new Error("reset"), { code: "ECONNRESET" }) }))
      .mockRejectedValueOnce(new TypeError("fetch failed", { cause: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) }));
    expect(await importWorkspaceOutputs(f.root, f.scratch, descriptor)).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([404, 403, 503])("bounds HTTP %s recovery without changing existing outputs", async (status) => {
    const f = fixture();
    const archive = exportWorkspaceOutputs(f.root, join(f.root, "export"), [f.output], ["daemon"]);
    const descriptor = source(f.root, archive);
    vi.mocked(fetch).mockImplementation(async () => new Response("unavailable", { status }));
    await expect(importWorkspaceOutputs(f.root, f.scratch, descriptor)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(status === 503 ? 4 : 1);
    expect(readFileSync(join(f.root, "apps/daemon/dist/cli.js"), "utf8")).toBe("export {};\n");
  });

  it.each(["ECONNRESET", "CERT_HAS_EXPIRED", "unknown"])("bounds %s failures without a rebuild fallback", async (code) => {
    const f = fixture();
    const archive = exportWorkspaceOutputs(f.root, join(f.root, "export"), [f.output], ["daemon"]);
    const descriptor = source(f.root, archive);
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed", { cause: { code } }));
    const attempts = code === "ECONNRESET" ? 4 : 1;
    await expect(importWorkspaceOutputs(f.root, f.scratch, descriptor)).rejects.toThrow(
      `workspace product request failed after ${attempts} request(s): ${code}`,
    );
    expect(fetch).toHaveBeenCalledTimes(attempts);
    expect(readFileSync(join(f.root, "apps/daemon/dist/cli.js"), "utf8")).toBe("export {};\n");
  });

  it("exports portable JavaScript and imports a clean complete declaration closure", async () => {
    const f = fixture();
    const archive = exportWorkspaceOutputs(f.root, join(f.root, "export"), [f.output], ["daemon"]);
    const descriptor = source(f.root, archive);
    rmSync(join(f.root, "apps/daemon/dist"), { recursive: true });
    expect(await importWorkspaceOutputs(f.root, f.scratch, descriptor)).toBeGreaterThan(0);
    for (const file of files) expect(readFileSync(join(f.root, "apps/daemon/dist", file), "utf8")).toBe("export {};\n");
  });

  it.skipIf(process.platform === "win32")("preserves a linked dependency closure that starts only after independent restoration", async () => {
    const f = fixture();
    const moduleRoot = join(f.root, "apps/daemon/dist/node_modules/.store/runtime");
    mkdirSync(moduleRoot, { recursive: true });
    writeFileSync(join(moduleRoot, "index.js"), "module.exports = 'started';\n");
    symlinkSync(".store/runtime", join(f.root, "apps/daemon/dist/node_modules/runtime"), "dir");
    writeFileSync(join(f.root, "apps/daemon/dist/cli.js"), "console.log(require('runtime'));\n");
    const archive = exportWorkspaceOutputs(f.root, join(f.root, "export"), [f.output], ["daemon"]);
    const descriptor = source(f.root, archive);
    const restored = join(f.root, "restored");
    mkdirSync(restored);
    await importWorkspaceOutputs(restored, f.scratch, descriptor);
    expect(execFileSync(process.execPath, [join(restored, "apps/daemon/dist/cli.js")], { encoding: "utf8" })).toBe("started\n");
  });

  it("exports and directly starts a restored Web closure with an absolute Next directory link", async () => {
    const f = fixture();
    const standalone = join(f.root, "apps/web/.next/standalone");
    const externalNext = join(f.root, "workspace-store/next");
    mkdirSync(externalNext, { recursive: true });
    writeFileSync(join(externalNext, "index.js"), "module.exports = 'portable-next';\n");
    mkdirSync(join(standalone, "apps/web/node_modules"), { recursive: true });
    mkdirSync(join(f.root, "apps/web/.next/static"), { recursive: true });
    mkdirSync(join(f.root, "apps/web/dist/sidecar"), { recursive: true });
    writeFileSync(join(f.root, "apps/web/dist/sidecar/index.js"), "export {};\n");
    writeFileSync(join(f.root, "apps/web/dist/sidecar/index.d.ts"), "export {};\n");
    symlinkSync(externalNext, join(standalone, "apps/web/node_modules/next"), process.platform === "win32" ? "junction" : "dir");
    writeFileSync(join(standalone, "apps/web/server.js"), "console.log(require('next'));\n");
    const output = {
      schemaVersion: 1,
      unit: "web" as const,
      platform: process.platform,
      arch: process.arch,
      webOutputMode: "standalone",
      outputPaths: ["apps/web/dist", "apps/web/.next/standalone", "apps/web/.next/static"],
    };
    const archive = exportWorkspaceOutputs(f.root, join(f.root, "export"), [output], ["web"]);
    const descriptor = source(f.root, archive, "web");
    const restored = join(f.root, "restored");
    mkdirSync(restored);
    await importWorkspaceOutputs(restored, f.scratch, descriptor);
    expect(execFileSync(process.execPath, [join(restored, "apps/web/.next/standalone/apps/web/server.js")], { encoding: "utf8" }))
      .toBe("portable-next\n");
  });

  it.skipIf(process.platform === "win32")("rejects non-portable links before changing existing outputs", async () => {
    const f = fixture();
    const archive = exportWorkspaceOutputs(f.root, join(f.root, "export"), [f.output], ["daemon"]);
    const outside = join(f.root, "outside");
    writeFileSync(outside, "outside\n");
    execFileSync("python3", ["-c", [
      "import os,sys,tarfile",
      "source,temp,target=sys.argv[1:]",
      "with tarfile.open(source,'r:gz') as old, tarfile.open(temp,'w:gz') as new:",
      " for member in old:",
      "  stream=old.extractfile(member) if member.isfile() else None; new.addfile(member,stream)",
      " link=tarfile.TarInfo('apps/daemon/dist/escape')",
      " link.type=tarfile.SYMTYPE; link.linkname=target; new.addfile(link)",
      "os.replace(temp,source)",
    ].join("\n"), archive, `${archive}.new`, outside]);
    const descriptor = source(f.root, archive);
    writeFileSync(join(f.root, "apps/daemon/dist/cli.js"), "previous\n");
    await expect(importWorkspaceOutputs(f.root, f.scratch, descriptor)).rejects.toThrow("non-portable link");
    expect(readFileSync(join(f.root, "apps/daemon/dist/cli.js"), "utf8")).toBe("previous\n");
  });

  it("rejects normalized duplicate archive paths without changing existing outputs", async () => {
    const f = fixture();
    const archive = exportWorkspaceOutputs(f.root, join(f.root, "export"), [f.output], ["daemon"]);
    execFileSync("python3", ["-c", [
      "import os,sys,tarfile",
      "source,temp,path=sys.argv[1:]",
      "with tarfile.open(source,'r:gz') as old, tarfile.open(temp,'w:gz') as new:",
      " for member in old:",
      "  stream=old.extractfile(member) if member.isfile() else None; new.addfile(member,stream)",
      " new.add(path,arcname='apps/daemon/dist/./cli.js')",
      "os.replace(temp,source)",
    ].join("\n"), archive, `${archive}.new`, join(f.root, "apps/daemon/dist/cli.js")]);
    const descriptor = source(f.root, archive);
    writeFileSync(join(f.root, "apps/daemon/dist/cli.js"), "previous\n");
    await expect(importWorkspaceOutputs(f.root, f.scratch, descriptor)).rejects.toThrow("duplicate paths");
    expect(readFileSync(join(f.root, "apps/daemon/dist/cli.js"), "utf8")).toBe("previous\n");
  });

  it("rejects a checksum mismatch without replacing existing outputs or building", async () => {
    const f = fixture();
    const archive = exportWorkspaceOutputs(f.root, join(f.root, "export"), [f.output], ["daemon"]);
    const descriptor = source(f.root, archive);
    await expect(importWorkspaceOutputs(f.root, f.scratch, { ...descriptor, sha256: "0".repeat(64) })).rejects.toThrow();
    expect(readFileSync(join(f.root, "apps/daemon/dist/cli.js"), "utf8")).toBe("export {};\n");
  });

  it("refuses incomplete declarations before replacing the previous output", async () => {
    const f = fixture();
    rmSync(join(f.root, "apps/daemon/dist/cli.d.ts"));
    const archive = exportWorkspaceOutputs(f.root, join(f.root, "export"), [f.output], ["daemon"]);
    const descriptor = source(f.root, archive);
    writeFileSync(join(f.root, "apps/daemon/dist/cli.d.ts"), "previous");
    await expect(importWorkspaceOutputs(f.root, f.scratch, descriptor)).rejects.toThrow("output is missing");
    expect(readFileSync(join(f.root, "apps/daemon/dist/cli.d.ts"), "utf8")).toBe("previous");
  });

  it("rolls back a failed leaf replacement", async () => {
    const f = fixture();
    const archive = exportWorkspaceOutputs(f.root, join(f.root, "export"), [f.output], ["daemon"]);
    const descriptor = source(f.root, archive);
    writeFileSync(join(f.root, "apps/daemon/dist/previous.js"), "previous");
    const real = (await vi.importActual<typeof import("node:fs")>("node:fs")).renameSync;
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (String(from).replaceAll("\\", "/").includes("/tree/")) throw new Error("replacement refused");
      return real(from, to);
    });
    await expect(importWorkspaceOutputs(f.root, f.scratch, descriptor)).rejects.toThrow("replacement refused");
    expect(existsSync(join(f.root, "apps/daemon/dist/previous.js"))).toBe(true);
  });

  it("does not let a platform Web tree masquerade as portable JavaScript", () => {
    const f = fixture();
    expect(() => exportWorkspaceOutputs(f.root, join(f.root, "export"), [{ ...f.output, unit: "web" }], ["web"]))
      .toThrow("incompatible source output set");
    expect(() => exportWorkspaceOutputs(f.root, join(f.root, "export"), [{ ...f.output, outputPaths: ["packages"] }], ["daemon"]))
      .toThrow("unsafe source output path");
  });
});
