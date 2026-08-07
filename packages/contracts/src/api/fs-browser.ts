export type FsBrowserRootKind = 'configured';

export interface FsBrowserRoot {
  label: string;
  path: string;
  kind: FsBrowserRootKind;
}

export interface FsBrowserRootsResponse {
  roots: FsBrowserRoot[];
}

export type FsBrowserEntryType = 'directory';

export interface FsBrowserEntry {
  name: string;
  path: string;
  type: FsBrowserEntryType;
  hidden: boolean;
}

export interface FsBrowserListResponse {
  path: string;
  parent: string | null;
  entries: FsBrowserEntry[];
  truncated: boolean;
}

export type FsBrowserErrorCode =
  | 'PATH_REQUIRED'
  | 'PATH_MUST_BE_ABSOLUTE'
  | 'PATH_OUTSIDE_ALLOWED_ROOTS'
  | 'PATH_NOT_FOUND'
  | 'PATH_NOT_DIRECTORY'
  | 'PATH_ACCESS_DENIED';

export interface FsBrowserErrorResponse {
  error: FsBrowserErrorCode;
  message: string;
}

export interface NativeFolderDialogSelectedResponse {
  path: string;
}

export interface NativeFolderDialogCancelledResponse {
  path: null;
}

export interface NativeFolderDialogRemoteResponse {
  code: 'NATIVE_FOLDER_DIALOG_REMOTE';
  message: string;
  fallback: 'server-directory-picker';
}

export interface NativeFolderDialogUnavailableResponse {
  code: 'NATIVE_FOLDER_DIALOG_UNAVAILABLE';
  message: string;
  fallback: 'server-directory-picker';
}

export type NativeFolderDialogSelectionResponse =
  | NativeFolderDialogSelectedResponse
  | NativeFolderDialogCancelledResponse;

export type NativeFolderDialogFallbackResponse =
  | NativeFolderDialogRemoteResponse
  | NativeFolderDialogUnavailableResponse;

export type NativeFolderDialogResponse =
  | NativeFolderDialogSelectionResponse
  | NativeFolderDialogFallbackResponse;
