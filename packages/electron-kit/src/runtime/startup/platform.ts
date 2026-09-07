import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, relative } from "node:path";
import { promisify } from "node:util";
import type { NodeRuntimeBinding } from "@open-design/standalone";
import { currentOfficialNodeTarget } from "./carrier/lock.js";

const execute = promisify(execFile);
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Read-only physical preflight. Never acquire, repair, or consume upgrade state. */
export async function bindElectronPlatform(root: string): Promise<NodeRuntimeBinding> {
  try {
    if (!isAbsolute(root)) throw new Error("physical platform root must be absolute");
    const target = currentOfficialNodeTarget();
    const platformRoot = await realpath(root);
    const local = async (name: string) => {
      const path = await realpath(join(platformRoot, name));
      const suffix = relative(platformRoot, path);
      if (isAbsolute(suffix) || suffix === ".." || suffix.startsWith("../") || suffix.startsWith("..\\")) throw new Error("physical platform path escaped its root");
      return path;
    };
    const manifest = JSON.parse((await readFile(await local("platform.json"))).toString("utf8")) as {
      schemaVersion?: unknown;
      node?: { schemaVersion?: unknown; target?: unknown; version?: unknown; abi?: unknown; executable?: { path?: unknown } };
      packageSha256?: unknown; lockSha256?: unknown;
      verification?: { path?: unknown; sha256?: unknown };
    };
    const executable = target === "win32-x64" ? "node.exe" : "bin/node";
    if (manifest.schemaVersion !== 1 || manifest.node?.schemaVersion !== 1 || manifest.node.target !== target
      || typeof manifest.node.version !== "string" || !/^\d+\.\d+\.\d+$/u.test(manifest.node.version)
      || typeof manifest.node.abi !== "string" || !/^\d+$/u.test(manifest.node.abi)
      || manifest.node.executable?.path !== executable || manifest.verification?.path !== "platform-check.cjs") throw new Error("physical platform manifest is invalid");
    for (const [name, expected] of [["package.json", manifest.packageSha256], ["package-lock.json", manifest.lockSha256], ["platform-check.cjs", manifest.verification.sha256]] as const) {
      if (typeof expected !== "string" || !/^[a-f0-9]{64}$/u.test(expected) || digest(await readFile(await local(name))) !== expected) throw new Error(`physical platform file verification failed: ${name}`);
    }
    const command = await local(executable);
    const env = Object.freeze({ NODE_PATH: await local("node_modules"), NODE_OPTIONS: "", ELECTRON_RUN_AS_NODE: "",
      PATH: `${dirname(command)}${delimiter}${process.env.PATH ?? ""}` });
    const options = { cwd: platformRoot, env: { ...process.env, ...env }, timeout: 15_000, maxBuffer: 1024 * 1024 };
    // Signing may change executable bytes. The signed installation owns integrity;
    // the pre-sign digest is provenance, not a post-sign executable checksum.
    const { stdout } = await execute(command, ["-e", "process.stdout.write(JSON.stringify({version:process.versions.node,abi:process.versions.modules,target:process.platform+'-'+process.arch,electron:process.versions.electron??null}))"], options);
    const actual = JSON.parse(stdout) as { version?: unknown; abi?: unknown; target?: unknown; electron?: unknown };
    if (actual.version !== manifest.node.version || actual.abi !== manifest.node.abi || actual.target !== target || actual.electron !== null) throw new Error("physical Node identity or ABI differs");
    await execute(command, [await local("platform-check.cjs")], options);
    return Object.freeze({ command, env });
  } catch (cause) {
    throw new Error("physical Electron platform is unavailable; install the latest physical Shell", { cause });
  }
}
