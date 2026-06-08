export const DEFAULT_PUBLIC_ARTIFACT_SHARE_ENDPOINT = 'https://og.open-design.ai/api/share';
export const PUBLIC_ARTIFACT_SHARE_TTL_SECONDS = 24 * 60 * 60;
export const PUBLIC_ARTIFACT_SHARE_SCHEMA = 'open-design.public-artifact-share.v1';

export interface PublicArtifactShareFile {
  path: string;
  contentType?: string;
  encoding: 'base64';
  data: string;
}

export interface PublicArtifactShareUploadRequest {
  schema: typeof PUBLIC_ARTIFACT_SHARE_SCHEMA;
  title: string;
  projectId: string;
  sourceFileName: string;
  entryFile: 'index.html';
  expiresInSeconds: number;
  files: PublicArtifactShareFile[];
}

export interface PublicArtifactShareResponse {
  url: string;
  id?: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface CreatePublicArtifactShareRequest {
  fileName: string;
  title?: string;
}
