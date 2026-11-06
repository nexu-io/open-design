// Stable, anonymized artifact identifier shared by the daemon and the web
// bundle. The CSV tracking doc forbids raw file names; this helper hashes
// the (projectId, fileName) pair into a 16-hex string so dashboards can
// group repeat opens / exports of the same artifact without learning the
// real name.
//
// FNV-1a 64-bit was chosen over SHA-256 so the same function can run
// synchronously in browsers (Web Crypto's digest is async) and inside the
// daemon without pulling in either Node's crypto or a hashing dependency
// into @open-design/contracts (which must stay dependency-light). Two
// different (projectId, fileName) pairs producing the same id are a
// dashboard collision, not a security failure — the threat model here is
// privacy of the filename, which FNV-1a addresses just as well as a
// cryptographic hash.

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

export function anonymizeArtifactId(args: {
  projectId: string;
  fileName: string;
}): string {
  const input = `${args.projectId}:${args.fileName}`;
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}
