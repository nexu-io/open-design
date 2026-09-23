import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SHARE_COMMENT_TERMINAL_REJECTION,
  VELA_CLI_FAILURE_ENVELOPE_FIELDS,
  type CollabCloudComment,
} from '@open-design/contracts';
import { CollabCloudError } from '../src/integrations/collab-cloud.js';

import {
  collabCloudErrorFromVelaFailure,
  createVelaCliCollabClient,
} from '../src/collab/vela-cli-collab-client.js';

describe('Vela CLI collaboration client inbound comments', () => {
  it('maps authoritative nested author key into the local cloud merge contract', async () => {
    const key = 'b'.repeat(64);
    const client = createVelaCliCollabClient({ run: async () => JSON.stringify({
      comments: [{ id: 'visitor', authorKind: 'user', authorAppUserId: 'account',
        author: { authorKey: key, displayName: 'Visitor' } }], latestSeq: 1,
    }) });
    const result = await client.pullComments('personal-ws', 'p', 0);
    expect(result.comments[0]).toMatchObject({ authorKey: key, authorDisplayName: 'Visitor' });
    expect(result.comments[0]?.authorAppUserId).toBe('account');
  });
  it.each(['team-space', 'personal-space'])('requests both author kinds without rewriting their identities in %s', async (workspaceId) => {
    const comments = [
      { id: 'member-comment', authorKind: 'member', memberId: 'same-id', authorAppUserId: null },
      { id: 'web-comment', authorKind: 'user', memberId: '', authorAppUserId: 'same-id' },
    ];
    const calls: Array<{ args: string[]; workspaceId: string | undefined }> = [];
    const client = createVelaCliCollabClient({
      run: async (args, workspaceId) => {
        calls.push({ args, workspaceId });
        return JSON.stringify({ comments, latestSeq: 19 });
      },
    });

    const result = await client.pullComments(workspaceId, 'project-1', 17);

    expect(calls).toEqual([{
      args: ['comment', 'pull', 'project-1', '--since-seq', '17', '--author-kinds', 'member,user'],
      workspaceId,
    }]);
    expect(result).toEqual({ comments, latestSeq: 19, notModified: false, etag: null });
  });
});

describe('Vela CLI collaboration client failures', () => {
  it('rejects malformed pull output instead of treating it as an empty successful batch', async () => {
    const client = createVelaCliCollabClient({ run: async () => '{' });
    const failure = await client.pullComments('team-1', 'p1', 17).catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: 'Invalid JSON from Vela collaboration command' });
    expect(failure).toHaveProperty('cause', expect.any(SyntaxError));
  });
  it('preserves the captured root errorCode failure emitted by Vela CLI source 927e0a62e7', async () => {
    const stdout = readFileSync(
      new URL('./fixtures/vela-cli-comment-push-share-stopped-927e0a62e7.stdout.json', import.meta.url),
      'utf8',
    );
    const wire = JSON.parse(stdout) as Record<string, unknown>;
    expect(wire[VELA_CLI_FAILURE_ENVELOPE_FIELDS.status]).toBe(SHARE_COMMENT_TERMINAL_REJECTION.status);
    expect(wire[VELA_CLI_FAILURE_ENVELOPE_FIELDS.code]).toBe(SHARE_COMMENT_TERMINAL_REJECTION.code);
    const client = createVelaCliCollabClient({
      run: async () => { throw Object.assign(new Error('the message is not a classifier'), { stdout }); },
    });

    const failure = await client.pushComment('team-1', 'p1', {} as CollabCloudComment).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CollabCloudError);
    expect(failure).toMatchObject({
      name: 'CollabCloudError',
      status: SHARE_COMMENT_TERMINAL_REJECTION.status,
      code: SHARE_COMMENT_TERMINAL_REJECTION.code,
    });
  });

  it('retains the legacy nested error.code envelope', () => {
    expect(collabCloudErrorFromVelaFailure(Object.assign(new Error('not a classifier'), {
      stdout: JSON.stringify({ error: { status: 410, code: 'SHARE_STOPPED', message: 'stopped' } }),
    }))).toMatchObject({ status: 410, code: 'SHARE_STOPPED', message: 'stopped' });
  });

  it('requires structured status and code; malformed JSON and prose fail closed', () => {
    expect(collabCloudErrorFromVelaFailure(Object.assign(new Error('410 SHARE_STOPPED'), {
      stdout: JSON.stringify({ error: { code: 'SHARE_STOPPED' } }),
    }))).toBeNull();
    expect(collabCloudErrorFromVelaFailure(Object.assign(new Error('malformed'), { stdout: '{' }))).toBeNull();
    expect(collabCloudErrorFromVelaFailure(new Error('410 SHARE_STOPPED'))).toBeNull();
  });
});
