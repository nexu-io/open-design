<!--
Role: Braze In-App Messaging(IAM) 타깃 도메인 레퍼런스 — ARCHITECTURE-BRAZE.md §11의 외부 리서치 산출물.
Key Features: IAM 메시지 유형·이미지 스펙, Custom HTML 제약 + brazeBridge JS API, REST API(엔드포인트/인증/송신·스케줄/Templates), 트리거 페이로드, 세그먼트/트리거
Dependencies: 없음(문서). Braze 공식문서(braze.com/docs) 검증 기반.
Notes: deep-research 스킬 산출(2026-06-23, 107 에이전트, 25 claim 3표 검증 / 0 kill). 모든 출처 primary(braze.com/docs). 미공표 항목은 fabricate 금지 — §6 Open Questions로 flag.
-->

# Braze 타깃 도메인 레퍼런스 (BRAZE-DOMAIN.md)

> ARCHITECTURE-BRAZE.md §11 스텁을 채우는 검증 산출물. Marketing AX 포크 = **(a) 전체 Marketing AX**(Braze IAM = 5산출물 중 1) 스코프 확정.
>
> **검증 메서드**: `deep-research` 스킬(2026-06-23) — 6각도 분해 → 24 primary 소스 fetch → 112 claim 추출 → 25 claim 3표 적대 검증(25 confirmed / 0 killed). 출처 전부 `braze.com/docs` primary. 각 사실 옆 `[Sn]` = §7 소스 인덱스.
>
> ⚠️ **시점 민감**: 2026-06 검증. SDK 버전 floor·deprecation·인스턴스 호스트는 변동 가능 → 구현 시 대시보드/공식문서 재확인(needs verification). 인스턴스 엔드포인트는 **하드코딩 금지, 대시보드에서 복사**가 Braze 권장.

---

## 1. IAM 메시지 유형 + 크리에이티브 제약

### 1.1 Traditional 에디터 6 유형 `[S3]`
| 유형 | 설명 | 플랫폼 |
|---|---|---|
| **Slideup** | 비차단 슬라이드인 | 전 플랫폼 |
| **Modal** | 오버레이 + 메시지 블록 | 전 플랫폼 |
| **Fullscreen** | 전체화면 메시지 블록 | 전 플랫폼 |
| **Custom HTML** | 커스텀 HTML/CSS/JS | 전 플랫폼 |
| **Email Capture Form** | 이메일 수집 폼 | **웹 전용** |
| **Web Modal with CSS** | CSS 모달 | **웹 전용** |

> 포크 함의: §9.1 스킬 `od.mode` 변형 = {slideup, modal, fullscreen, custom_html}. Email-capture·web-modal-with-CSS는 웹 전용 — 초기 스코프 후순위.

### 1.2 CTA 버튼 + 텍스트 제약 `[S3][S2]`
- **버튼 최대 2개** (body 텍스트 하단). modal/fullscreen = "up to two analytics-enabled buttons". slideup = 통상 1개.
- **하드 글자수 제한 없음** (headline/body/buttons 전부). 단 Braze가 moderate하고, 과다 텍스트는 expand/scroll 강제.
  - ⚠️ slideup 전용 글자 제한·플랫폼별 렌더 차이는 **미검증**(§6 Open Q3).

### 1.3 이미지 미디어 스펙 `[S1]`
- **포맷**: PNG / JPEG / GIF만. **WebP 미지원**(전 기기/브라우저) → PNG/JPEG 변환 필수.
- **용량**: 권장 ~500 KB, **최대 5 MB**.

### 1.4 유형별 이미지 종횡비·해상도 `[S1][S2]`
| 유형 | 변형 | 종횡비 | 해상도(고해상 / 최소) |
|---|---|---|---|
| **Modal** | image-only | 1:1 | 1200×2000 px(max) / 600×600 px(min) |
| **Modal** | with text | 29:10 | 1450×500 px / 600×205 px |
| **Fullscreen** | portrait + text | 6:5 | 1200×1000 px |
| **Fullscreen** | portrait image-only | 3:5 | 1200×2000 px |
| **Fullscreen** | landscape + text | 10:3 | 2000×600 px |
| **Slideup** | — | 1:1 | 150×150 px / 50×50 px(min) |

