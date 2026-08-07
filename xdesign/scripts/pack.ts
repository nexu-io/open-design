/**
 * xDesign brand-injecting pack wrapper.
 *
 * Loads the fork brand config from xdesign/brand/brand.json, exposes it to
 * `tools-pack` through the OD_PRODUCT_NAME / OD_APP_ID / OD_MAC_ICON env vars
 * (the brand overlay seam in tools/pack/src/brand.ts), and forwards every CLI
 * argument verbatim. Upstream `tools-pack` behavior is untouched when these env
 * vars are absent, so this wrapper is the single place the fork opts in to its
 * own identity.
 *
 * Run it from the repo root, e.g.:
 *   node --experimental-strip-types xdesign/scripts/pack.ts mac build --to dmg
 *   node --experimental-strip-types xdesign/scripts/pack.ts mac build --to dmg --namespace xdesign-local
 *
 * Everything after the script path is forwarded to `pnpm tools-pack`.
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

interface BrandConfig {
  productName: string;
  appId?: string;
}

const brandPath = join(repoRoot, "xdesign", "brand", "brand.json");
const brand = JSON.parse(readFileSync(brandPath, "utf8")) as BrandConfig;

if (!brand.productName || typeof brand.productName !== "string") {
  throw new Error(`xdesign/brand/brand.json must define a string productName: ${brandPath}`);
}

const env: NodeJS.ProcessEnv = {
  ...process.env,
  OD_PRODUCT_NAME: brand.productName,
  OD_MAC_ICON: join(repoRoot, "xdesign", "brand", "icon.icns"),
};
if (brand.appId) {
  env.OD_APP_ID = brand.appId;
}

const args = process.argv.slice(2);
const child = spawn("pnpm", ["tools-pack", ...args], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
