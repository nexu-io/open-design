import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const sharedHashPath = path.join(repoRoot, "nix/pnpm-deps.nix");

const consumerHashLine = "      hash = pnpmDepsHash;";
const fakeHashLine = "      hash = lib.fakeHash;";
const maxNixOutputBufferBytes = 32 * 1024 * 1024;

const consumers = [
  {
    hashKey: "daemonHash",
    consumerPath: path.join(repoRoot, "nix/package-daemon.nix"),
    nixCommand: ["build", ".#daemon", "--print-build-logs"],
  },
  {
    hashKey: "webHash",
    consumerPath: path.join(repoRoot, "nix/package-web.nix"),
    nixCommand: ["build", ".#web", "--print-build-logs"],
  },
] as const;

function extractExpectedHash(output: string): string | null {
  const matches = [...output.matchAll(/got:\s*(sha256-[A-Za-z0-9+/=]+)/g)];
  return matches.at(-1)?.[1] ?? null;
}

async function main(): Promise<void> {
  const updates: string[] = [];

  for (const consumer of consumers) {
    const originalConsumer = await readFile(consumer.consumerPath, "utf8");
    if (!originalConsumer.includes(consumerHashLine)) {
      throw new Error(
        `Expected to find \`${consumerHashLine.trim()}\` in ${path.relative(repoRoot, consumer.consumerPath)}`,
      );
    }

    const fakeHashConsumer = originalConsumer.replace(consumerHashLine, fakeHashLine);

    await writeFile(consumer.consumerPath, fakeHashConsumer, "utf8");

    try {
      const result = spawnSync("nix", consumer.nixCommand, {
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
          `nix ${consumer.nixCommand.join(" ")} unexpectedly succeeded after replacing the fixed-output hash with lib.fakeHash.`,
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
      const hashPattern = new RegExp(`${consumer.hashKey} = \"sha256-[A-Za-z0-9+/=]+\";`);
      if (!hashPattern.test(originalSharedHash)) {
        throw new Error(
          `Expected to find \`${consumer.hashKey} = \"sha256-...\";\` in ${path.relative(repoRoot, sharedHashPath)}`,
        );
      }

      const updatedSharedHash = originalSharedHash.replace(
        hashPattern,
        `${consumer.hashKey} = "${nextHash}";`,
      );

      if (updatedSharedHash === originalSharedHash) {
        updates.push(`${consumer.hashKey} already pins ${nextHash}`);
        continue;
      }

      await writeFile(sharedHashPath, updatedSharedHash, "utf8");
      updates.push(`${consumer.hashKey} -> ${nextHash}`);
    } finally {
      await writeFile(consumer.consumerPath, originalConsumer, "utf8");
    }
  }

  process.stdout.write(
    `Updated ${path.relative(repoRoot, sharedHashPath)} (${updates.join(", ")}).\n` +
      `Re-run \`nix flake check --print-build-logs --keep-going\` to confirm.\n`,
  );
}

await main();
