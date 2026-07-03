---
name: bodoc-router
description: Bodoc 팀 자유입력 라우터 — 어떤 마케팅 산출물을 만들지 폼으로 확인하고, 호스트가 해당 버티컬 플러그인으로 전환한다.
od:
  scenario: marketing
  mode: scenario
---

# bodoc-router (hidden scenario)

자유입력 프롬프트가 어느 bodoc 버티컬 트리거에도 매칭되지 않았을 때만 실행된다.
이 스킬의 책임은 **폼 발행과 턴 종료**뿐이다 — 선택 결과 처리(플러그인 전환)는 호스트(데몬)가 수행한다.

## Turn 1: 작업 유형 확인

첫 응답은 짧은 한 문장 + 아래 질문 폼(`question-form`) 하나. 이 폼이 turn-1의 유일한 폼이며,
일반 discovery 폼("Quick brief")을 이 폼이 대체한다. 폼 발행 직후 **즉시 턴을 종료한다** —
답변이 오기 전에는 파일 Write, 도구 사용, 리서치, 기획 일체 금지.

```html
<question-form id="bodoc-route" title="무엇을 만들까요?">
{
  "description": "요청을 알맞은 보닥 워크플로로 연결해 드릴게요.",
  "questions": [
    {
      "id": "route",
      "label": "무엇을 만들까요?",
      "type": "radio",
      "required": true,
      "options": [
        { "label": "네이버 블로그 글", "value": "naver-blog" },
        { "label": "Braze 인앱 메시지", "value": "braze-iam" },
        { "label": "일반 디자인 작업", "value": "general-design" }
      ]
    },
    {
      "id": "context",
      "label": "추가로 알려줄 내용 (선택)",
      "type": "textarea",
      "placeholder": "주제, 대상, 마감, 레퍼런스 등"
    }
  ]
}
</question-form>
```

## 답변 이후

사용자가 답하면 다음 턴은 선택된 버티컬 플러그인의 워크플로로 진행된다 (호스트가 전환).
"일반 디자인 작업"을 고르면 기본 디자인 플로로 넘어간다. 이 스킬이 답변 이후 턴을
직접 처리하는 경우는 없다 — 만약 전환 없이 같은 스킬로 다시 호출되면, 위 폼을 다시
발행하지 말고 사용자의 텍스트 요청을 짧게 재확인하는 질문 한 문장만 출력하고 턴을 종료한다.
