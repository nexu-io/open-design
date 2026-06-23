---
name: braze-iam
description: |
  Braze Custom-HTML In-App Message (IAM) producer — brand-agnostic 7-step
  workflow. Interviews the user, drafts a campaign plan, gates confirmation,
  produces two design-variant HTML artifacts (A/B), and hands off to the
  Braze dashboard. Works for any brand whose DESIGN.md is loaded as the
  active design system. Use when the brief asks for a "Braze IAM",
  "인앱메시지", "in-app message", "Braze 팝업", "IAM HTML", or "브레이즈 캠페인".
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
    requires:
      - braze-custom-html
  design_system:
    requires: true
    sections: [color, typography, spacing, components, voice, anti-patterns]
  example_prompt: "신규 가입 유도 모달 IAM 만들어줘 — 30초 안에 가입 가능하다는 메시지."
---

<!--
Role: Braze Custom-HTML IAM 7단계 제작 워크플로우 — brand-agnostic OD 포트
Key Features: <question-form> 인터뷰/컨펌, braze_plan_v1 기획안, od braze CLI 통합, Variant A/B 병렬 HTML 생성, craft/braze-custom-html.md 자가 검증
Dependencies: 활성 brand의 DESIGN.md, BRAZE-DOMAIN.md §1·§2·§5, DATA-MODEL-BRAZE.md §0·§4, craft/braze-custom-html.md, references/ (size-patterns, format-design-guide, interaction-standard, liquid-guide)
Notes: bodoc 브랜드 특화 사실(플래너→전문가, bodoc:// 딥링크, 특정 어트리뷰트) 하드코딩 금지. 브랜드 사실은 활성 DESIGN.md + brand context에서만 로드.
-->

# Braze IAM — 7단계 워크플로우

## 개요

Braze Custom-HTML IAM을 **브랜드-어그노스틱 워크플로우**로 제작한다.

- **인터뷰 4축**: 목적 · 타겟 · 형식(사이즈/레이아웃) · 톤
- **트리거 이벤트는 인터뷰하지 않는다**: Braze 캠페인 콘솔에서 직접 설정 (BRAZE-DOMAIN §5.1-5.2 — IAM은 SDK 커스텀 이벤트로만 발화, API로 발화 불가). 기획안에 후보 1~2개를 명시한다.
- **산출물 = Braze-ready Custom HTML 파일 2개 (Variant A/B)** → 대시보드 붙여넣기 핸드오프 (BRAZE-DOMAIN §4.4)

> **선행 필수 — 활성 브랜드 컨텍스트 로드**: 타겟·페르소나·브랜드 보이스·금지어·딥링크 카탈로그는 Claude 사전 지식에 없는 브랜드-사내 사실이다. 추측 금지. IAM 제작 시작 시 **활성 브랜드의 `DESIGN.md`를 먼저 Read**해 정본 컨텍스트를 확보한다 (`design-systems/<brand>/DESIGN.md`).

---

## 시작 전 Setup

### od braze 상태 초기화

```bash
od braze create --project <project_id> --title "<IAM 목적 한 줄>" --format custom_html
# → braze_message_id 반환 (이후 모든 단계에 사용)
```

- `braze_message_id` 를 환경변수 또는 작업 노트에 기록한다
- `status` → `interviewing` 상태로 전환

### 출력 경로

OD produced-file 아티팩트 패턴 (DATA-MODEL-BRAZE §2-A):
- Variant 파일: OD 프로젝트 artifact dir 내 `braze-iam/{YYYY-MM-DD}-{slug}/variant-a.html`, `variant-b.html`
- `artifact_path` 는 `od braze produce` 호출 시 `braze_variants` 에 기록됨

---

## Step 1 — Intake (접수)

활성 브랜드 컨텍스트를 로드하고 요청 원문을 기록한다.

```
Read: design-systems/<brand>/DESIGN.md
```

로드한 후 다음 항목을 내부 확인:
- 브랜드 보이스 / 톤 가이드
- 금지어 목록 (예: 브랜드별 호칭 규약)
- 딥링크 카탈로그 (있는 경우)
- 개인화 어트리뷰트 카탈로그 (있는 경우)

---

## Step 2 — Interview (인터뷰)

**`<question-form>` 아티팩트로만 진행한다.** AskUserQuestion 도구·인라인 폼 금지 (AGENTS.md "Asking the user questions").

인터뷰 = **4축만** 물어본다. 트리거 이벤트는 묻지 않는다 (Braze 캠페인 콘솔 설정, BRAZE-DOMAIN §5.1).

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
    <hint>슬라이드업(토스트형)은 HTML IAM으로 제작할 수 없습니다 — HTML IAM은 앱 전체를 차단하는 WebView라 비차단성 슬라이드업과 의도가 충돌합니다 (BRAZE-DOMAIN §1.1). 슬라이드업이 필요하면 Braze 기본 native 슬라이드업을 사용하세요.</hint>
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
- 브랜드 금지어 준수 (활성 DESIGN.md 기준)
- CTA 최대 2개 (BRAZE-DOMAIN §1.2)

**트리거 이벤트 후보** (Braze 대시보드 설정용, 인터뷰하지 않음):
- BRAZE-DOMAIN §5.2 5종 중 후보 1~2개 명시: Session Start / Push Click / Any Purchase / Specific Purchase / Custom Event
- 기획안에만 기록, 실제 설정은 Braze 콘솔에서 담당자가 수행

```bash
od braze interview <braze_message_id> \
  --purpose "<q-purpose>" \
  --target "<q-target>" \
  --format "<q-format>" \
  --tone "<q-tone>"
```

---

## Step 3 — Proposal (기획안)

기획안을 `braze_plan_v1` 객체로 작성하고 DB에 저장한 뒤 마크다운 카드로 렌더해 사용자에게 제시한다 (DATA-MODEL-BRAZE §4).

```bash
od braze plan <braze_message_id> --plan-file - << 'EOF'
{
  "version": "braze_plan_v1",
  "summary": "<캠페인 한 줄 요약>",
  "iam_format": "<modal|halfsheet|fullscreen>",
  "tone": "<톤>",
  "emphasis": ["<핵심 강조 1>", "<핵심 강조 2>"],
  "variants": [
    { "label": "A", "angle": "<디자인 접근 A>" },
    { "label": "B", "angle": "<디자인 접근 B>" }
  ],
  "targeting": {
    "segment": "<세그먼트 조건>",
    "trigger_event_candidates": ["<후보 트리거 1>", "<후보 트리거 2>"],
    "delivery_model": "action_based"
  },
  "cta": [
    { "label": "<주 CTA 텍스트>", "deeplink": "<딥링크 또는 null>" },
    { "label": "<보조 CTA 텍스트>", "deeplink": null }
  ],
  "liquid_attrs": [
    { "liquid": "{{custom_attribute.${attr}}}", "attr": "<attr_name>", "reason": "<선정 근거>" }
  ],
  "image": { "needed": false, "ratio": null, "format": "PNG" },
  "rejections": []
}
EOF
```

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
| Variant A | <angle A> |
| Variant B | <angle B> |
| 트리거 이벤트 후보 | <candidates> (Braze 콘솔에서 설정) |
| 주 CTA | <cta[0].label> |
| 보조 CTA | <cta[1].label> |
| 개인화 변수 | <liquid_attrs> |
```

### 자가 카피 검토 (Step 3~4 사이)

HTML 빌드 전 기획안 카피의 톤·금지어·CTA 품질을 **Claude 자신이 자가 검토**한다. (DECISIONS.md 결정: OD critique jury 삭제 → main-agent self-review)

체크 항목:
- [ ] 브랜드 금지어 없음 (활성 DESIGN.md anti-patterns 기준)
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

- **컨펌**: `od braze confirm <braze_message_id>` → status `plan_confirmed` → Step 4
- **반려**: `od braze reject <braze_message_id> --reason "<사유>"` → `rejections` 누적 + 기획안 재작성

---

## Step 4 — HTML 제작

### 활성 브랜드 DESIGN.md 필수 확인

```
Read: design-systems/<brand>/DESIGN.md
```

브랜드 토큰(색상·타이포·간격·radius·shadow), 컴포넌트 패턴, anti-patterns를 확인한다. 이것이 **단일 디자인 계약**이며 아래 외부 레퍼런스보다 우선한다.

### 참조 문서 읽기 (필수)

```
Read: design-templates/braze-iam/references/size-patterns.md    # 컨테이너 CSS
Read: design-templates/braze-iam/references/format-design-guide.md  # 포맷별 레이아웃
Read: design-templates/braze-iam/references/interaction-standard.md  # 애니메이션
```

Liquid 변수가 1개 이상이면:
```
Read: design-templates/braze-iam/references/liquid-guide.md
```

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

### Variant A / B 병렬 제작

카피·Liquid는 동일, **디자인 접근을 달리**한 두 파일을 병렬 제작.

| Variant | 디자인 레퍼런스 참고 방향 | 레이아웃 차별화 |
|---|---|---|
| A | 기본 구조 (아이콘·텍스트 위계 중심) | 브랜드 primary 톤 |
| B | 대안 구조 (배경·서피스·그래픽 차별화) | 대비 강조 또는 미니멀 |

산출물:
- `variant-a.html` ← 최종 발송본 A
- `variant-b.html` ← 최종 발송본 B

**프로덕션 발송본 룰** (둘 다 적용):
- 프리뷰 폴백 스크립트 블록 포함 금지
- raw rgba 인라인 금지 → 브랜드 토큰 사용
- 모든 요소에 `id="iam-..."` 부여
- Liquid 변수는 그대로 유지 (Braze 엔진이 치환)

---

## Step 5 — 자가 리뷰 (craft 체크리스트)

두 variant 각각에 대해 `craft/braze-custom-html.md` 체크리스트로 **메인 에이전트 자가 검토**를 수행한다.

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

- [ ] 브랜드 금지어 없음 (활성 DESIGN.md anti-patterns 기준)
- [ ] CTA 텍스트 = 행동 동사 형식
- [ ] 브랜드 로고 인라인 임베드 없음 (브랜드 정책 — 별도 확인)
- [ ] raw rgba 없음 → 브랜드 토큰 사용

P0 발견 시 → 해당 variant 수정 후 재확인.

```bash
od braze produce <braze_message_id> \
  --variant A --artifact <path/to/variant-a.html>
od braze produce <braze_message_id> \
  --variant B --artifact <path/to/variant-b.html>
```

---

## Step 6 — 반복 개선 (Iterate)

두 variant를 **각자 독립**으로 개선한다.

### 종료 조건 (variant별)

1. **자동 종료**: Braze 기술 P0 = 0건, 브랜드 가이드 P0 = 0건 → 해당 variant 완료
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

```bash
od braze variant <braze_message_id> --list
```

### Braze 대시보드 핸드오프 안내

HTML IAM은 REST API로 전송 불가 (BRAZE-DOMAIN §4.1-4.2). 수동 핸드오프 절차:

1. Braze 대시보드 → Campaigns → Create Campaign → In-App Message
2. Message type: **Custom HTML**
3. `variant-a.html` / `variant-b.html` 내용을 HTML 에디터에 붙여넣기 (또는 HTML Upload 기능 사용)
4. 트리거 이벤트 설정: 기획안의 후보 트리거 중 선택 (BRAZE-DOMAIN §5.2)
5. 타겟 세그먼트·빈도 제한 설정
6. 테스트 발송 후 라이브

> **JS 게이트 주의**: HTML IAM JS 실행에는 Web SDK 초기화 시 `allowUserSuppliedJavascript: true` 필요 (BRAZE-DOMAIN §2.1). SDK 버전 floor: Swift 5.0.0+ / Web 2.5.0+ / Android 8.0.0+. 구버전 유저는 조용히 제외됨.

```bash
od braze variant <braze_message_id> --status done
```

완료 메시지:
```
✓ Braze IAM 제작 완료 (Variant 2종)
A: variant-a.html (<상태>)
B: variant-b.html (<상태>)
기획안: braze_plan_v1 (DB)

Braze 대시보드 핸드오프 필요 — REST API로 IAM 전송 불가 (BRAZE-DOMAIN §4.4)
트리거 이벤트 설정 후보: <candidates>
```

---

## 주의사항

- 모든 인터뷰·컨펌 = `<question-form>` 아티팩트만. AskUserQuestion 도구, 인라인 폼 금지
- 트리거 이벤트는 인터뷰하지 않음 (BRAZE-DOMAIN §5.1: IAM은 SDK 커스텀 이벤트만 발화)
- 슬라이드업 = HTML IAM 제작 불가 (BRAZE-DOMAIN §1.1). Native 슬라이드업 권장
- `brazeBridge` 만 사용. `appboyBridge` 절대 사용하지 않음 (BRAZE-DOMAIN §2.2)
- 브랜드 facts (페르소나, 금지어, 딥링크, 어트리뷰트)는 활성 DESIGN.md에서만 로드. 추측 금지
- 개인화 어트리뷰트는 브랜드 카탈로그에 존재하는 식별자만 사용
- 이미지: PNG/JPEG/GIF만. WebP 금지 (BRAZE-DOMAIN §1.3)
- CTA ≤ 2개 (BRAZE-DOMAIN §1.2)
- HTML IAM은 REST로 전달 불가 → 대시보드 수동 핸드오프 (BRAZE-DOMAIN §4.4)
