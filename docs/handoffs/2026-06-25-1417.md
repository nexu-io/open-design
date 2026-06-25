---
status: in_progress
position: P0 리브랜딩 v5 — Task1~5 구현완료 + daemon-99 triage 완료. Task5 task-review 미실행, Task6~14 잔여.
last_updated: 2026-06-25T04:30:50Z
---

# Blocking Constraints — 재개 시 먼저 읽고 자기말로 표명 후 진행
- [ ] CONSTRAINT: node@24 필수 — 모든 pnpm/node 앞 `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`. 시스템 node = v25.8.2(ABI 141), node@24 = ABI 137. 불일치 시 better-sqlite3 네이티브 import 실패 → daemon 테스트 대량 false-fail.
- [ ] CONSTRAINT: shell = zsh. `$PIPESTATUS` 빈값(zsh는 `$pipestatus` 소문자). 파이프 exit 필요하면 `cmd >log 2>&1; echo $?` 직접.
- [ ] CONSTRAINT: grep = `grep -rnE`(ERE). PCRE 룩어헤드 `(?!…)` BSD grep crash/무음 금지. 보존은 `| grep -vE "$PRESERVE"` 후필터. 룩어헤드는 perl만.
- [ ] CONSTRAINT: perl 치환 = shell-safe + regex-correct 둘 다 실코드 대조. `.od`는 `\.od`. env 토큰은 word-boundary `\bOD_X\b`. 복잡앵커는 단일쿼트 heredoc.
- [ ] CONSTRAINT(사고기반): 서브에이전트 git 규율 — 모든 구현자 디스패치에 `git checkout/switch/reset/rebase/pull/fetch/merge/stash/worktree/branch` 금지 + 커밋 전 `git rev-parse HEAD`(base) + 커밋 후 `git rev-parse HEAD~1`(부모) 검증 명시. (Task5 1차가 옛 커밋 위 작업 → 브랜치 orphan 사고.)

## Anti-Patterns (이번 세션 발견)
| 패턴 | 내용 | 심각도 | 회피책 |
|---|---|---|---|
| 환경 위생을 rebrand 회귀로 오진 | Task5 구현자가 daemon 99-fail을 "prompt/MAX_NODE_BIN" 탓으로 보고 → 실제는 better-sqlite3 ABI 불일치 + stale dist | blocking | 대량 부트스트랩 실패면 먼저 `node ABI` + 네이티브 import + dist 정합 확인 후 소스 의심 |
| per-task 게이트 누적 드리프트 미포착 | 타깃 테스트핀+typecheck만 돌려 daemon 전체스위트 456-fail 못 봄 | blocking | 남은 Task6~14 각 게이트에 **full `@marketing-ax/daemon test`(node@24)** 추가 |
| 완료 태스크 blind-spot | Task2(env)가 design-templates `.md`, Task4(URL)가 plugin fixture + lagging 테스트핀 누락. Task1 miss-class와 동형 | advisory | broad surface는 `.md`/fixture/test-pin 포함 검색 |

## 현재 상태
**브랜치 `feat/p0-rebrand`. HEAD = `08e1f10b7`(triage fix). 체인 정상(parent=c3a6faa96 검증).**
- merge-base(최종 whole-branch 리뷰 BASE) = `bf7047292`. rebrand 시작점(bookkeeping) = `1f0009a7b`.
- **durable ledger = `.superpowers/sdd/rebrand/progress.md`** (gitignored, 모든 task+triage SHA 기록 — recovery map).
- 활성 플랜 = `docs/superpowers/plans/2026-06-24-p0-rebranding-v5.md` (gitignored, 디스크영속). Task 목록: 1~14(+12b/12c). Task6~14 미실행.
- task brief/global-constraints = `.superpowers/sdd/task-N-brief.md`, `.superpowers/sdd/rebrand/global-constraints.md`.
- SDD 스킬: `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.0.3/skills/subagent-driven-development/scripts/{task-brief,review-package}`.

## 완료
- **Task1~5 구현** (Task1~4 리뷰 Approved, Task5 미리뷰). 커밋: T1 `443f6d25c`+fix `aa2bd2e3c`, T2 `a730a7b2b`, T3 `8d07ea7da`, T4 `30af8a2c3`+fix `70a0c8cbf`, T5 `55b97ee2b`.
- **daemon 99-fail triage 완료** (`08e1f10b7`): 456-fail→1-fail. 근본원인 3계층 규명 + codex 0.135.0 검증.
  - 448 = better-sqlite3 ABI 141≠137 → `rm dist/Release/*.node && (cd pnpm/better-sqlite3 && npm run build-release)` (node@24). `pnpm rebuild`만으론 캐시스킵.
  - 2 = plugin-runtime/dist stale `OPEN_DESIGN_PLUGIN_SPEC_VERSION`(소스는 MARKETING_AX_) → `pnpm --filter @marketing-ax/plugin-runtime build`.
  - 4 = 진짜 rebrand miss → 커밋. SKILL.md env명만 MAX_*, publish 테스트핀, fixture URL.

