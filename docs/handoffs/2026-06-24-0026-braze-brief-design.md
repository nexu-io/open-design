---
status: in_progress
position: Braze IAM — 컨펌 기획안 → brief.md 문서 저장 기능 (설계 대기, 미착수)
last_updated: 2026-06-23T23:36:11Z
---

# Blocking Constraints — 재개 시 먼저 읽고 체크
> 실패로 발견된 제약만. 재개 에이전트는 각 항목 이해를 표명한 후 진행.
- [ ] CONSTRAINT: node@24 필수 — 시스템 node v25라 pnpm/typecheck/better-sqlite3 깨짐. 모든 pnpm/node 명령 앞에 `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- [ ] CONSTRAINT: 데이터-경로는 RUNTIME_DATA_DIR 파생만 — daemon 소유 파일(프로젝트 파일/아티팩트 포함)은 `RUNTIME_DATA_DIR`/`PROJECTS_DIR`/`ARTIFACTS_DIR`에서 파생. brief.md 저장 위치를 cwd-상대나 임의 경로로 하드코딩 금지(AGENTS.md "Daemon data directory contract"). 모르면 코어 결정 요청.
- [ ] CONSTRAINT: dual-track 필수 — 새 capability는 web UI + `od` CLI 둘 다 같은 `/api/*` 호출. brief 저장도 web+CLI 양쪽 노출(AGENTS.md "Capability exposure").
- [ ] CONSTRAINT: bodoc = PII/예시브랜드 — 참조 brief.md에 bodoc 식별자(`bodoc://`, 보닥명, attributes) 다수. skill/craft/daemon 로직은 **브랜드-애그노스틱** 유지. 브랜드 사실은 활성 design_system에서만 로드. brief.md 생성 템플릿에 보닥 하드코딩 금지.

## 현재 상태
**직전 작업(Braze IAM 홈 칩) = 완료·커밋됨 (`5feaf5677`).** 칩 클릭/자유 프롬프트 → example-braze-iam 시나리오 활성 → braze 도메인 인터뷰 정상 구동 검증(브라우저 테스트 통과, 스크린샷 확인).

**새 작업(미착수) = 컨펌된 기획안을 디벨롭된 brief.md 문서로 디자인 프로젝트에 저장.**
- 요구: braze IAM 제작 플로우에서 기획안이 **컨펌(plan_confirmed)** 되면, 그 기획안을 **마크다운 문서(brief.md)** 로 렌더해 **디자인 프로젝트 파일로 별도 저장**.
- 형식 = 참조 문서보다 **더 디벨롭된 형태**. 참조: `/Users/gyumin/Project/braze-iam/output/2026-06-22-signup-encourage/brief.md` (repo 밖, 디스크에 존재 — 재개 시 먼저 Read).
- 참조 brief.md 구조: ①기본정보 ②인터뷰 결정사항(목적·타겟·형식·톤·트리거·개인화 어트리뷰트 선정/제외+근거·CTA) ③기획안(기본정보·요약[배경/가설/목적]·타겟팅·콘텐츠[핵심카피 A/B·CTA·톤·타입]·트리거/스케줄·성과지표) ④부록(개인화변수·디자인방향[차용 레퍼런스·토큰매핑·variant 차별]).

## 잔여 (이 작업 = 미착수, 설계부터)
- **설계 미결정 4건 (재개 시 brainstorming 먼저):**
  1. **생성 주체**: daemon 결정론적 템플릿(braze_plan_v1 필드→markdown) vs 에이전트/SKILL.md가 LLM 저작(참조처럼 개인화 선정근거·디자인방향 등 추론 산문 포함). 참조 brief는 LLM 추론 다수 → SKILL 저작 유력하나 "별도 저장"은 daemon이 파일화해야 일관. 하이브리드(daemon이 골격 파일 + 에이전트가 디벨롭) 후보.
  2. **저장 위치/표면**: 디자인 프로젝트 파일(`PROJECTS_DIR/<proj>/...`, "디자인 파일" 탭 노출) vs 아티팩트(`ARTIFACTS_DIR`). 참조는 `output/<date>-<slug>/brief.md` 폴더 구조. OD 매핑 = `braze/<date>-<slug>/brief.md` 후보. 파일 쓰기·표면 노출 메커니즘 코드 확인 필요(server.ts 프로젝트 파일 라우트).
  3. **데이터 계약**: brief는 현 `braze_plan_v1`(summary/iamFormat/tone/emphasis/variants[label,angle]/targeting/cta/image/rejections)보다 필드 많음(배경·가설·성과지표·개인화 선정표·디자인방향). plan 스키마 확장 vs brief는 plan+인터뷰답+design_system 합성 산물로 별도. → contracts/braze.ts 확장 여부.
  4. **트리거 지점**: `braze-routes.ts` `POST /api/braze/messages/:id/plan/decision` confirm 분기(현재 variant spawn + status=plan_confirmed)에 brief 파일 생성 추가 vs 별도 엔드포인트.
- **구현(설계 후)**: 트리거 지점 + 파일 쓰기 + dual-track(web "디자인 파일" 노출 + `od braze` CLI에서 brief 경로 반환) + SKILL.md 갱신(컨펌 후 brief 저장 단계 명시) + 테스트.

## 완료 (이번 세션)
- **근본원인 진단**: braze-iam이 design-templates 스킬일 뿐 칩-활성 번들 플러그인 아니었음 → 자유 프롬프트가 od-default 라우터로 빠져 제네릭 폼+컨펌게이트 누락. `triggers:`는 UI 검색전용, 런타임 라우팅 안 함.
- **수정·커밋(`5feaf5677`, 30파일/+1579)**: `plugins/_official/examples/braze-iam/`(매니페스트 example-braze-iam + SKILL.md + example.html + references 4종) 번들 패키징 / `home-hero/chips.ts` 칩+union / HomeHero·HomeView 라벨·타이틀 헬퍼 braze 케이스 / i18n types + 19 로케일(`homeHero.chip.brazeIam`/`brazeIamHint`).
- **검증**: 플러그인 bundled 등록 ✓ / 칩 "Braze IAM" 렌더 ✓ / 브라우저 E2E — 칩→인터뷰(IAM포맷·톤·세그먼트·딥링크·혜택) 정상, 제네릭 폼 아님 ✓ / `pnpm guard` 63/63 ✓ / web typecheck ✓.

## 결정
- 칩 활성화 = 접근 A(번들 example 플러그인 패키징, HyperFrames 패턴) — 기존 apply-scenario 라우팅 재사용, 가장 검증된 경로 (사용자 선택).
- brief.md 저장 = 별도 신규 트랙. 사용자 지시로 퍼즈+핸드오프(설계부터 새 세션).

## Blockers / 사람 액션 대기
- 없음(설계 미결정은 재개 시 brainstorming으로 해소). PR #1 스크린샷은 여전히 사람 캡처 대기(별건).

## 인프라 상태
- dev 런타임 실행 중(백그라운드): web http://127.0.0.1:17573 / daemon http://127.0.0.1:17456 (node@24). 필요시 `pnpm tools-dev stop`.
- 테스트로 생성된 로컬 dev 데이터: 프로젝트 `braze-demo`(시드 3건) + `Braze IAM`(테스트 런, def55fb3). 정리 안 함.
- 브라우저 세션: gstack browse 데몬 떠있을 수 있음.

## Uncommitted
```
 M .gitignore        # gstack 툴링이 추가한 +.gstack/ — 이 작업 무관, 미스테이징(커밋 제외함)
?? HANDOFF.md         # 이 파일
?? docs/handoffs/2026-06-24-0836-braze-chip.md  # 이전 세션 HANDOFF 아카이브
```
(braze 칩 피처 파일은 5feaf5677로 커밋 완료)

## Next Action
1. 참조 Read: `/Users/gyumin/Project/braze-iam/output/2026-06-22-signup-encourage/brief.md` (+ 같은 폴더 revision-log.md / reviews/ / variants/ 구조도 참고 — 단 이번 요구는 brief.md 문서 저장에 집중).
2. `superpowers:brainstorming` — 위 설계 미결정 4건 합의(생성주체/저장위치/데이터계약/트리거지점).
3. 코드 매핑: `apps/daemon/src/braze-routes.ts` plan/decision confirm 분기 + 프로젝트 파일 쓰기 메커니즘(server.ts 프로젝트 파일 라우트/PROJECTS_DIR) + `packages/contracts/src/api/braze.ts` + `od braze` CLI + `plugins/_official/examples/braze-iam/SKILL.md`.
4. dual-track 구현 + 테스트.
