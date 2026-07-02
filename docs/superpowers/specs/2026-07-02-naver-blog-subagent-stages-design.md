# naver-blog 리서치·검수 서브에이전트 분리 — 설계

- 날짜: 2026-07-02
- 상태: 설계 확정 대기 (사용자 리뷰)
- 브랜치: `fu/p2-naver-blog`

## 배경

naver-blog 스킬 7단계 중 3단계 Research와 6단계 Self-review가 메인 에이전트 인라인으로 실행된다. 문제 세 가지:

1. **검수 객관성** — 글을 쓴 에이전트가 자기 글을 채점하면 편향된다. 깨끗한 컨텍스트의 검수자가 필요하다.
2. **컨텍스트 오염** — 리서치 중 WebSearch 결과 덤프가 메인 컨텍스트를 차지해 이후 작성 품질을 떨어뜨린다.
3. **전문화** — 리서치 전용·검수 전용 프롬프트로 각 단계 깊이를 높인다.

OD daemon에는 서브에이전트 오케스트레이션이 없다(1 run = 1 agent CLI 프로세스). 단, spawn되는 Claude Code CLI는 자체 Task tool을 쓸 수 있다(`--permission-mode bypassPermissions`, disallow 없음). 이 설계는 **스킬 지시문 레벨(A안)** 로 서브에이전트를 활용한다. daemon 파이프라인 실행기(C안, `pipeline.stages` 승격)는 별도 스펙으로 다룬다 — 2026-07-02 전략 반전(OD 하드포크가 제품 베이스)으로 C안도 정당한 투자가 되었으나, 다중 서브시스템 관통 규모라 분해가 먼저다.

## 결정사항 (사용자 확정)

| 항목 | 결정 |
|---|---|
| 분리 목적 | 검수 객관성 + 컨텍스트 오염 방지 + 전문화 (병렬화 아님 — 순차 유지) |
| 비-claude 런타임 | 인라인 fallback — 서브에이전트 도구 없으면 동일 절차를 인라인 수행 |
| 검수자 권한 | report-only — 점수+발견목록만 반환, 수정은 메인. 재검수 1회 |
| daemon 스트림 검증 | 필수 선행 작업으로 포함 |
| TaskCard UI | 포함 |

## 설계

### §1. 변경 파일

| 파일 | 변경 |
|---|---|
| `plugins/_official/examples/naver-blog/SKILL.md` | 3·6단계 서술 개정 |
| `design-templates/naver-blog/SKILL.md` | 동일 (byte-identical 가드: `apps/daemon/tests/naver-blog-catalog-sync.test.ts`) |
| `…/references/research-subagent.md` (신규, 양쪽) | 리서치 서브에이전트 프롬프트 템플릿 |
| `…/references/review-subagent.md` (신규, 양쪽) | 검수 서브에이전트 프롬프트 템플릿 |
| `apps/daemon/src/claude-stream.ts` 또는 `server.ts` | §5 검증 결과에 따라 `parent_tool_use_id` 가드 (조건부) |
| `apps/web/src/components/ToolCard.tsx` + 신규 TaskCard | §6 Task 전용 렌더러 |

SKILL.md 본문은 간결 유지, 프롬프트 전문은 references로. 스킬 파일은 프로젝트 cwd에 스테이징되므로(`.od-skills/naver-blog-*/`) 메인이 서브에이전트에 "이 파일을 Read 후 다음 입력으로 수행" 형태로 넘긴다.

### §2. 3단계 Research 서브에이전트

- **입력** (메인이 dispatch 프롬프트에 포함): 주제·타겟 키워드·독자, 활성 `design-systems/<brand>/DESIGN.md` 경로, `references/research-subagent.md` 스테이징 경로.
- **서브에이전트 작업**: DESIGN.md에서 출처 정책 직접 Read(메인 컨텍스트 경유 없음) → WebSearch로 1차 출처 수집 → **`research.md`를 프로젝트 cwd에 Write**. 항목: 출처 URL, 발행일, 핵심 사실/수치, 신뢰도 등급.
- **반환**: 핵심 사실 불릿 ≤10줄 요약만. SERP 덤프는 research.md에 격리된다.
- 4단계 기획·`brief.md`의 sources 섹션은 research.md를 참조한다.

### §3. 6단계 검수 서브에이전트

