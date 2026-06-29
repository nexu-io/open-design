---
status: in_progress
position: P2 Naver-blog 산출물 — 구현 플랜 완성+독립검증+정정, 구현 진입 대기
last_updated: 2026-06-29T00:50:06Z
---

# Blocking Constraints — 재개 시 먼저 읽고 체크
> 실패로 발견된 제약만. 구현이 다음 액션이라 전부 곧 발동. 재개 에이전트는 각 항목 이해를 표명한 후 진행.
- [ ] CONSTRAINT: node@24 필수 — pnpm/node 앞 `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`. 시스템 node25(ABI141)≠node@24(ABI137) → better-sqlite3 로드 실패. (이전 세션)
- [ ] CONSTRAINT: `pnpm typecheck` 전 `pnpm --filter @marketing-ax/contracts build` **먼저**. dist gitignored, stale면 TS2305/2339. 이번 작업이 contracts(projects.ts BADGE_TONES, manifest.ts) 수정 → 특히 중요. (플랜 Global Constraints baked)
- [ ] CONSTRAINT: green 톤 시퀀싱 — ①contracts BADGE_TONES+green+build → ②TONE_CLASS/CSS → ③manifest(tone:'green'). 부팅 등록이 resolvePluginFolder→validateSafe(PluginManifestSchema)로 파싱 → green 미선행 시 `tone:'green'` 매니페스트 파싱 실패 → registerOne(registry.ts) probe.ok=false → warn+return, upsert 안 됨(조용히 실패). 플랜 Task 순서가 이미 강제(1→2→6). (plan-reviewer 검증)
- [ ] CONSTRAINT: i18n 2세트 — manifest i18n = **18 키**(Braze 키셋: zh-CN,zh-TW,ja,ko,de,fr,ru,es,pt-BR,it,vi,pl,id,nl,ar,tr,uk,en; z.record permissive 비강제). web Dict = **19 로케일**(en,id,de,zh-CN,zh-TW,pt-BR,es-ES,ru,fa,ar,ja,ko,pl,hu,fr,uk,tr,th,it; it.ts 포함). web 키 누락 시 typecheck RED. (검증됨)
- [ ] CONSTRAINT: 배지 quiet-fail — create가 `pluginId='example-naver-blog'` 명시 전달해야 `resolveStampBadge`(project-routes.ts:761, **NOT src/routes/**) 스탬프. prototype 기본=example-web-prototype(배지 無)라 누락 시 배지 조용히 사라짐. 칩 action.pluginId + CLI `--plugin` 둘 다 검증. (검증됨)
- [ ] CONSTRAINT: commit = **Co-authored-by 금지**(AGENTS.md "Git commit policy"가 글로벌 디폴트 위에). 형식 `[what] — [why]`. gh push 전 `gh auth switch --user Gmin82`(origin=Gmin82/open-design, 캐시 evan2942 → 403).

## Anti-Patterns (이번 세션에서 발견)
| 패턴 | 내용 | 심각도 | 회피책 |
|---|---|---|---|
| 자가편집 확증편향(재발) | 내가 plan에 주입한 3건 사실오류(F1 import db.js→실제 registry.js / F2 icon 'file-text'→없음 / F3 "critique.ts 없음"→실제 src/critique.ts에 존재)를 self-review서 못 잡음. 독립 plan-reviewer+Explore가 전부 포착 | advisory | 스펙/플랜 자가편집 후 독립 서브에이전트 검증 필수(2세션 연속 입증) |
| 부분경로 grep 단정 | critique.ts를 `packages/contracts/src/plugins/`만 보고 "없음" 단정 → 실제 `src/` 직하에 존재 | advisory | "파일 없음" 단정 전 패키지 루트 전체 grep |

## 현재 상태
P2 2번째 버티컬 = 네이버 블로그 산출물. **구현 플랜 작성 완료 → 독립검증(plan-reviewer APPROVE-WITH-CHANGES + Explore 6-fact verify) → 결함 6건(F1~F6) 정정 완료.** 다음 = 플랜 Task 1부터 구현(subagent-driven-development 권장).

- 스펙(SSoT, gitignored): `docs/superpowers/specs/2026-06-26-naver-blog-deliverable-design.md` (2라운드 리뷰 반영본)
- **구현 플랜(gitignored): `docs/superpowers/plans/2026-06-29-naver-blog-deliverable.md`** ← 재개 시 이것부터 Read
- 설계 = Braze IAM 경량(Path A) 복제. 데몬 코드 0. 3층(스킬/craft/bodoc DESIGN.md). 9 Task, TDD red-spec 단위.

## 완료 (이번 세션)
- `/resume-work` 복원(이전 HANDOFF → `docs/handoffs/2026-06-29-0924.md` 아카이브).
- **fact-gathering 워크플로**(14 reader 병렬, 682k tok): Braze 레퍼런스/수정대상/데몬검증/도메인소스 정확한 현재 코드·라인·시그니처 수집. 결과로 스펙 라인번호 drift 다수 확인.
- **writing-plans 스킬**: 9 Task 구현 플랜 작성(Global Constraints + File Structure + Task별 TDD step + self-review §1~3). 모든 파일 full content(manifest JSON·SKILL·craft 13룰·example.html·references·DESIGN §11·테스트 2종·칩/i18n).
- **독립 2-에이전트 검증 병렬**: plan-reviewer(APPROVE-WITH-CHANGES, 7 findings) + Explore(6-fact verify). 교차 일치.
- **결함 6건 정정**: F1 import registry.js / F2 icon 'file' / F3 critique.ts 선례 복원 / F4 discovery 라우트 검증 추가(스펙 §14) / F5 Task2 라벨 정정+완전성 가드 / F6 drift 가드 서브트리 목록 동등성.

## 잔여
1. **구현** — 플랜 Task 1~8 순서대로(green 시퀀싱 강제). 신규 ~12파일(craft, 정본 plugin 4종, 미러 4종, 테스트 2종) / 수정 ~9(contracts×2, web card-tag+css+chips+HomeHero+types+locales×19, DESIGN.md).
2. **검증** — 플랜 Task 9(guard→contracts build→typecheck→pkg test/build, UI 수락, CLI dual-track 수락 teeth, discovery 라우트).
3. **PR** — gh auth switch 후, 템플릿 전 섹션 + dual-track 명시 + 칩 진입점 스크린샷.

## 결정 (이번 세션 — DECISIONS.md append됨)
- 구현 플랜 = 9 Task TDD, green 시퀀싱(contracts→web→manifest)을 Task 순서로 강제. 근거: 매니페스트 green 미선행 시 부팅 파싱 조용히 실패.
- plan 독립검증 = plan-reviewer + Explore 병렬. 근거: 자가편집 확증편향 재발(주입결함 3건 self-review 통과).
- 검증결과 자동반영 안 함(글로벌 룰) — 단 F1~F3은 양 에이전트 검증된 명백 버그라 즉시 정정, F4~F6 강화도 적용. F7(line-number) prose 앵커로 보류.
- blockquote 보더 #000(style SSoT) vs #333(2차) → #000 채택+craft에 플래그.
- 16개 비-CJK 로케일 chip i18n = 영문 폴백(Braze description_i18n 선례), CJK(ko/ja/zh)만 네이티브. 네이티브 번역은 후속.

## Blockers / 사람 액션 대기
- 없음. 게이트 = 사용자가 구현 진입 승인(+ 실행 방식: subagent-driven vs inline).

## 인프라 상태
- dev 런타임 미기동. 이번 세션 빌드 0회(플랜 작성·검증만, 코드 0줄 변경).
- 워크플로 트랜스크립트 잔존(무해): `wf_0f7ab4db-85e`(이번 fact-gathering), `wf_69f3df9d-979`(braze, 이전).
- contracts dist 빌드상태 미확인 — 구현 진입 시 `pnpm --filter @marketing-ax/contracts build` 먼저(CONSTRAINT).

## Uncommitted
```
 M DECISIONS.md
 M docs/marketing-ax-roadmap.md
?? docs/handoffs/2026-06-26-1553.md
?? docs/handoffs/2026-06-26-1638.md
?? docs/handoffs/2026-06-29-0924.md
```
(스펙·플랜은 docs/superpowers/ gitignored — git status 미표시, 디스크 영속. 이번 세션 tracked 코드 변경 0.)

## Next Action
새 세션: `/resume-work` → 플랜 `docs/superpowers/plans/2026-06-29-naver-blog-deliverable.md` Read(F1~F6 정정 최종본) → Blocking Constraints 6건 이해 표명 → **subagent-driven-development 스킬로 Task 1(contracts BADGE_TONES+green)부터 구현**. 구현 순서 = 플랜 Task 번호 = green 시퀀싱(①contracts ②web ③manifest) 준수.
