# Braze Liquid 작성 가이드 (필수 준수)

> SKILL.md Step 4에서 Liquid 변수 사용 시 *반드시 본 문서를 Read*한 뒤 작성한다.
>
> **공식 가이드**:
> - 기초: <https://www.braze.com/docs/user_guide/messaging/design_and_edit/personalize/liquid>
> - Use Cases: <https://www.braze.com/docs/user_guide/messaging/design_and_edit/personalize/liquid/liquid_use_cases>

---

## 변수 형식 분기

| 어트리뷰트 종류 | Liquid 표현 |
|---|---|
| Standard attribute (`first_name`, `email`, `language` 등 Braze 기본 필드) | `{{${attr_name}}}` |
| Custom attribute — Number / String / Boolean / Time | `{{custom_attribute.${attr_name}}}` |
| Custom attribute — Object Array | `{{custom_attribute.${attr_name}}}` 로 받아 `{% assign %}` + `{% for %}` 순회 |

**판별 기준**: Braze 표준 필드(first_name, email, last_name, country, language, dob, gender,
phone, time_zone, home_city)가 아니면 모두 `custom_attribute.${...}` prefix를 사용한다.
브랜드별 어트리뷰트 카탈로그가 있으면 그것을 우선 참고한다. 카탈로그에 없는 식별자는
사용하지 않는다.

---

## Object Array 처리 표준 패턴

Object Array에서 조건에 맞는 1건을 꺼내 카피에 사용할 때:

```liquid
{% assign data_array = {{custom_attribute.${array_attr}}} %}
{% assign matched_item = nil %}

{% for item in data_array %}
  {% if item.field_name == "조건값" %}
    {% assign matched_item = item %}
    {% break %}
  {% endif %}
{% endfor %}

{% if matched_item %}
  {{matched_item.display_field}}을 확인해보세요.
{% else %}
  {% abort_message("조건에 맞는 항목 없음") %}
{% endif %}
```

**핵심 규칙**:
1. 진입 시 `{% assign arr = {{custom_attribute.${attr}}} %}`로 변수에 담는다 — 직접 `{% for x in {{...}} %}` 형태는 권장하지 않음
2. 결과 변수를 `{% assign result = nil %}`로 미리 선언 → 매칭 시 할당 + `{% break %}`로 즉시 종료
3. 매칭 실패 시 `{% abort_message("사유") %}`로 발송 중단 — 어색한 빈 카피 노출 방지
4. 문자열 후처리 (`split`, `append`, `truncate` 등) 활용해 카피 자연스럽게 정렬
5. **`for` 루프 안에서 매칭 실패 시 `abort_message` 호출 금지** — 첫 원소가 실패하면 즉시 중단. 실패 처리는 *루프 바깥 `{% if result %}` 블록*에서

---

## Liquid 특화 패턴 (Braze vs Standard Liquid)

Braze Liquid는 변수 보간이 두 번 일어나는 특수한 문법을 가진다.

### 허용 패턴 (Braze 표준)

| 패턴 | 의미 |
|---|---|
| `{{${attr}}}` | Standard attribute 출력 |
| `{{custom_attribute.${attr}}}` | Custom attribute 출력 |
| `{% if {{${attr}}} == true %}` | 태그 안에 변수 중첩 허용 (Braze 전용) |
| `{% assign x = {{custom_attribute.${arr}}} %}` | Object Array를 변수에 담을 때 우항에 `{{...}}` |
| `{% abort_message("사유") %}` | Braze 전용 발송 중단 태그 |

### nil 체크 (필수)

```liquid
{% if {{${last_used_app_date}}} == nil %}
  {# nil 처리 #}
{% else %}
  마지막 사용일: {{${last_used_app_date}}}
{% endif %}
```

❌ 금지: `{% if {{${value}}} == "" %}` — 빈 문자열과 nil은 다름. 반드시 `nil` 비교.

### 날짜·시간 처리 (타임존 필수 명시)

날짜 리터럴은 반드시 timezone 명시:

```liquid
✅ "2025-01-01T00:00+09:00"   {# KST 명시 #}
❌ "2025-01-01"               {# timezone 누락 — 서버 timezone 의존 #}
```

타임존 보정이 필요한 Time attribute:

