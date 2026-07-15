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
  // 可选关联/时间字段支持显式清空：undefined 不修改，null 删除字段，非空字符串按规则写入。
  coverAssetId?: string | null;
  exportAssetId?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  publishedUrl?: string | null;
  checklist?: CreatorReleaseChecklist;
}
