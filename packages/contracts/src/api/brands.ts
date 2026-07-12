/**
 * Role: 브랜드 컨텍스트 레지스트리 API 계약 (GET /api/brands, /api/brands/:id + 쓰기 라우트)
 * Key Features: BrandSummary 목록 행(+표시 서브셋), BrandDetail 상세(+palette·presentation), 쓰기 DTO(생성·패치·채널·문서·에셋)
 * Dependencies: 없음 (순수 타입)
 */

/** brand.md '## Palette' 테이블 1행 (정체색 정본 파생) */
export interface BrandPaletteEntry {
  name: string;
  value: string; // #RRGGBB
  usage?: string;
}

export interface BrandTypography {
  family: string;
  roles?: string;
  weights?: string;
}

/** manifest.presentation 미러 — 큐레이션 표시값, 상세에만 전체 노출 */
export interface BrandPresentation {
  subtitle?: string;
  website?: string;
  audience?: string;
  tagline?: string;
  keyMessage?: string;
  avoid?: string;
  typography?: BrandTypography;
  voiceTone?: string[];
  toneLabel?: string;
  neutralPalette?: string[];
  /** assets/ 하위 브랜드 아이콘 파일명 (예: 'icon.png') — 목록은 iconUrl로 미러 */
  icon?: string;
  /** assets/ 하위 브랜드 로고 파일명 (예: 'logo.png') — 목록은 logoUrl로 미러 */
  logo?: string;
}

/** 브랜드 목록 행 — GET /api/brands 응답 { brands: BrandSummary[] } */
export interface BrandSummary {
  id: string;
  title: string;
  /** deliverables/ 하위 채널 키 목록 (예: ['blog','cardnews','iam']) — 프롬프트 주입 키, 불변 */
  deliverables: string[];
  // 목록 카드 표시 서브셋 (manifest.presentation / palette 파생)
  subtitle?: string;
  tagline?: string;
  primaryColor?: string; // palette[0].value — 이니셜 타일색
  /** 브랜드 아이콘 이미지 URL (presentation.icon 있을 때) — 없으면 이니셜 타일 폴백 */
  iconUrl?: string;
  /** 브랜드 로고 이미지 URL (presentation.logo 있을 때) — 상세 히어로 표시용 */
  logoUrl?: string;
  toneLabel?: string;
  projectCount?: number;
  deliverableLabels?: Record<string, string>; // 키→표시 라벨
}

/** 브랜드 상세 — GET /api/brands/:id (+?deliverable=<key>) */
export interface BrandDetail extends BrandSummary {
  /** brand.md 본문 */
  body: string;
  /** ?deliverable= 지정 시 해당 채널 파일 본문 */
  deliverable?: { key: string; body: string };
  /** brand.md Palette 테이블 파싱 정체색 */
  palette?: BrandPaletteEntry[];
  /** manifest.presentation 전체 */
  presentation?: BrandPresentation;
}

/** 브랜드 생성 입력 — POST /api/brands. id 미지정 시 title 슬러그 파생 (비라틴 title이면 400) */
export interface BrandCreateInput {
  id?: string;
  title: string;
  presentation?: BrandPresentation;
  /** brand.md 초기 본문 — 미지정 시 스캐폴드 생성 */
  coreBody?: string;
}

/** 브랜드 manifest 패치 — PUT /api/brands/:id. deliverables는 보존 */
export interface BrandUpdateInput {
  title?: string;
  /** 통째 교체 (병합 아님) — 폼이 전체 상태를 들고 있으므로 병합 시맨틱 불필요 */
  presentation?: BrandPresentation;
}

/** 채널(deliverable) 추가 입력 — POST /api/brands/:id/deliverables */
export interface BrandDeliverableInput {
  key: string;
  label?: string;
  designSystem?: string;
  body?: string;
}

/** 문서 본문 저장 입력 — PUT /api/brands/:id/docs/:key (core 포함) */
export interface BrandDocInput {
  body: string;
}

/** 에셋 업로드 결과 — POST /api/brands/:id/assets 응답 */
export interface BrandAssetUploadResult {
  path: string;
  url: string;
}
