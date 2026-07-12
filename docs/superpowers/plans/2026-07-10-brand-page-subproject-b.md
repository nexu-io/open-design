# 브랜드 페이지 서브프로젝트 B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** read-only 브랜드 레일에 풀 CRUD를 붙인다 — 생성·manifest 편집·문서 본문 편집·채널 추가/삭제·아이콘/로고 업로드·삭제를 HTTP + Web UI + `od brand` CLI 세 표면 동시 클로저로.

**Architecture:** 쓰기 대상은 `BRANDS_DIR` 단일 루트 (dev = repo `brands/`). 로직은 `apps/daemon/src/brands.ts` 레지스트리 함수로, 라우트는 얇게. 기존 읽기 레일(GET 3라우트·run 주입)은 무변경 — 같은 파일을 고치므로 자동 반영. web은 저장 후 재fetch(낙관 갱신 없음). packaged 미러(`routes/static-resource.ts`)는 GET deferral만이라 쓰기 라우트는 `server.ts` 단일 등록.

**Tech Stack:** TypeScript, Vitest, React 18 (apps/web), Express + multer (apps/daemon), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-07-10-brand-page-subproject-b-design.md`

## Global Constraints

- 커밋 메시지 `[what] — [why]`, `Co-authored-by` 트레일러 금지 (AGENTS.md Git commit policy).
- 테스트는 `src/` 형제 `tests/`에만 — `src/` 밑 신규 `*.test.ts` 금지.
- 루트 `pnpm test`/`pnpm build` 없음 — 패키지 스코프만.
- 공유 DTO는 `packages/contracts` 선행 + `pnpm --filter @marketing-ax/contracts build` — web/daemon shape 분기 금지.
- i18n 신규 키는 `apps/web/src/i18n/types.ts` 먼저, 그 뒤 **19개 로케일 전부** (`ar de en es-ES fa fr hu id it ja ko pl pt-BR ru th tr uk zh-CN zh-TW`).
- daemon/web 기존 파일 주석 컨벤션(영/한 혼재)은 수정 파일의 기존 관례를 따른다. 신규 파일은 파일 헤더(Role/Key Features/Dependencies) 포함.
- id 게이트는 **레지스트리 함수 내부** (`isValidBrandId`는 module-private — 기존 `readBrandManifest` 내부 게이트 모델과 동일). 경로 구성 전 검사 원칙은 함수 안에서 지킨다. `createBrand`는 사용자 지정 id를 명시 검증 (선행 manifest read 없음).
- 마무리 게이트: `pnpm guard` + `pnpm typecheck` + `pnpm --filter @marketing-ax/daemon test` + `pnpm --filter @marketing-ax/web test` — 실패는 main baseline 대조 후 판정.
- 검증 shell은 Node 24 PATH prefix 필수 (메모리: 쉘 node v25 → daemon 가짜 실패).

---

### Task 1: contracts — logo 필드 + 쓰기 DTO

**Files:**
- Modify: `packages/contracts/src/api/brands.ts`
- 확인: `packages/contracts/src/index.ts` (export 경로)

- [ ] `BrandPresentation.logo?: string`, `BrandSummary.logoUrl?: string` 추가 (기존 icon/iconUrl 미러와 동형 주석)
- [ ] 쓰기 DTO 추가: `BrandCreateInput` / `BrandUpdateInput`(presentation 통째 교체 시맨틱 주석 명시) / `BrandDeliverableInput` / `BrandDocInput` / `BrandAssetUploadResult`
- [ ] `pnpm --filter @marketing-ax/contracts build` green
- [ ] Commit

### Task 2: daemon 레지스트리 쓰기 함수 (red-spec 선행)

**Files:**
- Create: `apps/daemon/tests/brands-write.test.ts`
- Modify: `apps/daemon/src/brands.ts`

- [ ] **Red:** tmp 루트 fixture로 스펙 §4 함수 8종 왕복 테스트 작성 — createBrand(슬러그·유니크·스캐폴드 + **typed 에러**: 비라틴 title & id 미지정 → `BrandWriteError 'id-required'`, 중복 → `'duplicate-id'`, 불량 id → `'invalid-id'`), updateBrandManifest(deliverables 보존), writeBrandCore(Palette 테이블 왕복), writeBrandDeliverableDoc(미등재 키 null), addBrandDeliverable(중복 키 에러·키 형식 거부), removeBrandDeliverable(manifest+파일 제거), writeBrandAsset(role=icon/logo manifest 갱신·파일명 sanitize), deleteBrand(디렉토리 제거), 전 함수 traversal id(`..`·`a/b`) 거부. 실행 → red 확인
- [ ] **Green:** `brands.ts`에 함수 구현. **슬러그는 브랜드 로컬 구현 필수** — DS `slugify`/`uniqueSlug`는 module-private라 import 불가 + `|| 'design-system'` 폴백이 'id-required' 분기를 죽임 (plan-reviewer High). 브랜드판은 공백 슬러그 그대로 반환. id 게이트는 레지스트리 함수 내부(`isValidBrandId`, 기존 read 모델과 동일). logo 필드 목록/상세 미러(`logoUrl`)도 `listBrands`에 배선
- [ ] `pnpm --filter @marketing-ax/daemon test -- brands-write` green
- [ ] Commit

### Task 3: HTTP 쓰기 라우트 (red-spec 선행)

**Files:**
- Create: `apps/daemon/src/brand-routes.ts` — `registerBrandWriteRoutes(app, { brandsDir, db })` 주입형 헬퍼 (braze-routes.ts식 배치)
- Create: `apps/daemon/tests/brand-write-routes.test.ts`
- Modify: `apps/daemon/src/server.ts` (헬퍼 호출 1줄)

⚠️ **하니스 격리 (plan-reviewer Critical):** 기존 `brands-routes.test.ts`의 `startServer({ port: 0 })` 풀부팅을 복사하면 안 됨 — `BRANDS_DIR`가 실제 repo `brands/`로 폴백해 쓰기 테스트가 working tree를 오염시키고 재실행이 중복 409를 비결정적으로 밟는다. 복사할 정본은 **`apps/daemon/tests/design-system-tool-routes.test.ts:58-70`** — `mkdtempSync` 루트 + 주입 db로 express 앱에 register 함수만 붙이는 패턴.

- [ ] **Red:** 주입 하니스(tmp brandsDir + 주입 db) 위에서 스펙 §3 표의 라우트 계약 테스트 — 201 생성/중복 409/비라틴 title id 미지정 400, PUT 패치·404, docs `core`·`:key` 저장(단일 `:key` 핸들러의 core 특수 분기 — `core`가 deliverable 404로 새면 red)·미등재 키 404, deliverable add 409·remove, **DELETE 바인딩 프로젝트 409 `{ projectCount }`**(주입 db에 `projects.brand_id` 행 직접 시딩)·성공 삭제
- [ ] **Green:** `registerBrandWriteRoutes` 구현 — 레지스트리 함수 호출 + `BrandWriteError` 코드→400/409 매핑 + projectCount 검사. `server.ts`는 `registerBrandWriteRoutes(app, { brandsDir: BRANDS_DIR, db })` 호출만. asset 업로드는 Task 4로 분리
- [ ] daemon 테스트 스위트 green (baseline 대조)
- [ ] Commit

### Task 4: asset 업로드 라우트

**Files:**
- Modify: `apps/daemon/src/server.ts`, `apps/daemon/tests/brand-write-routes.test.ts`

- [ ] **Red:** multipart 업로드 테스트 — png 업로드 → 200 `{ path, url }` + 파일 존재, `role=icon` → manifest `presentation.icon` 갱신, `role=logo` 동형, 비허용 mime **400**, 6MB **413**(`sendMulterError`가 `LIMIT_FILE_SIZE→413` — 기존 컨벤션, 400 아님. plan-reviewer High), 404 브랜드
- [ ] **Green:** `brandAssetUpload = multer memoryStorage 5MB` 인스턴스 (pluginUpload 관례) + `POST /api/brands/:id/assets` — mime 허용 png·jpeg·webp·svg. **mime 거부는 명시 400 매핑 필수**: multer `fileFilter` 에러는 MulterError가 아니라 방치 시 500으로 샘. `sanitizeName` 재사용, `writeBrandAsset` 호출
- [ ] Commit

### Task 5: CLI `od brand` 쓰기 서브커맨드

**Files:**
- Modify: `apps/daemon/src/cli.ts` (`runBrand`)
- 확인: 기존 CLI 테스트 패턴 (`grep -rl "od brand\|runBrand" apps/daemon/tests`) — 있으면 동형 추가, 없으면 라우트 테스트가 계약을 커버하므로 help 텍스트 검증 수준

- [ ] 스펙 §6 서브커맨드 구현: `create`(--title·--id·--subtitle·--tagline) / `update`(--title·--presentation-json, `-`는 stdin) / `doc set`(--prompt-file, `-`는 stdin) / `deliverable add|remove` / `asset add`(--icon|--logo, 글로벌 FormData·Blob) / `delete --yes`(플래그 없으면 exit 2)
- [ ] 전 커맨드 `--json` 지원, help 텍스트 갱신
- [ ] 수동 smoke: dev daemon 상대로 create→doc set→delete 왕복 (`--json` 출력 확인)
- [ ] Commit

### Task 6: i18n 키

**Files:**
- Modify: `apps/web/src/i18n/types.ts` + `apps/web/src/i18n/locales/*.ts` (19개)

- [ ] 스펙 §7 키 그룹 확정 (Task 7·8 UI 문구 목록을 먼저 뽑아 한 번에) — types.ts 선행
- [ ] 19 로케일 전부 채움 (ko·en 네이티브, 나머지 성실 번역 — Braze 선례)
- [ ] `pnpm --filter @marketing-ax/web typecheck` green
- [ ] Commit

### Task 7: web — 생성 모달 + BrandsTab 진입점 (red-spec 선행)

**Files:**
- Create: `apps/web/src/components/BrandCreateModal.tsx` + `.module.css`
- Modify: `apps/web/src/components/BrandsTab.tsx`, `apps/web/src/providers/registry.ts`
- Create/Modify: `apps/web/tests/` 기존 BrandsTab 테스트 파일 위치 확인 후 병합

- [ ] `registry.ts`에 쓰기 fetcher 7종 추가 (`createBrand`·`updateBrand`·`saveBrandDoc`·`addBrandDeliverable`·`removeBrandDeliverable`·`uploadBrandAsset`·`deleteBrand`)
- [ ] **Red:** BrandsTab "+ 새 브랜드" 버튼 렌더·클릭 → 모달, 4필드(제목·id 자동 슬러그 제안·subtitle·tagline) 제출 → createBrand 호출 + onOpenBrand(신규 id) 단언
- [ ] **Green:** 모달 구현 — `@marketing-ax/components` Button, CSS Modules, 라틴 title 입력 시 id 자동 제안(수동 편집 시 잠금), 에러 표시(409 중복 id)
- [ ] Commit

### Task 8: web — 상세 편집 모드 (red-spec 선행)

**Files:**
- Create: `apps/web/src/components/BrandPresentationForm.tsx` + `.module.css`
- Modify: `apps/web/src/components/BrandDetailView.tsx` + `.module.css`
- Modify: web 테스트

- [ ] **Red:** 편집 토글 → 폼 표시·저장 시 `updateBrand` 호출 + 재fetch, 문서 편집 토글 → textarea·저장 시 `saveBrandDoc`, 채널 추가 인라인 폼 → `addBrandDeliverable`, 채널 제거, 아이콘/로고 file input → `uploadBrandAsset`, 삭제 버튼 `projectCount > 0`이면 disabled + 사유 문구 / 0이면 confirm 후 `deleteBrand` + onBack
- [ ] **Green:** 구현 — 스펙 §5 배치. 파일 헤더 Notes의 "편집 기능 없음(서브프로젝트 B)" 문구 제거
- [ ] `pnpm --filter @marketing-ax/web test` + `typecheck` green (baseline 대조)
- [ ] Commit

### Task 9: 검증 스윕 + 라이브 도그푸딩

- [ ] `pnpm guard` + `pnpm typecheck` + daemon·web 테스트 전체 — 실패는 main baseline 대조로 pre-existing 판별
- [ ] browse 라이브: 새 브랜드 생성 → presentation 편집 → brand.md에 고유 문구 심기 → 채널 추가 → 아이콘 업로드 → 프로젝트 생성(신규 브랜드 바인딩) → run 산출물에서 고유 문구 grep 확인 → 브랜드 삭제 차단(바인딩 존재) 확인
- [ ] `BrandsTab.tsx`/`BrandDetailView.tsx` 파일 헤더 Notes 갱신 (서브프로젝트 B 완료 반영)
- [ ] 잔여 이슈는 PR 본문 "Adjacent issues"로 이월 (스코프 홀드)
- [ ] Commit + PR (Surface area: HTTP·UI·CLI·i18n 전부 체크, 스크린샷 = Brands 탭 진입점 + 편집 모드 before/after)
