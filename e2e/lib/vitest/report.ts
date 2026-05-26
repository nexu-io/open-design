import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';

export type ReportBlob = ArrayBuffer | Blob | string | Uint8Array;

export type ReportEntry = {
  bytes: number;
  path: string;
  relpath: string;
};

export type E2eReport = {
  root: string;
  json: (relpath: string, value: unknown) => Promise<ReportEntry>;
  save: (relpath: string, blob: ReportBlob) => Promise<ReportEntry>;
};

export async function createReport(root: string): Promise<E2eReport> {
  await mkdir(root, { recursive: true });

  async function save(relpath: string, blob: ReportBlob): Promise<ReportEntry> {
    const safeRelpath = assertRelativeReportPath(relpath);
    const outputPath = join(root, safeRelpath);
    const content = await normalizeBlob(blob);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content);
    return {
      bytes: typeof content === 'string' ? Buffer.byteLength(content) : content.byteLength,
      path: outputPath,
      relpath: safeRelpath,
    };
  }

  return {
    root,
    json: (relpath, value) => save(relpath, `${JSON.stringify(value, null, 2)}\n`),
    save,
  };
}

export function assertRelativeReportPath(relpath: string): string {
  const unixName = relpath.replace(/\\/g, '/');
  if (unixName.includes('\0') || unixName.startsWith('/') || /^[A-Za-z]:\//.test(unixName)) {
    throw new Error(`report path must be relative: ${relpath}`);
  }
  const normalized = posix.normalize(unixName);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`report path must not escape report root: ${relpath}`);
  }
  return normalized;
}

async function normalizeBlob(blob: ReportBlob): Promise<Buffer | string> {
  if (typeof blob === 'string') return blob;
  if (blob instanceof Uint8Array) return Buffer.from(blob);
  if (blob instanceof ArrayBuffer) return Buffer.from(blob);
  return Buffer.from(await blob.arrayBuffer());
}
