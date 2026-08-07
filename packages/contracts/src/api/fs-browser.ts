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

export interface FsBrowserMkdirRequest {
  parentPath: string;
  name: string;
}

export interface FsBrowserMkdirResponse {
  path: string;
}

export type FsBrowserErrorCode =
  | 'PATH_REQUIRED'
  | 'NAME_REQUIRED'
  | 'NAME_INVALID'
  | 'PATH_ALREADY_EXISTS'
  | 'PATH_MUST_BE_ABSOLUTE'
  | 'PATH_OUTSIDE_ALLOWED_ROOTS'
  | 'PATH_NOT_FOUND'
  | 'PATH_NOT_DIRECTORY'
  | 'PATH_ACCESS_DENIED';

export interface FsBrowserErrorResponse {
  error: FsBrowserErrorCode;
  message: string;
}

export type NativeFolderDialogResponse =
  | { path: string }
  | { path: null; error: 'cancelled' }
  | { path: null; error: 'exec-failed'; detail: string };
