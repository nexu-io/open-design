import { describe, expect, it } from 'vitest';

import {
  AUTHOR_DISPLAY_NAME_MAX_LENGTH,
  AUTHOR_KEY_HEX_LENGTH,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  SHARE_AUTHOR_KINDS,
  SHARE_COMMENT_ERROR_CODES,
  SHARE_COMMENT_EVENT_TYPES,
  SHARE_COMMENT_MAX_BYTES,
  SHARE_COMMENT_PAGE_LIMIT,
  SHARE_COMMENT_VALIDATION_ORDER,
  SHARE_MAX_TOTAL_BYTES,
  SHARE_STATUSES,
  SHARE_COMMENT_TERMINAL_REJECTION,
  VELA_CLI_FAILURE_ENVELOPE_FIELDS,
  SHARE_URL_PATH_SEGMENT,
  SHARE_COMMENTS_PATH_PREFIX,
  SHARE_SNAPSHOT_DISCOVERY_IN_P0,
  buildShareCommentsUrl,
  hasUnreadComments,
  buildSharePath,
  hasActiveShare,
  isValidAuthorKey,
  isValidIdempotencyKey,
  parseSharePath,
  resolveAuthorDisplayName,
} from '../src/api/share';
import type { ProjectShareState } from '../src/api/share';

/**
 * Stage 0, Z3 — the frozen half of the share contract.
 *
 * Every assertion here exists because FOUR lanes that cannot see each other's
 * code depend on the value being what it is. A test failing in this file is
 * not "a test needs updating": it means a cross-repo seam moved, and the vela
 * mirror plus the three other lanes move with it or they silently disagree.
 */
describe('share contract · addressing', () => {
  it('builds the frozen /artifact/{projectId}/{slug} path', () => {
    expect(buildSharePath({ projectId: 'proj_123', slug: 'abc-def' })).toBe(
      '/artifact/proj_123/abc-def',
    );
    expect(SHARE_URL_PATH_SEGMENT).toBe('artifact');
  });

  it('round-trips a path through parse', () => {
    const parts = { projectId: 'proj_123', slug: 'abc-def' };
    expect(parseSharePath(buildSharePath(parts))).toEqual(parts);
  });

  it('percent-encodes segments so an id containing a slash cannot forge a path', () => {
    const path = buildSharePath({ projectId: 'a/b', slug: 'c' });
    expect(path).toBe('/artifact/a%2Fb/c');
    expect(parseSharePath(path)).toEqual({ projectId: 'a/b', slug: 'c' });
  });

  it('rejects anything that is not exactly three segments', () => {
    expect(parseSharePath('/artifact/proj')).toBeNull();
    expect(parseSharePath('/artifact/proj/slug/extra')).toBeNull();
    expect(parseSharePath('/other/proj/slug')).toBeNull();
    expect(parseSharePath('/')).toBeNull();
  });

  it('rejects a malformed percent-escape instead of throwing', () => {
    expect(parseSharePath('/artifact/%E0%A4%A/slug')).toBeNull();
  });

  /**
   * The deployment mounts the app under /cloud/, but that prefix belongs to
   * the deployment, not the route. If it ever leaks into the builder, every
   * environment that mounts the app elsewhere gets a wrong link — and the
   * round-trip above would still pass, because parse would learn the same
   * mistake. So it is asserted directly.
   */
  it('leaves the deployment base path out of the built path', () => {
    const path = buildSharePath({ projectId: 'p', slug: 's' });
    expect(path.startsWith('/artifact/')).toBe(true);
    expect(path).not.toContain('/cloud/');
  });

  /**
   * Two segments are two independent public inputs, so a well-formed path
   * proves nothing about whether the pair belongs together. Parsing must stay
   * purely syntactic: the moment it looks like it validates a pair, a caller
   * will treat a non-null result as authorization.
   */
  it('parses a mismatched pair without complaint — pairing is the server\'s job', () => {
    expect(parseSharePath('/artifact/project-a/slug-belonging-to-project-b')).toEqual({
      projectId: 'project-a',
      slug: 'slug-belonging-to-project-b',
    });
  });
});

