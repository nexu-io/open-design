<!--
Role: M-AX Braze IAM 데이터모델 설계 게이트 문서 — 코드 착수 전 사용자 리뷰 대상
Key Features: 5단계 제작 플로우 상태머신, braze_messages/braze_variants 스키마, 아티팩트 집 결정, 질문폼 항목
Dependencies: BRAZE-DOMAIN.md(제약), BRAZE-BODOC-CATALOG.md(트리거/어트리뷰트/딥링크), DECISIONS.md(경로1·아키텍처A), apps/daemon/src/db.ts·live-artifacts/schema.ts(현 패턴)
Notes: 코드 미착수. 이 문서 승인 후 dual-track(contracts→daemon→web→CLI→SKILL) 시작. ⚠️ 미결정(§7) 먼저 정해야 스키마 확정
-->

# M-AX Braze IAM 데이터모델 설계 (DATA-MODEL-BRAZE.md)

> **상태: 리뷰 게이트 (코드 착수 전).** 이 문서의 §7 미결정 항목을 사용자가 확정하면 스키마 fix 후 dual-track 구현 시작.
> 근거: [[DECISIONS]] 경로1(Custom HTML 아티팩트+대시보드 핸드오프), 아키텍처 A(단일 마케팅 두뇌). 제약: [[BRAZE-DOMAIN]] §2·§4·§5.

---

## 0. 제작 플로우 (사용자 확정, 2026-06-23)

```
요청 → 인터뷰 → 기획안(draft) → [컨펌 게이트] → 제작 → 수정 루프 → 완료
                                  ├ 컨펌: 기획안 저장 + IAM 제작
                                  └ 반려: 기획안 재작성(사유 반영)
```

1. **요청**: "앱 설치 후 미가입 유저 대상 회원가입 유도 IAM 만들어줘"
2. **인터뷰**: IAM 포맷 / 톤앤매너 / 핵심 강조 / Variant 개수 / 트리거 이벤트 / 세그먼트 (질문폼)
3. **기획안 + 컨펌**: 기획안 작성 → 사용자 컨펌(저장+제작) 또는 반려(재작성)
4. **제작**: Variant 수만큼 Custom HTML IAM 생성
5. **수정/완료**: 사용자 요청 따라 수정 루프 또는 완료

---

## 1. 상태머신 (`braze_messages.status`)

| status | 의미 | 다음 |
|---|---|---|
| `interviewing` | 인터뷰 질문폼 발행·답변 대기 | → `plan_draft` |
| `plan_draft` | 기획안 작성됨, 컨펌 대기 | → `plan_confirmed` (컨펌) / `plan_draft` (반려=재작성) |
| `plan_confirmed` | 기획안 확정, 제작 큐 | → `producing` |
| `producing` | Variant HTML 생성 중 | → `produced` |
| `produced` | 전 Variant 생성 완료 | → `editing` / `done` |
| `editing` | 사용자 수정 요청 처리 중 | → `produced` |
| `done` | 완료 (대시보드 핸드오프 준비) | (종료) |

- **반려 = `plan_draft` 회귀** + `plan_json`에 반려 사유 누적. 별도 status 불필요.
- 각 변종 개별 상태는 `braze_variants.status` (§3) 가 추적. message.status = 전체 단계.

---

## 2. 아티팩트 집 결정 ⭐ (핵심 분기 — §7-A 확정 필요)

IAM 산출물(Custom HTML)을 **어디에 저장**하나. 현 코드 분석 결과 3안:

| 안 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **A. produced-file (추천)** | OD 덱/프로토타입처럼 프로젝트 dir에 HTML 파일로 저장, FileViewer iframe 렌더 | 기존 HTML→iframe 렌더러 그대로. `braze_iam_v1`=파일 계약(naming+§2 준수), craft lint로 검증. 검증된 daemon 경계 안 건드림 | 파일-DB 정합성 직접 관리 |
| **B. live-artifact 재사용** | `apps/daemon/src/live-artifacts` (`html_template_v1`) 로 저장 | 영속/검증 인프라 기성 | ⚠️ format이 `html_template_v1` **하드코딩**(schema.ts:747), refresh/connector 머신리(데이터 갱신)=IAM 불요인데 부착. 새 format 추가 시 검증된 daemon 스키마 수술 |
| **C. 신규 braze 파일+테이블** | braze 전용 디스크 레이아웃 신설 | 완전 통제 | 차 바퀴 재발명. store/refresh 중복 |

**추천 = A.** 이유:
- IAM = 정적 Custom HTML, 데이터 갱신(refresh) 없음 → live-artifact의 refresh/connector 가치 0.
- live-artifact format은 단일 하드코딩이라 `braze_iam_v1` 추가 = 검증 로직 전반 수술(schema.ts validateDocument). 위험 대비 이득 없음.
- OD는 이미 덱/프로토타입을 produced HTML 파일 → iframe으로 렌더 → **동일 경로 재사용**. [[BRAZE-DOMAIN]] §4.4 함의("여느 OD 아티팩트처럼 저장")와 일치.

