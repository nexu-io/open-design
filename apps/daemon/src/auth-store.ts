import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface AuthKey {
  id: string;
  key: string;
  label: string;
  createdAt: number;
}

interface AuthStore {
  keys: AuthKey[];
}

const FILE_NAME = "daemon-api-keys.json";
const KEY_PREFIX = "od_";

function configFile(dataDir: string): string {
  return path.join(dataDir, FILE_NAME);
}

export async function readKeys(dataDir: string): Promise<AuthKey[]> {
  try {
    const raw = await fs.readFile(configFile(dataDir), "utf8");
    const store: AuthStore = JSON.parse(raw);
    return Array.isArray(store.keys) ? store.keys : [];
  } catch {
    return [];
  }
}

async function writeKeys(dataDir: string, keys: AuthKey[]): Promise<void> {
  const store: AuthStore = { keys };
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(configFile(dataDir), JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
}

export async function generateKey(dataDir: string, label = ""): Promise<AuthKey> {
  const keys = await readKeys(dataDir);
  const id = crypto.randomBytes(8).toString("hex");
  const secret = crypto.randomBytes(32).toString("base64url");
  const entry: AuthKey = {
    id,
    key: `${KEY_PREFIX}${secret}`,
    label,
    createdAt: Date.now(),
  };
  keys.push(entry);
  await writeKeys(dataDir, keys);
  return entry;
}

export async function listKeys(dataDir: string): Promise<Array<{ id: string; label: string; createdAt: number }>> {
  const keys = await readKeys(dataDir);
  return keys.map(({ id, label, createdAt }) => ({ id, label, createdAt }));
}

export async function revokeKey(dataDir: string, id: string): Promise<boolean> {
  const keys = await readKeys(dataDir);
  const before = keys.length;
  const filtered = keys.filter((k) => k.id !== id);
  if (filtered.length === before) return false;
  await writeKeys(dataDir, filtered);
  return true;
}

export async function allValidKeys(dataDir: string): Promise<string[]> {
  const keys = await readKeys(dataDir);
  return keys.map((k) => k.key);
}
