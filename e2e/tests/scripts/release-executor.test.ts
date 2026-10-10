import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const script = join(root, ".github/scripts/release/executor.py");
const probe = String.raw`
import importlib.util, io, json, sys, tarfile, tempfile, zipfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("executor", sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
mode = sys.argv[2]
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    product = root / "product.zip"
    output = root / "output"
    platform, arch = m.host_identity()
    manifest = {"arch": arch, "entries": {"pack": "pack/dist/index.mjs", "release": "release/dist/index.mjs"}, "platform": platform, "protocol": m.PROTOCOL, "schemaVersion": 1}
    if mode == "host": manifest["arch"] = "wrong-arch"
    entries = {
        "manifest.json": json.dumps(manifest).encode(),
        "pack/dist/index.mjs": b"export {};",
        "release/dist/index.mjs": b"export {};",
        "pack/node_modules/pnpm/bin/pnpm.cjs": b"export {};",
        "pack/node_modules/esbuild/bin/esbuild": b"export {};",
    }
    if mode == "missing": del entries["pack/node_modules/pnpm/bin/pnpm.cjs"]
    archive = root / "workspace.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        for name, payload in entries.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(payload)
            tar.addfile(entry, io.BytesIO(payload))
        if mode == "traversal":
            entry = tarfile.TarInfo("../escaped")
            entry.size = 1
            tar.addfile(entry, io.BytesIO(b"x"))
        if mode == "duplicate":
            entry = tarfile.TarInfo("manifest.json")
            entry.size = 2
            tar.addfile(entry, io.BytesIO(b"{}"))
        if mode == "link":
            entry = tarfile.TarInfo("pack/link")
            entry.type = tarfile.SYMTYPE
            entry.linkname = "../../escaped"
            tar.addfile(entry)
    with zipfile.ZipFile(product, "w") as wrapper:
        wrapper.write(archive, "workspace.tar.gz")
        if mode == "wrapper": wrapper.writestr("extra.json", "{}")
    try:
        result = m.extract_executor(product, output)
        print(json.dumps({"ok": True, "manifest": result, "output": output.exists()}))
    except ValueError as error:
        print(json.dumps({"ok": False, "error": str(error), "output": output.exists(), "escaped": (root / "escaped").exists()}))
`;
function run(mode: string) {
  return JSON.parse(execFileSync("python3", ["-c", probe, script, mode], { encoding: "utf8" }));
}
describe("stdlib release executor restoration", () => {
  it("restores a complete host-specific product without preparing the JS workspace", () => {
    expect(run("valid")).toMatchObject({ ok: true, output: true });
  });
  it.each([
    ["host", "host contract"], ["missing", "required entry"], ["traversal", "unsafe executor archive entry"],
    ["duplicate", "duplicate executor archive entry"], ["link", "link escapes"], ["wrapper", "only workspace.tar.gz"],
  ])("rejects %s before publishing an executor root", (mode, error) => {
    expect(run(mode)).toMatchObject({ ok: false, output: false, escaped: false, error: expect.stringContaining(error) });
  });
});