describe('share contract · author identity', () => {
  it('freezes the author-kind union to the two database check-constraint arms', () => {
    expect([...SHARE_AUTHOR_KINDS]).toEqual(['member', 'user']);
  });

  it('accepts a 64-char lowercase hex author key and nothing else', () => {
    const key = 'a'.repeat(AUTHOR_KEY_HEX_LENGTH);
    expect(AUTHOR_KEY_HEX_LENGTH).toBe(64);
    expect(isValidAuthorKey(key)).toBe(true);
    expect(isValidAuthorKey(key.toUpperCase())).toBe(false);
    expect(isValidAuthorKey('a'.repeat(63))).toBe(false);
    expect(isValidAuthorKey('a'.repeat(65))).toBe(false);
    expect(isValidAuthorKey('')).toBe(false);
    expect(isValidAuthorKey(`${'a'.repeat(63)}z`)).toBe(false);
  });

  it('resolves display name stamped-first, then directory, then null', () => {
    expect(resolveAuthorDisplayName({ stamped: 'Ada', directory: 'Grace' })).toBe('Ada');
    expect(resolveAuthorDisplayName({ stamped: '  ', directory: 'Grace' })).toBe('Grace');
    expect(resolveAuthorDisplayName({})).toBeNull();
    expect(resolveAuthorDisplayName({ stamped: null, directory: null })).toBeNull();
  });

  it('truncates a display name at the frozen ceiling on BOTH ladder rungs', () => {
    const long = 'x'.repeat(AUTHOR_DISPLAY_NAME_MAX_LENGTH + 10);
    expect(resolveAuthorDisplayName({ stamped: long })).toHaveLength(
      AUTHOR_DISPLAY_NAME_MAX_LENGTH,
    );
    expect(resolveAuthorDisplayName({ directory: long })).toHaveLength(
      AUTHOR_DISPLAY_NAME_MAX_LENGTH,
    );
  });
});

describe('share contract · idempotency (D131)', () => {
  it('bounds the key and rejects an empty one', () => {
    expect(isValidIdempotencyKey(crypto.randomUUID())).toBe(true);
    expect(isValidIdempotencyKey('')).toBe(false);
    expect(isValidIdempotencyKey('k'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH))).toBe(true);
    expect(isValidIdempotencyKey('k'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1))).toBe(false);
  });

  it('fits a v4 UUID, which is what both ends generate', () => {
    expect(crypto.randomUUID().length).toBeLessThanOrEqual(IDEMPOTENCY_KEY_MAX_LENGTH);
  });
});

describe('share contract · share state', () => {
  it('freezes the status union', () => {
    expect([...SHARE_STATUSES]).toEqual(['none', 'preparing', 'active', 'stopped']);
  });

  /**
   * D142. The lifecycle must stay a four-state enum living in ONE place.
   *
   * Two lanes each built a share store; one carried `status`, the other an
   * `enabled` boolean. Two stop switches, nothing keeping them equal — stop
   * through one path and the page still serves content while comments answer
   * 410 Gone. Both halves passed their own tests.
   *
   * These two assertions pin the property that makes a boolean unable to
   * stand in: `none` and `stopped` are BOTH not-live, yet must stay
   * distinguishable, because "stopped" is what lets the same slug resume.
   * Collapse the union to two states and this goes red.
   */
  it('keeps `none` and `stopped` distinct although neither is live', () => {
    const state = (status: ProjectShareState['status']): ProjectShareState => ({
      projectId: 'p',
      status,
    });
    expect(hasActiveShare(state('none'))).toBe(hasActiveShare(state('stopped')));
    expect(state('none').status).not.toBe(state('stopped').status);
    // A boolean lifecycle has at most two values; this one must not.
    expect(new Set(SHARE_STATUSES).size).toBeGreaterThan(2);
  });

  /**
   * D147. The CLI failure envelope's field names, pinned because the two
   * halves disagreed and neither side's tests could see it.
   */
  it('names the CLI failure envelope fields the way the batch path shipped them', () => {
    expect(VELA_CLI_FAILURE_ENVELOPE_FIELDS.code).toBe('errorCode');
    expect(VELA_CLI_FAILURE_ENVELOPE_FIELDS.status).toBe('status');
    expect(VELA_CLI_FAILURE_ENVELOPE_FIELDS.message).toBe('error');
    // The prose field must never be the one carrying the decision.
    expect(VELA_CLI_FAILURE_ENVELOPE_FIELDS.message).not.toBe(
      VELA_CLI_FAILURE_ENVELOPE_FIELDS.code,
    );
  });

  it('requires both halves of the terminal rejection', () => {
    expect(SHARE_COMMENT_TERMINAL_REJECTION).toEqual({ status: 410, code: 'SHARE_STOPPED' });
    // `SHARE_STOPPED` must remain a real member of the error union, not a
    // free-floating string this constant invented.
    expect(SHARE_COMMENT_ERROR_CODES).toContain(SHARE_COMMENT_TERMINAL_REJECTION.code);
  });

  it('treats only `active` as a live share', () => {
    const state = (status: ProjectShareState['status']): ProjectShareState => ({
      projectId: 'p',
      status,
    });
    expect(hasActiveShare(state('active'))).toBe(true);
    expect(hasActiveShare(state('preparing'))).toBe(false);
    expect(hasActiveShare(state('stopped'))).toBe(false);
    expect(hasActiveShare(state('none'))).toBe(false);
    expect(hasActiveShare(null)).toBe(false);
    expect(hasActiveShare(undefined)).toBe(false);
  });

  it('keeps the S15 ceiling at 20 MB', () => {
    expect(SHARE_MAX_TOTAL_BYTES).toBe(20 * 1024 * 1024);
  });
});

