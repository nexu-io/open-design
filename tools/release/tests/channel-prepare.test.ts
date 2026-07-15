import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, "..", "..", "..");
const tsxCliPath = require.resolve("tsx/cli");
const packagedPackageJsonPath = join(workspaceRoot, "apps", "packaged", "package.json");

type MetadataServer = {
  close: () => Promise<void>;
  origin: string;
};

function parseOutputs(value: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    if (line.length === 0) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    outputs[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return outputs;
}

async function runPrepare(channel: string, env: Record<string, string>): Promise<{
  outputs: Record<string, string>;
  stdout: string;
}> {
  const root = await mkdtemp(join(tmpdir(), `od-tools-release-${channel}-`));
  const outputPath = join(root, "github-output.txt");

  try {
    const result = await execFileAsync(
      process.execPath,
      [tsxCliPath, "tools/release/src/index.ts", "prepare", channel],
      {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          ...env,
          GITHUB_OUTPUT: outputPath,
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
        },
      },
    );
    const outputText = await readFile(outputPath, "utf8").catch(() => "");
    return {
      outputs: parseOutputs(outputText),
      stdout: result.stdout,
    };
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function startMetadataServer(
  objects: Record<string, unknown>,
  statusOverrides: Record<string, number> = {},
): Promise<MetadataServer> {
  const server = createHttpsServer(
    {
      cert: localHttpsCert,
      key: localHttpsKey,
    },
    (request, response) => {
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.end("method not allowed");
        return;
      }

      const objectKey = decodeURIComponent(new URL(request.url ?? "/", "https://127.0.0.1").pathname.replace(/^\/+/, ""));
      const statusOverride = statusOverrides[objectKey];
      if (statusOverride != null) {
        response.statusCode = statusOverride;
        response.end("status override");
        return;
      }

      const object = objects[objectKey];
      if (object == null) {
        response.statusCode = 404;
        response.end("not found");
        return;
      }

      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify(object));
    },
  );

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error("metadata fixture did not listen on TCP");
  }

  return {
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
      }),
    origin: `https://127.0.0.1:${address.port}`,
  };
}

async function writeFakeGhScript(root: string): Promise<string> {
  const scriptPath = join(root, "fake-gh.js");
  await writeFile(
    scriptPath,
    [
      "const args = process.argv.slice(2);",
      "if (args[0] === 'api' && String(args[1] ?? '').includes('/releases?')) {",
      "  console.log('[]');",
      "  process.exit(0);",
      "}",
      "console.error(`unsupported fake gh args: ${args.join(' ')}`);",
      "process.exit(1);",
      "",
    ].join("\n"),
    "utf8",
  );
  return scriptPath;
}

async function readPackagedVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(packagedPackageJsonPath, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("apps/packaged/package.json must define a version");
  }
  return packageJson.version;
}

function countedMetadata(
  channel: "beta" | "betas" | "prerelease" | "preview",
  releaseVersion: string,
  releaseNumber: number,
  baseVersion = "0.10.0",
): Record<string, unknown> {
  return {
    baseVersion,
    channel,
    releaseNumber,
    releaseVersion,
  };
}

function stablePrereleaseMetadata(publicOrigin: string, baseVersion: string): Record<string, unknown> {
  const releaseVersion = `${baseVersion}-prerelease.2`;
  const versionPrefix = `prerelease/versions/${releaseVersion}`;
  const versionUrl = `${publicOrigin}/${versionPrefix}`;
  const artifact = (name: string) => ({
    sha256Url: `${versionUrl}/${name}.sha256`,
    url: `${versionUrl}/${name}`,
  });

  return {
    ...countedMetadata("prerelease", releaseVersion, 2, baseVersion),
    github: {
      branch: `release/v${baseVersion}`,
      commit: "0123456789abcdef0123456789abcdef01234567",
      repository: "nexu-io/open-design",
      workflow: "release-prerelease",
    },
    platforms: {
      mac: {
        arch: "arm64",
        artifacts: {
          dmg: artifact("Open Design.dmg"),
          zip: artifact("Open Design-mac-arm64.zip"),
        },
        enabled: true,
        signed: true,
      },
      macIntel: {
        arch: "x64",
        artifacts: {
          dmg: artifact("Open Design Intel.dmg"),
          zip: artifact("Open Design-mac-x64.zip"),
        },
        enabled: true,
        signed: true,
      },
      win: {
        arch: "x64",
        artifacts: {
          installer: artifact("Open Design Setup.exe"),
        },
        enabled: true,
      },
    },
    r2: {
      report: {
        type: "zip",
        url: `${versionUrl}/report.zip`,
      },
      reportZipUrl: `${versionUrl}/report.zip`,
      versionMetadataUrl: `${versionUrl}/metadata.json`,
      versionPrefix,
    },
    signed: true,
  };
}

