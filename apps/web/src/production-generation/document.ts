import type { ProductionSegment } from './types';

export type ProductionFieldSource = 'user' | 'generated';

export interface ProductionFieldState {
  value: string;
  source: ProductionFieldSource;
  derivedFrom: string | null;
  revision: number;
  stale: boolean;
}

export interface ProductionSegmentRecord {
  id: string;
  label: ProductionFieldState;
  paragraph: ProductionFieldState;
  narration: ProductionFieldState;
  shot: ProductionFieldState;
  assets: ProductionFieldState;
  output: ProductionFieldState;
  voiceProfileId: string;
}

export interface ProductionDocument {
  id: string;
  revision: number;
  segments: ProductionSegmentRecord[];
}

export type ProductionLaneId = 'narration' | 'shot' | 'assets' | 'output';
export type ProductionLaneSyncStatus = 'in-sync' | 'stale' | 'diverged' | 'detached';

export interface ProductionSegmentSyncState {
  narration: ProductionLaneSyncStatus;
  shot: ProductionLaneSyncStatus;
  assets: ProductionLaneSyncStatus;
  output: ProductionLaneSyncStatus;
}

export function createProductionFieldState(
  value: string,
  input: Partial<Omit<ProductionFieldState, 'value'>> & {
    source?: ProductionFieldSource;
  } = {},
): ProductionFieldState {
  return {
    value,
    source: input.source ?? 'user',
    derivedFrom: input.derivedFrom ?? null,
    revision: input.revision ?? 1,
    stale: input.stale ?? false,
  };
}

export function createProductionSegmentRecord(
  segment: ProductionSegment,
  input: {
    source?: ProductionFieldSource;
    derivedSource?: ProductionFieldSource;
    revision?: number;
    derivedFrom?: string | null;
  } = {},
): ProductionSegmentRecord {
  return {
    id: segment.id,
    label: createProductionFieldState(segment.label, {
      source: input.source ?? 'user',
      derivedFrom: input.derivedFrom ?? null,
      revision: input.revision ?? 1,
    }),
    paragraph: createProductionFieldState(segment.paragraph, {
      source: input.source ?? 'user',
      derivedFrom: input.derivedFrom ?? null,
      revision: input.revision ?? 1,
    }),
    narration: createProductionFieldState(segment.narration, {
      source: input.derivedSource ?? 'generated',
      derivedFrom: input.derivedFrom ?? segment.id,
      revision: input.revision ?? 1,
    }),
    shot: createProductionFieldState(segment.shot, {
      source: input.derivedSource ?? 'generated',
      derivedFrom: input.derivedFrom ?? segment.id,
      revision: input.revision ?? 1,
    }),
    assets: createProductionFieldState(segment.assets, {
      source: input.derivedSource ?? 'generated',
      derivedFrom: input.derivedFrom ?? segment.id,
      revision: input.revision ?? 1,
    }),
    output: createProductionFieldState(segment.output, {
      source: input.derivedSource ?? 'generated',
      derivedFrom: input.derivedFrom ?? segment.id,
      revision: input.revision ?? 1,
    }),
    voiceProfileId: segment.voiceProfileId,
  };
}

export function createProductionDocument(
  segments: readonly ProductionSegment[],
  input: {
    id?: string;
    revision?: number;
  } = {},
): ProductionDocument {
  return {
    id: input.id ?? 'production-document',
    revision: input.revision ?? 1,
    segments: segments.map((segment) => createProductionSegmentRecord(segment, {
      source: 'user',
      derivedSource: 'generated',
      revision: input.revision ?? 1,
    })),
  };
}

export function projectProductionDocument(document: ProductionDocument): ProductionSegment[] {
  return document.segments.map((segment) => ({
    id: segment.id,
    label: segment.label.value,
    paragraph: segment.paragraph.value,
    narration: segment.narration.value,
    shot: segment.shot.value,
    assets: segment.assets.value,
    output: segment.output.value,
    voiceProfileId: segment.voiceProfileId,
  }));
}

export function createProductionSegmentSyncState(): ProductionSegmentSyncState {
  return {
    narration: 'in-sync',
    shot: 'in-sync',
    assets: 'in-sync',
    output: 'in-sync',
  };
}

