// Typed wrappers over the project file classifiers.
//
// `projects.ts` is the single owner of "what kind of file is this" and carries
// `@ts-nocheck`, so its exports arrive untyped. Wrapping them here keeps ONE
// definition of kind/mime for the whole daemon while giving the chat-artifact
// modules real types — a second classifier would be a second truth source and
// would eventually disagree with Design Files.

import { kindFor, mimeFor } from '../projects.js';

export function kindForArtifactPath(projectRelativePath: string): string {
  const kind: unknown = kindFor(projectRelativePath);
  return typeof kind === 'string' && kind ? kind : 'binary';
}

export function mimeForArtifactPath(projectRelativePath: string): string | undefined {
  const mime: unknown = mimeFor(projectRelativePath);
  return typeof mime === 'string' && mime ? mime : undefined;
}
