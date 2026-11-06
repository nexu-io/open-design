const path = require("node:path");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { spawn } = require("node:child_process");

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 15000;

function parsePositiveInteger(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        output: Buffer.concat(chunks).toString("utf8"),
      });
    });
  });
}

function isTransientNotaryError(error) {
  const message = `${error?.message ?? ""}\n${error?.stack ?? ""}`;
  return [
    "abortedUpload",
    "deadlineExceeded",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "socket hang up",
    "network connection was lost",
  ].some((marker) => message.includes(marker));
}

function authorizationArgs(credentials) {
  if (credentials.keychainProfile) {
    return [
      ...(credentials.keychain ? ["--keychain", credentials.keychain] : []),
      "--keychain-profile",
      credentials.keychainProfile,
    ];
  }

  return [
    "--apple-id",
    credentials.appleId,
    "--password",
    credentials.appleIdPassword,
    "--team-id",
    credentials.teamId,
  ];
}

async function submitNotarization(filePath, credentials) {
  const useS3Acceleration = process.env.OPEN_DESIGN_NOTARIZE_S3_ACCELERATION === "true";
  const result = await run("xcrun", [
    "notarytool",
    "submit",
    filePath,
    ...authorizationArgs(credentials),
    "--wait",
    "--output-format",
    "json",
    useS3Acceleration ? "--s3-acceleration" : "--no-s3-acceleration",
  ]);
  const rawOutput = result.output.trim();
  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    throw new Error(`Failed to notarize via notarytool. Failed with unexpected result:\n\n${rawOutput}`);
  }

  if (result.code === 0 && parsed.status === "Accepted") {
    return parsed;
  }

  throw new Error(`Failed to notarize via notarytool:\n\n${rawOutput}`);
}

async function stapleApp(appPath) {
  const result = await run("xcrun", ["stapler", "staple", appPath]);
  if (result.code !== 0) {
    throw new Error(`Failed to staple notarized app:\n\n${result.output.trim()}`);
  }
}

async function notarizeApp(appPath, credentials) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "open-design-notarize-"));
  try {
    const filePath = path.join(tempDir, `${path.parse(appPath).name}.zip`);
    const zipResult = await run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", path.basename(appPath), filePath], {
      cwd: path.dirname(appPath),
    });
    if (zipResult.code !== 0) {
      throw new Error(`Failed to zip app for notarization:\n\n${zipResult.output.trim()}`);
    }

    await submitNotarization(filePath, credentials);
    await stapleApp(appPath);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

module.exports = async function notarize(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const keychainProfile = process.env.APPLE_NOTARY_KEYCHAIN_PROFILE;
  const keychain = process.env.APPLE_NOTARY_KEYCHAIN;
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  let credentials;
  if (keychainProfile) {
    credentials = {
      keychainProfile,
      ...(keychain ? { keychain } : {}),
    };
  } else {
    const missing = [
      ["APPLE_ID", appleId],
      ["APPLE_APP_SPECIFIC_PASSWORD", appleIdPassword],
      ["APPLE_TEAM_ID", teamId],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `[tools-pack notarize] missing required Apple notarization env: ${missing.join(", ")}`,
      );
    }

    credentials = {
      appleId,
      appleIdPassword,
      teamId,
    };
  }

  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${productFilename}.app`);
  const attempts = parsePositiveInteger(process.env.OPEN_DESIGN_NOTARIZE_ATTEMPTS, DEFAULT_ATTEMPTS);
  const retryDelayMs = parsePositiveInteger(process.env.OPEN_DESIGN_NOTARIZE_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await notarizeApp(appPath, credentials);
      return;
    } catch (error) {
      const canRetry = attempt < attempts && isTransientNotaryError(error);
      if (!canRetry) {
        throw error;
      }

      console.warn(
        `[tools-pack notarize] transient notarytool failure on attempt ${attempt}/${attempts}; retrying in ${retryDelayMs}ms`,
      );
      await sleep(retryDelayMs);
    }
  }
};
