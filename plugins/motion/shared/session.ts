import type { ProjectMessage } from './conversation.ts';

/** Mode selects production tools; artifact kind selects its viewer. Neither depends on an Agent host. */
export const creationModes = [{ id: 'motion', title: 'Motion', skill: 'motion-production', artifactKind: 'motion-project', templateCategories: ['builtin', 'featured', 'ads', 'motion', 'script', 'all'] }] as const;
export const artifactViewers = { 'motion-project': { id: 'motion', title: 'Motion', scheme: 'motion', embeddable: true } } as const;
export type ArtifactKind = keyof typeof artifactViewers;
export type CreationMode = typeof creationModes[number]['id'];
export type ArtifactIdentity = { id: string; title: string; templateId?: string };
export type MotionArtifact = ArtifactIdentity & { kind: 'motion-project'; projectId: string };
// Extend this discriminated union when an additional viewer/resource type is implemented.
export type SessionArtifact = MotionArtifact;
export type CreativeSession = { id: string; title: string; mode: CreationMode; artifacts: SessionArtifact[]; activeArtifactId?: string; createdAt?: number; openedAt?: number; templateId?: string };
export type SessionDetail = CreativeSession & { messages: ProjectMessage[] };
export function creationMode(value: unknown) {
  const mode = creationModes.find(item => item.id === value);
  if (!mode) throw new Error('当前仅支持 Motion 模式');
  return mode;
}
