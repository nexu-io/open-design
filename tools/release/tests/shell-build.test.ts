import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  shellBuildIndexObjectKey,
  shellBuildVersionPrefix,
  shellSmokeProofObjectKey,
  registerShellBuild,
  registerShellSmokeProof,
  resolveShellBuild,
  validateShellBuildPlan,
  validateShellBuildRecord,
  validateShellSmokeProofRecord,
} from "../src/storage/shell-build.js";

const sourceDigest = `sha256:${"a".repeat(64)}` as const;
const acceptanceDigest = `sha256:${"e".repeat(64)}` as const;
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

const plan = {
  artifacts: { app: "/tmp/Open Design Beta.app", dmg: "/tmp/open-design.dmg", payload: "/tmp/payload.zip", zip: null },
  outputRoot: "/tmp/out",
  profileDigest: `sha256:${"d".repeat(64)}` as const,
  releaseVersion: "0.19.0-beta.2",
  runtimeNamespaceRoot: "/tmp/runtime",
  schemaVersion: 1 as const,
  shell: { sourceDigest, type: "electron", version: "0.19.0-beta.2" },
  target: "darwin-arm64" as const,
  to: "dmg",
};

describe("immutable Shell build storage", () => {
  it("keeps source lookup and physical version paths separate", () => {
    expect(shellBuildIndexObjectKey("beta", "electron", sourceDigest, "darwin-arm64")).toBe(
      `beta/shells/electron/builds/${"a".repeat(64)}/artifacts/darwin-arm64.json`,
    );
    expect(shellBuildVersionPrefix("beta", "electron", "0.19.0-beta.2", "darwin-arm64")).toBe(
      "beta/shells/electron/versions/0.19.0-beta.2/darwin-arm64",
    );
    expect(shellSmokeProofObjectKey(
      "beta",
      "electron",
      sourceDigest,
      "darwin-arm64",
      "mac-shell-v3",
      acceptanceDigest,
      1,
    )).toBe(
      `beta/shells/electron/builds/${"a".repeat(64)}/acceptance/darwin-arm64/mac-shell-v3/standalone-v1/${"e".repeat(64)}.json`,
    );
  });

  it("accepts a canonical older Shell version for identical source bytes", () => {
    const validatedPlan = validateShellBuildPlan(plan, "beta");
    const record = validateShellBuildRecord({
      artifacts: {
        dmg: {
          contentType: "application/x-apple-diskimage",
          digest: `sha256:${"b".repeat(64)}`,
          name: "Open Design.dmg",
          objectKey: "beta/shells/electron/versions/0.19.0-beta.1/darwin-arm64/Open Design.dmg",
          size: 42,
          url: "https://releases.example/beta/shells/electron/versions/0.19.0-beta.1/darwin-arm64/Open Design.dmg",
        },
      },
      channel: "beta",
      createdAt: "2026-08-09T00:00:00.000Z",
      provenance: {},
      profileDigest: plan.profileDigest,
      schemaVersion: 1,
      shell: { ...plan.shell, version: "0.19.0-beta.1" },
      target: "darwin-arm64",
    }, validatedPlan, "beta");
    expect(record.shell.version).toBe("0.19.0-beta.1");
    expect(record.artifacts.dmg.url).toContain("Open%20Design.dmg");
  });

  it("fails closed for a mismatched target or source identity", () => {
    expect(() => validateShellBuildRecord({
      artifacts: {},
      channel: "beta",
      createdAt: "2026-08-09T00:00:00.000Z",
      provenance: {},
      profileDigest: plan.profileDigest,
      schemaVersion: 1,
      shell: { ...plan.shell, sourceDigest: `sha256:${"c".repeat(64)}` },
      target: "darwin-arm64",
    }, plan, "beta")).toThrow(/identity/);
  });

  it("binds the Windows Shell proof to lifecycle, update, rollback, and migration", () => {
    const windowsPlan = { ...plan, target: "win32-x64" as const };
    const proof = validateShellSmokeProofRecord({
      acceptanceDigest,
      channel: "beta",
      createdAt: "2026-08-10T00:00:00.000Z",
      matrix: "win-shell-v1",
      profileDigest: windowsPlan.profileDigest,
      provenance: {},
      releaseVersion: "0.19.0-beta.2",
      scenarios: [
        "win-shell-lifecycle",
        "win-shell-silent-update",
        "win-shell-rollback",
        "win-legacy-migration",
      ],
      schemaVersion: 2,
      shell: windowsPlan.shell,
      standaloneProtocolVersion: 1,
      target: "win32-x64",
    }, windowsPlan, "beta", "win-shell-v1", acceptanceDigest, 1);

    expect(proof.scenarios).toEqual([
      "win-shell-lifecycle",
      "win-shell-silent-update",
      "win-shell-rollback",
      "win-legacy-migration",
    ]);
  });

  it("registers once and materializes the same verified bytes for a later release", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-shell-build-storage-"));
    temporaryRoots.push(root);
    const objects = new Map<string, Buffer>();
    const server = createServer(async (request, response) => {
      const key = (request.url ?? "").replace(/^\/bucket\//, "");
      if (request.method === "GET") {
        const body = objects.get(key);
        if (body == null) {
          response.statusCode = 404;
          response.end();
        } else {
          response.statusCode = 200;
          response.setHeader("etag", `\"${createHash("md5").update(body).digest("hex")}\"`);
          response.end(body);
        }
        return;
      }
      if (request.method === "PUT") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        if (request.headers["if-none-match"] === "*" && objects.has(key)) {
          response.statusCode = 412;
          response.end();
          return;
        }
        objects.set(key, Buffer.concat(chunks));
        response.statusCode = 200;
        response.end();
        return;
      }
      response.statusCode = 405;
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (address == null || typeof address === "string") throw new Error("test server did not bind");
      const inputRoot = join(root, "input");
      const outputRoot = join(root, "output");
      await mkdir(inputRoot, { recursive: true });
      const dmgPath = join(inputRoot, "Open Design-release-beta.dmg");
      const payloadPath = join(inputRoot, "Open Design-release-beta-payload.zip");
      await writeFile(dmgPath, "signed-notarized-dmg");
      await writeFile(payloadPath, "signed-launcher-payload");
      const describe = async (path: string) => {
        const bytes = await readFile(path);
        return { digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, path, size: bytes.byteLength };
      };
      const planPath = join(root, "plan.json");
      const buildPath = join(root, "build.json");
      const smokeSummaryPath = join(root, "smoke-summary.json");
      const registeredPlan = {
        ...plan,
        artifacts: { ...plan.artifacts, dmg: dmgPath, payload: payloadPath },
      };
      await writeFile(planPath, `${JSON.stringify(registeredPlan)}\n`);
      await writeFile(buildPath, `${JSON.stringify({
        artifacts: { dmg: await describe(dmgPath), payload: await describe(payloadPath), zip: null },
        releaseVersion: plan.releaseVersion,
        shell: plan.shell,
      })}\n`);
      const previous = { ...process.env };
      Object.assign(process.env, {
        RELEASE_CHANNEL: "beta",
        RELEASE_PUBLIC_ORIGIN: "https://releases.example",
        RELEASE_SHELL_BUILD_JSON_PATH: buildPath,
        RELEASE_SHELL_SMOKE_ACCEPTANCE_DIGEST: acceptanceDigest,
        RELEASE_SHELL_SMOKE_MATRIX: "mac-shell-v3",
        RELEASE_SHELL_SMOKE_SUMMARY_PATH: smokeSummaryPath,
        RELEASE_SHELL_PLAN_JSON_PATH: planPath,
        RELEASE_STANDALONE_PROTOCOL_VERSION: "1",
        RELEASE_STORAGE_ACCESS_KEY_ID: "test",
        RELEASE_STORAGE_BUCKET: "bucket",
        RELEASE_STORAGE_ENDPOINT: `http://127.0.0.1:${address.port}`,
        RELEASE_STORAGE_REGION: "auto",
        RELEASE_STORAGE_SECRET_ACCESS_KEY: "test",
      });
      try {
        await registerShellBuild();
        const registered = JSON.parse(await readFile(buildPath, "utf8"));
        expect(registered.resolution.state).toBe("registered");
        expect(registered.resolution.artifacts.dmg.url).toBe(
          "https://releases.example/beta/shells/electron/versions/0.19.0-beta.2/darwin-arm64/Open%20Design-release-beta.dmg",
        );
        const reusedDmgPath = join(outputRoot, "Open Design-release-beta.dmg");
        const reusedPayloadPath = join(outputRoot, "Open Design-release-beta-payload.zip");
        await writeFile(planPath, `${JSON.stringify({
          ...plan,
          artifacts: { ...plan.artifacts, dmg: reusedDmgPath, payload: reusedPayloadPath },
          releaseVersion: "0.19.0-beta.3",
          shell: { ...plan.shell, version: "0.19.0-beta.3" },
        })}\n`);
        await resolveShellBuild();
        const reused = JSON.parse(await readFile(buildPath, "utf8"));
        expect(reused.resolution.state).toBe("reused");
        expect(reused.releaseVersion).toBe("0.19.0-beta.3");
        expect(reused.shell.version).toBe("0.19.0-beta.2");
        expect(reused.resolution.artifacts).toEqual(registered.resolution.artifacts);
        expect(reused.timings).toHaveLength(1);
        expect(reused.timings[0].phase).toBe("remote-shell-materialize");
        expect(reused.timings[0].durationMs).toBeGreaterThan(0);
        expect(reused.resolution.smokeProof).toEqual({
          acceptanceDigest,
          matrix: "mac-shell-v3",
          standaloneProtocolVersion: 1,
          state: "miss",
          url: null,
        });
        expect(await readFile(reusedDmgPath, "utf8")).toBe("signed-notarized-dmg");
        expect(await readFile(reusedPayloadPath, "utf8")).toBe("signed-launcher-payload");

        await writeFile(smokeSummaryPath, `${JSON.stringify({
          plan: { profile: "full", selectedLanes: ["shell", "standalone", "migration"] },
          schemaVersion: 1,
          timings: [
            { lane: "shell", status: "success", step: "mac-shell-lifecycle" },
            { lane: "shell", status: "success", step: "mac-shell-silent-update" },
            { lane: "shell", status: "success", step: "mac-shell-rollback" },
          ],
        })}\n`);
        await expect(registerShellSmokeProof()).rejects.toThrow(/mac-legacy-migration/);

        await writeFile(smokeSummaryPath, `${JSON.stringify({
          plan: { profile: "full", selectedLanes: ["shell", "standalone", "migration"] },
          schemaVersion: 1,
          timings: [
            { lane: "shell", status: "success", step: "mac-shell-lifecycle" },
            { lane: "shell", status: "success", step: "mac-shell-silent-update" },
            { lane: "shell", status: "success", step: "mac-shell-rollback" },
            { lane: "migration", status: "success", step: "mac-legacy-migration" },
          ],
        })}\n`);
        await registerShellSmokeProof();
        await resolveShellBuild();
        const proven = JSON.parse(await readFile(buildPath, "utf8"));
        expect(proven.resolution.smokeProof).toEqual({
          acceptanceDigest,
          matrix: "mac-shell-v3",
          standaloneProtocolVersion: 1,
          state: "hit",
          url: `https://releases.example/beta/shells/electron/builds/${"a".repeat(64)}/acceptance/darwin-arm64/mac-shell-v3/standalone-v1/${"e".repeat(64)}.json`,
        });
        const proofKey = shellSmokeProofObjectKey(
          "beta",
          "electron",
          sourceDigest,
          "darwin-arm64",
          "mac-shell-v3",
          acceptanceDigest,
          1,
        );
        expect(validateShellSmokeProofRecord(
          JSON.parse(objects.get(proofKey)!.toString("utf8")),
          plan,
          "beta",
          "mac-shell-v3",
          acceptanceDigest,
          1,
        ).scenarios).toEqual([
          "mac-shell-lifecycle",
          "mac-shell-silent-update",
          "mac-shell-rollback",
          "mac-legacy-migration",
        ]);

        process.env.RELEASE_SHELL_SMOKE_ACCEPTANCE_DIGEST = `sha256:${"f".repeat(64)}`;
        await resolveShellBuild();
        expect(JSON.parse(await readFile(buildPath, "utf8")).resolution.smokeProof.state).toBe("miss");

        process.env.RELEASE_SHELL_SMOKE_ACCEPTANCE_DIGEST = acceptanceDigest;
        process.env.RELEASE_STANDALONE_PROTOCOL_VERSION = "2";
        await resolveShellBuild();
        expect(JSON.parse(await readFile(buildPath, "utf8")).resolution.smokeProof.state).toBe("miss");
      } finally {
        for (const key of Object.keys(process.env)) {
          if (!(key in previous)) delete process.env[key];
        }
        Object.assign(process.env, previous);
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error == null ? resolve() : reject(error)));
    }
  });
});
