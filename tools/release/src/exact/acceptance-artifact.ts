import { createHash } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import { appendFile, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { writeObject } from "./control-common.ts";
import { readPublishedAcceptance } from "./installed-acceptance.ts";

export async function fetchAcceptanceArtifact(input: Readonly<{
  publication: string; policy: string; shell: string; target: string; output: string; receipt: string; githubEnv?: string;
}>) {
  if (!["darwin-arm64", "darwin-x64", "win32-x64"].includes(input.target)) throw new Error("unsupported acceptance target");
  const { published, required, policy } = await readPublishedAcceptance({ publishReceipt: input.publication, policyReceipt: input.policy, shellType: input.shell, target: input.target });
  const artifact = required.artifact;
  if (typeof artifact?.url !== "string" || !/^[a-f0-9]{64}$/u.test(artifact.sha256 ?? "")
    || !Number.isSafeInteger(artifact.size) || artifact.size < 1) throw new Error("published acceptance artifact is invalid");
  const url = new URL(artifact.url), base = new URL(`${policy.target.publicBaseUrl}/`);
  if (url.protocol !== "https:" || url.username || url.password || url.origin !== base.origin
    || !url.pathname.startsWith(`${base.pathname}${policy.channel}/`)) throw new Error("acceptance artifact escapes the release public origin");
  let environment = "";
  if (input.shell === "electron") {
    const identity = required.installIdentity;
    if (typeof identity?.executableName !== "string" || typeof identity.namespace !== "string"
      || [identity.executableName, identity.namespace].some(value => !value || value === "." || value === ".." || /[\x00-\x1f\x7f/\\]/u.test(value))) {
      throw new Error("published Electron acceptance lacks a safe installed identity");
    }
    environment = `ELECTRON_EXECUTABLE=${identity.executableName}\nELECTRON_NAMESPACE=${identity.namespace}\n`;
    if (published.channelHead != null) {
      const head = new URL(published.channelHead.url);
      if (head.origin !== base.origin || head.protocol !== "https:" || head.username || head.password
        || !head.pathname.startsWith(`${base.pathname}${policy.channel}/${policy.releaseVersion}/`) || /[\r\n]/u.test(head.href)) {
        throw new Error("published candidate head escapes the release identity");
      }
      environment += `ELECTRON_CANDIDATE_HEAD_URL=${head.href}\n`;
    }
  }
  const scratch = await mkdtemp(join(tmpdir(), "release-acceptance-artifact-"));
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) throw new Error(`public Shell artifact acquisition failed (${response.status})`);
    const reader = response.body.getReader(), hash = createHash("sha256"); let size = 0;
    async function* chunks() {
      try {
        for (;;) {
          const value = await reader.read(); if (value.done) break;
          size += value.value.length;
          if (size > artifact.size) throw new Error("public Shell artifact exceeds published size");
          hash.update(value.value); yield value.value;
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
    }
    const staged = join(scratch, "artifact");
    await pipeline(Readable.from(chunks()), createWriteStream(staged, { flags: "wx" }));
    if (size !== artifact.size || hash.digest("hex") !== artifact.sha256) throw new Error("public Shell artifact binding mismatch");
    const suffix = input.shell === "terminal" ? ".tar.gz" : input.target.startsWith("darwin-") ? ".dmg" : ".exe";
    const output = join(resolve(input.output), `public-shell-artifact${suffix}`);
    await mkdir(dirname(output), { recursive: true });
    await copyFile(staged, output, constants.COPYFILE_EXCL);
    await writeObject(input.receipt, required);
    if (input.githubEnv && environment) await appendFile(input.githubEnv, environment);
    return { file: output, sha256: artifact.sha256, size };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
