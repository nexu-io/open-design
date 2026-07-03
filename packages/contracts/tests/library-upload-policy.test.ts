// The Library's manual-upload format policy: design-relevant resources are
// accepted (images, fonts, text family, JSON/design data) and media (audio /
// video) and other binaries are turned away. This pure policy is the single
// source both the daemon ingest guard and the web upload UI run, so locking it
// down here covers both surfaces.

import { describe, expect, it } from 'vitest';
import {
  LIBRARY_UPLOAD_MAX_BYTES,
  isLibraryUploadMimeAllowed,
  libraryUploadAcceptAttr,
} from '../src/api/library.js';

describe('library upload policy', () => {
  it('accepts design-relevant MIME types', () => {
    for (const mime of [
      'image/png',
      'image/jpeg',
      'image/svg+xml',
      'image/avif',
      'font/woff2',
      'application/font-woff',
      'text/plain',
      'text/html',
      'text/css',
      'text/markdown',
      'application/json',
      'application/ld+json',
      'application/vnd.api+json',
      'image/vnd.microsoft.icon',
    ]) {
      expect(isLibraryUploadMimeAllowed(mime), mime).toBe(true);
    }
  });

  it('rejects audio and video outright', () => {
    for (const mime of ['audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm', 'video/quicktime']) {
      expect(isLibraryUploadMimeAllowed(mime, 'clip.mp4'), mime).toBe(false);
    }
  });

  it('rejects other unrelated binaries', () => {
    expect(isLibraryUploadMimeAllowed('application/zip', 'a.zip')).toBe(false);
    expect(isLibraryUploadMimeAllowed('application/pdf', 'a.pdf')).toBe(false);
    expect(isLibraryUploadMimeAllowed('application/x-msdownload', 'a.exe')).toBe(false);
  });

  it('falls back to the extension when MIME is missing or octet-stream', () => {
    // Browsers/CLIs often report no type for these.
    expect(isLibraryUploadMimeAllowed(undefined, 'tokens.json')).toBe(true);
    expect(isLibraryUploadMimeAllowed('', 'styles.css')).toBe(true);
    expect(isLibraryUploadMimeAllowed('application/octet-stream', 'notes.md')).toBe(true);
    // …but an unknown/blocked extension with no usable MIME is still refused.
    expect(isLibraryUploadMimeAllowed('application/octet-stream', 'movie.mp4')).toBe(false);
    expect(isLibraryUploadMimeAllowed(undefined, 'design.fig')).toBe(false);
    expect(isLibraryUploadMimeAllowed(undefined, undefined)).toBe(false);
  });

  it('lets an explicit media MIME override an innocent-looking extension', () => {
    expect(isLibraryUploadMimeAllowed('video/mp4', 'thumbnail.png')).toBe(false);
  });

  it('exposes a non-trivial size ceiling and a populated accept attribute', () => {
    expect(LIBRARY_UPLOAD_MAX_BYTES).toBeGreaterThan(1_000_000);
    const accept = libraryUploadAcceptAttr();
    expect(accept).toContain('image/*');
    expect(accept).toContain('.json');
    expect(accept).not.toContain('audio/');
    expect(accept).not.toContain('video/');
  });
});