> 포크 함의: craft 룰 + lint-artifact = 이미지 포맷(no WebP)·용량(≤5MB)·종횡비를 유형별로 인코딩. 생성 산출물 검증 게이트로.

---

## 2. Custom HTML IAM 제약 + brazeBridge JS API

### 2.1 JS 실행 게이트 `[S5][S3]`
- HTML IAM JS 실행 = **Web SDK 초기화 옵션 필수**:
  ```js
  braze.initialize('YOUR-API_KEY', { allowUserSuppliedJavascript: true })
  ```
- 보안 게이트. deprecated `enableHtmlInAppMessages` 대체.
- ⚠️ **Web SDK 전용 플래그** — 모바일 HTML IAM 가이드엔 없음. iOS/Android에 동일 적용 가정 금지.
- **SDK 버전 floor** (HTML-upload-with-preview): Swift 5.0.0+ / Web 2.5.0+ / Android 8.0.0+. 구버전 유저는 **메시지 미수신(조용히 제외)**.

### 2.2 brazeBridge JS 객체 `[S4][S5]`
메서드 (전부 `ab.BridgeReady` 안에서 호출):
| 메서드 | 시그니처 |
|---|---|
| `closeMessage()` | UI만 닫음 (dismissal 미기록 / 서버측 suppression 없음) |
| `logClick(button_id)` | 클릭 트래킹 |
| `logCustomEvent(eventName, eventProperties)` | 커스텀 이벤트 |
| `logPurchase(productId, price, currencyCode, quantity, purchaseProperties)` | 구매 |
| `requestImmediateDataFlush()` | 즉시 flush |
| `requestPushPermission(successCb, deniedCb)` | 푸시 권한 요청 |
| `changeUser(id, sdkAuthSignature?)` | 유저 전환 |

- ⚠️ **`appboyBridge` deprecated**(동작은 함). deprecation floor: Web 3.3.0+ / Android 14.0.0+ / iOS 4.2.0+. → 생성 코드는 `brazeBridge`만.

### 2.3 딥링크/외부링크 — Android 주의 `[S4]`
- Android HTML IAM 딥/외부 링크 시 **`closeMessage()` 호출 금지**. SDK가 redirect 시 auto-close → closeMessage 호출하면 간섭, 복귀 시 메시지 unresponsive 가능.
- `closeMessage()`는 명시적 비링크 닫기 액션엔 유효.

### 2.4 클릭 트래킹 매핑 `[S5]`
- **Button 1 → `logClick('0')`**, **Button 2 → `logClick('1')`**, **body → `logClick()`**(인자 없음).
- 커스텀 이름 지원: `logClick('custom_name')`, 캠페인당 **최대 100 고유 이름**.
- 버튼 ID: 최대 255자, 영숫자/공백/대시/언더스코어만.

> 포크 함의: §9 craft 룰로 인코딩 — 생성 HTML은 (1) brazeBridge만, (2) 버튼 클릭 = logClick('0')/('1'), (3) Android 딥링크에 closeMessage 미삽입. lint-artifact 규칙화.

---

## 3. Braze REST API

### 3.1 인스턴스별 엔드포인트 `[S6]`
하드코딩 금지 — 대시보드에서 실제 REST 엔드포인트 복사가 공식 권장.
| 클러스터 | 호스트 |
|---|---|
| **US** | `rest.iad-01` … `rest.iad-08.braze.com`, `rest.us-10.braze.com` |
| **EU** | `rest.fra-01.braze.eu`, `rest.fra-02.braze.eu` |
| **APAC** | `rest.au-01` / `rest.id-01` / `rest.jp-01` / `rest.kr-01.braze.com` |

> ⚠️ `rest.iad-0X` 패턴은 **US 클러스터 한정**. US-10(`rest.us-10`)·EU(`.braze.eu`)는 다름.

### 3.2 인증 `[S6][S7]`
- `Authorization: Bearer YOUR_REST_API_KEY` (2020-04 이후 현행).
- 키별 **엔드포인트 스코프 권한**. 예: `/messages/send` → `messages.send`, `/campaigns/trigger/send` → `campaigns.trigger.send`.
- 에러: 401(키 무효/누락), 403(권한 부족).

