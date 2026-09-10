import { createHash } from "node:crypto";
import { close, constants, fstat, open } from "node:fs";
import { lstat, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// Raw descriptors have process lifetime, not FileHandle GC lifetime. Dropping
// a lease reference must never silently unlock a still-running carrier.
const openFile = promisify(open), closeFile = promisify(close), statFile = promisify(fstat);

export type KernelLeaseIdentity = Readonly<{ domain: string; key: string }>;
export type KernelLease = Readonly<{ release(): Promise<void> }>;

/** Nonwaiting kernel ownership over an opaque identity, not a transport.
 * Callers own transaction scope and retry policy. Protocol v2 requires a
 * stopped-client cutover from the former port-based leases; never mix them. */
export async function tryAcquireKernelLease(identity: KernelLeaseIdentity): Promise<KernelLease | null> {
  if (identity == null || typeof identity !== "object" || Array.isArray(identity)
    || Object.keys(identity).sort().join(",") !== "domain,key"
    || typeof identity.domain !== "string" || !/^[a-z][a-z0-9.-]{0,63}$/.test(identity.domain)
    || typeof identity.key !== "string" || !identity.key || identity.key.length > 8192) {
    throw new Error("invalid kernel lease identity");
  }
  const principal = userInfo();
  const digest = createHash("sha256").update(JSON.stringify([
    "kernel-lease-v2", principal.username, identity.domain, identity.key,
  ])).digest("hex");
  if (process.platform === "darwin") {
    const root = join(principal.homedir, "Library", "Application Support", "kernel-leases", "v2");
    await mkdir(root, { recursive: true, mode: 0o700 });
    const directory = await lstat(root);
    if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== principal.uid || (directory.mode & 0o077) !== 0) {
      throw new Error("kernel lease directory must be private and owned by the current user");
    }
    // Darwin sys/fcntl.h ABI constants, intentionally private to this backend.
    // Node accepts numeric open flags but does not export O_EXLOCK.
    const O_EXLOCK = 0x20, O_CLOEXEC = 0x01000000;
    const flags = constants.O_CREAT | constants.O_RDWR | constants.O_NONBLOCK | constants.O_NOFOLLOW | O_EXLOCK | O_CLOEXEC;
    const handle = await openFile(join(root, `${digest}.lock`), flags, 0o600).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EAGAIN" || error.code === "EWOULDBLOCK") return null;
      throw error;
    });
    if (handle == null) return null;
    try {
      const file = await statFile(handle);
      if (!file.isFile() || file.uid !== principal.uid || file.nlink !== 1 || (file.mode & 0o077) !== 0) {
        throw new Error("kernel lease anchor must be a private regular file");
      }
    } catch (error) { await closeFile(handle); throw error; }
    let releasing: Promise<void> | undefined;
    // Anchors are not cache or owner records. Never unlink/replace them: an
    // existing waiter may still refer to the old inode. Only the fd is authority.
    return Object.freeze({ release() { return releasing ??= closeFile(handle); } });
  }
  if (process.platform !== "win32") throw new Error(`kernel leases are not implemented for ${process.platform}`);
  const server = createServer(socket => socket.destroy());
  const acquired = await new Promise<boolean>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.removeListener("listening", onListening);
      if (error.code === "EADDRINUSE") resolve(false); else reject(error);
    };
    const onListening = () => { server.removeListener("error", onError); resolve(true); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ exclusive: true, path: `\\\\.\\pipe\\kernel-lease-v2-${digest}` });
  });
  if (!acquired) return null;
  let releasing: Promise<void> | undefined;
  return Object.freeze({ release() {
    return releasing ??= new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  } });
}
