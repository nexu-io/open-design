import { execFile } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))));

async function runPython(script: string, request: string, receipt: string, env: NodeJS.ProcessEnv = {}) {
  try {
    const result = await execFileAsync("python3", [script, "--request", request, "--receipt", receipt], {
      cwd: resolve(import.meta.dirname, "../../.."),
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    return { status: 0, ...result };
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    return { status: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

const runRelease = (request: string, receipt: string) => runPython(".github/scripts/release.py", request, receipt);

async function describeFile(file: string) {
  const body = await readFile(file);
  return { file, sha256: createHash("sha256").update(body).digest("hex"), size: body.byteLength };
}

describe("exact phased release control", () => {
  it("binds installed acceptance to the manifest while treating the fossil probe as liveness", async () => {
    const root = await mkdtemp(join(tmpdir(), "terminal-installed-acceptance-"));
    roots.push(root);
    const installedRoot = join(root, "installed-shell");
    await mkdir(installedRoot);
    const shell = { type: "terminal", version: "0.1.0", buildHash: "b".repeat(64) };
    const artifact = { url: "https://releases.invalid/terminal.tar.gz", sha256: "a".repeat(64), size: 1 };
    const shellMetadata = { url: "https://releases.invalid/terminal.json", sha256: "c".repeat(64), size: 1 };
    await mkdir(join(root, "published"));
    await writeFile(join(root, "published/publish-receipt.json"), JSON.stringify({ channel: "somechan", releaseVersion: "0.1.0-somechan.1", sourceCommit: "d".repeat(40) }));
    await writeFile(join(root, "required-acceptance.json"), JSON.stringify({ shell, target: "darwin-arm64", artifact, shellMetadata }));
    await writeFile(join(root, "installed-proof.json"), JSON.stringify({ outcome: "ready", operation: "probe", shell: { type: "terminal", version: "0.1.0", digest: "e".repeat(64) }, result: {} }));
    const manifest = JSON.stringify({ schemaVersion: 1, shell, target: "darwin-arm64" });
    await writeFile(join(installedRoot, "install-manifest.json"), manifest);
    await writeFile(join(installedRoot, "install-manifest.sha256"), `${createHash("sha256").update(manifest).digest("hex")}  install-manifest.json\n`);
    const generation = { state: "running", generationId: "generation-1", bindingDigest: "binding-1", sidecar: { generationPid: 123, status: "ready" } };
    await writeFile(join(root, "runtime-start.json"), JSON.stringify({ outcome: "ready", result: { ...generation, references: 1, attachmentCapability: "capability" } }));
    await writeFile(join(root, "runtime-status.json"), JSON.stringify({ outcome: "ready", result: generation }));
    await writeFile(join(root, "runtime-stop.json"), JSON.stringify({ outcome: "ready", result: { state: "stopped", sidecar: { remainingPids: [] } } }));

    const result = await execFileAsync("python3", [
      ".github/scripts/release/installed_acceptance.py", "--root", root, "--installed-root", installedRoot,
      "--shell-type", "terminal", "--target", "darwin-arm64",
    ], { cwd: resolve(import.meta.dirname, "../../.."), encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(JSON.parse(await readFile(join(root, "acceptance/terminal-darwin-arm64.json"), "utf8"))).toMatchObject({
      installed: { shell, target: "darwin-arm64", proof: { outcome: "ready", operation: "probe" } },
    });

    await writeFile(join(installedRoot, "install-manifest.sha256"), `${"0".repeat(64)}  install-manifest.json\n`);
    await expect(execFileAsync("python3", [
      ".github/scripts/release/installed_acceptance.py", "--root", root, "--installed-root", installedRoot,
      "--shell-type", "terminal", "--target", "darwin-arm64",
    ], { cwd: resolve(import.meta.dirname, "../../.."), encoding: "utf8" })).rejects.toMatchObject({ stderr: expect.stringContaining("manifest digest mismatch") });
  });

  it("replays deterministic prepare documents and rejects incomplete Shell contributions", async () => {
    const root = await mkdtemp(join(tmpdir(), "terminal-pack-control-"));
    roots.push(root);
    const scene = join(root, "scene");
    await mkdir(scene);
    const closure = join(root, "closure.mjs");
    const standalone = join(root, "standalone.mjs");
    await writeFile(closure, "export const closure = true;\n");
    await writeFile(standalone, "export const standalone = true;\n");
    const closureDigest = (await describeFile(closure)).sha256;
    const standaloneDigest = (await describeFile(standalone)).sha256;
    const shellBuildHash = "c".repeat(64);
    await writeFile(join(scene, "scene.json"), JSON.stringify({
      schemaVersion: 1,
      target: "darwin-arm64",
      shellVersion: "0.1.0",
      shellBuildHash,
      closure: { sha256: closureDigest },
      standalone: { sha256: standaloneDigest },
    }));
    const sceneDigest = (await describeFile(join(scene, "scene.json"))).sha256;
    const keys = generateKeyPairSync("ed25519");
    const signingEnv = {
      OD_EXACT_SIGNING_KEY_ID: "terminal-test",
      OD_EXACT_ED25519_PRIVATE_KEY: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    };
    const writePrepareRequest = async (path: string, outputDirectory: string) => writeFile(path, JSON.stringify({
      schemaVersion: 1,
      operation: "exact.prepare",
      channel: "somechan",
      releaseVersion: "0.1.0-somechan.1",
      sourceCommit: "a".repeat(40),
      publishedAt: "2026-09-02T00:00:00Z",
      standaloneVersion: "0.1.0",
      artifactBaseUrl: "https://releases.example.invalid/somechan/0.1.0-somechan.1",
      closureArtifactFile: closure,
      standaloneArtifactFile: standalone,
      shells: [{ type: "terminal", version: "0.1.0", scenes: [{ target: "darwin-arm64", sceneDirectory: scene, sceneManifestSha256: sceneDigest }] }],
      outputDirectory,
    }));
    const prepareA = join(root, "prepare-a");
    const prepareB = join(root, "prepare-b");
    const requestA = join(root, "prepare-a.json");
    const requestB = join(root, "prepare-b.json");
    await writePrepareRequest(requestA, prepareA);
    await writePrepareRequest(requestB, prepareB);
    await expect(runPython(".github/scripts/pack.py", requestA, join(prepareA, "receipt.json"), signingEnv)).resolves.toMatchObject({ status: 0, stderr: "" });
    await expect(runPython(".github/scripts/pack.py", requestB, join(prepareB, "receipt.json"), signingEnv)).resolves.toMatchObject({ status: 0, stderr: "" });
    expect(await readFile(join(prepareA, "documents/content-metadata.json"))).toEqual(await readFile(join(prepareB, "documents/content-metadata.json")));

    const contribution = join(root, "contribution.json");
    const archive = join(root, "terminal-darwin-arm64.tar.gz");
    await writeFile(archive, "terminal archive");
    await writeFile(contribution, JSON.stringify({
      schemaVersion: 1,
      operation: "shell.distribution.contribute",
      shell: { type: "terminal", version: "0.1.0", buildHash: shellBuildHash },
      target: "darwin-arm64",
      artifact: { ...await describeFile(archive), mediaType: "application/gzip" },
      updater: { protocol: "standalone-shell-updater-v3", handler: "sidecar-v1", interaction: "restart-and-install" },
    }));
    const finalizeRequest = join(root, "finalize.json");
    await writeFile(finalizeRequest, JSON.stringify({
      schemaVersion: 1,
      operation: "exact.finalize",
      prepareReceipt: join(prepareA, "receipt.json"),
      contributions: [],
      outputDirectory: join(root, "final"),
    }));
    const rejected = await runPython(".github/scripts/pack.py", finalizeRequest, join(root, "rejected.json"), signingEnv);
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("requires Shell contributions");
    await writeFile(finalizeRequest, JSON.stringify({
      schemaVersion: 1,
      operation: "exact.finalize",
      prepareReceipt: join(prepareA, "receipt.json"),
      contributions: [{ receipt: contribution }],
      outputDirectory: join(root, "final"),
    }));
    const finalReceipt = join(root, "final/receipt.json");
    await expect(runPython(".github/scripts/pack.py", finalizeRequest, finalReceipt, signingEnv)).resolves.toMatchObject({ status: 0, stderr: "" });
    expect(JSON.parse(await readFile(finalReceipt, "utf8"))).toMatchObject({
      schemaVersion: 2,
      operation: "exact.pack",
      requiredAcceptances: [{ shell: { type: "terminal", version: "0.1.0", buildHash: shellBuildHash }, target: "darwin-arm64" }],
    });
  });

  it("publishes immutable objects idempotently and activates only an exact accepted topology", async () => {
    const root = await mkdtemp(join(tmpdir(), "terminal-release-control-"));
    roots.push(root);
    const objects = new Map<string, Buffer>();
    const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
      const path = request.url ?? "/";
      if (request.method === "GET") {
        const body = objects.get(path);
        response.statusCode = body == null ? 404 : 200;
        if (body != null) response.setHeader("ETag", `"${createHash("sha256").update(body).digest("hex")}"`);
        response.end(body);
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const current = objects.get(path);
      if (request.headers["if-none-match"] === "*" && current != null) {
        response.statusCode = 412;
      } else if (request.headers["if-match"] != null && current == null) {
        response.statusCode = 412;
      } else {
        objects.set(path, body);
        response.statusCode = 200;
        response.setHeader("ETag", `"${createHash("sha256").update(body).digest("hex")}"`);
      }
      response.end();
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    try {
      const address = server.address();
      if (address == null || typeof address === "string") throw new Error("fixture server did not bind a port");
      const output = join(root, "objects");
      await mkdir(output);
      const archive = join(output, "terminal-darwin-arm64.tar.gz");
      const content = join(output, "content-metadata.json");
      const terminal = join(output, "terminal-metadata.json");
      const head = join(output, "channel-head.json");
      await writeFile(archive, "native-shell");
      await writeFile(content, "{\"metadata\":{}}\n");
      await writeFile(terminal, "{\"document\":{}}\n");
      await writeFile(head, JSON.stringify({ head: {
        schemaVersion: 1,
        channel: "somechan",
        publishedAt: "2026-09-02T00:00:00Z",
        lanes: {
          content: { releaseVersion: "0.1.0-somechan.1" },
          terminal: { releaseVersion: "0.1.0-somechan.1" },
        },
      } }));
      const [artifact, contentDocument, terminalDocument, headDocument] = await Promise.all([
        describeFile(archive), describeFile(content), describeFile(terminal), describeFile(head),
      ]);
      const shell = { type: "terminal", version: "0.1.0", buildHash: "b".repeat(64) };
      const pack = join(root, "pack.json");
      await writeFile(pack, JSON.stringify({
        schemaVersion: 2,
        operation: "exact.pack",
        channel: "somechan",
        releaseVersion: "0.1.0-somechan.1",
        sourceCommit: "a".repeat(40),
        artifacts: [artifact],
        documents: [contentDocument, terminalDocument, headDocument],
        channelHeadFile: head,
        requiredAcceptances: [{
          shell,
          target: "darwin-arm64",
          artifact: { url: "https://unpublished.invalid/terminal-darwin-arm64.tar.gz", sha256: artifact.sha256, size: artifact.size },
          shellMetadata: { url: "https://unpublished.invalid/terminal-metadata.json", sha256: terminalDocument.sha256, size: terminalDocument.size },
        }],
      }));
      const publishRequest = join(root, "publish-request.json");
      await writeFile(publishRequest, JSON.stringify({
        schemaVersion: 1,
        operation: "exact.publish",
        packReceipt: pack,
        endpointUrl: `http://127.0.0.1:${address.port}`,
        bucket: "fixture",
      }));
      const firstPublish = join(root, "publish-first.json");
      const replayPublish = join(root, "publish-replay.json");
      await expect(runRelease(publishRequest, firstPublish)).resolves.toMatchObject({ status: 0, stderr: "" });
      await expect(runRelease(publishRequest, replayPublish)).resolves.toMatchObject({ status: 0, stderr: "" });
      expect(JSON.parse(await readFile(replayPublish, "utf8"))).toMatchObject({ operation: "exact.publish", replayed: true });

      const published = JSON.parse(await readFile(firstPublish, "utf8"));
      const required = published.requiredAcceptances[0];
      const acceptance = join(root, "acceptance.json");
      await writeFile(acceptance, JSON.stringify({
        schemaVersion: 1,
        operation: "exact.acceptance",
        status: "accepted",
        channel: published.channel,
        releaseVersion: published.releaseVersion,
        sourceCommit: published.sourceCommit,
        shell: required.shell,
        target: required.target,
        artifact: required.artifact,
        shellMetadata: required.shellMetadata,
        installed: { shell: required.shell, target: required.target },
      }));
      const activateRequest = join(root, "activate-request.json");
      await writeFile(activateRequest, JSON.stringify({ schemaVersion: 1, operation: "exact.activate", publishReceipt: firstPublish, acceptanceCredentials: [] }));
      const rejected = await runRelease(activateRequest, join(root, "rejected.json"));
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain("acceptance topology mismatch");

      await writeFile(activateRequest, JSON.stringify({ schemaVersion: 1, operation: "exact.activate", publishReceipt: firstPublish, acceptanceCredentials: [acceptance] }));
      const firstActivation = join(root, "activation-first.json");
      const replayActivation = join(root, "activation-replay.json");
      await expect(runRelease(activateRequest, firstActivation)).resolves.toMatchObject({ status: 0, stderr: "" });
      await expect(runRelease(activateRequest, replayActivation)).resolves.toMatchObject({ status: 0, stderr: "" });
      expect(JSON.parse(await readFile(replayActivation, "utf8"))).toMatchObject({ operation: "exact.activate", replayed: true });
    } finally {
      await new Promise<void>((done, reject) => server.close((error) => error == null ? done() : reject(error)));
    }
  });
});