### 3.3 즉시 송신 엔드포인트 `[S8][S9][S10]`
| 엔드포인트 | 용도 |
|---|---|
| `POST /messages/send` | API-only 즉시 ad-hoc, content+config를 **요청 본문에** 포함 |
| `POST /campaigns/trigger/send` | 대시보드 관리 content 참조, API는 타이밍/수신자 제어 |
| `POST /canvas/trigger/send` | Canvas 버전 |

### 3.4 스케줄 엔드포인트 `[S8]` (검증 2-1, 전용 페이지 보강)
| 엔드포인트 | 스코프 |
|---|---|
| `POST /messages/schedule` | `messages.schedule.create` |
| `POST /campaigns/trigger/schedule` | `campaigns.trigger.schedule.create` |
| `POST /canvas/trigger/schedule` | `canvas.trigger.schedule.create` |
| `GET /messages/scheduled` | 예정 목록 조회 |

### 3.5 Templates API — Content Blocks `[S11][S12]`
| 작업 | 엔드포인트 |
|---|---|
| 목록 | `GET` List Available Content Blocks |
| 정보 | `GET` See Content Block Information |
| 생성 | `POST /content_blocks/create` |
| 수정 | `POST` Update Content Block |

> 포크 함의: §2.2 `braze-client.ts` = 인스턴스 base URL(설정 주입) + Bearer 인증 + 위 엔드포인트 래퍼. §2.3 발송 잡 = trigger/send + schedule. Content Block = 재사용 크리에이티브 저장처 후보.

---

## 4. ⚠️ 핵심: REST에 인라인 IAM 객체 없음 — IAM은 대시보드 작성 (2차 리서치, 3-0 검증)

> **제품 모델 결정타.** 2차 리서치(2026-06-23, 101 에이전트, 24 claim 3-0·1 kill)가 확정: **Braze는 어떤 REST 엔드포인트에도 인라인 `in_app_message` 객체 스키마를 공표하지 않음.** 1차 §11 가정(`braze_iam_v1` JSON → POST)은 **불가**. fabricate 금지.

### 4.1 `/messages/send`가 지원하는 채널 `[S10][S8][S25]`
지원 `messages` 객체 타입: `android_push`, `apple_push`, `content_card`, `email`, `kindle_push`, `web_push`, `webhook`, `whats_app`, `sms`. → **`in_app_message` 타입 없음.** 필드 스키마는 별도 Messaging Objects 레퍼런스(`/docs/api/objects_filters/#messaging-objects`)로 위임 — 거기에도 IAM 객체 없음 `[S26]`.

### 4.2 `/campaigns/trigger/send` = 콘텐츠 없음, 대시보드 참조 `[S9]`
본문: `campaign_id`(필수 String), `send_id`, `trigger_properties`(object), `broadcast`(bool), `audience`(connected-audience), `recipients`(≤50, 각 `external_user_id` + 개별 trigger_properties), `attachments`. **인라인 messages 객체 없음.** "API-triggered delivery = 메시지 콘텐츠는 Braze 대시보드에 두고, API는 언제·누구에게만 제어."
```jsonc
{
  "campaign_id": "REQUIRED",
  "trigger_properties": { },   // Liquid api_trigger_properties 네임스페이스 개인화 (구조 아님)
  "broadcast": false,          // true면 recipients 금지
  "audience": { },             // connected-audience 필터
  "recipients": [ ]            // ≤50, broadcast:true와 상호배타
}
```

### 4.3 IAM 타입 스키마 위치 `[S26]`
SlideUpMessage / ModalMessage / FullScreenMessage / HtmlMessage 필드 = **SDK 개발자 가이드**(`developer_guide/in_app_messages`)에 존재, API 레퍼런스 아님. = 클라이언트 SDK가 렌더하는 온디바이스 객체이지 REST 페이로드 아님.

