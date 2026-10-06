import { randomBytes } from 'node:crypto';

/** Mint the one-time nonce shared by this run's done/next/focus host markers. */
export function mintRunDoneKey(): string {
  return randomBytes(8).toString('hex');
}
