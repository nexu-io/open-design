/** chinese-heritage-motion — input contract. */

export type FactStatus = 'documented' | 'interpretive' | 'unverified';

export interface SourceRef {
  id: string;
  title: string;
  url?: string;
  note?: string;
}

export interface FactItem {
  id: string;
  text: string;
  status: FactStatus;
  source_ids?: string[];
}

export interface SubjectBlock {
  name_zh: string;
  name_en: string;
  period: string;
  location: string;
  structural_type: string;
  short_description: string;
  facts: FactItem[];
  sources: SourceRef[];
}

export interface SubjectDNA {
  vertical_rhythm: string;
  structural_motif: string;
  material_character: string;
  silhouette_logic: string;
  spatial_quality: string;
  weathering_character: string;
}

export type AccentToken = 'oxide' | 'moss' | 'stone' | 'none';
export type ThemeToken = 'paper' | 'timber' | 'night' | 'mineral';

export interface VisualSystemBlock {
  dna: SubjectDNA;
  primary_theme: ThemeToken;
  accent: AccentToken;
  image_finish: 'documentary-soft' | 'archive-grain' | 'mineral-clean';
  title_language: 'zh-first' | 'en-first' | 'bilingual';
}

export type SceneType =
  | 'encounter'
  | 'verticality'
  | 'structure'
  | 'detail'
  | 'interior'
  | 'time'
  | 'preservation'
  | 'afterimage';

export interface ChapterCopy {
  eyebrow: string;
  title_zh: string;
  title_en?: string;
  body: string;
  note?: string;
}

export interface ChapterBlock {
  id: string;
  index: string;
  scene_type: SceneType;
  copy: ChapterCopy;
  fact_ids?: string[];
  asset_ids: string[];
}

export type ImageStrategy = 'placeholder' | 'generate' | 'documentary' | 'bring-your-own';
export type MotionTier = 'high' | 'medium' | 'low' | 'fallback';

export interface DocumentarySource {
  asset_id: string;
  source_url: string;
  author?: string;
  license?: string;
  license_url?: string;
  retrieved_at?: string;
  license_status: 'verified' | 'unknown' | 'restricted';
}

export interface ImageryConfig {
  strategy: ImageStrategy;
  assets_path: string;
  motion_tier: MotionTier;
  documentary_sources?: DocumentarySource[];
  provided_assets?: Record<string, string>;
  prompts?: Record<string, string>;
}

export interface NavigationBlock {
  label_zh: string;
  label_en?: string;
  chapter_ids: string[];
}

export interface HeritageMotionInputs {
  $schema?: string;
  subject: SubjectBlock;
  visual_system: VisualSystemBlock;
  navigation: NavigationBlock;
  chapters: [
    ChapterBlock,
    ChapterBlock,
    ChapterBlock,
    ChapterBlock,
    ChapterBlock,
    ChapterBlock,
    ChapterBlock,
    ChapterBlock
  ];
  imagery: ImageryConfig;
}
