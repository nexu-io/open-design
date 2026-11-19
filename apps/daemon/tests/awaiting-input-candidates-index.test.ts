// Regression (#9563): `GET /api/projects` ran the awaiting-input candidate
// query as a full scan of `messages`, lowercasing every assistant message
// body ever stored on every call, so listing projects slowed linearly with
// total chat history (~400 ms at 80k messages).
//
// The invariant: the candidate queries are served by a partial index holding
// only form-bearing assistant messages, so their cost follows the number of
// question forms, not the size of the history. And the prefilter rewrite that
// makes the index possible must select exactly the rows the old LIKE did.

import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';

import {
  CONVERSATIONS_AWAITING_INPUT_CANDIDATES_SQL,
  PROJECTS_AWAITING_INPUT_CANDIDATES_SQL,
  closeDatabase,
  openDatabase,
} from '../src/db.js';

const tempDirs: string[] = [];

afterEach(() => {
  closeDatabase();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createDb(): Database.Database {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-awaiting-index-'));
  tempDirs.push(dir);
  return openDatabase(dir, { dataDir: path.join(dir, '.od') });
}

function queryPlan(db: Database.Database, sql: string): string[] {
  return (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{ detail: string }>).map(
    (row) => row.detail,
  );
}

for (const [name, sql] of [
  ['projects', PROJECTS_AWAITING_INPUT_CANDIDATES_SQL],
  ['conversations', CONVERSATIONS_AWAITING_INPUT_CANDIDATES_SQL],
] as const) {
  test(`${name} awaiting-input candidates read the partial index, not the whole messages table`, () => {
    const db = createDb();
    const plan = queryPlan(db, sql);
    const messagesStep = plan.find((detail) => /\bm\b/.test(detail));
    assert.ok(messagesStep, `no messages step in plan: ${plan.join(' | ')}`);
    assert.match(messagesStep, /USING INDEX idx_messages_awaiting_input_candidates/);
    // The index is ordered by (created_at, position), so no sort pass either.
    assert.ok(
      !plan.some((detail) => /TEMP B-TREE FOR ORDER BY/.test(detail)),
      `unexpected sort in plan: ${plan.join(' | ')}`,
    );
  });
}

test('instr prefilter selects exactly what the old LOWER(..) LIKE prefilter did', () => {
  const db = createDb();
  const samples = [
    'plain answer',
    '<question-form id="a"></question-form>',
    '<QUESTION-FORM id="b">',
    'text before <Question-Form>',
    '<ask-question>',
    '<ASK-QUESTION title="x">',
    '<question_form>', // underscore is NOT the tag; LIKE must not treat it as `-`
    '<questionxform>',
    'question-form without bracket',
    '< question-form>',
    'ünïcode <question-form> ✓',
    '',
  ];
  const oldLike = db.prepare(
    `SELECT (LOWER(@s) LIKE '%<question-form%' OR LOWER(@s) LIKE '%<ask-question%') AS hit`,
  );
  const newInstr = db.prepare(
    `SELECT (instr(lower(@s), '<question-form') > 0 OR instr(lower(@s), '<ask-question') > 0) AS hit`,
  );
  for (const sample of samples) {
    const before = (oldLike.get({ s: sample }) as { hit: number }).hit;
    const after = (newInstr.get({ s: sample }) as { hit: number }).hit;
    assert.equal(after, before, `prefilter diverged for ${JSON.stringify(sample)}`);
  }
});
