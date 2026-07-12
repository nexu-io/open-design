# 브랜드 페이지 서브프로젝트 B — 생성·편집·삭제 (풀 CRUD) 설계

- 날짜: 2026-07-10
- 상태: 설계 확정 대기 (사용자 리뷰)
- 브랜치: `Gmin82/brand-page-remaining-tasks` (main은 braze IAM 고도화 진행 중 — 파일 겹침 최소)
- 선행: 서브프로젝트 A (read-only 브랜드 레일) 완료 — 레지스트리(`apps/daemon/src/brands.ts`), GET 3라우트, `od brand list/show`, Brands 탭·상세·톱바 칩

## 배경

브랜드 레일은 현재 read-only다. 브랜드 등록·수정은 `brands/<id>/` 폴더를 손으로 만들어야 하고, UI·CLI 어느 표면에도 쓰기 경로가 없다. P2 브랜드 다중화(브랜드 N개)가 여기 종속: 두 번째 브랜드를 제품 안에서 등록할 수 없다.

`BrandsTab.tsx:5` / `BrandDetailView.tsx:5` 주석이 이 서브프로젝트를 예약해 두었다: "생성/편집(+새 브랜드·⋯메뉴)은 서브프로젝트 B".

## 결정사항 (사용자 확정, 2026-07-10)