- **신선한 컨텍스트에서 직접 Read**: `craft/naver-blog-html.md` · 활성 DESIGN.md · `brief.md` · `research.md` · `<slug>.html`. 메인의 작성 과정 편향을 차단한다.
- **채점 축 현행 유지**: craft 13 HTML룰 + SEO 5항목 + 브랜드 anti-pattern + 팩트체크(본문 수치·기관 ↔ research.md 대조; 1차 매핑 실패 시 정성 완화).
- **반환**: 점수 + P0/P1 발견목록. report-only — HTML 수정 금지.
- **루프**: 메인이 수정 → 재검수 1회(신규 dispatch, 컨텍스트 재오염 방지). 게이트 동일: ≥80 발행 / 60~79 수정 / <60 재기획. 재검수 후에도 <80이면 사용자에게 점수·발견목록 보고 후 판단 위임.

### §4. Fallback + 강제성

- 서브에이전트 dispatch 도구가 없는 런타임에서는 동일 절차를 인라인 수행한다. **산출물 계약은 런타임 무관 동일**: research.md 포맷, 채점표 포맷, 게이트 기준.
- SKILL.md에 "서브에이전트 dispatch가 가능하면 반드시 사용"을 명시해 인라인 뭉개기를 억제한다.

### §5. daemon 스트림 검증 + 조건부 fix (필수 선행)

Claude Code stream-json은 서브에이전트 내부 이벤트를 `parent_tool_use_id` 태그로 부모 스트림에 내보낸다. 현재 `claude-stream.ts`·`server.ts` 어디에도 이 필드 처리가 없고, `mocks/` 트레이스에 Task 포함 세션이 0건 — OD가 한 번도 관측하지 못한 경로다.

- **위험**: 서브에이전트 최종 메시지의 `stop_reason: end_turn`을 `claude-stream.ts`의 turn_end 판정(stop_reason만 검사)이 메인 turn 종료로 오인 → `applyClaudeStreamJsonRunBookkeeping`이 stdin을 조기 close → run 중단.
- **검증**: 실제 run(또는 Task 포함 신규 mock 트레이스)으로 서브에이전트 dispatch 세션을 통과시켜 (a) stdin 조기 close 여부 (b) 이벤트 렌더 형태를 확인한다.
- **버그 확인 시 fix**: `parent_tool_use_id`가 있는 메시지/이벤트는 turn_end·usage bookkeeping 판정에서 제외한다. red-spec(버그 재현 테스트) 먼저 — Bug follow-up workflow 준수.
- 이 검증이 끝나기 전에는 §2·§3 스킬 변경을 배포 상태로 두지 않는다(서브에이전트 dispatch가 run을 죽일 수 있으므로).

### §6. TaskCard UI

`ToolCard.tsx` 분기에 Task 전용 렌더러를 추가한다. 현재는 GenericCard 폴백으로 "Task" 제목 + 프롬프트 JSON 원문이 노출된다.

- **표시**: 실행 중 — 서브에이전트 라벨(input의 `description` 우선, 없으면 `subagent_type`) + 진행 스피너. 완료 — 라벨 + 결과 요약(tool_result 텍스트, 접힌 상태 기본).
- **서브에이전트 내부 이벤트**(`parent_tool_use_id` 태그): 최소 범위로 처리 — 메인 트랜스크립트에 구분 없이 섞이는 현행 예상 동작을 §5 검증에서 관측한 뒤, 렌더 정책(숨김/뱃지 구분)을 구현 플랜에서 확정한다. 이 스펙의 최소 요구는 "메인 활동으로 오인되지 않게 시각 구분 또는 숨김".
- i18n: 신규 문자열은 `apps/web/src/i18n/types.ts` 먼저, 18개 로케일 전부 추가.

### §7. 검증

1. `pnpm --filter @marketing-ax/daemon test` — naver-blog-catalog-sync(byte-identical 가드) 포함.
2. §5 스트림 검증 run — 서브에이전트 dispatch 세션이 끝까지 완주하는지.
3. `pnpm --filter @marketing-ax/web typecheck` + web test — TaskCard.
4. 실전 도그푸딩: OD에서 naver-blog 1회 실행 — 서브에이전트 dispatch → research.md 산출 → 검수 리포트 회수 → TaskCard 표시 확인.
5. `pnpm guard` + `pnpm typecheck`.

## Non-goals

- daemon 파이프라인 스테이지 실행기(C안) — 별도 브레인스토밍/스펙. 하드포크 세부 확정 후.
- 병렬 실행 — 리서치·검수는 순차 단계.
- braze-iam 등 다른 시나리오 스킬 적용 — naver-blog 검증 후 별도 확장.
- 서브에이전트 전용 에이전트 정의 파일(`.claude/agents/`) 배포(B안) — A 실측에서 지시문 강제성이 부족할 때 승격.
