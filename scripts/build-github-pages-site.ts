import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface BuildGitHubPagesSiteOptions {
  outDir?: string;
  repoRoot?: string;
}

export interface BuildGitHubPagesSiteResult {
  copiedRoots: string[];
  outDir: string;
}

const STATIC_ROOTS = ["catalog", "design-templates", "design-systems", "skills"] as const;

async function copyRoot(repoRoot: string, outDir: string, root: string): Promise<boolean> {
  try {
    await cp(path.join(repoRoot, root), path.join(outDir, root), {
      force: true,
      recursive: true,
      verbatimSymlinks: true,
    });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function buildGitHubPagesSite(options: BuildGitHubPagesSiteOptions = {}): Promise<BuildGitHubPagesSiteResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const outDir = options.outDir ?? path.join(repoRoot, ".tmp", "github-pages-site");
  const overview = await readFile(path.join(repoRoot, "overview.html"), "utf8");

  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "overview.html"), overview);
  await writeFile(path.join(outDir, "index.html"), overview);
  await writeFile(path.join(outDir, ".nojekyll"), "");

  const copiedRoots: string[] = [];
  for (const root of STATIC_ROOTS) {
    if (await copyRoot(repoRoot, outDir, root)) copiedRoots.push(root);
  }

  return { copiedRoots, outDir };
}

async function main(): Promise<void> {
  const outIndex = process.argv.indexOf("--out-dir");
  const outDir = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
  const result = await buildGitHubPagesSite(outDir === undefined ? {} : { outDir });
  console.log(`Wrote GitHub Pages site to ${result.outDir}`);
  console.log(`Copied roots: ${result.copiedRoots.join(", ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
