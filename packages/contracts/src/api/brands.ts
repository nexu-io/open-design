/**
 * Role: 브랜드 컨텍스트 레지스트리 API 계약 (GET /api/brands, /api/brands/:id)
 * Key Features: BrandSummary 목록 행, BrandDetail 상세(+deliverable 본문 옵션)
 * Dependencies: 없음 (순수 타입)
 */

/** 브랜드 목록 행 — GET /api/brands 응답 { brands: BrandSummary[] } */
export interface BrandSummary {
  id: string;
  title: string;
  /** deliverables/ 하위 채널 키 목록 (예: ['blog','cardnews','iam']) */
  deliverables: string[];
}

/** 브랜드 상세 — GET /api/brands/:id (+?deliverable=<key>) */
export interface BrandDetail extends BrandSummary {
  /** brand.md 본문 */
  body: string;
  /** ?deliverable= 지정 시 해당 채널 파일 본문 */
  deliverable?: { key: string; body: string };
}
