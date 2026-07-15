export interface CreatorPerformanceMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  favorites?: number;
  followers?: number;
  watchSeconds?: number;
}

export interface CreatorPerformanceSnapshot {
  id: string;
  projectId: string;
  releaseId: string;
  source: 'manual';
  capturedAt: string;
  metrics: CreatorPerformanceMetrics;
  note?: string;
  createdAt: string;
}

export interface CreatorPerformanceProjectData {
  snapshots: CreatorPerformanceSnapshot[];
}

export interface CreateCreatorPerformanceSnapshotRequest {
  releaseId: string;
  capturedAt?: string;
  metrics: CreatorPerformanceMetrics;
  note?: string;
}
