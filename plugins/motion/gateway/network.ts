import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Modality } from '../shared/gateway.ts';

export class ProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) { super(message); this.status = status; }
}
export type Fetcher = typeof fetch;
export async function apiJson(fetcher: Fetcher, url: string, init: RequestInit = {}) {
  const response = await fetcher(url, { ...init, redirect: 'error', signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(15_000) });
  // Do not forward provider response text: it may echo a key or user input.
  if (!response.ok) throw new ProviderError(`Provider HTTP ${response.status}${response.status === 401 || response.status === 403 ? ': credentials or permissions rejected' : ''}`, response.status);
  const body = await response.text();
  if (body.length > 16 * 1024 * 1024) throw new Error('Provider response exceeds 16 MB');
  try { return JSON.parse(body); } catch { throw new Error('Provider returned invalid JSON'); }
}
function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254)
      && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127);
  }
  // Global unicast only; disallow IPv4-mapped, loopback and link-local addresses.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address);
}
export const MAX_MEDIA_BYTES = 256 * 1024 * 1024;
/** Download without credentials; pin validated DNS answers to prevent rebinding. */
export async function downloadMedia(raw: string, signal: AbortSignal, redirects = 0): Promise<Buffer> {
  if (raw.startsWith('data:')) {
    const match = /^data:(?:image|video|audio)\/[\w.+-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(raw);
    if (!match || match[1].length > MAX_MEDIA_BYTES * 1.4) throw new Error('Invalid or oversized media data URL');
    return Buffer.from(match[1], 'base64');
  }
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Generated media must use public HTTPS');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('Generated media points to a non-public address');
  return new Promise<Buffer>((resolve, reject) => {
    const req = https.get(url, { signal, lookup: (_host, options, done) => {
      if ((options as { all?: boolean }).all) (done as Function)(null, addresses);
      else done(null, addresses[0].address, addresses[0].family);
    } }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= 3) { reject(new Error('Too many media redirects')); return; }
        downloadMedia(new URL(res.headers.location, url).href, signal, redirects + 1).then(resolve, reject); return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`Media download HTTP ${res.statusCode}`)); return; }
      if (Number(res.headers['content-length'] || 0) > MAX_MEDIA_BYTES) { res.destroy(); reject(new Error('Generated media exceeds 256 MB')); return; }
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > MAX_MEDIA_BYTES) res.destroy(new Error('Generated media exceeds 256 MB')); else chunks.push(chunk); });
      res.on('error', reject); res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(60_000, () => req.destroy(new Error('Media download timed out'))); req.on('error', reject);
  });
}
export function mediaType(bytes: Buffer, modality: Modality) {
  const head = bytes.subarray(0, 16), ascii = head.toString('ascii');
  const candidates = [
    [head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'image/png', 'png'],
    [head[0] === 255 && head[1] === 216 && head[2] === 255, 'image/jpeg', 'jpg'],
    [ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP', 'image/webp', 'webp'],
    [/^GIF8[79]a/.test(ascii), 'image/gif', 'gif'],
    [ascii.slice(4, 8) === 'ftyp', modality === 'audio' ? 'audio/mp4' : 'video/mp4', modality === 'audio' ? 'm4a' : 'mp4'],
    [head.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')), modality === 'audio' ? 'audio/webm' : 'video/webm', 'webm'],
    [ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE', 'audio/wav', 'wav'],
    [ascii.startsWith('ID3') || (head[0] === 255 && (head[1] & 0xe0) === 0xe0), 'audio/mpeg', 'mp3'],
    [ascii.startsWith('OggS'), 'audio/ogg', 'ogg'], [ascii.startsWith('fLaC'), 'audio/flac', 'flac'],
  ] as const;
  const match = candidates.find(([matches, mime]) => matches && mime.startsWith(modality + '/'));
  if (!match || bytes.length < 24 || bytes.length > MAX_MEDIA_BYTES) throw new Error(`Provider did not return valid ${modality} media`);
  return { mimeType: match[1], extension: match[2] };
}
