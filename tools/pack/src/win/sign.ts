import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";

import type { ToolPackConfig } from "../config.js";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMESTAMP_URL = "http://timestamp.digicert.com";
const DEFAULT_SIGNTOOL_CANDIDATES = [
  "signtool.exe",
  "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\signtool.exe",
  "C:\\Program Files (x86)\\Windows Kits\\10\\App Certification Kit\\signtool.exe",
];

export type WinSigningConfig = {
  certificateSha1: string;
  digestAlgorithm: "sha256";
  signtoolPath: string;
  timestampAlgorithm: "sha256";
  timestampUrl: string;
};

export type WinSigningCacheKey = {
  certificateSha1?: string;
  digestAlgorithm?: string;
  enabled: boolean;
  timestampAlgorithm?: string;
  timestampUrl?: string;
};

export type WinSigningDetails = {
  args: string[];
  command: string;
  file: string;
  stderrBytes: number;
  stderrTail: string;
  stdoutBytes: number;
  stdoutTail: string;
  verifyArgs: string[];
  verifyStderrBytes: number;
  verifyStderrTail: string;
  verifyStdoutBytes: number;
  verifyStdoutTail: string;
};

export type WinSigningOptions = {
  verify?: boolean;
};

export function resolveWinSigningCacheKey(config: ToolPackConfig): WinSigningCacheKey {
  if (!config.signed) return { enabled: false };
  const signing = resolveWinSigningConfig();
  return {
    certificateSha1: signing.certificateSha1,
    digestAlgorithm: signing.digestAlgorithm,
    enabled: true,
    timestampAlgorithm: signing.timestampAlgorithm,
    timestampUrl: signing.timestampUrl,
  };
}

export function resolveWinSigningConfig(): WinSigningConfig {
  const certificateSha1 = normalizeSha1(process.env.OD_WIN_SIGN_CERT_SHA1 ?? process.env.WIN_SIGN_CERT_SHA1);
  if (certificateSha1 == null) {
    throw new Error("signed Windows builds require OD_WIN_SIGN_CERT_SHA1");
  }
  return {
    certificateSha1,
    digestAlgorithm: "sha256",
    signtoolPath: process.env.OD_WIN_SIGNTOOL_PATH ?? process.env.WIN_SIGNTOOL_PATH ?? DEFAULT_SIGNTOOL_CANDIDATES[0],
    timestampAlgorithm: "sha256",
    timestampUrl: process.env.OD_WIN_SIGN_TIMESTAMP_URL ?? process.env.WIN_SIGN_TIMESTAMP_URL ?? DEFAULT_TIMESTAMP_URL,
  };
}

export async function signAndVerifyWinFile(
  file: string,
  options: WinSigningOptions = {},
): Promise<WinSigningDetails> {
  const signing = resolveWinSigningConfig();
  const signtoolPath = await resolveSigntoolPath(signing.signtoolPath);
  const verify = options.verify !== false;
  const args = [
    "sign",
    "/sha1",
    signing.certificateSha1,
    "/fd",
    signing.digestAlgorithm,
    "/tr",
    signing.timestampUrl,
    "/td",
    signing.timestampAlgorithm,
    file,
  ];
  const result = await execFileAsync(signtoolPath, args, { windowsHide: true });
  const verifyArgs = verify ? ["verify", "/pa", "/v", file] : [];
  const verifyResult = verify
    ? await execFileAsync(signtoolPath, verifyArgs, { windowsHide: true })
    : { stderr: "", stdout: "" };
  return {
    args,
    command: signtoolPath,
    file,
    stderrBytes: result.stderr.length,
    stderrTail: result.stderr.slice(-2000),
    stdoutBytes: result.stdout.length,
    stdoutTail: result.stdout.slice(-2000),
    verifyArgs,
    verifyStderrBytes: verifyResult.stderr.length,
    verifyStderrTail: verifyResult.stderr.slice(-2000),
    verifyStdoutBytes: verifyResult.stdout.length,
    verifyStdoutTail: verifyResult.stdout.slice(-2000),
  };
}

export async function resolveSigntoolPath(
  configured: string,
  candidates: readonly string[] = DEFAULT_SIGNTOOL_CANDIDATES,
): Promise<string> {
  const filesystemCandidates = candidates.filter((candidate) => candidate !== "signtool.exe");
  const orderedFilesystemCandidates = configured === "signtool.exe"
    ? filesystemCandidates
    : [configured, ...filesystemCandidates.filter((candidate) => candidate !== configured)];

  for (const candidate of orderedFilesystemCandidates) {
    if (await fileExists(candidate)) return candidate;
  }

  return configured === "signtool.exe" && candidates.includes("signtool.exe")
    ? "signtool.exe"
    : configured;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeSha1(value: string | undefined): string | null {
  if (value == null) return null;
  const normalized = value.replace(/\s/g, "").toUpperCase();
  if (normalized.length === 0) return null;
  if (!/^[0-9A-F]{40}$/.test(normalized)) {
    throw new Error("OD_WIN_SIGN_CERT_SHA1 must be a 40-character SHA1 thumbprint");
  }
  return normalized;
}
