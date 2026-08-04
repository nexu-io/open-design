import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  getInitialProjectConversation,
  insertConversation,
  insertProject,
  openDatabase,
} from '../src/db.js';

describe('getInitialProjectConversation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-project-conversation-order-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('uses insertion order when conversations share a creation timestamp', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'project-1',
      name: 'Project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'z-seeded-conversation',
      projectId: 'project-1',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'a-later-conversation',
      projectId: 'project-1',
      createdAt: now,
      updatedAt: now + 60_000,
    });

    expect(getInitialProjectConversation(db, 'project-1')?.id).toBe(
      'z-seeded-conversation',
    );
  });
});
