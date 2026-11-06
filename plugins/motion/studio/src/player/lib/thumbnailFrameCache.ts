/** One decoded video frame, shared by every strip of its source that accepts it. */
export interface SharedFrame {
  url: string;
  decodedAt: number;
  bytes: number;
  users: number;
}

export interface HeldFrame {
  key: string;
  frame: SharedFrame;
}

const sharedFrames = new Map<string, SharedFrame[]>();
// Frames no strip shows, least recently released first; their URLs stay valid until evicted.
const released = new Map<SharedFrame, string>();
let releasedBytes = 0;

function use(frame: SharedFrame): SharedFrame {
  if (frame.users++ === 0 && released.delete(frame)) releasedBytes -= frame.bytes;
  return frame;
}

export function takeSharedFrame(
  key: string,
  accepts: (decodedAt: number) => boolean,
): SharedFrame | undefined {
  const frame = sharedFrames.get(key)?.find((shared) => accepts(shared.decodedAt));
  return frame && use(frame);
}

export function shareFrame(
  key: string,
  decodedAt: number,
  url: string,
  bytes: number,
): SharedFrame {
  const frames = sharedFrames.get(key) ?? [];
  const existing = frames.find((shared) => shared.decodedAt === decodedAt);
  if (existing) {
    URL.revokeObjectURL(url);
    return use(existing);
  }
  const frame = { url, decodedAt, bytes, users: 1 };
  sharedFrames.set(key, [...frames, frame]);
  return frame;
}

function evict(frame: SharedFrame, key: string): void {
  released.delete(frame);
  releasedBytes -= frame.bytes;
  const rest = sharedFrames.get(key)?.filter((shared) => shared !== frame) ?? [];
  if (rest.length > 0) sharedFrames.set(key, rest);
  else sharedFrames.delete(key);
  URL.revokeObjectURL(frame.url);
}

/** Ends these holds; a frame nobody holds stays shared until released frames pass `budgetBytes`. */
export function releaseSharedFrames(held: HeldFrame[], budgetBytes: number): void {
  for (const { key, frame } of held.splice(0)) {
    if (--frame.users > 0) continue;
    released.set(frame, key);
    releasedBytes += frame.bytes;
  }
  for (const [frame, key] of released) {
    if (releasedBytes <= budgetBytes) break;
    evict(frame, key);
  }
}
