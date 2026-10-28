import fs from 'node:fs';
import path from 'node:path';
import type { WorkspaceDirectoryItem } from '@open-design/contracts';

type Identity = { profile: string; apiUrl: string; userId: string };

/** Last successful membership directory per local account, for offline Team reads. */
export function createTeamMembershipSnapshotStore(dataDir: string) {
  const file = path.join(dataDir, 'team-memberships.json');
  function read(): Record<string, Record<string, string>> {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, Record<string, string>> : {};
    } catch { return {}; }
  }
  function key(identity: Identity) { return JSON.stringify([identity.profile, identity.apiUrl, identity.userId]); }
  function write(entries: Record<string, Record<string, string>>): void {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entries), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  return {
    has(identity: Identity, workspaceId: string): boolean {
      const workspaces = read()[key(identity)];
      return !!workspaces && !Array.isArray(workspaces) && typeof workspaces[workspaceId] === 'string' && !!workspaces[workspaceId];
    },
    member(identity: Identity, workspaceId: string): string | null {
      const workspaces = read()[key(identity)];
      const member = workspaces && !Array.isArray(workspaces) ? workspaces[workspaceId] : null;
      return typeof member === 'string' && member ? member : null;
    },
    remove(identity: Identity): void {
      const entries = read();
      delete entries[key(identity)];
      write(entries);
    },
    forget(identity: Identity, workspaceId: string): void {
      const entries = read();
      const workspaces = entries[key(identity)];
      if (!workspaces || Array.isArray(workspaces) || !(workspaceId in workspaces)) return;
      delete workspaces[workspaceId];
      if (Object.keys(workspaces).length === 0) delete entries[key(identity)];
      write(entries);
    },
    save(identity: Identity, items: WorkspaceDirectoryItem[]): void {
      const entries = read();
      entries[key(identity)] = Object.fromEntries(items.filter(item => item.workspaceType === 'team'
        && item.memberStatus === 'active' && item.lifecycleState !== 'deleted' && item.workspaceMemberId)
        .map(item => [item.workspaceId, item.workspaceMemberId]));
      write(entries);
    },
  };
}