describe('share contract · comment API (I4)', () => {
  it('freezes the event-type union at four shapes', () => {
    expect([...SHARE_COMMENT_EVENT_TYPES]).toEqual(['create', 'update', 'delete', 'status']);
  });

  it('freezes the four-step validation order (D58 as narrowed by D97)', () => {
    expect([...SHARE_COMMENT_VALIDATION_ORDER]).toEqual([
      'UNAUTHENTICATED',
      'SHARE_STOPPED',
      'INVALID_COMMENT',
      'RATE_LIMITED',
    ]);
  });

  it('keeps every ordered step inside the declared code table', () => {
    for (const code of SHARE_COMMENT_VALIDATION_ORDER) {
      expect(SHARE_COMMENT_ERROR_CODES).toContain(code);
    }
  });

  it('checks the session before revealing whether a share exists', () => {
    const order = SHARE_COMMENT_VALIDATION_ORDER;
    expect(order.indexOf('UNAUTHENTICATED')).toBeLessThan(order.indexOf('SHARE_STOPPED'));
  });

  it('throttles only after the body has been judged valid', () => {
    const order = SHARE_COMMENT_VALIDATION_ORDER;
    expect(order.indexOf('INVALID_COMMENT')).toBeLessThan(order.indexOf('RATE_LIMITED'));
  });

  it('caps the page at the frozen figure', () => {
    expect(SHARE_COMMENT_PAGE_LIMIT).toBe(500);
  });

  /**
   * Comment length is NOT limited as a product rule — a character cap was
   * proposed three times (200 code points, 1-400 characters, 4000 characters)
   * and rejected each time. What remains is an anti-abuse byte ceiling, and
   * the difference between the two is exactly what this asserts: a byte
   * budget that no client counts against, refused as PAYLOAD_TOO_LARGE rather
   * than as an invalid comment.
   *
   * If someone later reads this as "the limit is 64000 characters" and builds
   * a counter from it, that is the product decision quietly coming back — so
   * the unit is asserted, not just the number.
   */
  it('keeps the body ceiling an anti-abuse BYTE cap, not a character limit', () => {
    expect(SHARE_COMMENT_MAX_BYTES).toBe(64 * 1024);
    // Far beyond anything a person types: ~20k Chinese characters.
    expect(SHARE_COMMENT_MAX_BYTES).toBeGreaterThan(4000 * 3);
    // The overflow answer is a transport refusal, not a validation verdict.
    expect(SHARE_COMMENT_ERROR_CODES).toContain('PAYLOAD_TOO_LARGE');
    // ...and it is deliberately absent from the validation ORDER, because it
    // is not one of the four checks a comment body goes through.
    expect(SHARE_COMMENT_VALIDATION_ORDER).not.toContain('PAYLOAD_TOO_LARGE');
  });
});

