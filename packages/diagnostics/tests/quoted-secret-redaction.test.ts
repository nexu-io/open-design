import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, it } from 'vitest';
import { buildAutomaticDiagnostics } from '../src/automatic.js';
import { redactJsonText, redactText } from '../src/redaction.js';

describe('quoted secret assignments', () => {
  it('removes complete quoted values including embedded spaces and separators', () => {
    assert.equal(redactText('password="private words, more; data" mode=debug'), 'password=[REDACTED] mode=debug');
    assert.equal(redactText("env: refresh_token='private words, more; data' attempt=2"), 'env: refresh_token=[REDACTED] attempt=2');
  });

  it('does not stop at an escaped quote inside a credential', () => {
    assert.equal(redactText('token="private\\"still-secret" status=ok'), 'token=[REDACTED] status=ok');
    assert.equal(redactText("secret='private\\'still-secret' status=ok"), 'secret=[REDACTED] status=ok');
  });

  it.each([
    ['a bare suffix', 'token="private words"suffix status=ok', 'token=[REDACTED] status=ok'],
    ['adjacent quote styles', `secret='private words'"more data" status=ok`, 'secret=[REDACTED] status=ok'],
    ['a bare prefix and suffix', 'password=prefix"private words"suffix;status=ok', 'password=[REDACTED];status=ok'],
    ['an empty quoted fragment', `api_key=""'private words' status=ok`, 'api_key=[REDACTED] status=ok'],
    ['escaped whitespace', String.raw`token="private"\ still-secret status=ok`, 'token=[REDACTED] status=ok'],
    ['escaped separators', String.raw`secret='private'\,more\;data,status=ok`, 'secret=[REDACTED],status=ok'],
    ['a colon assignment', `Authorization: "private"'suffix'; status=ok`, 'Authorization: [REDACTED]; status=ok'],
    ['an unfinished final fragment', 'token="private"suffix"more data\nnext event', 'token=[REDACTED]\nnext event'],
  ])('redacts the whole shell word with %s', (_name, input, expected) => {
    assert.equal(redactText(input), expected);
  });

  it('redacts an unfinished quoted assignment up to the log line boundary', () => {
    assert.equal(redactText('password="private words\nnext event'), 'password=[REDACTED]\nnext event');
    assert.equal(redactText("secret='private words\r\nnext event"), 'secret=[REDACTED]\r\nnext event');
  });

  it('redacts colon assignments and strings nested inside a JSON event', () => {
    assert.equal(redactText('Authorization: "private credential"; status=ok'), 'Authorization: [REDACTED]; status=ok');
    const output = JSON.parse(redactJsonText(JSON.stringify({ message: 'request token="private words" failed', attempt: 2 })));
    assert.deepEqual(output, { message: 'request token=[REDACTED] failed', attempt: 2 });
  });

  it('preserves ordinary fields and existing unquoted and URL redaction', () => {
    const ordinary = 'not_a_token="keep this" token_count=12 name="keep that"';
    assert.equal(redactText(ordinary), ordinary);
    assert.equal(redactText('token=private mode=debug'), 'token=[REDACTED] mode=debug');
    assert.equal(redactText('GET /?token=private&page=2'), 'GET /?token=[REDACTED]&page=2');
  });

  it('removes quoted credentials from an actual automatic diagnostic archive', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'diagnostics-quoted-secret-'));
    try {
      const log = join(directory, 'daemon.log');
      await writeFile(log, 'request password="private words, more"suffix failed\nretry token=\'second private value\'"last fragment" status=503\n');
      const outputDirectory = join(directory, 'archive');
      const { manifest } = await buildAutomaticDiagnostics({
        directory: outputDirectory,
        incidentId: 'quoted-assignment',
        summary: { message: 'request token="summary private value"suffix failed' },
        sources: [{ name: 'daemon.log', absolutePath: log, kind: 'text' }],
      });
      const chunks = await Promise.all(manifest.chunks.map((chunk) => readFile(join(outputDirectory, String(chunk.index)))));
      const records = gunzipSync(Buffer.concat(chunks)).toString('utf8').trim().split('\n').map((line) => JSON.parse(line));
      assert.equal(records[0].summary.message, 'request token=[REDACTED] failed');
      assert.equal(records[1].content, 'request password=[REDACTED] failed\nretry token=[REDACTED] status=503\n');
      assert.equal(records[2].completeness, 'complete');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