```liquid
{% assign kst_epoch = {{custom_attribute.${time_attr}}} | date: "%s" | plus: 32400 %}
{% assign kst_date  = kst_epoch | date: "%Y년 %m월 %d일 %H:%M" %}

{% if kst_date != "" and kst_date != "1970년 01월 01일 09:00" %}
  {{kst_date}}에 예정되어 있어요
{% else %}
  {% abort_message("시간 속성 미설정 또는 변환 실패") %}
{% endif %}
```

> `1970년 01월 01일 09:00` = epoch 0 + KST 보정 = nil 값 변환 실패의 전형 패턴.

### 날짜 차이 계산 (N일 전/후)

```liquid
{% assign attr_epoch = {{custom_attribute.${date_attr}}} | date: "%s" | times: 1 %}
{% assign now_epoch  = "now" | date: "%s" | times: 1 %}
{% assign d_ago      = now_epoch | minus: attr_epoch | divided_by: 86400.00 | round %}

{% if d_ago == 0 %}
  오늘 시작하셨네요
{% elsif d_ago == 1 %}
  어제 시작하셨네요
{% else %}
  {{d_ago}}일 전에 시작하셨네요
{% endif %}
```

> `times: 1`을 붙이는 이유: `date: "%s"` 출력은 문자열이라 `minus`/`divided_by` 등
> 산술 필터가 오동작하는 케이스가 보고됨. `times: 1`로 강제 숫자 변환.
>
> `divided_by: 86400.00`(실수 나눗셈) + `round` — 정수 나눗셈 시 소수점 절삭으로 의도 어긋남.

---

## 발송 중단 패턴 (`abort_message`)

```liquid
{% if {{${attr}}} == nil %}
  {% abort_message("어트리뷰트 미설정") %}
{% endif %}
```

- 발송 자체를 중단 — 어색한 빈 카피 노출보다 안전
- 사유 문자열은 Braze 캠페인 발송 로그에 남음

---

## Conditional 분기 + fallback

```liquid
{% if {{custom_attribute.${attr}}} == true %}
  메시지 A
{% elsif {{custom_attribute.${count}}} > 0 %}
  메시지 B
{% else %}
  기본 메시지 (catch-all)
{% endif %}
```

---

## 흔한 실수 (Braze 공식 안티패턴)

| ❌ 실수 | 결과 | ✅ 해결 |
|---|---|---|
| `{% if {{value}} == "" %}` (빈 문자열 nil 체크) | nil 인식 실패 | `== nil` 비교 |
| `"2025-01-01"` (timezone 누락) | 서버 timezone 의존 | `"2025-01-01T00:00+09:00"` |
| `plus: 1` (초 단위에서 1일 의도) | 1초만 더해짐 | `plus: 86400` |
| `divided_by: 86400` 정수 나눗셈 | 소수점 절삭 | `divided_by: 86400.00 | round` |
| nil 변수를 분기 없이 직접 출력 | 빈 출력 → 카피 어색 | nil 체크 먼저 |
| for 루프 안에서 `abort_message` | 첫 미매칭 시 즉시 중단 | 루프 바깥에서 처리 |

---

## 브랜드-특화 어트리뷰트 패턴

활성 브랜드 DESIGN.md / 어트리뷰트 카탈로그에서 브랜드별 custom attribute 목록을 확인한다.

- 브랜드마다 Standard vs Custom 구분이 다를 수 있음
- 카탈로그에 없는 식별자 사용 금지
- Object Array 타입 어트리뷰트는 위 Object Array 처리 패턴을 적용

딥링크 사용 시 CTA onclick 호출 순서:
1. `brazeBridge.logClick('<label>')`
2. `location.href = '<deeplink>'`
3. `brazeBridge.closeMessage()` 호출 **하지 않음** (Android deeplink 시 — BRAZE-DOMAIN §2.3)

---

## 딥링크 처리 — 브랜드 컨텍스트 참조

CTA가 앱 화면 이동(딥링크)을 포함할 때:

1. 활성 브랜드 딥링크 카탈로그를 DESIGN.md 또는 브랜드 컨텍스트에서 확인
2. 목적에 맞는 딥링크 1개를 주 CTA에 할당
3. 카탈로그에 없는 URL은 임의 생성 금지 — 브랜드 담당자에게 등록 요청
4. 보조 CTA(닫기·나중에 등)는 딥링크 없이 `brazeBridge.closeMessage()` 만

> 딥링크 카탈로그는 브랜드 데이터이며 이 파일에 하드코딩하지 않는다.
> 브랜드별 카탈로그는 `design-systems/<brand>/DESIGN.md` 또는 별도 brand context 파일에 있다.