| 항목 | 결정 |
|---|---|
| 저장 루트 | **`BRANDS_DIR` 단일 루트 직접 CRUD** — 번들 bodoc 포함 전 브랜드 편집 가능. DS식 이중 루트(`user:` prefix) 미채택. 트레이드오프: packaged 설치본 리소스 루트가 read-only일 수 있음 → user-루트 오버레이는 후속 분리 |
| 편집 표면 | manifest 필드 폼 + 문서 본문 편집(brand.md·deliverables/*.md) + 채널 추가/삭제 + 아이콘 업로드 + **로고 업로드** |
| 삭제 | 포함 — `projectCount > 0`이면 409 차단 (dangling `brand_id` 방지) |

## 설계

### §1. 저장 모델

- 쓰기 대상 = `BRANDS_DIR` (dev는 repo `brands/`, packaged는 리소스 루트 — `server.ts:1351 resolveDaemonResourceDir`).
- 기존 읽기 레일(GET 3라우트·run 프롬프트 주입·`pickBrandBinding`) 변경 없음 — 쓰기가 같은 파일을 고치면 읽기는 자동 반영.
- dev 모드에서 편집 = repo working tree diff 발생. 의도된 동작 (브랜드 콘텐츠는 repo 자산).
- 파일 쓰기는 DS 선례(`createUserDesignSystem`)와 동일하게 `fs.writeFile` 직접 — 레지스트리 파일은 소형이라 temp+rename 원자성 미도입.

### §2. contracts 확장 (`packages/contracts/src/api/brands.ts`)

- `BrandPresentation.logo?: string` 신설 — `assets/` 하위 로고 파일명 (아이콘과 동형).
- `BrandSummary.logoUrl?: string` 미러 (`/api/brands/:id/assets/<logo>`), 상세 히어로 표시용.
- 쓰기 DTO 신설:
  - `BrandCreateInput`: `{ id?: string; title: string; presentation?: BrandPresentation; coreBody?: string }`
  - `BrandUpdateInput`: `{ title?: string; presentation?: BrandPresentation }` — presentation은 **통째 교체**(폼이 전체 상태를 들고 있으므로 병합 시맨틱 불필요, 명시가 단순)
  - `BrandDeliverableInput`: `{ key: string; label?: string; designSystem?: string; body?: string }`
  - `BrandDocInput`: `{ body: string }`
  - `BrandAssetUploadResult`: `{ path: string; url: string }`

### §3. HTTP API (daemon `server.ts`)

| 라우트 | 역할 | 실패 |
|---|---|---|
| `POST /api/brands` | 생성. id 미지정 시 브랜드 로컬 `slugify(title)` + 유니크 suffix — **DS `slugify` 재사용 금지**: module-private인 데다 `|| 'design-system'` 폴백이 있어 비라틴 title의 400 분기가 죽는다. 브랜드판은 공백 슬러그를 그대로 반환 → 400 "id required". `manifest.json`(schemaVersion `od-brand/v1`) + `brand.md` 스캐폴드(`# <title>` + `## Palette` 주석 예시 테이블) 생성 → 201 BrandDetail | 중복 id 409, 검증 실패 400 |
| `PUT /api/brands/:id` | manifest 패치 — title·presentation 교체, `deliverables` 보존 (read-modify-write) | 404 |
| `PUT /api/brands/:id/docs/core` | `brand.md` 본문 저장 (`manifest.core` 오버라이드 존중). Palette 테이블도 이 본문 안 — 별도 팔레트 API 없음 | 404 |
| `PUT /api/brands/:id/docs/:key` | manifest 등재 deliverable 파일 본문 저장 — 미등재 키 404 (traversal 관례 유지). **라우팅 주의**: 단일 `:key` 핸들러 안에서 `core`를 특수 분기 (별도 라우트 2개로 가면 등록 순서에 따라 `:key`가 `core`를 가로챔) | 404 |
| `POST /api/brands/:id/deliverables` | 채널 추가 — manifest 엔트리(`deliverables/<key>.md`) + md 스캐폴드(body 미지정 시 `# <label ?? key>`) | 키 중복 409, 키 형식 400 |
| `DELETE /api/brands/:id/deliverables/:key` | 채널 제거 — manifest 엔트리 + 파일 삭제 | 404 |
| `POST /api/brands/:id/assets` | multipart 업로드 (multer **memoryStorage**, 5MB, mime 허용: png·jpeg·webp·svg). 쿼리/필드 `role=icon\|logo` 지정 시 `presentation.icon/logo` 갱신. 파일명 sanitize 후 `assets/<name>` 저장 → `BrandAssetUploadResult` | 404 / **크기 초과 413** (`sendMulterError`가 `LIMIT_FILE_SIZE→413` — 기존 컨벤션 유지) / 비허용 mime 400 (multer `fileFilter` 에러는 MulterError가 아니라 그대로 두면 500 — 라우트에서 명시적으로 400 매핑) |
| `DELETE /api/brands/:id` | 브랜드 삭제 — `projects.brand_id` 카운트 > 0이면 **409 `{ error, projectCount }`**. 통과 시 `fs.rm(<BRANDS_DIR>/<id>, recursive)` | 404 |

검증 규칙:

- 브랜드 id: 기존 `isValidBrandId` 게이트 (charset `[a-zA-Z0-9._-]`, `.`/`..` 거부). `isValidBrandId`는 module-private — 게이트는 **레지스트리 함수 내부**에서 수행하고 실패 시 null/에러 반환 (기존 `readBrandManifest` 내부 게이트 모델과 동일, 라우트 export 불필요). `createBrand`는 사용자 지정 `--id`를 명시 검증 (선행 manifest read가 없으므로).
- deliverable 키: `^[a-z0-9-]{1,32}$` — 프롬프트 주입 키이자 파일명 조각.
- `designSystem` ref: passthrough (manifest는 prose 계약 — DS 존재 검증은 run 시점 폴백이 이미 관용).
- packaged 미러(`routes/static-resource.ts`)의 브랜드 라우트: list/detail은 `next()` deferral, asset GET은 실핸들러 중복 — 어느 쪽도 POST/PUT/DELETE를 등록하지 않으므로 쓰기 라우트는 `server.ts` 단일 등록으로 충분 (plan-reviewer 검증 완료).

### §4. daemon 레지스트리 쓰기 함수 (`apps/daemon/src/brands.ts`)

라우트는 얇게, 로직은 레지스트리 모듈로 (기존 읽기 함수와 동형 배치):

```
createBrand(root, input)            → BrandManifestFile | throws BrandWriteError
                                      (id 슬러그·유니크, manifest+brand.md 쓰기.
                                       에러 코드: 'id-required'|'invalid-id' → 400, 'duplicate-id' → 409
                                       — 라우트가 400/409를 구분할 typed 에러 채널)
updateBrandManifest(root, id, input)→ BrandManifestFile | null
writeBrandCore(root, id, body)      → boolean
writeBrandDeliverableDoc(root, id, key, body) → boolean   (manifest 등재 키만)
addBrandDeliverable(root, id, input)→ BrandManifestFile | null  (중복 키 에러)
removeBrandDeliverable(root, id, key)→ BrandManifestFile | null
writeBrandAsset(root, id, name, bytes, role?) → { path } | null  (role 시 manifest 갱신)
deleteBrand(root, id)               → boolean  (프로젝트 카운트 검사는 라우트 — DB는 라우트 소유)
```

### §5. Web UI

- **BrandsTab**: 헤더 우측 "+ 새 브랜드" `Button` → `BrandCreateModal` (핵심 4필드: 제목·id(라틴 title이면 자동 슬러그 제안, 편집 가능)·subtitle·tagline). 생성 성공 → 상세로 이동. 전체 presentation은 상세 편집에서.
- **BrandDetailView** 편집 모드:
  - 히어로 옆 "편집" 토글 → presentation 전체 폼 (subtitle·tagline·website·audience·keyMessage·avoid·voiceTone(콤마 분리)·toneLabel·typography 3필드·neutralPalette) + 저장/취소 → `PUT /api/brands/:id`
  - 문서 섹션: 활성 문서에 "편집" 토글 → textarea + 저장/취소 → `PUT .../docs/<core|key>`
  - 채널: 문서 리스트 하단 "+ 채널" 인라인 폼 (key·label·designSystem) / 채널 탭 항목에 제거 버튼 (confirm)
  - 히어로: 아이콘·로고 업로드 버튼 (file input → multipart)
  - 위험 구역(페이지 하단): "브랜드 삭제" — confirm 다이얼로그, `projectCount > 0`이면 disabled + 사유 문구
- 신규 컴포넌트: `BrandCreateModal.tsx`(+module.css), `BrandPresentationForm.tsx`(상세 편집 폼 분리). 나머지는 BrandDetailView 내부 상태.
- `providers/registry.ts`에 쓰기 fetcher 추가: `createBrand`·`updateBrand`·`saveBrandDoc`·`addBrandDeliverable`·`removeBrandDeliverable`·`uploadBrandAsset`·`deleteBrand`.
- CSS Modules + `@marketing-ax/components` 프리미티브. 낙관 갱신 없음 — 저장 성공 후 `fetchBrand` 재호출 (기존 doc 전환 재호출 패턴 유지).

### §6. CLI (`od brand` 확장 — 듀얼트랙 클로저)

```
od brand create --title <t> [--id <id>] [--subtitle <s>] [--tagline <s>] [--json]
od brand update <id> [--title <t>] [--presentation-json <json|->] [--json]
od brand doc set <id> <core|채널키> --prompt-file <path|->
od brand deliverable add <id> <key> [--label <s>] [--design-system <ds>] [--prompt-file <path|->]
od brand deliverable remove <id> <key>
od brand asset add <id> <file> [--icon|--logo] [--json]
od brand delete <id> --yes
```

- 전부 동일 `/api/brands*` 호출 (UI와 같은 shape — AGENTS.md 캐퍼빌리티 규칙).
- `asset add`는 Node 24 글로벌 `FormData`/`Blob`으로 multipart 구성.
- `delete`는 `--yes` 없으면 확인 프롬프트 없이 즉시 종료(exit 2) — 헤드리스 안전.

### §7. i18n

신규 키 전부 `apps/web/src/i18n/types.ts` 선행 → 19 로케일. 예상 키 그룹: `brands.new*`(모달), `brands.edit*`/`brands.save`/`brands.cancel`(폼), `brands.doc*`(에디터), `brands.channelAdd*`/`brands.channelRemove*`, `brands.upload*`, `brands.delete*`(confirm·차단 사유), 에러 토스트.

### §8. 테스트 전략

- **레지스트리 유닛** (`apps/daemon/tests/`): tmp 루트로 create/update/doc/deliverable/asset/delete 왕복 + Palette 테이블 보존 + traversal id 거부 + 미등재 deliverable 키 거부. 각 태스크 red-spec 선행.
- **라우트 — 하니스 격리 필수**: 기존 `brands-routes.test.ts`는 `startServer({ port: 0 })` 풀부팅이라 `BRANDS_DIR`가 **실제 repo `brands/`로 폴백** — 쓰기 테스트가 working tree를 오염시키고 재실행 시 중복 409를 비결정적으로 밟는다 (plan-reviewer Critical). 쓰기 라우트는 `registerBrandWriteRoutes(app, { brandsDir, db })` 주입형 헬퍼로 추출하고, 테스트는 `design-system-tool-routes.test.ts:58-70`의 `mkdtempSync` 루트 주입 패턴을 복사한다. DELETE-409용 프로젝트 시딩도 주입 db로 해결. 기존 GET 라우트는 이동하지 않음 (기계적 이동과 행위 변경 혼합 금지).
- **라우트 커버리지**: 409 분기(중복 id·바인딩 프로젝트)·400/404·asset 413 포함.
- **web**: BrandsTab 모달 진입·생성 흐름, BrandDetailView 편집 토글·저장·삭제 disabled — 기존 컴포넌트 테스트 패턴.
- **라이브 도그푸딩**: browse로 신규 브랜드 생성 → 편집 → 프로젝트 바인딩 → run에서 신규 브랜드 컨텍스트 주입 확인 (grep-검증 가능한 고유 문구를 brand.md에 심음).

### §9. 비범위 (후속)

- 브랜드 스위처 (전역 현재-브랜드 상태) — 잔여작업 2번, 별건
- 문서 프리뷰 상대 이미지 렌더 — 잔여작업 3번, 별건
- AI 보조 브랜드 생성 (DS generation-jobs 유사) — 별도 스펙
- packaged read-only 리소스 루트 대응 (user-루트 오버레이 / copy-on-write)
- asset 삭제·목록 API

## 변경 파일

| 파일 | 변경 |
|---|---|
| `packages/contracts/src/api/brands.ts` | logo 필드 + 쓰기 DTO |
| `apps/daemon/src/brands.ts` | §4 쓰기 함수 8종 + `BrandWriteError` + 브랜드 로컬 slugify |
| `apps/daemon/src/brand-routes.ts` (신규) | `registerBrandWriteRoutes(app, { brandsDir, db })` — §3 쓰기 라우트 8종 (테스트 주입성) |
| `apps/daemon/src/server.ts` | `registerBrandWriteRoutes` 호출 + brand용 multer 인스턴스 |
| `apps/daemon/src/cli.ts` | `runBrand` 확장 (§6) |
| `apps/daemon/tests/*` | 레지스트리·라우트 테스트 |
| `apps/web/src/providers/registry.ts` | 쓰기 fetcher 7종 |
| `apps/web/src/components/BrandsTab.tsx` | + 새 브랜드 버튼·모달 진입 |
| `apps/web/src/components/BrandCreateModal.tsx` (신규) | 생성 모달 |
| `apps/web/src/components/BrandPresentationForm.tsx` (신규) | presentation 편집 폼 |
| `apps/web/src/components/BrandDetailView.tsx` | 편집 모드 전반 |
| `apps/web/src/i18n/types.ts` + 19 로케일 | §7 키 |
| `apps/web/tests/*` | 컴포넌트 테스트 |
