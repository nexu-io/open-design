import { describe, expect, it } from 'vitest';
import { manifestSourceDigest } from '../src/digest';
import type { PluginManifest } from '@open-design/contracts';

const baseManifest: PluginManifest = {
  name: 'sample-plugin',
  title: 'Sample Plugin',
  version: '1.0.0',
  description: 'Fixture for digest tests.',
  od: {
    kind: 'skill',
    taskKind: 'new-generation',
    useCase: { query: 'Make a {{topic}} brief.' },
    inputs: [{ name: 'topic', type: 'string', required: true }],
  },
};

describe('manifestSourceDigest', () => {
  // Pinned hex values guard against accidental drift in the canonical
  // serializer. If a Phase 1+ refactor changes them, update the fixtures
  // *and* document the migration impact in the plan.
  it('digests the empty-input case to a stable hex', () => {
    const digest = manifestSourceDigest({
      manifest: baseManifest,
      inputs: {},
      resolvedContextRefs: [],
    });
    expect(digest).toBe('90d968416e5b98816af4ecb0ef07813b07032996aa59fb182ad7a68489167156');
  });

  it('digests the topic-input case to a stable hex', () => {
    const digest = manifestSourceDigest({
      manifest: baseManifest,
      inputs: { topic: 'agentic design' },
      resolvedContextRefs: [
        { kind: 'skill', ref: 'sample-plugin' },
        { kind: 'design-system', ref: 'linear-clone' },
      ],
    });
    expect(digest).toBe('d16e3ea91061168e0728ff7f9c3b79b087bb7cb2859c4c5c240feddbe3d8a3d9');
  });

  it('produces the same digest regardless of object key order', () => {
    const a = manifestSourceDigest({
      manifest: baseManifest,
      inputs: { audience: 'VC', topic: 'design' },
      resolvedContextRefs: [
        { kind: 'skill', ref: 'sample-plugin' },
        { kind: 'craft', ref: 'typography' },
      ],
    });
    const b = manifestSourceDigest({
      manifest: { ...baseManifest, description: baseManifest.description },
      inputs: { topic: 'design', audience: 'VC' },
      resolvedContextRefs: [
        { kind: 'skill', ref: 'sample-plugin' },
        { kind: 'craft', ref: 'typography' },
      ],
    });
    expect(a).toBe(b);
  });

  it('changes when an input value changes', () => {
    const a = manifestSourceDigest({
      manifest: baseManifest,
      inputs: { topic: 'design' },
      resolvedContextRefs: [],
    });
    const b = manifestSourceDigest({
      manifest: baseManifest,
      inputs: { topic: 'engineering' },
      resolvedContextRefs: [],
    });
    expect(a).not.toBe(b);
  });
});