export function markProductionSegmentSyncStateStale(
  state: ProductionSegmentSyncState,
): ProductionSegmentSyncState {
  return {
    narration: state.narration === 'detached' ? 'detached' : 'stale',
    shot: state.shot === 'detached' ? 'detached' : 'stale',
    assets: state.assets === 'detached' ? 'detached' : 'stale',
    output: state.output === 'detached' ? 'detached' : 'stale',
  };
}

export function resolveProductionLaneSyncState(
  state: ProductionSegmentSyncState,
  lane: ProductionLaneId,
  action: 'regenerate' | 'keep' | 'detach',
): ProductionSegmentSyncState {
  const nextStatus =
    action === 'regenerate'
      ? 'in-sync'
      : action === 'keep'
        ? 'in-sync'
        : 'detached';

  return {
    ...state,
    [lane]: nextStatus,
  };
}

export function recordProductionLaneManualEdit(
  state: ProductionSegmentSyncState,
  lane: ProductionLaneId,
): ProductionSegmentSyncState {
  const current = state[lane];
  return {
    ...state,
    [lane]: current === 'stale' ? 'diverged' : 'detached',
  };
}

export function markDownstreamFieldsStale(
  document: ProductionDocument,
  segmentId: string,
  sourceRevision: number,
): ProductionDocument {
  return {
    ...document,
    revision: Math.max(document.revision, sourceRevision + 1),
    segments: document.segments.map((segment) => {
      if (segment.id !== segmentId) return segment;
      return {
        ...segment,
        narration: { ...segment.narration, stale: true, derivedFrom: segment.id, revision: sourceRevision },
        shot: { ...segment.shot, stale: true, derivedFrom: segment.id, revision: sourceRevision },
        assets: { ...segment.assets, stale: true, derivedFrom: segment.id, revision: sourceRevision },
        output: { ...segment.output, stale: true, derivedFrom: segment.id, revision: sourceRevision },
      };
    }),
  };
}

export function updateProductionDocumentSegment(
  document: ProductionDocument,
  segmentId: string,
  patch: Partial<Pick<ProductionSegment, 'label' | 'paragraph' | 'narration' | 'shot' | 'assets' | 'output' | 'voiceProfileId'>>,
  input: {
    source?: ProductionFieldSource;
    revision?: number;
    markStale?: boolean;
  } = {},
): ProductionDocument {
  const nextRevision = input.revision ?? document.revision + 1;
  return {
    ...document,
    revision: nextRevision,
    segments: document.segments.map((segment) => {
      if (segment.id !== segmentId) return segment;
      const source = input.source ?? 'user';
      const derivedFrom = segment.id;
      const markStale = input.markStale ?? false;

      return {
        ...segment,
        label: patch.label !== undefined
          ? { ...segment.label, value: patch.label, source, derivedFrom, revision: nextRevision, stale: false }
          : segment.label,
        paragraph: patch.paragraph !== undefined
          ? { ...segment.paragraph, value: patch.paragraph, source, derivedFrom, revision: nextRevision, stale: false }
          : segment.paragraph,
        narration: patch.narration !== undefined
          ? { ...segment.narration, value: patch.narration, source, derivedFrom, revision: nextRevision, stale: false }
          : markStale
            ? { ...segment.narration, stale: true, derivedFrom, revision: nextRevision }
            : segment.narration,
        shot: patch.shot !== undefined
          ? { ...segment.shot, value: patch.shot, source, derivedFrom, revision: nextRevision, stale: false }
          : markStale
            ? { ...segment.shot, stale: true, derivedFrom, revision: nextRevision }
            : segment.shot,
        assets: patch.assets !== undefined
          ? { ...segment.assets, value: patch.assets, source, derivedFrom, revision: nextRevision, stale: false }
          : markStale
            ? { ...segment.assets, stale: true, derivedFrom, revision: nextRevision }
            : segment.assets,
        output: patch.output !== undefined
          ? { ...segment.output, value: patch.output, source, derivedFrom, revision: nextRevision, stale: false }
          : markStale
            ? { ...segment.output, stale: true, derivedFrom, revision: nextRevision }
            : segment.output,
        voiceProfileId: patch.voiceProfileId ?? segment.voiceProfileId,
      };
    }),
  };
}
