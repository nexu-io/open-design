---
status: in_progress
position: 브랜드 페이지 서브프로젝트 B — 스펙·플랜 확정, SDD 구현 0/9
last_updated: 2026-07-10T05:50:35Z
---

# Blocking Constraints — 재개 시 먼저 읽고 체크
> 재개 에이전트는 각 항목 이해를 표명한 후 진행.
- [ ] CONSTRAINT: 라우트 테스트 하니스 오염 (blocking) — `apps/daemon/tests/brands-routes.test.ts`의 `startServer({ port: 0 })` 풀부팅을 쓰기 테스트에 복사하면 `BRANDS_DIR`가 실제 repo `brands/`로 폴백해 working tree 오염 + 재실행 시 중복 409 비결정 실패. 회피책: `registerBrandWriteRoutes(app, { brandsDir, db })` 주입형 헬퍼 + `apps/daemon/tests/design-system-tool-routes.test.ts:58-70`의 mkdtemp 패턴이 정본 (플랜 Task 3에 명시).
- [ ] CONSTRAINT: DS slugify 재사용 금지 (blocking) — `design-systems.ts`의 `slugify`/`uniqueSlug`는 module-private라 import 불가하고, `|| 'design-system'` 폴백 때문에 비라틴 title의 400 "id required" 분기가 죽는다. 회피책: 브랜드 로컬 slugify(공백 슬러그 그대로 반환) 구현 (플랜 Task 2에 명시).
- [ ] CONSTRAINT: docs/superpowers는 gitignored (advisory) — 이번 세션 커밋이 실제 실패. 스펙·플랜 문서 커밋은 `git add -f` 필요 (기존 파일 전부 -f 선례).

## 현재 상태
브랜드 페이지 잔여작업 3건 식별(생성/편집=서브프로젝트 B, 브랜드 스위처, 문서 상대 이미지 렌더) 후 서브프로젝트 B 착수. 스펙+플랜 작성 → plan-reviewer 독립검증(APPROVE-WITH-CHANGES) → 6픽스 문서 반영 → 커밋 `7abc80d8c` 완료. **구현은 시작 안 함 (Task 0/9).**

- 스펙: `docs/superpowers/specs/2026-07-10-brand-page-subproject-b-design.md`
- 플랜: `docs/superpowers/plans/2026-07-10-brand-page-subproject-b.md` (SDD 9태스크, red-spec 체크박스)
- 브랜치: `Gmin82/brand-page-remaining-tasks` (main은 braze IAM 고도화 병행 — 파일 겹침 최소, 충돌 리스크 낮음)

## 완료
- 잔여작업 조사: 서브프로젝트 A(read-only 레일)는 완료 상태 확인 — 레지스트리·GET 3라우트·`od brand list/show`·Brands 탭·상세·톱바 칩
- 스코프 확정 (사용자): BRANDS_DIR 단일 루트 CRUD / 편집 표면 5종(manifest 폼·문서 본문·채널 추가/삭제·아이콘·로고 업로드) / 삭제 projectCount>0 차단
- 스펙·플랜 문서 작성 + plan-reviewer 검증 + 픽스 반영 + 커밋

## 잔여
- 플랜 Task 1~9 전부 (SDD): ①contracts DTO ②daemon 레지스트리 쓰기 함수 ③HTTP 쓰기 라우트(주입형 헬퍼) ④asset 업로드 ⑤`od brand` CLI 확장 ⑥i18n 19로케일 ⑦web 생성 모달 ⑧web 상세 편집 ⑨검증 스윕+browse 도그푸딩+PR
- (B 이후 별건) 브랜드 스위처 — `EntryShell.tsx:548` "브랜드 스위처 미착수", 브랜드 2개 생긴 뒤 실익
- (별건) 브랜드 문서 프리뷰 상대 이미지 렌더 — asset 라우트 존재, 렌더러 경로 리라이트만

## 결정
- 저장 루트 = BRANDS_DIR 단일 루트 직접 CRUD (bodoc 포함 편집) — DS식 user: 이중 루트 미채택, 도그푸딩 즉효 우선. packaged read-only 대응은 후속 분리 (사용자 확정)
- 삭제 = projectCount>0이면 409 `{ projectCount }` — dangling brand_id 방지 (사용자 확정)
- createBrand 에러 = typed `BrandWriteError`(`id-required`/`invalid-id`/`duplicate-id`) — 라우트 400/409 구분 채널 (plan-reviewer High)
- asset 크기 초과 = 413 (기존 `sendMulterError` 컨벤션), mime 거부 = 라우트 명시 400 매핑 (fileFilter 에러 방치 시 500) (plan-reviewer High)
- `/docs/core`+`/docs/:key` = 단일 `:key` 핸들러 내 core 특수 분기 — 라우트 등록 순서 함정 회피 (plan-reviewer Medium)
- id 게이트 = 레지스트리 함수 내부 (`isValidBrandId` module-private, 기존 read 모델 동일) (plan-reviewer Medium)
- 생성 모달 = 핵심 4필드(제목·id 자동슬러그·subtitle·tagline), 전체 presentation은 상세 편집에서

## Blockers / 사람 액션 대기
- 없음

## 인프라 상태
- 실행 중 프로세스 없음 (dev 서버·watcher 미기동)

## Uncommitted
- 없음 (working tree clean, HEAD `7abc80d8c`)

## Next Action
새 세션에서 superpowers:subagent-driven-development로 `docs/superpowers/plans/2026-07-10-brand-page-subproject-b.md` Task 1부터 실행. 첫 명령: 플랜 문서 Read → Task 1 (contracts — `packages/contracts/src/api/brands.ts`에 logo 필드+쓰기 DTO, red 없음·build green이 게이트: `pnpm --filter @marketing-ax/contracts build`). 검증 shell은 Node 24 PATH prefix 필수 (메모리: 쉘 node v25 → daemon 가짜 실패).
