import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'vitest';
import type { ArtifactFocusSelection } from '@open-design/contracts';
import { createArtifactFocusMarkerStripper } from '../src/artifact-focus-marker.js';

const KEY = 'c07a83a9bc73cbd6';
type ProbeResult = { size: number } | null;

function harness() {
  const root = path.resolve('focus-test-project');
  const emitted: ArtifactFocusSelection[] = [];
  const probes: Array<{
    path: string;
    promise: Promise<ProbeResult>;
    resolve: (value: ProbeResult) => void;
    reject: (error: Error) => void;
  }> = [];
  const stripper = createArtifactFocusMarkerStripper({
    key: KEY,
    projectRoot: root,
    emit: (selection) => emitted.push(selection),
    probeFile: (absolutePath) => {
      let resolve!: (value: ProbeResult) => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<ProbeResult>((yes, no) => { resolve = yes; reject = no; });
      probes.push({ path: absolutePath, promise, resolve, reject });
      return promise;
    },
  });
  return {
    ...stripper, emitted, probes, root,
    open(file: string, key = KEY) {
      return stripper.strip('<od-focus key="' + key + '" open="' + file + '"/>');
    },
    async complete(index: number, value: ProbeResult | Error) {
      const probe = probes[index]!;
      if (value instanceof Error) probe.reject(value);
      else probe.resolve(value);
      await probe.promise.catch(() => null);
      // Drain the production probe's catch and await continuations, without timers.
      await Promise.resolve();
    },
  };
}

describe('artifact focus probe ordering', () => {
  it('does not reopen an older file when its probe finishes after the latest marker', async () => {
    const h = harness();
    h.open('old.html');
    h.open('new.html');
    await h.complete(1, { size: 1 });
    await h.complete(0, { size: 1 });
    assert.deepEqual(h.emitted, [{ open: 'new.html' }]);
    assert.equal(await h.settle(), false);
  });

  it('does not let an older empty result replace the current pending file', async () => {
    const h = harness();
    h.open('old.html');
    h.open('new.html');
    await h.complete(0, null);
    const settling = h.settle();
    const retryPath = h.probes[2]!.path;
    await h.complete(2, { size: 1 });
    await settling;
    await h.complete(1, { size: 1 });
    assert.equal(retryPath, path.join(h.root, 'new.html'));
    assert.deepEqual(h.emitted, [{ open: 'new.html' }]);
  });

  it('does not requeue an older failed probe after the current file has opened', async () => {
    const h = harness();
    h.open('old.html');
    h.open('new.html');
    await h.complete(1, { size: 1 });
    await h.complete(0, new Error('Old file unavailable'));
    const settling = h.settle();
    const count = h.probes.length;
    if (count > 2) await h.complete(2, { size: 1 });
    assert.equal(await settling, false);
    assert.equal(count, 2);
    assert.deepEqual(h.emitted, [{ open: 'new.html' }]);
  });

  it('distinguishes repeated paths belonging to different accepted markers', async () => {
    const h = harness();
    h.open('a.html');
    h.open('b.html');
    h.open('a.html');
    await h.complete(0, { size: 1 });
    assert.deepEqual(h.emitted, []);
    await h.complete(2, { size: 1 });
    await h.complete(1, { size: 1 });
    assert.deepEqual(h.emitted, [{ open: 'a.html' }]);
  });

  it('keeps concurrent probes of the current marker idempotent', async () => {
    const h = harness();
    h.open('current.html');
    const settling = h.settle();
    await h.complete(1, { size: 1 });
    assert.equal(await settling, true);
    await h.complete(0, { size: 1 });
    assert.equal(await h.settle(), false);
    assert.deepEqual(h.emitted, [{ open: 'current.html' }]);
  });

  it('does not invalidate a valid pending marker for a rejected marker', async () => {
    const h = harness();
    h.open('current.html');
    h.open('other.html', 'wrong-key');
    h.open('../outside.html');
    assert.equal(h.probes.length, 1);
    await h.complete(0, { size: 1 });
    assert.deepEqual(h.emitted, [{ open: 'current.html' }]);
  });
});
