// AUTO-GENERATED — merge of localized /alternatives/ shards.
import type { AlternativeDetailCopy } from './info-page-i18n';
import { ALT_PART_A } from './alternatives-i18n.part-a';
import { ALT_PART_B } from './alternatives-i18n.part-b';
import { ALT_PART_C } from './alternatives-i18n.part-c';
import { ALT_PART_D } from './alternatives-i18n.part-d';
import { ALT_PART_E } from './alternatives-i18n.part-e';
import { ALT_PART_F } from './alternatives-i18n.part-f';
import { ALT_PART_G } from './alternatives-i18n.part-g';
import { ALT_PART_H } from './alternatives-i18n.part-h';

type AltMap = Partial<Record<string, AlternativeDetailCopy>>;

const PARTS: Partial<Record<string, AltMap>>[] = [
  ALT_PART_A,
  ALT_PART_B,
  ALT_PART_C,
  ALT_PART_D,
  ALT_PART_E,
  ALT_PART_F,
  ALT_PART_G,
  ALT_PART_H,
];

// Deep-merge per locale so a later shard can contribute a single slug to a
// locale without clobbering the slugs an earlier shard already supplied.
export const LOCALIZED_ALTERNATIVES: Partial<Record<string, AltMap>> = {};
for (const part of PARTS) {
  for (const [locale, map] of Object.entries(part)) {
    LOCALIZED_ALTERNATIVES[locale] = {
      ...(LOCALIZED_ALTERNATIVES[locale] ?? {}),
      ...(map ?? {}),
    };
  }
}
