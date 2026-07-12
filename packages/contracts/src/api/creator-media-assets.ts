export type CreatorMediaKind = 'image' | 'video';
export type CreatorMediaAvailability = 'available' | 'missing';
export type CreatorThumbnailStatus = 'pending' | 'ready' | 'failed' | 'unavailable';

export interface CreatorMediaAsset {
  id: string;
  projectId: string;
  rootPath: string;
  sourcePath: string;
  relativePath: string;
  fileName: string;
  extension: string;
  kind: CreatorMediaKind;
  sizeBytes: number;
  modifiedAt: string;
  capturedAt?: string;
  availability: CreatorMediaAvailability;
  thumbnailStatus: CreatorThumbnailStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorTaskMediaLink {
  taskId: string;
  assetId: string;
  createdAt: string;
}

export interface CreatorMediaRoot {
  rootPath: string;
  addedAt: string;
  lastScannedAt?: string;
}

export interface CreatorMediaScanCandidate extends Omit<CreatorMediaAsset, 'id' | 'projectId' | 'createdAt' | 'updatedAt'> {}

export interface CreatorMediaScanResult {
  discovered: CreatorMediaScanCandidate[];
  skipped: number;
  errors: string[];
}

export interface CreatorMediaProjectData {
  roots: CreatorMediaRoot[];
  assets: CreatorMediaAsset[];
  taskLinks: CreatorTaskMediaLink[];
}
