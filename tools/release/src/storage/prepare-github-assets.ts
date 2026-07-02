import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { optional, required, writeJson } from "./common.ts";
import { releaseChannelDescriptor } from "@open-design/release";

const releaseChannel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
const releaseVersion = required("RELEASE_VERSION");
const sourceDir = required("RELEASE_GITHUB_ASSETS_SOURCE_DIR");
const outputDir = required("RELEASE_GITHUB_ASSETS_DIR");
const outputsPath = optional("RELEASE_OUTPUTS_PATH", join(dirname(outputDir), "github-assets-outputs.json"));
const summaryPath = optional("RELEASE_SUMMARY_PATH", join(dirname(outputDir), "github-assets-summary.md"));
const enableLinux = optional("ENABLE_LINUX_X64") === "true";

if (releaseChannel !== "stable") {
  throw new Error(`prepare-github-assets only supports stable releases; got ${releaseChannel}`);
}

function isInside(parent: string, child: string): boolean {
  const relativePath = relative(resolve(parent), resolve(child));
  return relativePath.length > 0 && !relativePath.startsWith("..") && !relativePath.startsWith("/") && !relativePath.includes(":");
}

if (isInside(outputDir, outputsPath) || isInside(outputDir, summaryPath)) {
  throw new Error("GitHub asset plan metadata must not be written inside RELEASE_GITHUB_ASSETS_DIR");
}

function listFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  files.sort();
  return files;
}

function findRequiredAsset(files: string[], name: string): string {
  const matches = files.filter((file) => basename(file) === name);
  if (matches.length === 0) throw new Error(`missing GitHub release asset: ${name}`);
  if (matches.length > 1) throw new Error(`duplicate GitHub release asset: ${name}`);
  return matches[0] ?? "";
}

const allowedNames = [
  `open-design-${releaseVersion}-mac-arm64.dmg`,
  `open-design-${releaseVersion}-mac-arm64.dmg.sha256`,
  `open-design-${releaseVersion}-mac-x64.dmg`,
  `open-design-${releaseVersion}-mac-x64.dmg.sha256`,
  `open-design-${releaseVersion}-win-x64-setup.exe`,
  `open-design-${releaseVersion}-win-x64-setup.exe.sha256`,
  ...(enableLinux
    ? [
        `open-design-${releaseVersion}-linux-x64.AppImage`,
        `open-design-${releaseVersion}-linux-x64.AppImage.sha256`,
      ]
    : []),
];

const sourceFiles = listFiles(sourceDir);
rmSync(outputDir, { force: true, recursive: true });
mkdirSync(outputDir, { recursive: true });

const plannedAssets: string[] = [];
for (const name of allowedNames) {
  const source = findRequiredAsset(sourceFiles, name);
  const destination = join(outputDir, name);
  copyFileSync(source, destination);
  plannedAssets.push(name);
}

const outputFiles = listFiles(outputDir).map((file) => basename(file)).sort();
const unexpected = outputFiles.filter((name) => !allowedNames.includes(name));
if (unexpected.length > 0) {
  throw new Error(`unexpected GitHub release asset(s): ${unexpected.join(", ")}`);
}

const missing = allowedNames.filter((name) => !outputFiles.includes(name));
if (missing.length > 0) {
  throw new Error(`missing GitHub release asset(s): ${missing.join(", ")}`);
}

mkdirSync(dirname(outputsPath), { recursive: true });
writeJson(outputsPath, {
  assetCount: plannedAssets.length,
  assets: plannedAssets,
  directory: outputDir,
});
writeFileSync(
  summaryPath,
  [
    "## Stable GitHub Release assets",
    "",
    `- version: \`${releaseVersion}\``,
    `- asset count: \`${plannedAssets.length}\``,
    "",
    ...plannedAssets.map((name) => `- \`${name}\``),
  ].join("\n") + "\n",
  "utf8",
);

for (const file of listFiles(outputDir)) {
  if (statSync(file).size <= 0) throw new Error(`GitHub release asset is empty: ${file}`);
}

console.log(`prepared ${plannedAssets.length} stable GitHub Release asset(s) in ${outputDir}`);