describe("tools-release local channel prepare validation", () => {
  it("prepares beta, betas, preview, and prerelease from local metadata fixtures", async () => {
    const packagedVersion = await readPackagedVersion();
    const objects: Record<string, unknown> = {
      "beta/latest/metadata.json": countedMetadata("beta", "0.10.0-beta.2", 2),
      "betas/latest/metadata.json": countedMetadata("betas", "0.10.0-betas.2", 2),
      "prerelease/latest/metadata.json": countedMetadata("prerelease", "0.10.1-prerelease.2", 2, "0.10.1"),
      "preview/latest/metadata.json": countedMetadata("preview", "0.10.0-preview.2", 2),
      "stable/latest/metadata.json": {
        baseVersion: "0.9.0",
        channel: "stable",
        releaseVersion: "0.9.0",
        stableVersion: "0.9.0",
      },
    };
    const server = await startMetadataServer(objects);
    const ghRoot = await mkdtemp(join(tmpdir(), "od-tools-release-gh-"));

    try {
      const fakeGh = await writeFakeGhScript(ghRoot);
      const commonEnv = {
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_GH_NODE_SCRIPT: fakeGh,
        OPEN_DESIGN_STABLE_METADATA_URL: `${server.origin}/stable/latest/metadata.json`,
        OPEN_DESIGN_STABLE_VERSION: packagedVersion,
      };

      const beta = await runPrepare("beta", {
        ...commonEnv,
        GITHUB_REF_NAME: "main",
        OPEN_DESIGN_BETA_METADATA_URL: `${server.origin}/beta/latest/metadata.json`,
      });
      expect(beta.stdout).toContain("[release-beta] channel: beta");
      expect(beta.outputs.release_version).toBe(`${packagedVersion}-beta.1`);
      expect(beta.outputs.release_number).toBe("1");
      expect(beta.outputs.beta_version).toBe(`${packagedVersion}-beta.1`);

      const betas = await runPrepare("betas", {
        ...commonEnv,
        GITHUB_REF_NAME: "main",
        OPEN_DESIGN_BETAS_METADATA_URL: `${server.origin}/betas/latest/metadata.json`,
      });
      expect(betas.stdout).toContain("[release-betas] channel: betas");
      expect(betas.outputs.release_version).toBe(`${packagedVersion}-betas.1`);
      expect(betas.outputs.release_number).toBe("1");

      const preview = await runPrepare("preview", {
        ...commonEnv,
        GITHUB_REF_NAME: "main",
        OPEN_DESIGN_PREVIEW_METADATA_URL: `${server.origin}/preview/latest/metadata.json`,
        OPEN_DESIGN_PREVIEW_VERSION: packagedVersion,
      });
      expect(preview.stdout).toContain("[release-preview] channel: preview");
      expect(preview.outputs.release_version).toBe(`${packagedVersion}-preview.1`);
      expect(preview.outputs.release_number).toBe("1");

      const prerelease = await runPrepare("prerelease", {
        ...commonEnv,
        GITHUB_REF_NAME: "main",
        OPEN_DESIGN_PRERELEASE_METADATA_URL: `${server.origin}/prerelease/latest/metadata.json`,
      });
      expect(prerelease.stdout).toContain("[release-prerelease] channel: prerelease");
      expect(prerelease.outputs.release_version).toBe(`${packagedVersion}-prerelease.1`);
      expect(prerelease.outputs.release_number).toBe("1");
      expect(prerelease.outputs.prerelease_number).toBe("1");
    } finally {
      await server.close();
      await rm(ghRoot, { force: true, recursive: true });
    }
  });

  it("allows beta force to bypass stable and beta base version ordering checks", async () => {
    const packagedVersion = await readPackagedVersion();
    const objects: Record<string, unknown> = {
      "beta/latest/metadata.json": countedMetadata("beta", "99.0.0-beta.7", 7, "99.0.0"),
      "stable/latest/metadata.json": {
        baseVersion: "99.0.0",
        channel: "stable",
        releaseVersion: "99.0.0",
        stableVersion: "99.0.0",
      },
    };
    const server = await startMetadataServer(objects);

    try {
      const beta = await runPrepare("beta", {
        GITHUB_REF_NAME: "main",
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_BETA_METADATA_URL: `${server.origin}/beta/latest/metadata.json`,
        OPEN_DESIGN_RELEASE_FORCE: "1",
        OPEN_DESIGN_STABLE_METADATA_URL: `${server.origin}/stable/latest/metadata.json`,
      });

      expect(beta.stdout).toContain("[release-beta] force: true");
      expect(beta.outputs.force).toBe("true");
      expect(beta.outputs.release_version).toBe(`${packagedVersion}-beta.1`);
      expect(beta.outputs.release_number).toBe("1");
    } finally {
      await server.close();
    }
  });

  it("prepares preview from the packaged version when branch and explicit version are absent", async () => {
    const packagedVersion = await readPackagedVersion();
    const objects: Record<string, unknown> = {
      "preview/latest/metadata.json": countedMetadata("preview", "0.10.0-preview.2", 2),
    };
    const server = await startMetadataServer(objects);

    try {
      const preview = await runPrepare("preview", {
        GITHUB_REF_NAME: "main",
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_PREVIEW_METADATA_URL: `${server.origin}/preview/latest/metadata.json`,
      });

      expect(preview.stdout).toContain(`[release-preview] base version: ${packagedVersion}`);
      expect(preview.outputs.release_version).toBe(`${packagedVersion}-preview.1`);
    } finally {
      await server.close();
    }
  });

  it("treats a 403 betas latest response as a cold-start missing metadata object", async () => {
    const packagedVersion = await readPackagedVersion();
    const objects: Record<string, unknown> = {
      "stable/latest/metadata.json": {
        baseVersion: "0.10.1",
        channel: "stable",
        releaseVersion: "0.10.1",
        stableVersion: "0.10.1",
      },
    };
    const server = await startMetadataServer(objects, {
      "betas/latest/metadata.json": 403,
    });

    try {
      const betas = await runPrepare("betas", {
        GITHUB_REF_NAME: "main",
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_BETAS_METADATA_URL: `${server.origin}/betas/latest/metadata.json`,
        OPEN_DESIGN_STABLE_METADATA_URL: `${server.origin}/stable/latest/metadata.json`,
      });

      expect(betas.stdout).toContain("betas metadata.json: not found; using betas.0 fallback");
      expect(betas.outputs.release_version).toBe(`${packagedVersion}-betas.1`);
      expect(betas.outputs.release_number).toBe("1");
    } finally {
      await server.close();
    }
  });

  it("validates stable dry-run promotion against local prerelease metadata", async () => {
    const packagedVersion = await readPackagedVersion();
    const prereleaseVersion = `${packagedVersion}-prerelease.2`;
    const objects: Record<string, unknown> = {};
    const server = await startMetadataServer(objects);
    const ghRoot = await mkdtemp(join(tmpdir(), "od-tools-release-gh-"));
    objects[`prerelease/versions/${prereleaseVersion}/metadata.json`] = stablePrereleaseMetadata(server.origin, packagedVersion);

    try {
      const fakeGh = await writeFakeGhScript(ghRoot);
      const stable = await runPrepare("stable", {
        GITHUB_REF_NAME: `release/v${packagedVersion}`,
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_GH_NODE_SCRIPT: fakeGh,
        OPEN_DESIGN_RELEASE_DRY_RUN: "true",
        OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN: server.origin,
        OPEN_DESIGN_STABLE_PRERELEASE_VERSION: prereleaseVersion,
      });

      expect(stable.stdout).toContain("[release-stable] channel: stable");
      expect(stable.stdout).toContain(`[release-stable] validated prerelease: ${prereleaseVersion}`);
      expect(stable.outputs.release_version).toBe(packagedVersion);
      expect(stable.outputs.dry_run).toBe("true");
      expect(stable.outputs.dry_run_mode).toBe("metadata");
      expect(stable.outputs.github_release_enabled).toBe("false");
      expect(stable.outputs.publish_side_effects_enabled).toBe("false");
      expect(stable.outputs.run_prepublish_jobs).toBe("false");
      expect(stable.outputs.version_tag).toBe(`open-design-v${packagedVersion}`);
    } finally {
      await server.close();
      await rm(ghRoot, { force: true, recursive: true });
    }
  });

  it("prepares stable prepublish dry-run controls without enabling publish side effects", async () => {
    const packagedVersion = await readPackagedVersion();
    const prereleaseVersion = `${packagedVersion}-prerelease.2`;
    const objects: Record<string, unknown> = {};
    const server = await startMetadataServer(objects);
    const ghRoot = await mkdtemp(join(tmpdir(), "od-tools-release-gh-"));
    objects[`prerelease/versions/${prereleaseVersion}/metadata.json`] = stablePrereleaseMetadata(server.origin, packagedVersion);

    try {
      const fakeGh = await writeFakeGhScript(ghRoot);
      const stable = await runPrepare("stable", {
        GITHUB_REF_NAME: `release/v${packagedVersion}`,
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_GH_NODE_SCRIPT: fakeGh,
        OPEN_DESIGN_RELEASE_DRY_RUN: "prepublish",
        OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN: server.origin,
        OPEN_DESIGN_STABLE_PRERELEASE_VERSION: prereleaseVersion,
      });

      expect(stable.stdout).toContain("[release-stable] dry run mode: prepublish");
      expect(stable.outputs.dry_run).toBe("true");
      expect(stable.outputs.dry_run_mode).toBe("prepublish");
      expect(stable.outputs.github_release_enabled).toBe("false");
      expect(stable.outputs.publish_side_effects_enabled).toBe("false");
      expect(stable.outputs.run_prepublish_jobs).toBe("true");
    } finally {
      await server.close();
      await rm(ghRoot, { force: true, recursive: true });
    }
  });

  it("prepares stable publish controls when dry-run is false", async () => {
    const packagedVersion = await readPackagedVersion();
    const prereleaseVersion = `${packagedVersion}-prerelease.2`;
    const objects: Record<string, unknown> = {};
    const server = await startMetadataServer(objects);
    const ghRoot = await mkdtemp(join(tmpdir(), "od-tools-release-gh-"));
    objects[`prerelease/versions/${prereleaseVersion}/metadata.json`] = stablePrereleaseMetadata(server.origin, packagedVersion);

    try {
      const fakeGh = await writeFakeGhScript(ghRoot);
      const stable = await runPrepare("stable", {
        GITHUB_REF_NAME: `release/v${packagedVersion}`,
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_GH_NODE_SCRIPT: fakeGh,
        OPEN_DESIGN_RELEASE_DRY_RUN: "false",
        OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN: server.origin,
        OPEN_DESIGN_STABLE_PRERELEASE_VERSION: prereleaseVersion,
      });

      expect(stable.stdout).toContain("[release-stable] dry run: false");
      expect(stable.outputs.dry_run).toBe("false");
      expect(stable.outputs.dry_run_mode).toBe("");
      expect(stable.outputs.github_release_enabled).toBe("true");
      expect(stable.outputs.publish_side_effects_enabled).toBe("true");
      expect(stable.outputs.run_prepublish_jobs).toBe("true");
    } finally {
      await server.close();
      await rm(ghRoot, { force: true, recursive: true });
    }
  });

  it("rejects stable promotion inputs from non-prerelease counted channels", async () => {
    const packagedVersion = await readPackagedVersion();
    const objects: Record<string, unknown> = {};
    const server = await startMetadataServer(objects);
    const ghRoot = await mkdtemp(join(tmpdir(), "od-tools-release-gh-"));

    try {
      const fakeGh = await writeFakeGhScript(ghRoot);
      await expect(runPrepare("stable", {
        GITHUB_REF_NAME: `release/v${packagedVersion}`,
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_GH_NODE_SCRIPT: fakeGh,
        OPEN_DESIGN_RELEASE_DRY_RUN: "metadata",
        OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN: server.origin,
        OPEN_DESIGN_STABLE_PRERELEASE_VERSION: `${packagedVersion}-preview.2`,
      })).rejects.toThrow(/prereleaseVersion must be x\.y\.z-prerelease\.N/);
    } finally {
      await server.close();
      await rm(ghRoot, { force: true, recursive: true });
    }
  });

  it("requires stable promotion to run from the release version branch", async () => {
    const packagedVersion = await readPackagedVersion();
    const prereleaseVersion = `${packagedVersion}-prerelease.2`;
    const objects: Record<string, unknown> = {};
    const server = await startMetadataServer(objects);
    const ghRoot = await mkdtemp(join(tmpdir(), "od-tools-release-gh-"));
    objects[`prerelease/versions/${prereleaseVersion}/metadata.json`] = stablePrereleaseMetadata(server.origin, packagedVersion);

    try {
      const fakeGh = await writeFakeGhScript(ghRoot);
      await expect(runPrepare("stable", {
        GITHUB_REF_NAME: "main",
        GITHUB_REPOSITORY: "nexu-io/open-design",
        GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
        OPEN_DESIGN_GH_NODE_SCRIPT: fakeGh,
        OPEN_DESIGN_RELEASE_DRY_RUN: "metadata",
        OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN: server.origin,
        OPEN_DESIGN_STABLE_PRERELEASE_VERSION: prereleaseVersion,
      })).rejects.toThrow(/requires GITHUB_REF_NAME to be release\/vX\.Y\.Z; got main/);
    } finally {
      await server.close();
      await rm(ghRoot, { force: true, recursive: true });
    }
  });
});

const localHttpsKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC1hoV1GwxqTYdO
Zs0pY5hnp8BtTwdF6dWsXoFWYw9IPpBTmyNeleRcLtrht/oc5oRS05tC97qmb5eL
RigyXUmwrpt/VjJ7ursDa3qGnljkqVxqBkRAUdXBMCVPkMogKWvJy/S61Vthvf7K
K5HhofwcuPPvRBdhdZgtw/7nZY49HYutd7wP/U7iqCYBMpWr0I29jSs1S2xY9fH8
ih/exDGe3PHm8yQao4pHUUFVXoAI5w6tYsmNep6b+5NYPHnHSaXd7h5gaF+nIJE4
78jgRQHKjQ2iNf/53/o/d5SAMb/9lZ7stNT8RIFOJUz1IP8Zsz3VKwAvXKXZDObr
0MS4JrPdAgMBAAECggEATcF0HD/8VvKjsU0ut3pud4QvVINEGcn6mY2XuFHRY4BN
IUr0YRkyytvVLVe5vrRtXO9Ac/Sakp19XA6uvDgijxiUCfz5ve80GVhqEQz2BeiX
6eCKTsTfG5QMf2MFebZUcgm36Gno7VrNr3rvT6erzv/YmZZgr4IIMB5i62qgfYOY
ABSg6b223RSVeZXNvWxovKycBUUa26lrzRu5jpuexjAccmgbiE86exhzW7FK2zjZ
XH8rOxSDJ49+ipPOGsJ+rZMdtvHq6BO/QU4O9IkBLNuHAIbr/WcjBgnAPskQTrOM
i3vWqPNVw3tPjBWCOtzy0UllG0L5Sxnx5cceFvL9HwKBgQDieIaM89In+VETI+x4
aUmQXxVcisZR0FWQytl+XbWe4T1zxEj4fFjd/phgv0M60599/mwCCGrImxKM8cnb
mjxv2FX+or9+2IFpaSOi+Qj6/IxcTTWoMU0t4AQjOgbRf3iBpVz6JysnKKpqqukT
GGOnzGWz0gFmDAqKm0zkGy7czwKBgQDNMb6hrSGobMRlCndgx//w/SdDq/IqAbIS
QyAvYgNuOXV3J4sD2Z1TwYxZM2Oq5rhOPfZr8SnqM7d+LknLPiGMKV7z6vL/BOu8
ZB5+EmMZwqNmSOMaFZM+77OC/zxDCznqTm4N5vDdg+6SByCtuyCm+Jraj0PtHtkD
krdWqBfHkwKBgDpTzluZJGQ1OyNR2kJ843xycL7/4uoJXTBIflGkcvVzj280e5K7
++tY+gfY2sjY3jgGAe1YG6CFB/cTAukzRSONNUC6y9Uwj8wFTy9XMm/qAYB4RjyG
Thllm8sy07S7Pt8tJtAqrFuOhq2oTRUk7+20n/D7Qm705PYj317UfXJTAoGABdYM
XfzWoDu3ukf57T7DAM+ydjJFyPwTXIGcQLzA7DmmJaVyRsHBv8gZfdAAXbQCOfd5
MsjBMHAYH/ahEq7JtXrXwIhGMQqqycjvNRbAytLGYvpfuzYx4fBfYrJvvFhtZUSl
zK9s2mAOQQkC3O4dl6IqhVzdybi+42Mg484UHxECgYEAht1ef0Gc6RKZpmqttlZJ
1G4lsR1Aws3dintACs8lza5aaufrY07gF8z3rkW6tPGEWfol3CYOT2U5UiUw+iKG
F/Pa3L5wCxuRKKWx0ip0PFhDPrpWfVCm2CLlUlZLEjpmF2iUZgmkaScjYqG8R16a
C8cywTs1ku5aYIaN8YcAigI=
-----END PRIVATE KEY-----`;

const localHttpsCert = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUbNGmwcWmZP5tw6gm8s2RXzWJv+IwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDYwODA0MDczNVoXDTI2MDYw
OTA0MDczNVowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAtYaFdRsMak2HTmbNKWOYZ6fAbU8HRenVrF6BVmMPSD6Q
U5sjXpXkXC7a4bf6HOaEUtObQve6pm+Xi0YoMl1JsK6bf1Yye7q7A2t6hp5Y5Klc
agZEQFHVwTAlT5DKIClrycv0utVbYb3+yiuR4aH8HLjz70QXYXWYLcP+52WOPR2L
rXe8D/1O4qgmATKVq9CNvY0rNUtsWPXx/Iof3sQxntzx5vMkGqOKR1FBVV6ACOcO
rWLJjXqem/uTWDx5x0ml3e4eYGhfpyCROO/I4EUByo0NojX/+d/6P3eUgDG//ZWe
7LTU/ESBTiVM9SD/GbM91SsAL1yl2Qzm69DEuCaz3QIDAQABo1MwUTAdBgNVHQ4E
FgQU8Z0Oy/q8fAqp9005cn2sW4K6oB4wHwYDVR0jBBgwFoAU8Z0Oy/q8fAqp9005
cn2sW4K6oB4wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAlJTb
7zi4FKJqYuXZ9YWmV96Ri+vBcNfO2dwKBxFtJXm0Ai2Q4ruutuFPYwY6UYGTN5gC
HJ0/WxuPK5ftAE6UU+Mghu0dJlH+gWmOq5cDyhYdnEi8R6z5AsPtPEYlkkIvhUO1
k1BtCP0h4Kh8fuaILGuXQNOaKizIWF2lEEHfCmvKhgOF6dKWs38zdetFQCLRIaHg
ZyGlUhPCUbKdTiBJuCGaDKzeEAlC8dsar2zjg9CVue7w3CaamQpjnV0d2IHJiVAH
QONQvdtLnZ6GeNPe06oBrq7R9SL5/tkqgSq8lCrDE6jFZnfXNMdDmZY3wTcFcdyG
yW/DsIUs5ZzcHza5rw==
-----END CERTIFICATE-----`;
