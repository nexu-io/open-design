import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { detectMime } from '../library.js';
import { mimeFor } from '../projects.js';
import { MAX_CHAT_IMAGE_BYTES } from './chat-prompt-inputs.js';

const CODEX_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function isCodexPromptImage(mime: string, sizeBytes: number): boolean {
  return CODEX_IMAGE_MIMES.has(mime) && sizeBytes <= MAX_CHAT_IMAGE_BYTES;
}

export async function resolveCodexPromptImages(
  attachments: readonly string[],
  uploadedImages: readonly string[],
  resolveAttachment: (name: string) => string | Promise<string>,
): Promise<string[]> {
  const images = new Set<string>();
  for (const attachment of attachments) {
    if (!CODEX_IMAGE_MIMES.has(mimeFor(attachment))) continue;
    try {
      const filePath = await resolveAttachment(attachment);
      if (images.has(filePath)) continue;
      const info = await stat(filePath);
      if (!info.isFile() || info.size > MAX_CHAT_IMAGE_BYTES) continue;
      const file = await open(filePath, 'r');
      try {
        const header = Buffer.alloc(12);
        const { bytesRead } = await file.read(header, 0, header.length, 0);
        if (isCodexPromptImage(detectMime(header.subarray(0, bytesRead)), info.size)) images.add(filePath);
      } finally {
        await file.close();
      }
    } catch {
      // Keep the project-file reference when native image input is unavailable.
    }
  }
  for (const imagePath of uploadedImages) images.add(path.resolve(imagePath));
  return [...images];
}
