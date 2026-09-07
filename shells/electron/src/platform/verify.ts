import { realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative } from "node:path";

// Bundled as platform-check.cjs. The physical carrier owns this product probe.
const root = dirname(process.argv[1]!);
const load = createRequire(join(root, "package.json"));

async function verify(): Promise<void> {
  const paths = [process.execPath, load.resolve("better-sqlite3"), load.resolve("node-pty")];
  const platformRoot = await realpath(root);
  async function assertLocal(path: string): Promise<void> {
    const local = relative(platformRoot, await realpath(path));
    if (isAbsolute(local) || local === ".." || local.startsWith("../") || local.startsWith("..\\")) throw new Error("native runtime escaped physical platform");
  }
  await Promise.all(paths.map(assertLocal));
  const Database = load("better-sqlite3") as new (path: string) => { prepare(sql: string): { get(): { answer: number } }; close(): void };
  const db = new Database(":memory:");
  let sqlite: number;
  try { sqlite = db.prepare("select 42 as answer").get().answer; } finally { db.close(); }
  if (sqlite !== 42) throw new Error("SQLite probe failed");
  const pty = load("node-pty") as { spawn(command: string, args: string[], options: unknown): {
    onData(callback: (data: string) => void): void; onExit(callback: (event: { exitCode: number }) => void): void; kill(): void;
  } };
  const nativePaths = Object.keys(load.cache).filter(path => path.endsWith(".node")).sort();
  if (nativePaths.length < 2) throw new Error("native addon probes did not load both addons");
  await Promise.all(nativePaths.map(assertLocal));
  const child = pty.spawn(process.execPath, ["-e", "process.stdout.write('shell-native-ready')"], { cols: 80, rows: 24, env: process.env });
  const output = await new Promise<string>((resolve, reject) => {
    let data = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error("PTY probe timed out")); }, 5_000);
    child.onData(chunk => { data += chunk; });
    child.onExit(({ exitCode }) => { clearTimeout(timeout); exitCode === 0 ? resolve(data) : reject(new Error(`PTY probe exited ${exitCode}`)); });
  });
  if (output !== "shell-native-ready") throw new Error("PTY output mismatch");
  process.stdout.write(JSON.stringify({ node: process.versions.node, abi: process.versions.modules, executable: paths[0], sqlite, pty: output, sqlitePath: paths[1], ptyPath: paths[2], nativePaths }));
}
void verify().catch(error => { console.error(error); process.exitCode = 1; });
