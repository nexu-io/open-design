import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const consumerPath = path.join(repoRoot, "nix/package-web.nix");
const sharedHashPath = path.join(repoRoot, "nix/pnpm-deps.nix");

const consumerHashLine = "      hash = pnpmDepsHash;";
const fakeHashLine = "      hash = lib.fakeHash;";
const nixCommand = ["build", ".#web", "--print-build-logs"];
const maxNixOutputBufferBytes = 32 * 1024 * 1024;

function extractExpectedHash(output: string): string | null {
  const matches = [...output.matchAll(/got:\s*(sha256-[A-Za-z0-9+/=]+)/g)];
  return matches.at(-1)?.[1] ?? null;
}

async function main(): Promise<void> {
  const originalConsumer = await readFile(consumerPath, "utf8");
  if (!originalConsumer.includes(consumerHashLine)) {
    throw new Error(
      `Expected to find \`${consumerHashLine.trim()}\` in ${path.relative(repoRoot, consumerPath)}`,
    );
  }

  const fakeHashConsumer = originalConsumer.replace(consumerHashLine, fakeHashLine);

  await writeFile(consumerPath, fakeHashConsumer, "utf8");

  try {
    const result = spawnSync("nix", nixCommand, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: maxNixOutputBufferBytes,
      stdio: ["inherit", "pipe", "pipe"],
    });

    if (result.error) {
      throw new Error(`Failed to execute nix: ${result.error.message}`);
    }

    if (result.status === 0) {
      throw new Error(
        "nix build unexpectedly succeeded after replacing the fixed-output hash with lib.fakeHash.",
      );
    }

    const combinedOutput = `${result.stdout}${result.stderr}`;
    const nextHash = extractExpectedHash(combinedOutput);
    if (!nextHash) {
      throw new Error(
        "nix build failed without reporting a fixed-output hash mismatch (`got: sha256-...`). " +
          `Refusing to update ${path.relative(repoRoot, sharedHashPath)}.\n\n${combinedOutput}`,
      );
    }

    const originalSharedHash = await readFile(sharedHashPath, "utf8");
    const updatedSharedHash = originalSharedHash.replace(
      /hash = "sha256-[A-Za-z0-9+/=]+";/,
      `hash = "${nextHash}";`,
    );

    if (updatedSharedHash === originalSharedHash) {
      process.stdout.write(
        `${path.relative(repoRoot, sharedHashPath)} already pins ${nextHash}; no update needed.\n`,
      );
      return;
    }

    await writeFile(sharedHashPath, updatedSharedHash, "utf8");
    process.stdout.write(
      `Updated ${path.relative(repoRoot, sharedHashPath)} to ${nextHash}.\n` +
        `Re-run \`nix flake check --print-build-logs --keep-going\` to confirm.\n`,
    );
  } finally {
    await writeFile(consumerPath, originalConsumer, "utf8");
  }
}

await main();
