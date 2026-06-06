import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface AuthKey {
  id: string;
  keyPrefix: string;
  keyHash: string;
  label: string;
  createdAt: number;
}

const FILE_NAME = "daemon-api-keys.json";
const KEY_PREFIX = "od_";

function configFile(dataDir: string): string {
  return path.join(dataDir, FILE_NAME);
}

function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Serialize concurrent writes to the same dataDir.
const writeLocks = new Map<string, Promise<unknown>>();

export async function readKeys(dataDir: string): Promise<AuthKey[]> {
  try {
    const raw = await fs.readFile(configFile(dataDir), "utf8");
    const store = JSON.parse(raw) as { keys: unknown[] };
    if (!Array.isArray(store.keys)) return [];
    return migrateIfNeeded(dataDir, store.keys as AuthKey[]);
  } catch {
    return [];
  }
}

async function migrateIfNeeded(
  dataDir: string,
  keys: AuthKey[],
): Promise<AuthKey[]> {
  let dirty = false;
  const migrated: AuthKey[] = keys.map((k: unknown) => {
    const rec = k as Record<string, unknown>;
    if (typeof rec.keyHash === "string" && typeof rec.keyPrefix === "string") {
      return k as AuthKey;
    }
    dirty = true;
    const rawKey = String(rec.key ?? "");
    return {
      id: String(rec.id ?? crypto.randomBytes(8).toString("hex")),
      keyPrefix: rawKey.slice(0, 8),
      keyHash: hashKey(rawKey),
      label: String(rec.label ?? ""),
      createdAt: typeof rec.createdAt === "number" ? rec.createdAt : Date.now(),
    };
  });
  if (dirty) await doWrite(dataDir, migrated);
  return migrated;
}

async function doWrite(dataDir: string, keys: AuthKey[]): Promise<void> {
  const file = configFile(dataDir);
  await fs.mkdir(dataDir, { recursive: true });
  const tmp = file + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
  await fs.writeFile(tmp, JSON.stringify({ keys }, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(tmp, file);
}

async function lockedWrite(
  dataDir: string,
  fn: (keys: AuthKey[]) => Promise<AuthKey[]>,
): Promise<void> {
  const prev = writeLocks.get(dataDir) ?? Promise.resolve();
  const task = prev.catch(() => {}).then(async () => {
    const keys = await readKeys(dataDir);
    const result = await fn(keys);
    await doWrite(dataDir, result);
  });
  writeLocks.set(dataDir, task);
  try {
    await task;
  } finally {
    if (writeLocks.get(dataDir) === task) writeLocks.delete(dataDir);
  }
}

export async function generateKey(
  dataDir: string,
  label = "",
): Promise<{ id: string; key: string; label: string; createdAt: number }> {
  const id = crypto.randomBytes(8).toString("hex");
  const secret = crypto.randomBytes(32).toString("base64url");
  const rawKey = `${KEY_PREFIX}${secret}`;
  const entry: AuthKey = {
    id,
    keyPrefix: rawKey.slice(0, 8),
    keyHash: hashKey(rawKey),
    label,
    createdAt: Date.now(),
  };
  await lockedWrite(dataDir, async (keys) => {
    keys.push(entry);
    return keys;
  });
  return { id, key: rawKey, label, createdAt: entry.createdAt };
}

export async function listKeys(
  dataDir: string,
): Promise<
  Array<{ id: string; keyPrefix: string; label: string; createdAt: number }>
> {
  const keys = await readKeys(dataDir);
  return keys.map(({ id, keyPrefix, label, createdAt }) => ({
    id,
    keyPrefix,
    label,
    createdAt,
  }));
}

export async function revokeKey(
  dataDir: string,
  id: string,
): Promise<boolean> {
  let removed = false;
  await lockedWrite(dataDir, async (keys) => {
    const before = keys.length;
    const filtered = keys.filter((k) => k.id !== id);
    removed = filtered.length < before;
    return filtered;
  });
  return removed;
}

export async function clearAllKeys(dataDir: string): Promise<void> {
  await lockedWrite(dataDir, async () => []);
}

export async function allValidHashes(
  dataDir: string,
): Promise<string[]> {
  const keys = await readKeys(dataDir);
  return keys.map((k) => k.keyHash);
}

export function verifyKey(
  candidate: string,
  hashes: string[],
): boolean {
  const h = hashKey(candidate);
  const a = Buffer.from(h);
  return hashes.some((stored) => {
    const b = Buffer.from(stored);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
