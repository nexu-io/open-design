import fs from 'node:fs';

export function detectAvailability(home: string): boolean {
  try {
    return fs.statSync(home).isDirectory();
  } catch {
    return false;
  }
}