### 4.4 포크 데이터모델 함의 (확정 변경)
- ~~`braze_messages`에 IAM JSON 저장 → REST POST~~ **폐기**(불가능).
- M-AX 산출물 = **Custom HTML IAM = HTML 아티팩트**(OD HTML→iframe 렌더러 재사용) 또는 이미지 IAM = 이미지+카피. 여느 OD 아티팩트처럼 저장.
- "Braze-ready" = HTML이 §2 custom-HTML 제약(brazeBridge·logClick·이미지 스펙) 충족. 전달 = **대시보드 붙여넣기/HTML-upload(수동 핸드오프)**.
- `braze-client.ts`(REST)는 **push/email/content_card/canvas-trigger·schedule용** 보조 — IAM 전송 아님.

---

## 5. 세그먼트 / 트리거 / 전달 (2차 리서치, 3-0 검증)

### 5.1 IAM은 API로 트리거 불가 — 클라이언트 SDK가 발화 `[S19][S3]`
- 버바팀: "In-app messages can't be triggered through the API or by API events—only custom events logged by the SDK." 트리거 평가 = 온디바이스. 세션 시작 시 기기가 트리거 config 받고 메시지 fetch.
- 우회로(유일): **API → 사일런트 푸시 → SDK가 온디바이스 커스텀 이벤트 로그 → IAM 발화.**

### 5.2 트리거 이벤트 5종 `[S19][S3][S27]`
SDK가 로그하는 발화 이벤트: **Session Start / Push Click / Any Purchase / Specific Purchase / Custom Event**. Specific Purchase·Custom Event는 프로퍼티 필터 지원(예: 카트 $100~200). 세션 시작 = 기본 전달 시점.

### 5.3 타깃팅·자격 평가 `[S30][S20]`
- **타깃 오디언스 멤버십을 entry criteria보다 먼저** 체크. 트리거 시점에 자격 없으면 진입 안 됨(나중에 이벤트 쳐도). action-based+딜레이면 "Re-evaluate segment membership at send-time" 옵션.
- 이벤트 프로퍼티 = 트리거 메시지 필터·Liquid 개인화 용. **기본적으로 유저 프로필에 persist 안 됨** `[S31]`.

### 5.4 전달 모델·자격 타이밍 `[S20][S28]`
- **action-based(트리거, SDK 커스텀이벤트 필요) vs scheduled(로컬 타임존, 온디바이스 start/end 평가)** 2모델.
- IAM 자격 = **전달 시점 계산**(생성/스케줄 시점 아님). 7am 스케줄 → 7am에 자격 체크. "Re-evaluate campaign eligibility before displaying" 옵션.

### 5.5 빈도/재자격 `[S24][S32]`
- **IAM·Content Card = 빈도 제한(frequency capping) 완전 면제** — 캠페인/Canvas 캡에 카운트 안 되고 카운트 시키지도 않음. 서버 전달률 제한도 무관.
- **SDK 트리거 IAM = 기본 30초당 1회** rate-limit (Web `minimumIntervalBetweenTriggerActionsInSeconds`, Android `com_braze_trigger_action_minimum_time_interval_seconds`, Swift `triggerMinimumTimeInterval` — SDK 버전별 가능).
- 기본 **유저당 1회 발송**. 재자격 opt-in("Allow users to become re-eligible", 최대 720일). 트리거 캠페인 재자격 = **메시지 수신(receipt) 기준**(진입 아님) — 트리거했으나 미수신 시 다음 트리거에 자동 재자격.

> 포크 함의: §10.2 디스커버리 질문폼 = "타깃 세그먼트? 트리거 이벤트(5종 중)? 전달 모델(트리거/스케줄)?" 추가. braze-client는 IAM 발송이 아니라 **대시보드 캠페인 trigger/send(타이밍·오디언스)** 또는 REST 채널(push/email/content-card)만 다룸.

---

## 6. Open Questions (잔여 미검증 — fabricate 금지)

