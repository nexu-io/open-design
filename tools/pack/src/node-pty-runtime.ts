import { chmod, stat } from "node:fs/promises";
import { join } from "node:path";

export type NodePtyRuntimePlatform = "darwin" | "win32";
export type NodePtyRuntimeArch = "arm64" | "x64";

export interface NodePtyRuntimeOptions {
  appRoot: string;
  arch: NodePtyRuntimeArch;
  platform: NodePtyRuntimePlatform;
}

export function resolveNodePtyRuntimeArch(arch: NodeJS.Architecture): NodePtyRuntimeArch {
  if (arch === "arm64" || arch === "x64") return arch;
  throw new Error(`node-pty packaged runtime does not support architecture ${arch}`);
}

interface RequiredNodePtyRuntimeFile {
  label: string;
  relativePath: string;
  executable?: boolean;
}

// node-pty 1.1.0 publishes these platform prebuilds as its runtime closure.
// Keep them intact instead of adding node-pty to Electron's ABI rebuild list.
const REQUIRED_NODE_PTY_RUNTIME_FILES = {
  "darwin-arm64": [
    { label: "pty.node", relativePath: "pty.node" },
    { executable: true, label: "spawn-helper", relativePath: "spawn-helper" },
  ],
  "darwin-x64": [
    { label: "pty.node", relativePath: "pty.node" },
    { executable: true, label: "spawn-helper", relativePath: "spawn-helper" },
  ],
  "win32-x64": [
    { label: "conpty.node", relativePath: "conpty.node" },
    { label: "conpty_console_list.node", relativePath: "conpty_console_list.node" },
    { label: "pty.node", relativePath: "pty.node" },
    { label: "winpty-agent.exe", relativePath: "winpty-agent.exe" },
    { label: "winpty.dll", relativePath: "winpty.dll" },
  ],
} as const satisfies Partial<
  Record<`${NodePtyRuntimePlatform}-${NodePtyRuntimeArch}`, readonly RequiredNodePtyRuntimeFile[]>
>;

function runtimeKey(options: NodePtyRuntimeOptions): keyof typeof REQUIRED_NODE_PTY_RUNTIME_FILES | null {
  const key = `${options.platform}-${options.arch}`;
  return key in REQUIRED_NODE_PTY_RUNTIME_FILES
    ? key as keyof typeof REQUIRED_NODE_PTY_RUNTIME_FILES
    : null;
}

function prebuildRoot(options: NodePtyRuntimeOptions): string {
  return join(
    options.appRoot,
    "node_modules",
    "node-pty",
    "prebuilds",
    `${options.platform}-${options.arch}`,
  );
}

function formatStatError(label: string, path: string, error: unknown): string {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    return `node-pty ${label} is missing: ${path}`;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return `node-pty ${label} could not be inspected: ${path}: ${detail}`;
}

export async function validateNodePtyRuntime(
  options: NodePtyRuntimeOptions,
): Promise<string | null> {
  const key = runtimeKey(options);
  if (key == null) {
    return `node-pty packaged runtime does not support ${options.platform}-${options.arch}`;
  }

  const root = prebuildRoot(options);
  for (const file of REQUIRED_NODE_PTY_RUNTIME_FILES[key]) {
    const path = join(root, file.relativePath);
    try {
      const metadata = await stat(path);
      if (!metadata.isFile()) return `node-pty ${file.label} is not a file: ${path}`;
      if (metadata.size === 0) return `node-pty ${file.label} is empty: ${path}`;
      if ("executable" in file && file.executable === true && (metadata.mode & 0o111) === 0) {
        return `node-pty ${file.label} is not executable: ${path}`;
      }
    } catch (error) {
      return formatStatError(file.label, path, error);
    }
  }
  return null;
}

export async function assertNodePtyRuntime(
  options: NodePtyRuntimeOptions,
): Promise<void> {
  const validationError = await validateNodePtyRuntime(options);
  if (validationError != null) throw new Error(validationError);
}

export async function prepareNodePtyRuntime(
  options: NodePtyRuntimeOptions,
): Promise<void> {
  if (options.platform === "darwin") {
    const helperPath = join(prebuildRoot(options), "spawn-helper");
    try {
      const metadata = await stat(helperPath);
      if (metadata.isFile() && metadata.size > 0 && (metadata.mode & 0o111) === 0) {
        await chmod(helperPath, metadata.mode | 0o111);
      }
    } catch {
      // The shared validator below produces the stable, path-specific error.
    }
  }
  await assertNodePtyRuntime(options);
}
