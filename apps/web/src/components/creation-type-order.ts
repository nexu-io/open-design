// Shared priority for creation-type entries on Home and Community.
// Each surface owns its supported types and inline/overflow grouping.
export const CREATION_TYPE_ORDER = [
  'prototype',
  'motion-design',
  'deck',
  'document',
  'image',
  'web-clone',
  'hyperframes',
  'webgl',
  'live-artifact',
  'video',
  'audio',
] as const;

export type CreationTypeId = (typeof CREATION_TYPE_ORDER)[number];
