import { describe, expect, it } from 'vitest';
import type {
  NativeFolderDialogCancelledResponse,
  NativeFolderDialogRemoteResponse,
  NativeFolderDialogResponse,
  NativeFolderDialogSelectedResponse,
  NativeFolderDialogUnavailableResponse,
} from '../src/index';

const selected = { path: '/workspace/project' } satisfies NativeFolderDialogSelectedResponse;
const cancelled = { path: null } satisfies NativeFolderDialogCancelledResponse;
const remote = {
  code: 'NATIVE_FOLDER_DIALOG_REMOTE',
  message: 'Native folder picker is unavailable to a remote browser',
  fallback: 'server-directory-picker',
} satisfies NativeFolderDialogRemoteResponse;
const unavailable = {
  code: 'NATIVE_FOLDER_DIALOG_UNAVAILABLE',
  message: 'Could not open folder picker on this host',
  fallback: 'server-directory-picker',
} satisfies NativeFolderDialogUnavailableResponse;

const responses = [selected, cancelled, remote, unavailable] satisfies NativeFolderDialogResponse[];

describe('native folder dialog response contract', () => {
  it('covers selected, cancelled, remote, and native-unavailable responses', () => {
    expect(responses).toHaveLength(4);
  });
});
