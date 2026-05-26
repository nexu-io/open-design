// Block any package manager other than pnpm.
//
// Wired into the root `preinstall` hook. Reads `npm_config_user_agent`
// (set by every modern package manager — npm, yarn, pnpm, bun) and
// exits non-zero with a clear pointer to pnpm if anything else is
// invoking install.
//
// We avoid the `only-allow` package on purpose: this is small enough
// to ship inline, costs zero install time, and works the moment the
// hook fires (no npx download race for npm/yarn/bun first runs).

const ua = process.env.npm_config_user_agent ?? "";
const detectedPm = ua.split(" ")[0]?.split("/")[0] ?? "";

if (detectedPm === "pnpm") {
  process.exit(0);
}

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

console.error("");
console.error(`${RED}✘ open-design requires pnpm.${RESET}`);
console.error("");
console.error(`  Detected:   ${YELLOW}${detectedPm || "unknown"}${RESET}`);
console.error(`  Required:   ${GREEN}pnpm${RESET} (pinned in package.json → packageManager + engines)`);
console.error("");
console.error("  Use:");
console.error(`    ${GREEN}pnpm install${RESET}`);
console.error("");
console.error("  If pnpm isn't installed:");
console.error(`    ${GREEN}corepack enable${RESET}            ${DIM}# bundled with Node 16.10+, picks the version from packageManager${RESET}`);
console.error(`    ${DIM}# or https://pnpm.io/installation${RESET}`);
console.error("");
console.error(`  ${DIM}(See scripts/enforce-pnpm.mjs to relax this if needed.)${RESET}`);
console.error("");
process.exit(1);