describe('share contract · public HTTP seam', () => {
  it('puts the slug in the path and the project in the query', () => {
    const url = buildShareCommentsUrl({
      slug: 'snap-1',
      projectId: 'proj-1',
      filePath: 'index.html',
    });
    expect(url.startsWith(`${SHARE_COMMENTS_PATH_PREFIX}/snap-1/comments?`)).toBe(true);
    const query = new URLSearchParams(url.split('?')[1]);
    expect(query.get('projectId')).toBe('proj-1');
    expect(query.get('filePath')).toBe('index.html');
    // Absent rather than zero: `since=0` and "no cursor" are the same read
    // today, but sending 0 explicitly invites treating it as a sentinel.
    expect(query.has('since')).toBe(false);
  });

  it('carries the cursor when polling forward', () => {
    const query = new URLSearchParams(
      buildShareCommentsUrl({
        slug: 's', projectId: 'p', filePath: 'f', since: 42,
      }).split('?')[1],
    );
    expect(query.get('since')).toBe('42');
  });

  it('encodes a slug that would otherwise break out of its path segment', () => {
    const url = buildShareCommentsUrl({
      slug: 'a/b', projectId: 'p', filePath: 'f',
    });
    expect(url).toContain('/a%2Fb/comments');
  });

  /**
   * A published snapshot is immutable and re-publishing mints a new slug, so
   * a share link addresses one version forever. P0 has no transport for an
   * open page to discover a newer one, and that is a decision rather than an
   * omission: discovery would let a live share URL start serving different
   * bytes than the person who sent it saw.
   */
  it('records that snapshot discovery is deliberately absent in P0', () => {
    expect(SHARE_SNAPSHOT_DISCOVERY_IN_P0).toBe(false);
  });
});

describe('share contract · comment read state', () => {
  const other = (createdAt: number) => ({ createdAt, author: { authorKey: 'them' } });
  const mine = (createdAt: number) => ({ createdAt, author: { authorKey: 'me' } });

  it('lights the dot for a comment that arrived after the last open', () => {
    expect(hasUnreadComments({
      readState: { projectId: 'p', lastReadAt: 100 },
      comments: [other(101)],
      viewerAuthorKey: 'me',
    })).toBe(true);
  });

  it('stays quiet for a comment that arrived before the last open', () => {
    expect(hasUnreadComments({
      readState: { projectId: 'p', lastReadAt: 100 },
      comments: [other(99)],
      viewerAuthorKey: 'me',
    })).toBe(false);
  });

  /**
   * The condition that gets forgotten. Without it, sending a comment marks
   * your own project unread — the dot lights up for something you just did.
   */
  it('never lights the dot for the viewer\'s own comment', () => {
    expect(hasUnreadComments({
      readState: { projectId: 'p', lastReadAt: 100 },
      comments: [mine(101)],
      viewerAuthorKey: 'me',
    })).toBe(false);
  });

  it('treats a never-opened project as unread once anyone else comments', () => {
    expect(hasUnreadComments({
      readState: undefined,
      comments: [other(1)],
      viewerAuthorKey: 'me',
    })).toBe(true);
    expect(hasUnreadComments({
      readState: undefined,
      comments: [mine(1)],
      viewerAuthorKey: 'me',
    })).toBe(false);
  });

  /**
   * Strict comparison on purpose: a comment written in the same millisecond
   * as the open is far more likely to be what triggered the open than
   * something that arrived after it.
   */
  it('counts a comment arriving exactly at lastReadAt as seen', () => {
    expect(hasUnreadComments({
      readState: { projectId: 'p', lastReadAt: 100 },
      comments: [other(100)],
      viewerAuthorKey: 'me',
    })).toBe(false);
  });

  it('is unread when ANY qualifying comment is, not only the newest', () => {
    expect(hasUnreadComments({
      readState: { projectId: 'p', lastReadAt: 100 },
      comments: [other(101), mine(200)],
      viewerAuthorKey: 'me',
    })).toBe(true);
  });
});
