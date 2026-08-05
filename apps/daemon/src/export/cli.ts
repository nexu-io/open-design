import { parseFlags, positionalArgs, type CliFlags } from '../cli-args.js';

const EXPORT_STRING_FLAGS = new Set([
  'daemon-url', 'project', 'format', 'out', 'image-format', 'title', 'file',
]);
const EXPORT_BOOLEAN_FLAGS = new Set(['help', 'h', 'json', 'deck']);
const EXPORT_FORMATS = ['pdf', 'image'] as const;
const EXPORT_IMAGE_FORMATS = ['png', 'jpeg'] as const;

export interface ExportCliDeps {
  resolveDaemonBaseUrl: (flags: CliFlags) => Promise<string>;
  fetch: typeof globalThis.fetch;
  structuredHttpFailure: (response: Response) => Promise<never>;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  log: (text: string) => void;
  printHelp: () => void;
  exit: (code: number) => never;
}

function stringFlag(flags: CliFlags, key: string): string | undefined {
  return typeof flags[key] === 'string' ? flags[key] : undefined;
}

function responseFilename(response: Response): string | undefined {
  const contentDisposition = response.headers.get('content-disposition') || '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  const plain = /filename="([^"]+)"/i.exec(contentDisposition);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return plain?.[1];
    }
  }
  return plain?.[1];
}

export async function runExport(args: readonly string[], deps: ExportCliDeps): Promise<void> {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    deps.printHelp();
    deps.exit(args.length === 0 ? 2 : 0);
  }

  let flags: CliFlags;
  try {
    flags = parseFlags(args, { string: EXPORT_STRING_FLAGS, boolean: EXPORT_BOOLEAN_FLAGS });
  } catch (error: unknown) {
    deps.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    deps.exit(2);
  }

  const file = stringFlag(flags, 'file') ?? positionalArgs(args, EXPORT_STRING_FLAGS)[0];
  const projectId = stringFlag(flags, 'project');
  const format = stringFlag(flags, 'format');
  if (!file || !projectId || !format) {
    deps.printHelp();
    deps.exit(2);
  }
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    deps.writeStderr(`invalid --format: ${format} (expected ${EXPORT_FORMATS.join(' | ')})\n`);
    deps.exit(2);
  }
  const imageFormat = stringFlag(flags, 'image-format');
  if (imageFormat && !(EXPORT_IMAGE_FORMATS as readonly string[]).includes(imageFormat)) {
    deps.writeStderr(`invalid --image-format: ${imageFormat} (expected ${EXPORT_IMAGE_FORMATS.join(' | ')})\n`);
    deps.exit(2);
  }

  const base = await deps.resolveDaemonBaseUrl(flags);
  const response = await deps.fetch(`${base}/api/projects/${encodeURIComponent(projectId)}/export`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName: file,
      format,
      deck: flags.deck === true,
      ...(imageFormat ? { imageFormat } : {}),
      ...(stringFlag(flags, 'title') ? { title: stringFlag(flags, 'title') } : {}),
    }),
  });
  if (!response.ok) return deps.structuredHttpFailure(response);

  const buffer = new Uint8Array(await response.arrayBuffer());
  let outputPath = stringFlag(flags, 'out') ?? responseFilename(response);
  if (!outputPath) {
    const extension = format === 'image' ? (imageFormat === 'jpeg' ? 'jpg' : 'png') : 'pdf';
    outputPath = `artifact.${extension}`;
  }
  await deps.writeFile(outputPath, buffer);
  if (flags.json === true) {
    deps.writeStdout(`${JSON.stringify({ ok: true, out: outputPath, bytes: buffer.length, format }, null, 2)}\n`);
    return;
  }
  deps.log(`wrote ${outputPath} (${buffer.length} bytes)`);
}
