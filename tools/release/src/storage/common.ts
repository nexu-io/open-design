import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { StorageConfig } from "./s3-upload.ts";

export type ReleaseTarget = "mac_arm64" | "mac_x64" | "win_x64" | "linux_x64";

export function required(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

export function bool(name: string): boolean {
  return process.env[name] === "true";
}

export function requiredTarget(name = "RELEASE_TARGET"): ReleaseTarget {
  const value = required(name);
  if (value !== "mac_arm64" && value !== "mac_x64" && value !== "win_x64" && value !== "linux_x64") {
    throw new Error(`${name} must be mac_arm64, mac_x64, win_x64, or linux_x64; got ${value}`);
  }
  return value;
}

export function storageConfigFromEnv(): StorageConfig {
  return {
    accessKeyId: required("RELEASE_STORAGE_ACCESS_KEY_ID"),
    bucket: required("RELEASE_STORAGE_BUCKET"),
    endpointUrl: required("RELEASE_STORAGE_ENDPOINT"),
    region: required("RELEASE_STORAGE_REGION"),
    secretAccessKey: required("RELEASE_STORAGE_SECRET_ACCESS_KEY"),
    sessionToken: optional("RELEASE_STORAGE_SESSION_TOKEN"),
  };
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

export function contentType(name: string): string {
  if (name.endsWith(".dmg")) return "application/x-apple-diskimage";
  if (name.endsWith(".zip")) return "application/zip";
  if (name.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  if (name.endsWith(".AppImage")) return "application/octet-stream";
  if (name.endsWith(".sha256")) return "text/plain; charset=utf-8";
  if (name.endsWith(".yml") || name.endsWith(".yaml")) return "application/x-yaml; charset=utf-8";
  if (name.endsWith(".json")) return "application/json; charset=utf-8";
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (name.endsWith(".log") || name.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".xml")) return "application/xml; charset=utf-8";
  return "application/octet-stream";
}

export function publicUrl(publicOrigin: string, prefix: string, name: string): string {
  return `${publicOrigin.replace(/\/+$/, "")}/${prefix.replace(/^\/+|\/+$/g, "")}/${name}`;
}

export function githubInfo(): Record<string, unknown> {
  return {
    branch: optional("RELEASE_BRANCH"),
    commit: optional("RELEASE_COMMIT"),
    repository: optional("RELEASE_REPOSITORY"),
    runAttempt: Number(optional("RELEASE_RUN_ATTEMPT", "0")),
    runId: Number(optional("RELEASE_RUN_ID", "0")),
    workflow: optional("RELEASE_WORKFLOW"),
  };
}