**→ `braze_iam_v1` = "스키마 객체"가 아니라 "produced HTML 파일 계약"**: 파일명 규칙 + §2 Custom HTML 제약(brazeBridge·logClick·이미지 스펙) 충족. 검증 = craft lint-artifact 룰 (DB 스키마 아님).

---

## 3. 테이블 스키마 (db.ts 패턴 준수)

> 패턴: `CREATE TABLE IF NOT EXISTS`, `id TEXT PRIMARY KEY`, FK `ON DELETE CASCADE`, `created_at/updated_at INTEGER`(epoch ms), 구조체=`*_json TEXT`, idempotent ALTER=`PRAGMA table_info`. 등록 = `migrateBraze(db)` 서브모듈 (`migrateCritique`/`migrateMediaTasks`/`migratePlugins` 와 동일, db.ts:350~352 옆).

### 3.1 `braze_messages` — IAM 제작 단위(요청=1행)

```sql
CREATE TABLE IF NOT EXISTS braze_messages (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  brand_id        TEXT,              -- 브랜드(=design-system). NULL=프로젝트 design_system_id 상속 (§7-C)
  title           TEXT NOT NULL,     -- "회원가입 유도 IAM"
  goal            TEXT,              -- 사용자 원요청 요약
  iam_format      TEXT NOT NULL,     -- 'slideup'|'modal'|'fullscreen'|'custom_html'
  delivery_model  TEXT,              -- 'action_based'|'scheduled'
  trigger_event   TEXT,             -- 5종 중 / Custom Event명(카탈로그 128 중)
  trigger_props_json TEXT,          -- 트리거 필터 프로퍼티 (BRAZE-DOMAIN §5.3)
  segment_json    TEXT,             -- 타깃 어트리뷰트 조건 (카탈로그 122 중)
  tone            TEXT,             -- 톤앤매너
  emphasis        TEXT,             -- 핵심 강조 포인트
  variant_count   INTEGER NOT NULL DEFAULT 1,
  plan_json       TEXT,             -- 기획안(braze_plan_v1) + 반려사유 누적 (§4)
  status          TEXT NOT NULL,    -- §1 상태머신
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  FOREIGN KEY(project_id)      REFERENCES projects(id)      ON DELETE CASCADE,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_braze_messages_project
  ON braze_messages(project_id, updated_at DESC);
```

### 3.2 `braze_variants` — Variant당 1행(IAM N개)

```sql
CREATE TABLE IF NOT EXISTS braze_variants (
  id            TEXT PRIMARY KEY,
  message_id    TEXT NOT NULL,
  label         TEXT NOT NULL,      -- 'A'|'B'|...
  artifact_path TEXT,              -- 생성 HTML 파일 경로(produced-file, §2-A). NULL=미생성
  status        TEXT NOT NULL,      -- 'pending'|'produced'|'editing'|'done'
  position      INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  FOREIGN KEY(message_id) REFERENCES braze_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_braze_variants_message
  ON braze_variants(message_id, position);
```

- Variant별 상태/수정 독립 추적 필요 → 자식 테이블(추천, vs message행에 JSON 배열). A/B 변종 개별 수정 루프 지원.

---

## 4. 기획안 = `braze_plan_v1` (= `plan_json` 구조)

기획안은 별도 파일/아티팩트 아님 → `braze_messages.plan_json` JSON으로 저장(컨펌 게이트 로직이 읽음, 사용자엔 마크다운 렌더).

```jsonc
{
  "version": "braze_plan_v1",
  "summary": "앱 설치 후 미가입 유저에게 회원가입 혜택 강조 모달 IAM",
  "iam_format": "modal",
  "tone": "친근·혜택강조",
  "emphasis": ["가입 즉시 3,000P", "30초 소요"],
  "variants": [
    { "label": "A", "angle": "혜택 중심" },
    { "label": "B", "angle": "간편함 중심" }
  ],
  "targeting": {
    "segment": "installed AND NOT signed_up",
    "trigger_event": "session_start",
    "delivery_model": "action_based"
  },
  "cta": [{ "label": "지금 가입", "deeplink": "bodoc://signup" }],
  "image": { "needed": true, "ratio": "29:10", "format": "PNG" },
  "rejections": []   // 반려 시 {at, reason} append → 재작성 반영
}
```

- 컨펌 게이트에서 이 객체를 마크다운 카드로 렌더 → 사용자 컨펌/반려. 반려 시 `rejections` 누적, status=`plan_draft` 유지.

---

## 5. 인터뷰·컨펌 = `<question-form>` 메커니즘 (AGENTS.md 확정)

