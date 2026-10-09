import { expect, it } from 'vitest';
import type { SharePublishReceipt, SharePublishResponse } from '../src/api/share.js';

const receipt: SharePublishReceipt = { filePath: 'index.html', slug: 'a863b8d7-cc55-465a-a359-435bd3ef4919', publishedAt: 1, version: 1, versionId: 'v1', entryPath: 'index.html' };
const unavailable = { status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' } as const;

it('published without presentation origin is a successful receipt, not an error or a guessed link', () => {
  const result: SharePublishResponse = { status: 'published', receipt, link: unavailable };
  expect(result.status).toBe('published'); expect(result.receipt).toBe(receipt);
  expect(result).not.toHaveProperty('url'); expect(result).not.toHaveProperty('error');
});
it('binding progress and presentation availability remain independently expressible', () => {
  const result: SharePublishResponse = { status: 'binding_pending', receipt, binding: { retrying: true }, link: unavailable };
  expect(result.binding.retrying).toBe(true); expect(result.link?.status).toBe('unavailable');
  expect(result).not.toHaveProperty('url');
});

// Checked by contracts' test tsconfig, not merely Vitest's transpiler.
// @ts-expect-error Missing origin cannot also promise a usable copy target.
const contradictory: SharePublishResponse = { status: 'published', receipt, url: 'https://other.example.test', link: unavailable };
// @ts-expect-error A missing receipt is a failure, not this successful no-link branch.
const failed: SharePublishResponse = { status: 'published', link: unavailable };
void contradictory; void failed;
