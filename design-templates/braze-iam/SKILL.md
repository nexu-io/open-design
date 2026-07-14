---
name: braze-iam
description: |
  Braze Custom-HTML In-App Message (IAM) producer — brand-agnostic 7-step
  workflow with a dual visual mode (layer/scene). Interviews the user, drafts
  a campaign plan, gates confirmation, produces two design-variant HTML
  artifacts (A/B), and hands off to the Braze dashboard. Works for any brand
  whose DESIGN.md is loaded as the active design system. Use when the brief
  asks for a "Braze IAM", "인앱메시지", "in-app message", "Braze 팝업",
  "IAM HTML", or "브레이즈 캠페인".
triggers:
  - "braze iam"
  - "in-app message"
  - "인앱메시지"
  - "IAM"
  - "Braze 팝업"
  - "브레이즈 캠페인"
  - "braze campaign"
od:
  mode: prototype
  platform: mobile
  scenario: marketing
  craft:
    requires: [braze-custom-html]
  design_system:
    requires: true
    sections: [color, typography, spacing, components, voice, anti-patterns]
  example_prompt: "신규 가입 유도 모달 IAM 만들어줘 — 30초 안에 가입 가능하다는 메시지."
---

<!--
Role: Braze Custom-HTML IAM 7단계 제작 워크플로우 — brand-agnostic OD 포트, layer/scene 듀얼 비주얼 모드
Key Features: <question-form> 인터뷰/컨펌, braze_plan_v1 기획안(image.mode 듀얼 비주얼 layer/scene 컴포지션 확장), od braze CLI 통합, 오브제 imagegen·Variant A/B 빌더·검수 서브에이전트 위임(인라인 폴백), Media Library 자동 업로드(발송본에 CDN URL 직기입 — placeholder/프리뷰 듀얼 산출은 업로드 불가 시 폴백)
Dependencies: 활성 브랜드 컨텍스트(system prompt의 "Active brand" + "Brand deliverable context" 블록), BRAZE-DOMAIN.md §1·§2·§5, DATA-MODEL-BRAZE.md §0·§4, craft/braze-custom-html.md, references/ (size-patterns, format-design-guide, interaction-standard, liquid-guide, imagegen-pipeline, variant-builder-subagent, review-subagent, visual-layout-patterns)
Notes: bodoc 브랜드 특화 사실(플래너→전문가, bodoc:// 딥링크, 특정 어트리뷰트) 하드코딩 금지. 브랜드 사실은 활성 브랜드 컨텍스트(Active brand + Brand deliverable context 블록)에서만 로드.
-->

# Braze IAM — 7단계 워크플로우

## 개요

Braze Custom-HTML IAM을 **브랜드-어그노스틱 워크플로우**로 제작한다.

- **인터뷰 6축**: 목적 · 타겟 · 형식(사이즈) · 톤 · 비주얼 방향 · 레이아웃 지시(지정/자율)
- **트리거 이벤트는 인터뷰하지 않는다**: Braze 캠페인 콘솔에서 직접 설정 (BRAZE-DOMAIN §5.1-5.2 — IAM은 SDK 커스텀 이벤트로만 발화, API로 발화 불가). 기획안에 후보 1~2개를 명시한다.
- **Variant 수는 2개 고정 (A/B)**: 인터뷰에서 묻지 않는다.
- **DATA-MODEL §5.1 정합 노트**: 이 스킬의 인터뷰 6축 중 4축(purpose/target/format/tone)은 DATA-MODEL-BRAZE §5.1 인터뷰 필드와 일치하도록 정합되었다. `q-visual`(비주얼 방향)과 `q-layout`(레이아웃 지시)은 §5.1 필드가 아니다 — CLI 플래그 없이 기획안 `image.mode`·`layout`으로만 기록된다 (Step 3). `trigger_event`는 §5.1에 필드가 존재하지만 인터뷰에서 수집하지 않음(Braze 콘솔 설정이므로); `variant_count`는 2로 고정(A/B). **다에몬 측 인터뷰 폼을 자동 생성할 경우 trigger_event와 variant_count는 skip 또는 default 처리해야 한다.**
- **산출물 = Braze-ready Custom HTML 파일 2개 (Variant A/B)** → 대시보드 붙여넣기 핸드오프 (BRAZE-DOMAIN §4.4)

> **선행 필수 — 활성 브랜드 컨텍스트 확인**: 타겟·페르소나·브랜드 보이스·금지어·딥링크 카탈로그는 Claude 사전 지식에 없는 브랜드-사내 사실이다. 추측 금지. IAM 제작 시작 시 **system prompt의 "Active brand" + "Brand deliverable context" 블록**을 먼저 확인해 정본 컨텍스트를 확보한다 (소스 파일 경로는 그 블록의 Source files 라인).

---

## 시작 전 Setup

### od braze 상태 초기화

```bash
od braze create \
  --project <project_id> \
  --conversation <conversation_id> \
  --title "<IAM 목적 한 줄>" \
  [--goal "<목적 한 줄>"] \
  [--brand <brand_id>] \
  [--json]
# → braze_message_id 반환 (이후 모든 단계에 사용)
```

- `<conversation_id>` 는 스킬 런 컨텍스트(run context)에서 OD 대화 id를 읽는다.
- `braze_message_id` 를 환경변수 또는 작업 노트에 기록한다
- `status` → `interviewing` 상태로 전환

### 출력 경로

OD produced-file 아티팩트 패턴 (DATA-MODEL-BRAZE §2-A):
- Variant 파일: OD 프로젝트 artifact dir 내 `braze-iam/{YYYY-MM-DD}-{slug}/variant-a.html`, `variant-b.html`
- `artifact_path` 는 `od braze produce` 호출 시 `braze_variants` 에 기록됨

---

## Step 1 — Intake (접수)

활성 브랜드 컨텍스트를 확인하고 요청 원문을 기록한다.

```
확인: system prompt의 "Active brand" + "Brand deliverable context" 블록
(자동 주입됨 — 별도 Read 불요; 서브에이전트에 위임할 경우에만 그 블록의
Source files 라인이 가리키는 경로를 전달한다)
```

로드한 후 다음 항목을 내부 확인:
- 브랜드 보이스 / 톤 가이드
- 금지어 목록 (예: 브랜드별 호칭 규약)
- 딥링크 카탈로그 (있는 경우)
- 개인화 어트리뷰트 카탈로그 (있는 경우)

---

## Step 2 — Interview (인터뷰)

**`<question-form>` 아티팩트로만 진행한다.** AskUserQuestion 도구·인라인 폼 금지 (AGENTS.md "Asking the user questions").

인터뷰 = **6축만** 물어본다. 트리거 이벤트는 묻지 않는다 (Braze 캠페인 콘솔 설정, BRAZE-DOMAIN §5.1).

```xml
<question-form id="braze-iam-interview">
  <title>IAM 캠페인 기본 설정</title>

  <question id="q-purpose" type="single-choice" required="true">
    <label>이 IAM의 목적은 무엇인가요?</label>
    <choices>
      <choice value="conversion">전환 유도 (결제·가입·구독)</choice>
      <choice value="retention">리텐션 (재방문·재활성화)</choice>
      <choice value="onboarding">온보딩 안내</choice>
      <choice value="feature">기능 공지·신규 기능 소개</choice>
      <choice value="promo">프로모션·혜택 알림</choice>
      <choice value="custom">직접 입력</choice>
    </choices>
  </question>

  <question id="q-target" type="free-text" required="true">
    <label>타겟 사용자 세그먼트를 설명해 주세요 (브랜드 세그먼트명 또는 조건).</label>
    <hint>예: "신규 가입 7일 이내", "미결제 회원", "특정 기능 미사용 30일+"</hint>
  </question>

  <question id="q-format" type="single-choice" required="true">
    <label>IAM 사이즈/레이아웃을 선택하세요.</label>
    <choices>
      <choice value="modal">모달 (중앙 팝업) — 단일 알림·혜택 1건</choice>
      <choice value="halfsheet">하프시트 (하단 슬라이드) — 체크리스트·단계 안내</choice>
      <choice value="fullscreen">풀스크린 — 온보딩·몰입·스토리텔링</choice>
      <choice value="custom">직접 입력</choice>
    </choices>
    <hint>슬라이드업(토스트형)은 HTML IAM으로 제작하지 마세요 — BRAZE-DOMAIN §1.1은 슬라이드업이 비차단(non-blocking)임을 명시하며, HTML IAM은 앱 전체를 점유하는 전체화면 WebView로 동작해 비차단 UI 기대와 충돌합니다(프로덕션 SDK 동작 기준). 슬라이드업이 필요하면 Braze 기본 native 슬라이드업을 사용하세요.</hint>
  </question>

  <question id="q-tone" type="single-choice" required="true">
    <label>톤 &amp; 무드를 선택하세요.</label>
    <choices>
      <choice value="informative">정보 전달 (중립·신뢰)</choice>
      <choice value="celebratory">축하·격려</choice>
      <choice value="urgent">긴급·주의</choice>
      <choice value="promo">프로모션·혜택 강조</choice>
      <choice value="custom">직접 입력</choice>
    </choices>
  </question>

  <question id="q-visual" type="single-choice" required="true">
    <label>디자인 방향을 선택하세요.</label>
    <choices>
      <choice value="layer">브랜드 가이드형 — 디자인시스템 룩 + 투명 오브제 (기본)</choice>
      <choice value="scene">씬 카드형 — 카드 전체가 생성 일러스트 씬 + 텍스트 오버레이</choice>
      <choice value="recommend">Claude 추천 (목적·톤 기반)</choice>
    </choices>
  </question>

  <question id="q-layout" type="single-choice" required="true">
    <label>레이아웃 방향을 선택하세요.</label>
    <choices>
      <choice value="auto">Claude 자율 — 캠페인에 맞는 레이아웃을 Claude가 설계 (기본, 창작 변형 포함)</choice>
      <choice value="specified">직접 지정 — 원하는 레이아웃·레퍼런스 방향을 알려주세요</choice>
    </choices>
    <hint>지정 예: "수직 스택 화이트 모달", "좌텍스트-우비주얼 분할", "풀블리드 비주얼에 텍스트 오버레이", 또는 참고 이미지 설명. 유형 어휘는 visual-layout-patterns.md §2 9형.</hint>
  </question>
</question-form>
```

> 사용자가 슬라이드업을 선택하면: 위 제약을 안내하고 모달/하프시트 대안을 제시한 뒤 `<question-form>` 으로 재선택을 받는다.

### 인터뷰 후 — Claude의 자율 결정

인터뷰 응답을 받은 뒤 아래 항목을 **Claude가 직접 결정**한다. 사용자에게 묻지 않는다.

**개인화 어트리뷰트 선정** (활성 브랜드 어트리뷰트 카탈로그 기반):
- 캠페인 목적·타겟과 직접 연관된 어트리뷰트 최대 5개
- Liquid 형식: `{{${attr}}}` (Braze Standard) 또는 `{{custom_attribute.${attr}}}` (Custom)
- 카탈로그에 없는 식별자는 절대 사용하지 않음

**CTA 텍스트 결정**:
- 목적에 맞는 행동 동사 (예: "지금 시작하기", "혜택 확인하기")
- 브랜드 금지어 준수 (활성 브랜드 컨텍스트 기준)
- CTA 최대 2개 (BRAZE-DOMAIN §1.2)

**트리거 이벤트 후보** (Braze 대시보드 설정용, 인터뷰하지 않음):
- BRAZE-DOMAIN §5.2 5종 중 후보 1~2개 명시: Session Start / Push Click / Any Purchase / Specific Purchase / Custom Event
- 기획안에만 기록, 실제 설정은 Braze 콘솔에서 담당자가 수행

**비주얼 방향 결정** (`q-visual`="recommend"일 때만 — `layer`/`scene`을 직접 선택했으면 그대로 적용):
- scene 존치 보류는 **해제됨** (2026-07-14, 139핀 재분석 — 풀블리드 비주얼 카드
  ~40핀, `references/visual-layout-patterns.md` §10). `layer`/`scene`을 동급
  선택지로 검토: 오버레이형·몰입 연출 = scene, 디자인시스템 룩·존 분리 = layer
- 기획안 카드에 선택 근거 1줄 명시

**레이아웃 결정** (`q-layout` 기반 — `visual-layout-patterns.md` §12 정본):
- `specified`: 지정 내용을 기획안 `layout.specified`에 기록하고 그 안에서 설계.
  지정이 §11 안티패턴과 충돌하면 충돌 지점을 보고하고 사용자 판단을 받는다.
- `auto`: §2 9형 전 어휘에서 자율 선택 — **무근거 기본값 금지** (센터 모달
  라이트+수직 스택을 고르려면 선택 근거 필요). 등재 패턴의 조합·변형·신규 구조
  창작 허용 (§12.2 — 하드 가드레일 불변, brief에 `창작 레이아웃 — 근거` 명시).
- **Variant 분화 (§12.3)**: A/B는 최소 1축 구조 분화(유형/존 문법/히어로 유형)가
  기본 — `layout.variants.A/B` + `layout.divergenceAxis`에 기록. 사용자가 "카피만
  A/B"를 명시하면 동일 레이아웃 오버라이드 (brief 기록).

인터뷰 응답을 수집한 뒤 아래 CLI로 daemon에 등록한다:

```bash
od braze interview <braze_message_id> \
  --format <slideup|modal|fullscreen|custom_html> \
  --delivery <action_based|scheduled> \
  --trigger <session_start|push_click|any_purchase|specific_purchase|custom_event> \
  [--custom-event <catalog_event_name>]  # trigger=custom_event 일 때만 \
  [--segment "<condition>"] \
  [--tone "<tone>"] \
  [--emphasis "<a>,<b>"] \
  [--variants <n>] \
  [--json]
```

**플래그 매핑 (인터뷰 5축 → CLI 플래그)**:

| 인터뷰 질문 | CLI 플래그 | 비고 |
|---|---|---|
| `q-format` (IAM 사이즈/레이아웃) | `--format` | **필수** (`modal`/`fullscreen`/`custom_html` 권장 — 슬라이드업 HTML IAM 제약 있음) |
| `q-tone` (톤 &amp; 무드) | `--tone` | 선택 |
| `q-target` (타겟 세그먼트) | `--segment "<condition>"` | 선택; Braze 세그먼트 조건 문자열 |
| `q-purpose` (목적) | 기획안 `summary`/`--emphasis` 로 녹인다 | `--purpose`/`--target` 플래그는 존재하지 않음 |
| `q-visual` (비주얼 방향) | 없음 | CLI 플래그 없음 — 기획안 `image.mode`에만 기록 (Step 3) |
| `q-layout` (레이아웃 지시) | 없음 | CLI 플래그 없음 — 기획안 `layout`에만 기록 (Step 3) |

**필수 플래그 기본값 가이드**:
- `--delivery`: 트리거 기반 발화 = `action_based` (기본 권장), 예약 발송 = `scheduled`
- `--trigger`: 캠페인 목적에서 후보 1개를 Claude가 추론해 기입 (예: 신규 온보딩 → `session_start`). 기획안에 후보 목록을 명시하고 **Braze 콘솔에서 담당자가 최종 확정**한다고 명기할 것.
- `delivery`/`trigger` 값은 후보(candidate)이며, 실제 발화 설정은 Braze 대시보드에서 수행한다.

---

## Step 3 — Proposal (기획안)

기획안을 `braze_plan_v1` 객체로 작성하고 DB에 저장한 뒤 마크다운 카드로 렌더해 사용자에게 제시한다 (DATA-MODEL-BRAZE §4).

```bash
od braze plan <braze_message_id> --plan-file - << 'EOF'
{
  "version": "braze_plan_v1",
  "summary": "<배경·가설·목적 요약>",
  "iamFormat": "modal",
  "tone": "<톤>",
  "emphasis": ["<핵심 강조 1>", "<핵심 강조 2>"],
  "variants": [
    { "label": "A", "angle": "<디자인 접근 A>", "heading": "<타이틀 영역 후킹 카피 A>", "body": "<본문 영역 카피 A>" },
    { "label": "B", "angle": "<디자인 접근 B>", "heading": "<타이틀 영역 후킹 카피 B>", "body": "<본문 영역 카피 B>" }
  ],
  "layout": {
    "directive": "auto",
    "specified": null,
    "variants": {
      "A": { "type": "센터 모달 (라이트) — 수직 스택", "composition": "<A 존 스케치 — 전 존 나열>" },
      "B": { "type": "분할형 (좌텍스트-우비주얼)", "composition": "<B 존 스케치 — 전 존 나열>" }
    },
    "divergenceAxis": "<유형|존 문법|히어로 유형 — A/B 구조 분화 축 1줄. 사용자 오버라이드(카피만 A/B) 시 \"동일 레이아웃 — 사용자 지정\">",
    "creative": null
  },
  "targeting": {
    "segment": "<세그먼트 조건>",
    "triggerEvent": "session_start",
    "deliveryModel": "action_based"
  },
  "cta": [
    { "label": "<주 CTA 텍스트>", "deeplink": "<딥링크>" },
    { "label": "<보조 CTA 텍스트>" }
  ],
  "image": {
    "needed": true,
    "mode": "layer",
    "format": "PNG",
    "assets": [
      { "id": "clipboard", "source": "generate", "role": "object",
        "style": "3d-icon", "concept": "체크마크 찍힌 진단 클립보드 — 글로시 3D, 브랜드 비비드", "ratio": "1:1" },
      { "id": "orb",       "source": "css",      "role": "decor", "note": "브랜드 톤 블러 오브 2개" }
    ],
    "composition": "화이트 카드 — 아이브로우 필 → 헤드라인 → 서브 → 클립보드 히어로(카드 높이 ~40%) → 풀폭 CTA → dismissal, 존 수직 분리"
  },
  "rejections": []
}
EOF
```

> `mode: "scene"`일 때는 `assets`가 씬 에셋 1건 중심으로 바뀐다: `{ "id":
> "scene", "source": "generate", "role": "scene", "style": "3d-illust",
> "concept": "<단일 소품 히어로 + 추상 컬러 필드 배경 서술>", "ratio": "2:3" }` (+ 선택적
> `css` 장식 1건). `composition`에는 세이프존 스케치(상단 텍스트존/하단
> CTA존)를 함께 명시한다.

### image 필드 결정 규칙 (Claude 자율 — 인터뷰하지 않음)

- `needed`: 공지(announcement)·기능 안내 순수 목적 = `false` 기본, 그 외(혜택·
  전환·리텐션·축하) = `true` 기본. 기획안 카드에 근거 1줄 명시.
- `mode`: `q-visual` 응답을 그대로 사용 (기본 `"layer"`; `"recommend"`면 위
  "비주얼 방향 결정" 규칙 적용). **물리적으로 맞물린 복합 오브제는 통짜 통합
  생성 1건으로 선언** — 별도 assets로 나눠 CSS로 조립하는 설계 금지 (콜라주
  금지 — 도그푸딩 반려 실측 2026-07-10). **캐릭터는 IAM 전면 미포함**
  (2026-07-13 사용자 결정 — 라이브러리 컷 포함. `references/visual-layout-patterns.md`
  §3). `scene` 모드는 씬 에셋 1건 + (선택) `css` 장식만 구성한다.
- `assets[].source`: `library`(브랜드 제공 에셋 직접 사용 — 실물 사진·UI
  스크린샷 등, 브랜드 deliverable 컨텍스트의 에셋 라이브러리에서 선택. 캐릭터
  컷은 IAM 미포함) / `generate`(imagegen — 메타포 오브제) / `css`(코드 장식 —
  생성 없음).
- `assets[].style`: `flat-icon` | `2d-illust` | `3d-illust` | `3d-icon` — **실사
  없음**. 목적·톤 기반 선택 근거는 `references/visual-layout-patterns.md` §3.
- 오브제 concept = 메시지 메타포 (§4 사례표) — "보여야 하는 것"을 concept에,
  오독 위험 요소를 note에 기록.
- **레이아웃·컴포지션 = `layout` 필드가 정본 (v2)**: `layout.variants.A/B`에
  variant별 §2 유형 + 존 스케치를 각각 기록한다. 존 스케치는 선택한 존 문법
  계열(visual-layout-patterns.md §1 — 수직 스택/오버레이형/분할형)의 **전 존
  나열** (수직 스택 = 아이브로우 필→헤드라인→서브→히어로→가격·조건→CTA→dismissal
  — 선택 슬롯은 접되 순서 불변, `variants[].body`가 있으면 서브카피 슬롯에
  "서브카피 = body"로 표기. 존 누락·해석 여지 시 병렬 빌더 발산 실측 2026-07-13).
  오버레이형은 가독 조건(스크림/여백존/색 반전) 1개를, 분할형은 좌우 폭 배분을
  스케치에 명시. `image.composition`은 구 필드 — layout.variants가 있으면 생략
  가능, 병기 시 A 기준 서술로 취급. `scene` 모드는 세이프존 스케치(상단
  텍스트존/하단 CTA존)를 함께 명시한다.
- `layout.divergenceAxis` = A/B 구조 분화 축 (§12.3 — 기본 의무, 사용자 오버라이드
  시 "동일 레이아웃 — 사용자 지정"). 창작 레이아웃이면 `layout.creative`에 근거 1줄.
- 스키마는 daemon 계약 변경 없음 — `braze_plan_v1`은 JSON blob 저장이라 필드
  추가는 하위 호환 (검증 = version 체크뿐, braze-routes.ts). `image.mode`
  필드도 동일 근거로 스키마 변경 없음. 기획안 카드에 에셋 표
  (id/source/style/concept)를 포함해 사용자 컨펌을 받는다.

### 카피 작성 원칙 (헤딩·본문)

`heading`·`body`는 IAM의 타이틀·디스크립션 영역에 그대로 들어가는 **최종 카피**다. 기능 나열이 아니라 사용자 행동을 끌어내도록 마케팅 관점에서 후킹하게 작성한다. (브랜드 톤·금지어는 활성 브랜드 컨텍스트(Active brand + Brand deliverable context 블록)에서만 로드 — 브랜드명·`bodoc://`·attributes 하드코딩 금지.)

- **헤딩(타이틀)**: 첫 3초 안에 시선을 잡는 한 문장. **사용자 이득·호기심·긴급성** 중 하나를 건다. 기능·시스템 용어 나열 금지. (예: `흩어진 내 보험, 한 번에 정리됐어요` — 이득)
- **본문(디스크립션)**: 헤딩의 약속을 구체화 — **핵심 베네핏 1개 + 지금 행동할 이유**를 2문장 이내로. 끝이 CTA로 자연스럽게 이어지게 한다. 베네핏 2개 이상 욱여넣기 금지.
- **개인화**: 카탈로그 내 변수로 관련성을 높인다(예: 이름·보유 상태). 변수 형식은 `references/liquid-guide.md` 기준.
- **A/B**: variant별 카피는 서로 다른 후킹 각도(이득 vs 긴급성 등)를 검증하도록 차별화한다. 카피가 A·B 공통이면 같은 값을 양쪽에 둔다.

사용자에게 기획안을 마크다운 카드로 제시:

```markdown
## 📋 IAM 기획안 — <slug>

| 항목 | 내용 |
|---|---|
| 캠페인 목적 | <purpose> |
| 타겟 세그먼트 | <segment> |
| 포맷 | <format> |
| 톤 | <tone> |
| 핵심 강조 | <emphasis> |
| Variant A — 각도 | <angle A> |
| Variant A — 헤딩 | <variants[0].heading> |
| Variant A — 본문 | <variants[0].body> |
| Variant B — 각도 | <angle B> |
| Variant B — 헤딩 | <variants[1].heading> |
| Variant B — 본문 | <variants[1].body> |
| 트리거 이벤트 | <triggerEvent> (session_start / push_click / any_purchase / specific_purchase / custom_event) |
| 주 CTA | <cta[0].label> |
| 보조 CTA | <cta[1].label> |
| 이미지 | needed + 에셋 요약 (id·source·style·concept) + composition |
```

### 자가 카피 검토 (Step 3~4 사이)

HTML 빌드 전 기획안 카피의 톤·금지어·CTA 품질을 **Claude 자신이 자가 검토**한다. (DECISIONS.md 결정: OD critique jury 삭제 → main-agent self-review)

체크 항목:
- [ ] 모든 variant에 `heading`·`body`가 채워짐 (빈 값·플레이스홀더 금지)
- [ ] 헤딩이 이득·호기심·긴급성 중 하나로 후킹 (기능 나열 아님)
- [ ] 본문이 베네핏 1개 + 행동 이유, 2문장 이내, CTA로 연결됨
- [ ] 브랜드 금지어 없음 (활성 브랜드 컨텍스트 anti-patterns 기준)
- [ ] CTA 텍스트 = 행동 동사, 2개 이하 (BRAZE-DOMAIN §1.2)
- [ ] Liquid 변수 형식 올바름 (`{{${}}}`/`{{custom_attribute.${}}}`), 카탈로그 내 식별자만
- [ ] 톤이 포맷-콘텐츠 매트릭스와 정합 (references/format-design-guide.md 기준)

P0(발송 차단) 발견 시 → 기획안 수정 후 재확인. P1·P2는 평가 노트 기록 후 진행.

### 컨펌 게이트

`<question-form>` 으로 사용자 컨펌/반려를 받는다 (DATA-MODEL-BRAZE §5.2):

```xml
<question-form id="braze-iam-confirm">
  <title>기획안을 확인해 주세요</title>
  <question id="q-decision" type="single-choice" required="true">
    <label>위 기획안으로 진행할까요?</label>
    <choices>
      <choice value="confirm">이대로 제작 시작</choice>
      <choice value="reject">수정 필요 — 아래에 수정점 입력</choice>
    </choices>
  </question>
  <question id="q-rejection-reason" type="free-text" required="false">
    <label>수정 요청 사항 (반려 선택 시)</label>
  </question>
</question-form>
```

- **컨펌**: `od braze confirm <braze_message_id>` → status `plan_confirmed` → Step 3.5
- **반려**: `od braze reject <braze_message_id> --reason "<사유>"` → `rejections` 누적 + 기획안 재작성

---

## Step 3.5 — brief.md 저작 및 저장

`plan_confirmed` 수신 후, HTML 제작(Step 4) **전에** brief.md 마크다운을 저작해 저장한다.

### brief.md 섹션 구조

① **기본 정보**
- 캠페인 slug, 요청일, 요청 내용 요약

② **인터뷰 결정 사항**
- 목적, 타겟, 형식, 톤, 트리거
- 개인화 어트리뷰트 선정/제외 + **근거**
- CTA

③ **기획안**
- 기본정보, 요약(배경·가설·목적), 타겟팅
- 콘텐츠 — variant별로 IAM에 실제 들어가는 카피를 명시:
  - 헤딩(타이틀 영역): `<variants[*].heading>` — A/B 각각
  - 본문(디스크립션 영역): `<variants[*].body>` — A/B 각각
  - CTA(주/보조), 톤, 타입
- 트리거/스케줄, 성과지표

③-b **컴포지션 플랜** (image.needed=true일 때)
- `mode`(layer/scene) 명기 + `scene`이면 세이프존 스케치(상단 텍스트존/하단 CTA존) 포함
- 에셋 표: id / source / style / concept / ratio (CDN URL은 Step 4a-b 업로드 후 manifest에서 확정 — brief에는 기입하지 않는다)
- **레이아웃 플랜**: `layout.directive`(auto/specified — specified면 지정 내용),
  variant별 유형 + 존 스케치 (visual-layout-patterns.md §2 9형 중 선택 근거),
  분화 축(§12.3 — 오버라이드 시 그 사실), 창작 레이아웃이면 `창작 레이아웃 — 근거` 표기(§12.2)
- library 컷 원본 경로 (브랜드 에셋 라이브러리 기준)

④ **부록**
- 개인화 변수 선정/제외 표 + 근거
- 디자인 방향: 차용 레퍼런스, 토큰 매핑, variant 차별화

### 브랜드 중립성 원칙

개인화 변수·딥링크·attributes 등 **브랜드 사실은 활성 브랜드 컨텍스트(Active brand + Brand deliverable context 블록)에서만** 로드한다. `bodoc://` 식별자·브랜드명·속성을 하드코딩하지 않는다.

### brief 저장

```bash
od braze brief <braze_message_id> --brief-file -
```

stdin(파이프)으로 저작한 마크다운을 전달한다. 파일 경로로 저장할 경우:

```bash
od braze brief <braze_message_id> --brief-file <path>
```

> **주의**: `od braze confirm`은 이미 Step 3에서 1회 호출했다. brief 저장 실패 시 `confirm`을 재호출하지 말고 `od braze brief` 엔드포인트만 재시도한다. confirm 중복 호출은 variant 중복을 유발한다.

---

## Step 4a — 오브제 에셋 생성 (imagegen 서브에이전트)

`image.needed=false`면 skip. 그 외:

1. `Read: design-templates/braze-iam/references/imagegen-pipeline.md` (dispatch
   계약·프롬프트 스캐폴드·폴백 절차 정본)
2. `mkdir -p {artifact_dir}/assets`
3. **`image.mode` 분기**:
   - `"scene"` → 씬 에셋 1건을 imagegen-pipeline.md 씬 생성 경로로 dispatch
     (배경 포함 생성·알파 검증 skip·세이프존 스캐폴드 강제. 히어로는 단일
     소품 — 캐릭터 미포함). `scene` 모드는 여기서 종료 — 아래 4~6 skip (씬
     에셋을 일반 generate 경로로 재dispatch하지 않는다; 실패 시 재시도·강등
     보고 규칙은 6과 동일).
   - `"layer"` → 아래 4~6 기존 절차 그대로. 물리적으로 맞물린 복합 오브제는
     통합 컴포지션 경로로 dispatch — 분리 생성 후 CSS 조립 금지.
4. `source:"generate"` 에셋 전부를 **한 턴 병렬 dispatch** — 에셋별 서브에이전트
   1개, 프롬프트는 메인이 스캐폴드로 조립. 실패분만 순차 재시도 1회(성공분 보존).
5. `source:"library"` 에셋: 브랜드 에셋 라이브러리 원본을
   `{artifact_dir}/assets/obj-<id>.png`로 복사 (생성 호출 없음).
6. 재시도도 실패한 에셋은 기획안 강등(css/생략) 여부를 사용자에게 보고 —
   조용한 누락 금지.

dispatch 도구가 없는 런타임 = 인라인 순차로 동일 계약 (imagegen-pipeline.md 절차 그대로).

## Step 4a-b — Media Library 업로드 (메인 직접)

`image.needed=false`면 skip. 전 에셋 검증 통과 후 **메인이 직접** 업로드한다 —
수 초·결정적 작업이라 위임 오버헤드가 더 크다 (compose·갤러리 Write와 동일 원리).

```bash
python3 <스킬 폴더>/scripts/upload_media.py --name-prefix iam-<braze_message_id>- \
  --json {artifact_dir}/assets/*.png
```

- 자격 = env `BRAZE_REST_API_KEY`·`BRAZE_REST_ENDPOINT` (media_library.create 권한
  키). 미설정 시 `~/.config/marketing-ax/braze.env` 자동 탐색 — 샘플은 스킬
  `scripts/braze.env.example`. **키를 문서·HTML·로그에 남기지 않는다.**
- 반환 JSON `uploaded` = `{에셋 파일명: CDN URL}` — 이 매핑이 Step 4b 빌더
  manifest의 `url` 필드 정본이다.
- `--name-prefix iam-<messageId>-` 필수 — Media Library 표시명 충돌 회피
  (동일 name 재업로드 시 Braze 측 동작이 문서 불명이라 캠페인별 유니크 이름으로 방어).
- **부분 실패**(exit 1, `failed` 배열)면 성공분은 URL 사용, 실패분만 재시도 1회 →
  재실패 시 해당 에셋만 placeholder 폴백(아래) + Step 7 수동 업로드 안내. 조용한 누락 금지.
- **전체 불가**(exit 2 자격 미설정, 403 API 비활성)면 **placeholder 폴백 경로**로
  전환: 종전 계약 그대로 발송본에 `__BRAZE_MEDIA__/<name>` 토큰 기입 + 프리뷰
  make_preview.py 듀얼 산출 + Step 7 수동 업로드·치환. 폴백 사용 사실을 사용자에게 보고.

## Step 4b — Variant 제작 (빌더 서브에이전트 위임)

메인은 제작하지 않는다:

1. `Read: design-templates/braze-iam/references/variant-builder-subagent.md`
2. Variant A/B **2개 병렬 dispatch** — 입력(brief 경로·기획안 전문·브랜드 컨텍스트
   소스 경로·DESIGN.md·references 5종+craft·에셋 manifest(**Step 4a-b의 CDN URL
   포함**)·**해당 variant의 `layout.variants.{label}` 유형+존 스케치**(=`{composition}`)·
   `{image_mode}`·산출 디렉토리)을 지시문 계약대로 채운다. A/B 스케치가 다른 것이
   기본이다 (§12.3 분화 — 빌더가 아니라 기획이 분화를 설계).
3. 각 빌더 산출 = 발송본 `variant-x.html`(이미지 src = Media Library CDN URL 직기입,
   FileViewer 프리뷰 겸용 — 별도 프리뷰 파일 없음). 반환 `OK ...` 2건 확인.
   **placeholder 폴백 시에만** 종전 듀얼 산출(발송본 placeholder + 프리뷰
   `variant-x-preview.html` make_preview.py 기계 변환).
4. FAIL 반환 시: 사유가 카피/기획 문제면 Step 3 수정 후 재dispatch, 실행 문제면
   해당 variant만 재dispatch 1회.

dispatch 도구가 없는 런타임 = 인라인 순차 제작으로 동일 산출물 계약. 이때 아래
"HTML 보일러플레이트"·"id 속성 강제 규칙"·"Liquid 작성" 절과
`references/` 문서를 직접 Read해 빌더 지시문의 전 규율을 자가 적용한다.

### HTML 보일러플레이트 — Braze 기술 제약 (craft/braze-custom-html.md 참조)

모든 기술 제약은 `craft/braze-custom-html.md` 에 인코딩됨. 핵심 요약:

- **단일 HTML 파일**: 외부 CSS/JS 파일 참조 불가 → 모두 인라인 (BRAZE-DOMAIN §2 Custom HTML 제약)
- **brazeBridge만** 사용: `brazeBridge.closeMessage()`, `brazeBridge.logClick()` 등 (BRAZE-DOMAIN §2.2). `appboyBridge` 사용 금지 (deprecated)
- **logClick 매핑**: 버튼 1 → `brazeBridge.logClick('0')`, 버튼 2 → `brazeBridge.logClick('1')`, 본문 탭 → `brazeBridge.logClick()` (BRAZE-DOMAIN §2.4)
  - 커스텀 이름 허용: `brazeBridge.logClick('<label>')`. ID ≤255자, 영숫자/공백/대시/언더스코어 (BRAZE-DOMAIN §2.4)
  - 캠페인당 최대 100 고유 이름 (BRAZE-DOMAIN §2.4)
- **Android 딥링크 시 `closeMessage()` 호출 금지**: SDK가 redirect 시 자동 닫음 (BRAZE-DOMAIN §2.3)
- **반응형**: `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`
- **`ab.BridgeReady`**: brazeBridge 모든 호출을 이 콜백 안에 위치시킨다 (BRAZE-DOMAIN §2.2)

```html
<script>
window.brazeBridge = window.brazeBridge || {};
brazeBridge.BridgeReady = function(callback) {
  if (document.readyState !== 'loading') { callback(); }
  else { document.addEventListener('ab.BridgeReady', callback); }
};

brazeBridge.BridgeReady(function() {
  // 모든 brazeBridge 호출은 여기에
});
</script>
```

### id 속성 강제 규칙 (필수)

`<body>` 내부 **모든** 요소에 `id="iam-..."` 속성을 부여한다. editor 인스펙터의 소스 역동기화에 필수.

**네이밍 컨벤션**:
- 컨테이너: `iam-overlay`, `iam-modal`, `iam-sheet`, `iam-fullscreen`
- 헤더/본문 섹션: `iam-modal-header`, `iam-modal-body`
- 닫기 버튼: `iam-close`, 아이콘 svg: `iam-close-icon`
- 메인 아이콘: `iam-icon`, 아이콘 svg: `iam-{의미명}-svg`
- 텍스트: `iam-header`, `iam-body`, `iam-subbody`
- 구분선: `iam-divider`
- CTA: `iam-cta-primary`, `iam-cta-secondary`
- 컴포넌트: 의미 명사 사용 (`iam-time-label`, `iam-checklist`, `iam-item-{N}`)

**svg 처리**: `<svg>` 자체에 id 부여, 내부 `<path>/<rect>/<circle>` 등은 별도 id 불필요.

```html
<!-- 표준 구조 예시 (모달) -->
<div id="iam-overlay" class="overlay" role="dialog" aria-modal="true" aria-label="...">
  <div id="iam-modal" class="modal">
    <button id="iam-close" class="close-btn" aria-label="닫기">
      <svg id="iam-close-icon" ...><path .../></svg>
    </button>
    <div id="iam-icon" class="icon-wrap">
      <svg id="iam-check-svg" ...><path .../></svg>
    </div>
    <h1 id="iam-header">...</h1>
    <p id="iam-body">...</p>
    <div id="iam-divider" class="divider"></div>
    <button id="iam-cta-primary" class="btn-primary">...</button>
    <button id="iam-cta-secondary" class="btn-secondary">...</button>
  </div>
</div>
```

### Liquid 작성 (변수 사용 시)

상세 가이드: `references/liquid-guide.md`. 요약:

- Standard attribute: `{{${attr}}}` / Custom attribute: `{{custom_attribute.${attr}}}`
- Object Array: `{% assign arr = {{custom_attribute.${attr}}} %}` + `{% for %}` 패턴
- 매칭 실패 시 루프 **바깥에서** `{% abort_message("사유") %}`
- nil 체크: `{% if {{${attr}}} == nil %}` (빈 문자열 비교 금지)
- 시간 변수: UTC ISO → epoch → `| plus: TZ_OFFSET_SEC` → 포맷

---

## Step 5 — 검수 (report-only 서브에이전트)

1. `Read: design-templates/braze-iam/references/review-subagent.md`
2. 신선 컨텍스트 검수자 **1 dispatch** — 입력(HTML 2파일(A/B 발송본 — placeholder
   폴백 시 프리뷰 포함 4파일)·에셋 PNG 전장·업로드 manifest(URL 매핑)·brief·
   기획안·브랜드 컨텍스트·DESIGN.md·craft·references·`{image_mode}`)을 지시문
   계약대로 채운다. 검수자는 report-only — 채점표·P0/P1 목록만 반환한다.
3. **수정 반영은 메인**: P0·감점 항목을 발송본에 수정 → 재검수 dispatch 1회.
   (placeholder 폴백 시에만 `make_preview.py` 재실행 — 프리뷰 수기 수정 금지.)
4. dispatch 불가 런타임 = 아래 체크리스트로 인라인 자가검수 (동일 채점표).

### Braze 기술 체크리스트

- [ ] `brazeBridge` 만 사용, `appboyBridge` 없음 (BRAZE-DOMAIN §2.2)
- [ ] 모든 brazeBridge 호출이 `ab.BridgeReady` 콜백 안에 있음 (BRAZE-DOMAIN §2.2)
- [ ] 버튼 1 = `logClick('0')`, 버튼 2 = `logClick('1')`, 본문 탭 = `logClick()` 또는 커스텀 이름 (BRAZE-DOMAIN §2.4)
- [ ] CTA 버튼 ≤ 2개 (BRAZE-DOMAIN §1.2)
- [ ] Android 딥링크 onClick에 `closeMessage()` 없음 (BRAZE-DOMAIN §2.3)
- [ ] 이미지 사용 시: PNG/JPEG/GIF만, WebP 없음, ≤5MB (BRAZE-DOMAIN §1.3)
- [ ] 이미지 사용 시: 포맷별 종횡비 준수 (modal/text=29:10, modal/image-only=1:1, fullscreen-portrait-text=6:5 등) (BRAZE-DOMAIN §1.4)
- [ ] 외부 CSS/JS 참조 없음, 모두 인라인
- [ ] 모든 body 요소에 `id="iam-..."` 부여

### 브랜드 체크리스트

- [ ] 브랜드 금지어 없음 (활성 브랜드 컨텍스트 anti-patterns 기준)
- [ ] CTA 텍스트 = 행동 동사 형식
- [ ] 브랜드 로고 인라인 임베드 없음 (브랜드 정책 — 별도 확인)
- [ ] raw rgba 없음 → 브랜드 토큰 사용

P0 발견 시 → 해당 variant 수정 후 재확인.

variant UUID를 알아야 produce를 호출할 수 있다. 먼저 `od braze get`으로 UUID를 확인한다:

```bash
# 1) variant UUID 조회
od braze get <braze_message_id> --json
# 출력 예: "variants": [{"id": "<uuid-A>", "label": "A", ...}, {"id": "<uuid-B>", "label": "B", ...}]

# 2) 각 variant의 UUID(id)로 produce 호출
od braze produce <braze_message_id> --variant <uuid-A> --artifact <path/to/variant-a.html>
od braze produce <braze_message_id> --variant <uuid-B> --artifact <path/to/variant-b.html>
```

> **중요**: `--variant` 에는 레이블("A"/"B")이 아닌 UUID `id` 값을 전달한다.
> `od braze get <messageId> --json` 으로 각 variant의 `id` 필드를 먼저 확인할 것.

---

## Step 6 — 반복 개선 (Iterate)

두 variant를 **각자 독립**으로 개선한다.

### 종료 조건 (variant별)

1. **자동 종료**: 검수 게이트 P0 0건 그리고 총점 ≥80 (재검수 서브에이전트 판정) → 해당 variant 완료
2. **반복 한계 가드**: `MAX_ITERATIONS = 3`. P0 남아도 더 이상 반복하지 않고 발송 보류 권고 처리
3. 두 variant 모두 완료 시 Step 7 진입

완료 보고 형식:
```
✓ Variant A — P0 0건 (rev 1). 잔여 P1 2건 carry-over.
✓ Variant B — P0 0건 (rev 2). 완료.
→ Step 7 진입
```

---

## Step 7 — 최종 확인 + 핸드오프

두 variant 파일이 FileViewer iframe에서 렌더된다 (OD produced-file 아티팩트, DATA-MODEL-BRAZE §2-A).

variant 목록 및 상태 확인은 `od braze get`을 사용한다:

```bash
od braze get <braze_message_id> [--json]
# → 메시지 상태 + variants 배열(id, label, status, artifactPath) 출력
```

### Braze 대시보드 핸드오프 안내

HTML IAM은 REST API로 전송 불가 (BRAZE-DOMAIN §4.1-4.2). 수동 핸드오프 절차:

1. Braze 대시보드 → Campaigns → Create Campaign → In-App Message
2. Message type: **Custom HTML**
2-b. **미디어 확인 (image.needed=true일 때)**: 에셋은 Step 4a-b에서 이미 Media
   Library에 업로드돼 발송본에 CDN URL이 기입돼 있다 — 업로드 표시명
   (`iam-<messageId>-...`)과 URL 목록만 표로 제시해 대시보드에서 확인 가능하게
   한다. **placeholder 폴백을 쓴 경우에만** 종전 수동 절차: `{artifact_dir}/assets/*.png`
   목록 제시 → 대시보드 Media Library 수동 업로드 → 발송본의
   `__BRAZE_MEDIA__/<name>`을 업로드된 URL로 치환 안내 (에디터 붙여넣기 전 수행).
   **data-URI 인라인 발송본 금지** — Braze 에디터 버퍼링 실측.
3. `variant-a.html` / `variant-b.html` 내용을 HTML 에디터에 붙여넣기 (또는 HTML Upload 기능 사용)
4. 트리거 이벤트 설정: 기획안의 후보 트리거 중 선택 (BRAZE-DOMAIN §5.2)
5. 타겟 세그먼트·빈도 제한 설정
6. 테스트 발송 후 라이브

> **JS 게이트 주의**: HTML IAM JS 실행에는 Web SDK 초기화 시 `allowUserSuppliedJavascript: true` 필요 (BRAZE-DOMAIN §2.1). SDK 버전 floor: Swift 5.0.0+ / Web 2.5.0+ / Android 8.0.0+. 구버전 유저는 조용히 제외됨.

각 variant를 완료 처리할 때는 UUID `id`를 사용한다:

```bash
# variant UUID는 `od braze get <messageId> --json` 으로 조회
od braze variant <braze_message_id> --variant <uuid-A> --status done
od braze variant <braze_message_id> --variant <uuid-B> --status done
```

완료 메시지:
```
✓ Braze IAM 제작 완료 (Variant 2종)
A: variant-a.html (<상태>)
B: variant-b.html (<상태>)
기획안: braze_plan_v1 (DB)
기획 문서: braze/<messageId>-<slug>/brief.md (디자인 프로젝트 파일)
에셋: assets/*.png N건 — Media Library 업로드 완료 (URL 발송본 기입) / 폴백 시: 수동 업로드 + placeholder 치환 필요

Braze 대시보드 핸드오프 필요 — REST API로 IAM 전송 불가 (BRAZE-DOMAIN §4.4)
트리거 이벤트 설정 후보: <candidates>
```

---

## 주의사항

- 모든 인터뷰·컨펌 = `<question-form>` 아티팩트만. AskUserQuestion 도구, 인라인 폼 금지
- 트리거 이벤트는 인터뷰하지 않음 (BRAZE-DOMAIN §5.1: IAM은 SDK 커스텀 이벤트만 발화)
- 슬라이드업 = HTML IAM으로 제작하지 말 것. §1.1은 슬라이드업이 비차단임을 확인; HTML IAM의 전체화면 WebView 동작으로 비차단 기대와 충돌(프로덕션 SDK 동작 기준). Native 슬라이드업 권장
- `brazeBridge` 만 사용. `appboyBridge` 절대 사용하지 않음 (BRAZE-DOMAIN §2.2)
- 브랜드 facts (페르소나, 금지어, 딥링크, 어트리뷰트)는 활성 브랜드 컨텍스트(Active brand + Brand deliverable context 블록)에서만 로드. 추측 금지
- 개인화 어트리뷰트는 브랜드 카탈로그에 존재하는 식별자만 사용
- 이미지: PNG/JPEG/GIF만. WebP 금지 (BRAZE-DOMAIN §1.3)
- CTA ≤ 2개 (BRAZE-DOMAIN §1.2)
- HTML IAM은 REST로 전달 불가 → 대시보드 수동 핸드오프 (BRAZE-DOMAIN §4.4)
- 발송본에 data-URI 금지 (에디터 버퍼링) — 이미지 src = Media Library CDN URL (Step 4a-b 자동 업로드). 업로드 불가 시에만 placeholder `__BRAZE_MEDIA__/<name>` + 프리뷰 인라인 폴백
- Braze REST 자격(`BRAZE_REST_API_KEY`)은 env/`~/.config/marketing-ax/braze.env`에서만 — 문서·HTML·로그·반환 텍스트에 노출 금지
- 이미지 생성 = gti `gpt-5.5` 고정 (codex exec 폴백) + 실사 금지 (스타일 4종) — references/imagegen-pipeline.md
- 서브에이전트 위임 실패(도구 없음) 시 인라인 동일 절차 — 단계 생략 금지
- 캐릭터 IAM 전면 미포함 (2026-07-13 사용자 결정, 라이브러리 컷 포함) — 히어로는 references/visual-layout-patterns.md §3 등재 유형에서 선택
- 레이아웃 = visual-layout-patterns.md §12: 지시 모드(auto/specified) + auto 무근거 기본값 금지 + A/B 최소 1축 구조 분화 기본(사용자 "카피만 A/B" 오버라이드 가능) + 창작 레이아웃은 brief에 근거 표기 (2026-07-14 사용자 결정)
- 물리적으로 맞물린 복합 오브제 = 통짜 통합 생성 1건. 분리 생성한 PNG를 CSS로 겹쳐 조립하는 콜라주 금지 (도그푸딩 반려 실측 2026-07-10)
- `scene` 모드 씬 = 텍스트·글자·숫자 절대 금지 + STRICT 세이프존(상단 텍스트존/하단 CTA존) 강제 — references/imagegen-pipeline.md
