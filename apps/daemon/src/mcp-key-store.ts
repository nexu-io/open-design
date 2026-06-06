import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface McpKey {
  id: string;
  keyPrefix: string;
  encryptedKey: string;
  iv: string;
  authTag: string;
  keyHash: string;
  label: string;
  createdAt: number;
}

const FILE_NAME = 'mcp-keys.json';
const ENC_KEY_FILE = '.enc-key';
const KEY_PREFIX = 'od_mcp_';
const ALGO = 'aes-256-gcm';

const cachedHashesByDir = new Map<string, string[]>();

function invalidateHashCache(dataDir: string): void {
  cachedHashesByDir.delete(dataDir);
}

function storeFile(dataDir: string): string {
  return path.join(dataDir, FILE_NAME);
}

function encKeyFile(dataDir: string): string {
  return path.join(dataDir, ENC_KEY_FILE);
}

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

const cachedEncKeyByDir = new Map<string, Buffer>();

export function resetEncKeyCache(): void {
  cachedEncKeyByDir.clear();
}

async function loadEncKey(dataDir: string): Promise<Buffer> {
  const cached = cachedEncKeyByDir.get(dataDir);
  if (cached) return cached;
  const file = encKeyFile(dataDir);
  try {
    const raw = await fs.readFile(file);
    if (raw.length === 32) {
      cachedEncKeyByDir.set(dataDir, raw);
      return raw;
    }
  } catch {
    // not found — create
  }
  const key = crypto.randomBytes(32);
  await fs.mkdir(dataDir, { recursive: true });
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fs.writeFile(tmp, key, { mode: 0o600 });
  await fs.rename(tmp, file);
  cachedEncKeyByDir.set(dataDir, key);
  return key;
}

export async function initMcpKeyStore(dataDir: string): Promise<void> {
  await loadEncKey(dataDir);
}

function encrypt(raw: string, encKey: Buffer): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encKey, iv);
  const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

function decrypt(
  encrypted: string,
  iv: string,
  authTag: string,
  encKey: Buffer,
): string {
  const decipher = crypto.createDecipheriv(
    ALGO,
    encKey,
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return decipher.update(encrypted, 'base64', 'utf8') + decipher.final('utf8');
}

const writeLocks = new Map<string, Promise<unknown>>();

async function readStore(dataDir: string): Promise<McpKey[]> {
  try {
    const raw = await fs.readFile(storeFile(dataDir), 'utf8');
    const store = JSON.parse(raw) as { keys: McpKey[] };
    return Array.isArray(store.keys) ? store.keys : [];
  } catch {
    return [];
  }
}

async function doWrite(dataDir: string, keys: McpKey[]): Promise<void> {
  const file = storeFile(dataDir);
  await fs.mkdir(dataDir, { recursive: true });
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fs.writeFile(tmp, JSON.stringify({ keys }, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.rename(tmp, file);
}

async function lockedWrite(
  dataDir: string,
  fn: (keys: McpKey[]) => Promise<McpKey[]>,
): Promise<void> {
  const prev = writeLocks.get(dataDir) ?? Promise.resolve();
  const task = prev.catch(() => {}).then(async () => {
    const keys = await readStore(dataDir);
    const result = await fn(keys);
    await doWrite(dataDir, result);
    invalidateHashCache(dataDir);
  });
  writeLocks.set(dataDir, task);
  try {
    await task;
  } finally {
    if (writeLocks.get(dataDir) === task) writeLocks.delete(dataDir);
  }
}

export async function generateMcpKey(
  dataDir: string,
  label = '',
): Promise<{ id: string; key: string; label: string; createdAt: number }> {
  const encKey = await loadEncKey(dataDir);
  const id = crypto.randomBytes(8).toString('hex');
  const secret = crypto.randomBytes(32).toString('base64url');
  const rawKey = `${KEY_PREFIX}${secret}`;
  const { encrypted, iv, authTag } = encrypt(rawKey, encKey);
  const entry: McpKey = {
    id,
    keyPrefix: rawKey.slice(0, 12),
    encryptedKey: encrypted,
    iv,
    authTag,
    keyHash: hashKey(rawKey),
    label,
    createdAt: Date.now(),
  };
  // Enforce 1-key limit: atomically replace any existing keys.
  await lockedWrite(dataDir, async (_keys) => [entry]);
  return { id, key: rawKey, label, createdAt: entry.createdAt };
}

export async function listMcpKeys(
  dataDir: string,
): Promise<
  Array<{ id: string; keyPrefix: string; label: string; createdAt: number }>
> {
  const keys = await readStore(dataDir);
  return keys.map(({ id, keyPrefix, label, createdAt }) => ({
    id,
    keyPrefix,
    label,
    createdAt,
  }));
}

export async function revealMcpKey(
  dataDir: string,
  id: string,
): Promise<{ key: string; label: string; createdAt: number } | null> {
  const keys = await readStore(dataDir);
  const entry = keys.find((k) => k.id === id);
  if (!entry) return null;
  const encKey = await loadEncKey(dataDir);
  try {
    const rawKey = decrypt(entry.encryptedKey, entry.iv, entry.authTag, encKey);
    return { key: rawKey, label: entry.label, createdAt: entry.createdAt };
  } catch {
    throw new Error('Failed to decrypt MCP key — encryption key may have changed');
  }
}

export async function revokeMcpKey(
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

export async function clearAllMcpKeys(dataDir: string): Promise<void> {
  await lockedWrite(dataDir, async () => []);
}

export async function allMcpKeyHashes(
  dataDir: string,
): Promise<string[]> {
  const cached = cachedHashesByDir.get(dataDir);
  if (cached !== undefined) return cached;
  const keys = await readStore(dataDir);
  const hashes = keys.map((k) => k.keyHash);
  cachedHashesByDir.set(dataDir, hashes);
  return hashes;
}

export function verifyMcpKey(
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