2차 리서치가 남긴 공백:
1. **SDK IAM 타입 필드 스키마 정밀 매핑** (SlideUp/Modal/FullScreen/Html Message의 body/header/image_url/buttons/extras/slide_from) — `developer_guide/in_app_messages`에 존재하나 필드 단위 미매핑. ※ 단 M-AX는 **Custom HTML 경로**라 이 스키마 불필요 가능성 높음(HTML 직접 생성).
2. `POST /messages/schedule`의 IAM 특수 동작 여부 — IAM이 인라인 스케줄 채널이 아님은 동일 추정, 명시 검증 안 됨.
3. `trigger_properties`/`api_trigger_properties` 정밀 구조·Liquid 접근 문법·중첩·크기 제한.
4. API→사일런트푸시→SDK 우회 경로의 신뢰성 제약(플랫폼 지원·푸시 전달 보장·온디바이스 세션/연결 요건).
5. (1차 잔여) custom-HTML/HTML-upload의 HTML/CSS 샌니타이징 제약(금지 태그·CSP·인라인스타일) — JS 게이트 외.

---

## 7. 소스 인덱스 (전부 primary, braze.com/docs)

| # | URL | 각도 |
|---|---|---|
| S1 | `/docs/user_guide/messaging/design_and_edit/media_library/image_specifications` | 메시지 유형·제약 |
| S2 | `/docs/user_guide/channels/in_app_messages/message_types/modal` | 메시지 유형·제약 |
| S3 | `/docs/user_guide/channels/in_app_messages/traditional` | 메시지 유형·제약 |
| S4 | `/docs/developer_guide/in_app_messages/html_messages` | Custom HTML / bridge |
| S5 | `/docs/user_guide/channels/in_app_messages/message_types/custom_html` | Custom HTML / bridge |
| S6 | `/docs/api/basics` (+ `/docs/user_guide/administer/personal/sdk_endpoints`) | REST API |
| S7 | `/docs/api/api_key` | REST API 인증 |
| S8 | `/docs/api/endpoints/messaging` (+ schedule_messages 전용 페이지) | REST 송신/스케줄 |
| S9 | `/docs/api/endpoints/messaging/send_messages/post_send_triggered_campaigns` | 트리거 송신/페이로드 |
| S10 | `/docs/api/endpoints/messaging/send_messages/post_send_messages` | 즉시 송신 |
| S11 | `/docs/api/endpoints/templates` | Templates API |
| S12 | `/docs/api/endpoints/templates/content_blocks_templates/post_create_email_content_block` | Content Block 생성 |
| S19 | `/docs/developer_guide/in_app_messages/triggering_messages` | 트리거(IAM API불가·5이벤트·30s rate) ✅2차 |
| S20 | `/docs/user_guide/messaging/campaigns/schedule_your_campaign/triggered_delivery` | 트리거 전달/재자격 ✅2차 |
| S24 | `/docs/user_guide/messaging/messaging_fundamentals/frequency_capping` | 빈도 면제 ✅2차 |
| S25 | `/docs/developer_guide/rest_api/sending_messages` | messages 객체 채널 목록 ✅2차 |
| S26 | `/docs/api/objects_filters/` | Messaging objects(IAM 없음) ✅2차 |
| S27 | `/docs/user_guide/channels/in_app_messages/faq` | 자격=전달시점·세션시작 ✅2차 |
| S28 | `/docs/user_guide/channels/in_app_messages/faq` (전달모델) | action vs scheduled ✅2차 |
| S30 | `/docs/user_guide/messaging/messaging_fundamentals/target_users` | 오디언스 평가 순서 ✅2차 |
| S31 | `/docs/api/objects_filters/event_object` | 이벤트 프로퍼티(미persist) ✅2차 |
| S32 | `/docs/user_guide/messaging/messaging_fundamentals/re_eligibility` | 재자격 720일·receipt ✅2차 |

---

*산출: deep-research 스킬 2회(2026-06-23). 1차(107 에이전트, 24소스, 25검증·0kill) = §1~§3. 2차(101 에이전트, 19소스, 24검증·1kill) = §4~§5(전부 3-0 verbatim). §6 = 잔여 미검증, fabricate 안 함. **핵심**: REST에 인라인 IAM 객체 없음 → M-AX = Custom HTML 아티팩트 생성 + 대시보드 핸드오프 모델(§4.4). 구현 전 인스턴스 엔드포인트·SDK 버전 재확인 필수(needs verification).*
