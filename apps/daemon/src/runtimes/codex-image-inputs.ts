import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { detectMime } from '../library.js';
import { mimeFor, resolveSafeReal } from '../projects.js';
import { MAX_CHAT_IMAGE_BYTES, UPLOAD_DIR } from './chat-prompt-inputs.js';

const CODEX_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function isCodexPromptImage(mime: string, sizeBytes: number): boolean {
  return CODEX_IMAGE_MIMES.has(mime) && sizeBytes <= MAX_CHAT_IMAGE_BYTES;
}

async function addCodexImage(
  images: Set<string>,
  resolvePath: () => string | Promise<string>,
): Promise<void> {
  try {
    const filePath = await resolvePath();
    if (images.has(filePath)) return;
    const info = await stat(filePath);
    if (!info.isFile() || info.size > MAX_CHAT_IMAGE_BYTES) return;
    const file = await open(filePath, 'r');
    try {
      const header = Buffer.alloc(12);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      if (isCodexPromptImage(detectMime(header.subarray(0, bytesRead)), info.size)) images.add(filePath);
    } finally {
      await file.close();
    }
  } catch {
    // Native image input is optional when a selected file cannot be read.
  }
}

export async function resolveCodexUploadedImages(
  uploadedImages: readonly string[],
  uploadRoot = UPLOAD_DIR,
): Promise<string[]> {
  const images = new Set<string>();
  for (const imagePath of uploadedImages) {
    await addCodexImage(images, () => resolveSafeReal(uploadRoot, path.relative(uploadRoot, imagePath)));
  }
  return [...images];
}

export async function resolveCodexPromptImages(
  attachments: readonly string[],
  verifiedUploads: readonly string[],
  resolveAttachment: (name: string) => string | Promise<string>,
): Promise<string[]> {
  const images = new Set<string>();
  for (const attachment of attachments) {
    if (!CODEX_IMAGE_MIMES.has(mimeFor(attachment))) continue;
    await addCodexImage(images, () => resolveAttachment(attachment));
  }
  for (const imagePath of verifiedUploads) images.add(imagePath);
  return [...images];
}
