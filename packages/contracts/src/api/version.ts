export interface AppVersionInfo {
  version: string;
  channel: string;
  packaged: boolean;
  platform: string;
  arch: string;
}

export interface AppVersionResponse {
  version: AppVersionInfo;
}
