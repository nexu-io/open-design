import { cp, mkdir, readdir, realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

async function copyTree(source: string, destination: string): Promise<void> {
  const path = await realpath(source).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (path == null) return;
  const details = await stat(path);
  if (details.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(path)) await copyTree(join(path, entry), join(destination, entry));
  } else if (details.isFile()) {
    await mkdir(dirname(destination), { recursive: true });
    await cp(path, destination);
  }
}

/** Materialize Next's traced pnpm dependency view beside its application.
 * The virtual store is a source for symlink resolution, not a second runtime
 * dependency tree. Unknown root layouts fail rather than silently losing files. */
export async function copyClosureWebStandalone(source: string, destination: string): Promise<void> {
  const children = await readdir(source);
  const dependencies = join(source, "node_modules");
  if (children.includes("node_modules")) {
    const layout = await readdir(dependencies);
    if (layout.some(name => name !== ".pnpm")) throw new Error("unsupported Next standalone root dependency layout");
    await stat(join(dependencies, ".pnpm", "node_modules"));
  }
  await mkdir(destination, { recursive: true });
  for (const child of children.filter(name => name !== "node_modules")) await copyTree(join(source, child), join(destination, child));
  if (children.includes("node_modules")) await copyTree(join(dependencies, ".pnpm", "node_modules"), join(destination, "apps", "web", "node_modules"));
}
