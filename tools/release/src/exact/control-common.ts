import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type JsonObject = Record<string, any>;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value != null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalValue(child)]));
  }
  return value;
}

export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`);
}

export async function readObject(path: string): Promise<JsonObject> {
  const value: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`JSON document must be an object: ${path}`);
  return value as JsonObject;
}

export async function writeObject(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(resolve(path), canonicalBytes(value));
}

export async function describeFile(path: string, mediaType?: string): Promise<JsonObject> {
  const absolute = resolve(path);
  const body = await readFile(absolute);
  return {
    file: absolute,
    sha256: createHash("sha256").update(body).digest("hex"),
    size: (await stat(absolute)).size,
    ...(mediaType == null ? {} : { mediaType }),
  };
}

export async function checkedFile(value: JsonObject, label: string, override?: unknown): Promise<string> {
  const path = resolve(typeof override === "string" ? override : String(value.file ?? ""));
  const actual = await describeFile(path);
  if (actual.sha256 !== value.sha256 || actual.size !== value.size) throw new Error(`${label} binding verification failed: ${path}`);
  return path;
}

export function exactArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}
