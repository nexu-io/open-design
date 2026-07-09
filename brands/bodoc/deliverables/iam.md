# 보닥 IAM — 채널 제작 컨텍스트 (Braze Custom-HTML In-App Message)

> 스킨 스왑 불변인 포맷·플랫폼 제약·발송 규칙. 비주얼 룩은 활성 디자인시스템
> (디폴트 design-systems/bodoc-iam/) 소관. 제작 절차는 braze-iam SKILL.md 소관.

## Layout (사이즈 3종만 — Braze 플랫폼 제약)

HTML IAM은 **모달·하프시트·풀스크린만** 가능.

| 사이즈 | 컨테이너 핵심 | 적합 |
|---|---|---|
| 모달 | `width:calc(100%-40px); max-width:400px; radius:20px; 중앙정렬` | 단일 메시지·확인 |
| 하프시트 | `width:100%; max-width:600px; radius:20px 20px 0 0; padding-bottom:safe-area; 하단정렬` | 목록·다중 옵션 |
| 풀스크린 | `body{position:fixed; inset:0; overflow-y:auto}` | 몰입·축하 |

- **슬라이드업 금지** — HTML IAM은 WebView 전면 차단이라 비차단성 기대 위반. Braze native 슬라이드업으로 제작.
- **하프시트 드래그 핸들 금지** — WebView 오버레이라 드래그 미동작. 닫기는 ✕ 버튼·오버레이 탭만.
- iPad 대응 `max-width`, 노치 대응 `env(safe-area-inset-bottom)`.

## 프로덕션 폰트 — Braze 자산 문자열 블록

**프로덕션 인라인 폰트 — Braze 자산 문자열 블록** (프로덕션 발송본은 이 블록을 인라인, `tokens.css` @font-face는 제거):

```css
.font-bold     { font-family: 'Pretendard-Bold.otf:65eea035affddd004d709b51';     font-weight: 300; letter-spacing: -0.5px; }
.font-semibold { font-family: 'Pretendard-SemiBold.otf:65eea0dcaffddd004d709b8b';  font-weight: 300; letter-spacing: -0.5px; }
.font-medium   { font-family: 'Pretendard-Medium.otf:65eea07daffddd004d709b6f';    font-weight: 300; }
.font-regular  { font-family: 'Pretendard-Regular.otf:65eea01caffddd004d709b39';   font-weight: 300; }
```

로컬 프리뷰용 @font-face(CDN)는 Braze 자산 경로(`https://braze-images.com/appboy/communication/assets/font_assets/...`)를 직접 참조한다. 프로덕션엔 위 자산 문자열만 사용.

## 컴포넌트 인프라 (채널 계약)

- **id 강제**: `<body>` 내부 모든 요소(`div/button/h1~h6/p/span/a/img/svg`)에 `id="iam-..."` 부여. editor 인스펙터 역동기화 의존. svg 자체엔 id, 내부 path/rect/circle은 불필요.
- **Braze Bridge**: `appboyBridge.logClick(id)` / `appboyBridge.closeMessage()`. logClick 라벨은 **버튼명 그대로 한글**(영문 슬러그 금지).

## IAM 개인화·카피 규칙

- **개인화**: `name`은 custom attribute → `{{custom_attribute.${name}}}` 강제. `{{${name}}}`·`{{${first_name}}}`은 미치환 발송 → 금지.
- **Time 어트리뷰트**: UTC ISO → KST(+32400초) 보정 + `date` 필터 체이닝 필수. 변환 실패 시 fallback `{% abort_message %}` 권장.
- **보닥 로고 IAM 포함 금지** — IAM HTML에 로고 절대 삽입 안 함.
- **deprecated 어트리뷰트 사용 금지**: `bodoc_percentile`(보험점수 백분율) 등.
- 프로덕션 발송본은 단일 HTML 인라인(외부 CSS/JS 참조 불가).

## 발송 차단 신호 (프로덕션 금지)

| ❌ | 이유 |
|---|---|
| `PREVIEW_PLACEHOLDERS` / appboyBridge fallback `<script>` | 프리뷰 전용. 프로덕션 잔존 시 미치환·오동작 |
| `{{${name}}}` / `{{${first_name}}}` | 미치환 발송. custom_attribute prefix 필수 |
| 보닥 로고 삽입 | IAM 개인화·카피 규칙 |
| "플래너" 표현 | "전문가" 강제 |
| 슬라이드업 HTML / 하프시트 드래그 핸들 | WebView 제약 위반 |
| id 누락 요소 | editor 역동기화 불가 |