## 잔여 (우선순위 순)
1. **Task5 task-review** — review-package `70a0c8cbf 55b97ee2b` → task-reviewer. 7파일 ipc/pipe/session 정합.
2. **Task6~9 순차** (파일공유). 각 종료게이트 = grep0 후필터 + typecheck + **full daemon test(node@24)** ← triage 교훈 반영.
   - Task7 사람판단 대기: 데이터루트 `RUNTIME_DATA_DIR` escape(registry.ts:53 등, AGENTS contract 엄격) + `.od-data`/`.od-e2e` alias 결정.
3. **Task10·11·12·12b·12c·14 병렬** (사용자 결정: worktree 격리). disjoint(.github/·nix/·deploy/·helm+charts·telemetry-worker·AGENTS). Task9 후 분기.
4. **Task13 최종 surface 게이트** (합류 후 단방향 검증).
5. **최종 whole-branch 리뷰** (review-package `bf7047292 HEAD`, 강한 모델). ledger MINOR-CARRY 전달.
6. **finishing-a-development-branch** 스킬로 마무리(PR/merge).

## 결정 (이번 세션)
- daemon-99 triage 방식 = HEAD vs base 대조 시도했으나 base worktree install이 node@24로 빌드돼 confounder → 대신 에러 직접 분류로 근본원인 규명(better-sqlite3 ABI). codex 0.135.0 consult로 분류+fixture 판정 2차 검증.
- 4 rebrand miss = 완료 Task2/4 누락이라 follow-up 커밋으로 즉시 수정(Task1 miss-class `aa2bd2e3c` 선례). owning-task 재오픈 대신.
- fixture `registry-starter/open-design.json` repo/homepage = **리브랜드**(codex 판정: 제품 registry/publish 경로가 권위신호, example-deck/landing 귀속 아님). nexu-io/open-design는 OSS 귀속 표면만 보존.
- SKILL.md = env 식별자(OD_*)만 MAX_*. "Open Design" 제품명(Task8)·`.od-skills`(Task7) 보존 — 태스크 경계 유지.

## Blockers / 사람 액션 대기
- 없음(차단). Task7 진입 시 데이터루트 escape + .od alias = 메인테이너(사용자) 판단 필요(AGENTS.md:152-160).

## 인프라 상태
- 백그라운드 프로세스 없음. base worktree(`/private/tmp/od-base-1f0009`) 제거됨.
- main repo 환경 위생 정상화됨: better-sqlite3 = node@24 ABI137 재빌드, plugin-runtime/dist = 최신. **이 상태 유지**(구현자 서브에이전트가 같은 repo 사용). dist/sqlite는 gitignore라 커밋 안 됨.

## MINOR-CARRY (최종 triage 전달)
- `vercel.json:3` `OD_WEB_OUTPUT_MODE` 루트라 무스코프 — code가 MAX_로 읽으면 바인딩 깨질 갭. final서 config↔code env 정합 확인.
- **chat-route `external_directory` 테스트 1-fail = pre-existing 환경**(allowed-dir 구성 + `/var`↔`/private/var` 정규화, repo-root design-systems/skills 누출). rebrand 무관(codex 확인). 별도 red-spec 후속, rebrand 스코프 아님.
- Task2 report "dist 커밋" 표현 부정확(무해, dist gitignored).

## Uncommitted
```
 D HANDOFF.md                              # 이 파일 재생성 중(아래 참조)
?? docs/handoffs/2026-06-25-1100.md        # 이전 핸드오프 아카이브(resume-work). bookkeeping, 미커밋 무해.
# 워킹트리: 3 fix는 08e1f10b7로 커밋됨. main 대비 feat/p0-rebrand 미푸시.
```

## Next Action
1. `/resume-work` → Blocking Constraints 5건 자기말 표명(특히 node@24 ABI, zsh pipestatus, git 규율).
2. `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` + `git rev-parse HEAD` = `08e1f10b7` 확인. ledger Read.
3. **Task5 task-review** 먼저 (review-package `70a0c8cbf 55b97ee2b`). 그 후 Task6~9 순차(각 게이트에 full daemon test 추가) → Task10~14 worktree 병렬 → Task13 → 최종리뷰 → finishing.
