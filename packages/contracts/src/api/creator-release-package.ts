export type CreatorReleasePlatform = 'bilibili' | 'youtube' | 'xiaohongshu' | 'other';

export type CreatorReleaseStatus = 'draft' | 'ready' | 'published' | 'archived';

export interface CreatorReleaseChecklist {
  contentComplete: boolean;
  exportConfirmed: boolean;
  coverConfirmed: boolean;
  metadataConfirmed: boolean;
  platformConfirmed: boolean;
}

export interface CreatorReleasePackage {
  id: string;
  projectId: string;
  contentId: string;
  platform: CreatorReleasePlatform;
  status: CreatorReleaseStatus;
  title: string;
  description: string;
  tags: string[];
  coverAssetId?: string;
  exportAssetId?: string;
  scheduledAt?: string;
  publishedAt?: string;
  publishedUrl?: string;
  checklist: CreatorReleaseChecklist;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorReleasePackageData {
  releasePackages: CreatorReleasePackage[];
}

export interface CreateCreatorReleasePackageRequest {
  contentId: string;
  platform: CreatorReleasePlatform;
  title: string;
  description?: string;
  tags?: string[];
  coverAssetId?: string;
  exportAssetId?: string;
  scheduledAt?: string;
  publishedAt?: string;
  publishedUrl?: string;
  checklist?: CreatorReleaseChecklist;
  status?: CreatorReleaseStatus;
}

export interface UpdateCreatorReleasePackageRequest {
  contentId?: string;
  platform?: CreatorReleasePlatform;
  status?: CreatorReleaseStatus;
  title?: string;
  description?: string;
  tags?: string[];
  coverAssetId?: string;
  exportAssetId?: string;
  scheduledAt?: string;
  publishedAt?: string;
  publishedUrl?: string;
  checklist?: CreatorReleaseChecklist;
}