별도 tool 배선 없음. 클arifying = question-form 아티팩트만(AGENTS.md "Asking the user questions").

### 5.1 인터뷰 질문폼 (status `interviewing`)

> ⚠️ **정합성 (2026-06-23, 검증된 iam-builder 워크플로우 반영)**: 실전 iam-builder는 인터뷰에서 **4축만 묻는다 — 목적·타깃·포맷·톤**. 트리거 이벤트는 **인터뷰하지 않고 Braze 캠페인 콘솔에서 설정**([[BRAZE-DOMAIN]] §5.1), 기획안엔 *후보*로만 기록. Variant 개수도 **A/B 2개 고정**(인터뷰 안 함). 따라서 아래 표의 "트리거 이벤트"·"Variant 개수" 행은 **인터뷰 필드 아님 — 기획안(plan)/콘솔 레벨**로 격하. `braze-iam` SKILL이 정본 플로우.
> **후속 조정 후보(미적용)**: daemon `/interview` 가 현재 `triggerEvent`·`deliveryModel` 필수 → optional 로 완화하면 콘솔-레벨 트리거 모델과 더 정합. 현재는 SKILL이 추론한 후보 트리거를 전달해 동작. [[DECISIONS]] 참조.

| 항목 | 타입 | 선택지 출처 |
|---|---|---|
| 목적(purpose) | single/free | 캠페인 목적 (전환/리텐션/온보딩/공지/프로모션…) |
| 타깃(target) | single/free | 세그먼트 — 어트리뷰트 조건 (브랜드 context; bodoc=카탈로그 122 중, §2) |
| IAM 포맷 | single | modal / fullscreen / halfsheet ([[BRAZE-DOMAIN]] §1.1; slideup=HTML 부적합→native 권장, email-capture·web-modal 후순위) |
| 톤앤매너 | single/free | 정보전달 / 축하 / 긴급 / 프로모션 등 |
| ~~트리거 이벤트~~ | — | **인터뷰 제외** — Braze 콘솔 설정, 기획안 후보로 기록 (§5.1) |
| ~~Variant 개수~~ | — | **A/B 2개 고정** — 인터뷰 안 함 |
| (자율결정) 강조포인트·CTA·딥링크 | — | Claude가 브랜드 context+카탈로그 참고해 결정 (사용자에 안 물음) |

### 5.2 컨펌 질문폼 (status `plan_draft`)
- 기획안 마크다운 + 질문폼: **컨펌 / 반려(+사유 free text)**. 반려 → §4 `rejections` append → 재작성.

---

## 6. craft / lint 계약 (제작 단계 검증 — §2-A 파일 계약)

생성 HTML = [[BRAZE-DOMAIN]] §2 준수, craft 룰 + lint-artifact로 게이트:
- brazeBridge만 (`appboyBridge` 금지, §2.2)
- 버튼 클릭 = `logClick('0')`/`('1')`, body = `logClick()` (§2.4)
- Android 딥링크에 `closeMessage()` 미삽입 (§2.3)
- 이미지: PNG/JPEG/GIF, ≤5MB, **WebP 금지**, 유형별 종횡비 (§1.3·1.4)
- CTA ≤2 (§1.2)

→ `design-templates/braze-iam/SKILL.md` + craft 룰로 인코딩 (dual-track 후반).

---

## 7. ✅ 결정 완료 (2026-06-23 게이트 통과 — 추천 디폴트 전부 확정)

| # | 결정 | 확정 |
|---|---|---|
| **A** | 아티팩트 집 (§2) | ✅ **produced-file** |
| **B** | `braze_messages` ↔ OD conversation 관계 | ✅ 대화당 N메시지 |
| **C** | brand_id 바인딩 (§3.1) | ✅ design_system_id 상속 + 메시지별 override |
| **D** | 전달 모델 REST 보조 범위 | ✅ **경로1만** (대시보드 수동, 경로2 보류) |
| **E** | Variant 저장 (§3.2) | ✅ **자식 테이블** `braze_variants` |

---

## 8. 다음 단계 (이 문서 승인 후)

dual-track 순서 (AGENTS.md "Capability exposure" — UI/CLI 동시):
1. `packages/contracts/src/api/braze.ts` — DTO (BrazeMessage, BrazeVariant, BrazePlan)
2. `apps/daemon/src/braze/persistence.ts` (`migrateBraze`) + `apps/daemon/src/braze-routes.ts` (`/api/braze/*`)
3. `apps/web/src/` — 인터뷰/기획안/Variant UI (bodoc UX 패턴 추종, [[DECISIONS]] 결정4)
4. `apps/daemon/src/cli.ts` — `od braze` 서브커맨드 (`--json`/`--prompt-file`)
5. `design-templates/braze-iam/SKILL.md` + craft 룰 (§6)
