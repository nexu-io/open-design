import { describe, expect, it } from 'vitest';

import {
  createProductionDocument,
  createProductionSegmentSyncState,
  markDownstreamFieldsStale,
  markProductionSegmentSyncStateStale,
  projectProductionDocument,
  recordProductionLaneManualEdit,
  resolveProductionLaneSyncState,
  updateProductionDocumentSegment,
} from '../../src/production-generation/document';

describe('production document model', () => {
  it('projects the canonical document back into the editable segment view', () => {
    const document = createProductionDocument([
      {
        id: 'hook',
        label: 'Hook',
        paragraph: 'Open with the question the viewer cares about.',
        narration: '專業講解者 (professional) 旁白：Open with the question the viewer cares about.',
        shot: '鏡頭：Open with the question the viewer cares about.',
        assets: '素材：Use a bold title card and one sample image.',
        output: '成片：Open with the question the viewer cares about.',
        voiceProfileId: 'guide-host',
      },
    ]);

    const segments = projectProductionDocument(document);

    expect(document.id).toBe('production-document');
    expect(document.revision).toBe(1);
    expect(document.segments[0]?.paragraph.source).toBe('user');
    expect(document.segments[0]?.narration.source).toBe('generated');
    expect(segments).toHaveLength(1);
    expect(segments[0]?.paragraph).toContain('viewer cares about');
  });

  it('marks downstream fields as stale when the script changes', () => {
    const document = createProductionDocument([
      {
        id: 'hook',
        label: 'Hook',
        paragraph: 'Original paragraph',
        narration: 'Original narration',
        shot: 'Original shot',
        assets: 'Original assets',
        output: 'Original output',
        voiceProfileId: 'guide-host',
      },
    ]);

    const next = markDownstreamFieldsStale(document, 'hook', 3);

    expect(next.revision).toBeGreaterThan(document.revision);
    expect(next.segments[0]?.narration.stale).toBe(true);
    expect(next.segments[0]?.shot.stale).toBe(true);
    expect(next.segments[0]?.assets.stale).toBe(true);
    expect(next.segments[0]?.output.stale).toBe(true);
    expect(next.segments[0]?.narration.derivedFrom).toBe('hook');
  });

  it('updates a single segment while preserving stable identity', () => {
    const document = createProductionDocument([
      {
        id: 'hook',
        label: 'Hook',
        paragraph: 'Original paragraph',
        narration: 'Original narration',
        shot: 'Original shot',
        assets: 'Original assets',
        output: 'Original output',
        voiceProfileId: 'guide-host',
      },
    ]);

    const next = updateProductionDocumentSegment(document, 'hook', {
      paragraph: 'Revised paragraph',
      narration: 'Revised narration',
    });

    expect(next.revision).toBe(2);
    expect(next.segments[0]?.id).toBe('hook');
    expect(next.segments[0]?.paragraph.value).toBe('Revised paragraph');
    expect(next.segments[0]?.paragraph.source).toBe('user');
    expect(next.segments[0]?.narration.value).toBe('Revised narration');
    expect(next.segments[0]?.narration.stale).toBe(false);
  });

  it('tracks stale, diverged, detached, and keep states for downstream lanes', () => {
    const base = createProductionSegmentSyncState();
    const stale = markProductionSegmentSyncStateStale(base);
    const diverged = recordProductionLaneManualEdit(stale, 'narration');
    const kept = resolveProductionLaneSyncState(diverged, 'narration', 'keep');
    const detached = resolveProductionLaneSyncState(kept, 'narration', 'detach');

    expect(base.narration).toBe('in-sync');
    expect(stale.narration).toBe('stale');
    expect(diverged.narration).toBe('diverged');
    expect(kept.narration).toBe('in-sync');
    expect(detached.narration).toBe('detached');
  });
});
