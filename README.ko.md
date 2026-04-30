# Open Design

> **[Claude Design][cd]의 오픈소스 대안.** 로컬 우선, Vercel 배포 가능, 모든 레이어에서 BYOK — 이미 설치된 코딩 에이전트(Claude Code, Codex, Cursor Agent, Gemini CLI, OpenCode, Qwen, GitHub Copilot CLI)가 **19개의 조합 가능한 Skill**과 **71개의 브랜드급 디자인 시스템**으로 구동되는 디자인 엔진이 됩니다.

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design — 표지: 노트북 위의 AI 에이전트와 함께 디자인하기" width="100%" />
</p>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" /></a>
  <a href="#지원하는-코딩-에이전트"><img alt="Agents" src="https://img.shields.io/badge/agents-Claude%20%7C%20Codex%20%7C%20Cursor%20%7C%20Gemini%20%7C%20OpenCode%20%7C%20Qwen%20%7C%20Copilot-black" /></a>
  <a href="#디자인-시스템"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-71-orange" /></a>
  <a href="#내장-skills"><img alt="Skills" src="https://img.shields.io/badge/skills-19-teal" /></a>
  <a href="QUICKSTART.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <b>한국어</b></p>

---

## 왜 만들었는가

Anthropic의 [Claude Design][cd](2026-04-17 출시, Opus 4.7 기반)은 LLM이 장문의 글쓰기를 멈추고 디자인 산출물을 직접 내놓기 시작했을 때 어떤 일이 일어나는지 보여주었습니다. 순식간에 화제가 되었지만, 여전히 **클로즈드 소스**, 유료, 클라우드 전용, Anthropic 모델과 Anthropic 내부 skill에 종속된 상태입니다. 체크아웃도, 자가 호스팅도, Vercel 배포도, 에이전트 교체도 불가능합니다.

**Open Design(OD)은 그 오픈소스 대안입니다.** 동일한 루프, 동일한 '아티팩트 우선' 사고방식, 락인 없음. 에이전트를 직접 만들지 않습니다 — 가장 강력한 코딩 에이전트는 이미 여러분의 노트북에 있습니다. 우리는 그것을 skill 기반 디자인 워크플로에 연결할 뿐입니다. 로컬에서는 `pnpm tools-dev`로 실행하고, 웹 레이어는 Vercel에 배포할 수 있으며, 모든 레이어에서 BYOK(자체 키 사용)가 가능합니다.

`시드 라운드를 위한 매거진 스타일 피치덱 만들어줘`라고 입력하세요. 모델이 픽셀 하나 그리기 전에 **초기화 질문 폼**이 먼저 등장합니다. 에이전트는 5개의 엄선된 시각적 방향 중 하나를 선택합니다. 실시간 `TodoWrite` 계획 카드가 UI에 스트리밍됩니다. Daemon이 디스크에 실제 프로젝트 폴더를 생성하며, seed 템플릿, 레이아웃 라이브러리, 자가 점검 체크리스트가 포함됩니다. 에이전트는 **pre-flight를 강제**로 읽고, 자신의 출력물에 대해 **5차원 검토**를 실행하며, 몇 초 후 샌드박스 iframe에 렌더링되는 단일 `<artifact>`를 내보냅니다.

이건 "AI가 디자인을 시도한다"가 아닙니다. 프롬프트 스택에 의해 훈련된 AI가 사용 가능한 파일시스템, 결정론적 팔레트 라이브러리, 체크리스트 문화를 갖춘 수석 디자이너처럼 동작하는 것입니다 — Claude Design이 세운 기준 그대로, 하지만 오픈소스로, 여러분의 것으로.

OD는 네 개의 오픈소스 프로젝트 어깨 위에 서 있습니다:

- [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) — 디자인 철학의 나침반. Junior-Designer 워크플로, 5단계 브랜드 에셋 프로토콜, anti-AI-slop 체크리스트, 5차원 자기 검토, 그리고 방향 선택기 뒤에 있는 "5개 학파 × 20가지 디자인 철학" 아이디어 — 모두 [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts)에 녹아들었습니다.
- [**`op7418/guizang-ppt-skill`**](https://github.com/op7418/guizang-ppt-skill) — 덱 모드. [`skills/guizang-ppt/`](skills/guizang-ppt/) 아래에 원본 그대로 번들됨, 원 LICENSE 보존; 매거진 레이아웃, WebGL hero, P0/P1/P2 체크리스트.
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign) — UX의 북극성이자 가장 가까운 동류. 최초의 오픈소스 Claude-Design 대안. 스트리밍 아티팩트 루프, 샌드박스 iframe 미리보기 패턴(React 18 + Babel 내장), 실시간 에이전트 패널(todos + tool calls + 중단 가능한 생성), 5가지 내보내기 형식(HTML / PDF / PPTX / ZIP / Markdown)을 차용했습니다. 폼 팩터에서는 의도적으로 차별화했습니다 — 그쪽은 [`pi-ai`][piai]를 번들링한 Electron 데스크탑 앱이고, 우리는 에이전트 런타임을 이미 설치된 CLI에 **위임**하는 웹앱 + 로컬 daemon입니다.
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica) — Daemon 및 런타임 아키텍처. PATH 스캔 방식의 에이전트 감지, 단일 특권 프로세스로서의 로컬 daemon, 에이전트-동료 세계관.

## 한눈에 보기

| | 제공 내용 |
|---|---|
| **지원 코딩 에이전트** | Claude Code · Codex CLI · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · GitHub Copilot CLI · Anthropic API(BYOK 대체) |
| **내장 디자인 시스템** | **71개** — 2개의 수작업 스타터 + [`awesome-design-md`][acd2]에서 가져온 69개의 제품 시스템(Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Anthropic, Apple, Cursor, Supabase, Figma, …) |
| **내장 Skill** | **19개** — 프로토타입, 덱, 모바일, 대시보드, 가격 책정, 문서, 블로그, SaaS 랜딩, 그리고 10개의 문서/업무 산출물 템플릿(PM 스펙, 주간 업데이트, OKR, 런북, 칸반, …) |
| **시각적 방향** | 5개의 엄선된 학파(Editorial Monocle · Modern Minimal · Tech Utility · Brutalist · Soft Warm) — 각각 결정론적 OKLch 팔레트 + 폰트 스택 제공 |
| **기기 프레임** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome — 픽셀 정확도, 스킬 간 공유 |
| **에이전트 런타임** | 로컬 daemon이 프로젝트 폴더에서 CLI를 실행 — 에이전트가 실제 디스크 환경에 대한 실제 `Read`, `Write`, `Bash`, `WebFetch` 도구를 사용 |
| **배포 대상** | 로컬(`pnpm tools-dev`) · Vercel 웹 레이어 · daemon 정적 서빙 프로덕션 |
| **라이선스** | Apache-2.0 |

[acd2]: https://github.com/VoltAgent/awesome-design-md

## 데모

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/01-entry-view.png" alt="01 · 진입 화면" /><br/>
<sub><b>진입 화면</b> — skill 선택, 디자인 시스템 선택, 브리프 입력. 프로토타입, 덱, 모바일 앱, 대시보드, 에디토리얼 페이지를 위한 동일한 인터페이스.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/02-question-form.png" alt="02 · Turn-1 초기화 폼" /><br/>
<sub><b>Turn-1 초기화 폼</b> — 모델이 픽셀 하나 그리기 전에 OD가 브리프를 확정합니다: 화면, 대상, 톤, 브랜드 컨텍스트, 규모. 30초의 라디오 버튼 클릭이 30분의 수정 작업을 대체합니다.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/03-direction-picker.png" alt="03 · 방향 선택기" /><br/>
<sub><b>방향 선택기</b> — 사용자에게 브랜드가 없을 때, 에이전트가 두 번째 폼을 띄워 5개의 엄선된 방향(Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm)을 제시합니다. 라디오 하나 클릭 → 결정론적 팔레트 + 폰트 스택, 모델 자유 재량 없음.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · 실시간 할 일 진행 상황" /><br/>
<sub><b>실시간 할 일 진행 상황</b> — 에이전트의 계획이 실시간 카드로 스트리밍됩니다. <code>in_progress</code> → <code>completed</code> 업데이트가 실시간으로 반영됩니다. 작업 중에도 저렴한 비용으로 방향을 조정할 수 있습니다.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · 샌드박스 미리보기" /><br/>
<sub><b>샌드박스 미리보기</b> — 모든 <code>&lt;artifact&gt;</code>가 깨끗한 srcdoc iframe에서 렌더링됩니다. 파일 워크스페이스에서 바로 편집 가능; HTML, PDF, ZIP으로 다운로드 가능.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · 71개 시스템 라이브러리" /><br/>
<sub><b>71개 시스템 라이브러리</b> — 모든 제품 시스템이 4색 시그니처를 표시합니다. 클릭하면 전체 <code>DESIGN.md</code>, 색상 견본 그리드, 라이브 쇼케이스를 볼 수 있습니다.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/07-magazine-deck.png" alt="07 · 매거진 덱" /><br/>
<sub><b>덱 모드(guizang-ppt)</b> — 번들된 <a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a>이 그대로 들어갑니다. 매거진 레이아웃, WebGL 히어로 배경, 단일 파일 HTML 출력, PDF 내보내기.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/08-mobile-app.png" alt="08 · 모바일 프로토타입" /><br/>
<sub><b>모바일 프로토타입</b> — 픽셀 정확도의 iPhone 15 Pro 크롬(Dynamic Island, 상태바 SVG, 홈 인디케이터). 다화면 프로토타입은 공유 <code>/frames/</code> 에셋을 사용하므로 에이전트가 폰을 다시 그릴 필요가 없습니다.</sub>
</td>
</tr>
</table>

## 내장 Skills

19개의 skill이 기본 제공됩니다. 각각은 Claude Code의 [`SKILL.md`][skill] 규약을 따르는 [`skills/`](skills/) 아래의 폴더이며, 확장된 `od:` 프론트매터(`mode`, `platform`, `scenario`, `preview`, `design_system`)를 포함합니다.

### 쇼케이스 예시

시각적으로 가장 눈에 띄어 먼저 실행해 볼 skill들입니다. 각각은 저장소에서 바로 열 수 있는 실제 `example.html`을 제공합니다 — 인증 없이, 설정 없이, 에이전트가 무엇을 생산하는지 미리 확인할 수 있습니다.

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>소비자용 데이팅/매칭 대시보드 — 좌측 레일 내비게이션, 티커 바, KPI, 30일 상호 매칭 차트, 에디토리얼 타이포그래피.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>2페이지 디지털 e-가이드 — 표지(제목, 저자, TOC 티저) + 풀 쿼트 및 단계 목록이 있는 레슨 스프레드. 크리에이터/라이프스타일 톤.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>브랜드 제품 출시 HTML 이메일 — 마스트헤드, 히어로 이미지, 헤드라인 락업, CTA, 스펙 그리드. 중앙 단일 컬럼, 테이블 폴백 지원.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/gamified-app/"><img src="docs/screenshots/skills/gamified-app.png" alt="gamified-app" /></a><br/>
<sub><b><a href="skills/gamified-app/"><code>gamified-app</code></a></b> · <i>prototype</i><br/>다크 쇼케이스 스테이지의 3화면 게임화 모바일 앱 프로토타입 — 표지, 오늘의 퀘스트(XP 리본 + 레벨 바), 퀘스트 상세.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/mobile-onboarding/"><img src="docs/screenshots/skills/mobile-onboarding.png" alt="mobile-onboarding" /></a><br/>
<sub><b><a href="skills/mobile-onboarding/"><code>mobile-onboarding</code></a></b> · <i>prototype</i><br/>3화면 모바일 온보딩 플로우 — 스플래시, 가치 제안, 로그인. 상태바, 스와이프 점, 기본 CTA.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/motion-frames/"><img src="docs/screenshots/skills/motion-frames.png" alt="motion-frames" /></a><br/>
<sub><b><a href="skills/motion-frames/"><code>motion-frames</code></a></b> · <i>prototype</i><br/>루핑 CSS 애니메이션의 단일 프레임 모션 디자인 히어로 — 회전 타입 링, 애니메이션 글로브, 째깍거리는 타이머. HyperFrames 핸드오프 준비 완료.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/social-carousel/"><img src="docs/screenshots/skills/social-carousel.png" alt="social-carousel" /></a><br/>
<sub><b><a href="skills/social-carousel/"><code>social-carousel</code></a></b> · <i>prototype</i><br/>3장의 1080×1080 소셜 미디어 캐러셀 — 시리즈를 가로지르는 표시 헤드라인이 있는 영화적 패널, 브랜드 마크, 루프 어포던스.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/sprite-animation/"><img src="docs/screenshots/skills/sprite-animation.png" alt="sprite-animation" /></a><br/>
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>픽셀/8비트 애니메이션 설명 슬라이드 — 전면 크림 스테이지, 애니메이션 픽셀 마스코트, 역동적인 일본어 표시 타이포그래피, 루핑 CSS 키프레임.</sub>
</td>
</tr>
</table>

### 디자인 산출물 유형

| Skill | Mode | 기본 용도 | 생산물 |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | prototype | 데스크탑 | 단일 페이지 HTML — 랜딩, 마케팅, 히어로 페이지 |
| [`saas-landing`](skills/saas-landing/) | prototype | 데스크탑 | Hero / features / pricing / CTA 마케팅 레이아웃 |
| [`dashboard`](skills/dashboard/) | prototype | 데스크탑 | 사이드바 + 데이터 밀집 레이아웃의 어드민/분석 |
| [`pricing-page`](skills/pricing-page/) | prototype | 데스크탑 | 독립형 가격 + 비교 테이블 |
| [`docs-page`](skills/docs-page/) | prototype | 데스크탑 | 3컬럼 문서 레이아웃 |
| [`blog-post`](skills/blog-post/) | prototype | 데스크탑 | 에디토리얼 장문 |
| [`mobile-app`](skills/mobile-app/) | prototype | 모바일 | iPhone 15 Pro / Pixel 프레임 앱 화면 |
| [`simple-deck`](skills/simple-deck/) | deck | 데스크탑 | 미니멀 수평 스와이프 덱 |
| [`guizang-ppt`](skills/guizang-ppt/) | deck | 덱 **기본** | 매거진 스타일 웹 PPT — [op7418/guizang-ppt-skill][guizang]에서 번들됨 |

### 문서/업무 산출물 유형

| Skill | Mode | 생산물 |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | template | TOC + 의사결정 로그가 있는 PM 스펙 문서 |
| [`weekly-update`](skills/weekly-update/) | template | 진행 사항 / 블로커 / 다음 단계가 있는 팀 주간 업데이트 |
| [`meeting-notes`](skills/meeting-notes/) | template | 회의 의사결정 로그 |
| [`eng-runbook`](skills/eng-runbook/) | template | 장애 런북 |
| [`finance-report`](skills/finance-report/) | template | 임원 재무 요약 |
| [`hr-onboarding`](skills/hr-onboarding/) | template | 역할 온보딩 계획 |
| [`invoice`](skills/invoice/) | template | 단일 페이지 인보이스 |
| [`kanban-board`](skills/kanban-board/) | template | 보드 스냅샷 |
| [`team-okrs`](skills/team-okrs/) | template | OKR 스코어시트 |

skill 추가는 폴더 하나면 됩니다. [`docs/skills-protocol.md`](docs/skills-protocol.md)에서 확장 프론트매터를 읽고, 기존 skill을 포크하고, daemon을 재시작하면 선택기에 나타납니다.

## 6가지 핵심 아이디어

### 1 · 에이전트를 제공하지 않습니다. 여러분의 것으로 충분합니다.

Daemon은 시작 시 `PATH`에서 [`claude`](https://docs.anthropic.com/en/docs/claude-code), [`codex`](https://github.com/openai/codex), [`cursor-agent`](https://www.cursor.com/cli), [`gemini`](https://github.com/google-gemini/gemini-cli), [`opencode`](https://opencode.ai/), [`qwen`](https://github.com/QwenLM/qwen-code), [`copilot`](https://github.com/features/copilot/cli)을 스캔합니다. 찾은 것이 디자인 엔진이 됩니다 — stdio를 통해 구동되며, CLI당 하나의 어댑터. [`multica`](https://github.com/multica-ai/multica)와 [`cc-switch`](https://github.com/farion1231/cc-switch)에서 영감을 받았습니다. CLI가 없다면? `Anthropic API · BYOK`가 spawn만 없는 동일한 파이프라인입니다.

### 2 · Skill은 파일이지 플러그인이 아닙니다.

Claude Code의 [`SKILL.md` 규약](https://docs.anthropic.com/en/docs/claude-code/skills)을 따라 각 skill은 `SKILL.md` + `assets/` + `references/`입니다. [`skills/`](skills/)에 폴더를 드롭하고 daemon을 재시작하면 선택기에 나타납니다. 번들된 `magazine-web-ppt`는 [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill)을 그대로 커밋한 것입니다 — 원본 라이선스와 저작권 표시 보존.

### 3 · 디자인 시스템은 테마 JSON이 아닌 이식 가능한 Markdown입니다.

[`VoltAgent/awesome-design-md`][acd2]의 9섹션 `DESIGN.md` 스키마 — color, typography, spacing, layout, components, motion, voice, brand, anti-patterns. 모든 아티팩트가 활성 시스템에서 읽습니다. 시스템 전환 → 다음 렌더에 새 토큰 사용. 드롭다운에는 **Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Apple, Anthropic, Cursor, Supabase, Figma, Resend, Raycast, Lovable, Cohere, Mistral, ElevenLabs, X.AI, Spotify, Webflow, Sanity, PostHog, Sentry, MongoDB, ClickHouse, Cal, Replicate, Clay, Composio…** 총 71개가 있습니다.

### 4 · 초기화 질문 폼이 수정 작업의 80%를 막아줍니다.

OD의 프롬프트 스택에는 `RULE 1`이 하드코딩되어 있습니다: 모든 새 디자인 브리프는 코드 대신 `<question-form id="discovery">`로 시작합니다. 화면 · 대상 · 톤 · 브랜드 컨텍스트 · 규모 · 제약 조건. 긴 브리프라도 시각적 톤, 색상 입장, 규모 같은 디자인 결정 사항은 여전히 열려 있습니다 — 폼이 정확히 이것들을 30초 안에 고정합니다. 잘못된 방향의 비용은 한 번의 채팅 라운드이지, 완성된 덱 하나가 아닙니다.

이것이 [`huashu-design`](https://github.com/alchaincyf/huashu-design)에서 추출한 **Junior-Designer 모드**입니다: 미리 일괄 질문하고, 일찍 가시적인 것을 보여주며(와이어프레임에 회색 블록이라도), 사용자가 저렴한 비용으로 방향을 바꿀 수 있도록 합니다. 브랜드 에셋 프로토콜(위치 파악 · 다운로드 · `grep` hex · `brand-spec.md` 작성 · 발성)과 결합하면, 출력이 "AI 자유 창작"에서 "그리기 전에 주의를 기울인 디자이너"처럼 느껴지게 되는 가장 큰 이유입니다.

### 5 · Daemon은 에이전트가 여러분의 노트북에 있는 것처럼 느끼게 합니다. 실제로 그러니까요.

Daemon은 프로젝트의 아티팩트 폴더 `.od/projects/<id>/`로 `cwd`를 설정해 CLI를 spawn합니다. 에이전트는 실제 파일시스템에 대한 실제 도구인 `Read`, `Write`, `Bash`, `WebFetch`를 사용합니다. skill의 `assets/template.html`을 `Read`하고, CSS에서 hex 값을 `grep`하고, `brand-spec.md`를 작성하고, 생성된 이미지를 저장하고, `.pptx` / `.zip` / `.pdf` 파일을 생성할 수 있습니다. 이 파일들은 턴이 끝날 때 파일 워크스페이스에 다운로드 칩으로 나타납니다. 세션, 대화, 메시지, 탭은 로컬 SQLite DB에 영구 저장됩니다 — 내일 프로젝트를 열면 에이전트의 할 일 카드가 어제 멈춘 곳에 그대로 있습니다.

### 6 · 프롬프트 스택 자체가 제품입니다.

전송 시 구성되는 것은 "system + user"가 아닙니다. 다음과 같습니다:

```
DISCOVERY 지시문  (turn-1 폼, turn-2 브랜드 분기, TodoWrite, 5차원 검토)
  + 신원 헌장   (OFFICIAL_DESIGNER_PROMPT, anti-AI-slop, junior-pass)
  + 활성 DESIGN.md   (71개 시스템 사용 가능)
  + 활성 SKILL.md    (19개 skill 사용 가능)
  + 프로젝트 메타데이터   (kind, fidelity, speakerNotes, animations, inspiration ids)
  + skill 사이드 파일   (pre-flight 자동 주입: assets/template.html + references/*.md 읽기)
  + (덱 kind, skill seed 없음) DECK_FRAMEWORK_DIRECTIVE   (nav / counter / scroll / print)
```

모든 레이어는 조합 가능합니다. 모든 레이어는 편집 가능한 파일입니다. 실제 계약을 보려면 [`apps/web/src/prompts/system.ts`](apps/web/src/prompts/system.ts)와 [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts)를 읽으세요.

## 아키텍처

```
┌────────────────────────── 브라우저 ─────────────────────────────┐
│                                                                │
│   Next.js 16 App Router  (채팅 · 파일 워크스페이스 · iframe 미리보기) │
│                                                                │
└──────────────┬───────────────────────────────────┬─────────────┘
               │ /api/* (개발 시 rewritten)         │ direct (BYOK)
               ▼                                   ▼
   ┌──────────────────────┐              ┌──────────────────────┐
   │   로컬 daemon         │              │   Anthropic SDK      │
   │   (Express + SQLite) │              │   (브라우저 폴백)     │
   │                      │              └──────────────────────┘
   │   /api/agents        │
   │   /api/skills        │
   │   /api/design-systems│
   │   /api/projects/...  │
   │   /api/chat (SSE)    │
   │                      │
   └─────────┬────────────┘
             │ spawn(cli, [...], { cwd: .od/projects/<id> })
             ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │  claude · codex · cursor-agent · gemini · opencode · qwen · copilot│
   │  SKILL.md + DESIGN.md 읽기, 디스크에 아티팩트 쓰기               │
   └────────────────────────────────────────────────────────────────────┘
```

| 레이어 | 스택 |
|---|---|
| 프론트엔드 | Next.js 16 App Router + React 18 + TypeScript |
| Daemon | Node 24 · Express · SSE 스트리밍 · 프로젝트/대화/메시지/탭을 위한 `better-sqlite3` |
| 에이전트 전송 | Claude Code(`claude-stream-json`)와 Copilot CLI(`copilot-stream-json`)를 위한 타입 이벤트 파서가 있는 `child_process.spawn`; 나머지는 라인 버퍼링 plain stdout |
| 저장소 | `.od/projects/<id>/`의 평문 파일 + `.od/app.sqlite`의 SQLite (gitignore됨) |
| 미리보기 | `srcdoc`를 통한 샌드박스 iframe + 스킬별 `<artifact>` 파서 |
| 내보내기 | HTML(인라인 에셋) · PDF(브라우저 인쇄) · PPTX(skill 정의) · ZIP(archiver) |

## 빠른 시작

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # 10.33.2가 출력되어야 합니다
pnpm install
pnpm tools-dev run web  # daemon + web foreground
# tools-dev가 출력한 web URL을 여세요
```

환경 요구사항: Node `~24`와 pnpm `10.33.x`. `nvm`/`fnm`은 선택적 보조 도구일 뿐입니다; 사용한다면 `pnpm install` 전에 `nvm install 24 && nvm use 24` 또는 `fnm install 24 && fnm use 24`를 실행하세요.

첫 번째 로드 시:

1. `PATH`에 어떤 에이전트 CLI가 있는지 감지하고 자동으로 하나를 선택합니다.
2. 19개의 skill + 71개의 디자인 시스템을 로드합니다.
3. Anthropic 키를 붙여넣을 수 있는 환영 다이얼로그를 표시합니다(BYOK 폴백 경로에만 필요).
4. **`./.od/`를 자동 생성합니다** — SQLite 프로젝트 DB, 프로젝트별 아티팩트, 저장된 렌더를 위한 로컬 런타임 폴더. `od init` 단계는 없습니다; daemon이 부팅 시 필요한 모든 것을 `mkdir`합니다.

프롬프트를 입력하고 **전송**을 누르면 질문 폼이 도착하고, 채우면 할 일 카드가 스트리밍되고, 아티팩트가 렌더링됩니다. **디스크에 저장** 클릭 또는 프로젝트 ZIP으로 다운로드하세요.

### 첫 실행 상태(`./.od/`)

Daemon은 저장소 루트에 하나의 숨겨진 폴더를 소유합니다. 그 안의 모든 것은 gitignore되고 로컬 머신 전용입니다 — 커밋하지 마세요.

```
.od/
├── app.sqlite                 ← 프로젝트 · 대화 · 메시지 · 열린 탭
├── artifacts/                 ← 일회성 "디스크에 저장" 렌더(타임스탬프)
└── projects/<id>/             ← 프로젝트별 작업 디렉터리, 에이전트의 cwd
```

| 원하는 작업 | 방법 |
|---|---|
| 내용 확인 | `ls -la .od && sqlite3 .od/app.sqlite '.tables'` |
| 초기 상태로 재설정 | `pnpm tools-dev stop`, `rm -rf .od`, `pnpm tools-dev run web` 재실행 |
| 다른 위치로 이동 | 아직 지원되지 않음 — 경로가 저장소 상대 경로로 하드코딩됨 |

전체 파일 맵, 스크립트, 트러블슈팅 → [`QUICKSTART.md`](QUICKSTART.md).

## 저장소 구조

```
open-design/
├── README.md                      ← 영어
├── README.zh-CN.md                ← 简体中文
├── README.ko.md                   ← 한국어 (이 파일)
├── QUICKSTART.md                  ← 실행 / 빌드 / 배포 가이드
├── package.json                   ← pnpm 워크스페이스, 단일 bin: od
│
├── apps/
│   ├── daemon/                    ← Node + Express, 유일한 서버
│   │   ├── cli.js                 ← `od` bin 진입점
│   │   ├── server.js              ← /api/* 라우트(projects, chat, files, exports)
│   │   ├── agents.js              ← PATH 스캐너 + CLI별 argv 빌더
│   │   ├── claude-stream.js       ← Claude Code stdout 스트리밍 JSON 파서
│   │   ├── skills.js              ← SKILL.md 프론트매터 로더
│   │   └── db.js                  ← SQLite 스키마(projects/messages/templates/tabs)
│   │
│   └── web/                       ← Next.js 16 App Router + React 클라이언트
│       ├── app/                   ← App Router 진입점
│       ├── next.config.ts         ← 개발 rewrite + 프로덕션 정적 내보내기 to out/
│       └── src/                   ← Next.js를 위한 공유 React + TS 클라이언트 모듈
│           ├── App.tsx            ← 라우팅, 부트스트랩, 설정
│           ├── components/        ← 채팅, 작성기, 선택기, 미리보기, 스케치, …
│           ├── prompts/
│           │   ├── system.ts      ← composeSystemPrompt(base, skill, DS, metadata)
│           │   ├── discovery.ts   ← turn-1 폼 + turn-2 분기 + 5차원 검토
│           │   └── directions.ts  ← 5가지 시각적 방향 × OKLch 팔레트 + 폰트 스택
│           ├── artifacts/         ← 스트리밍 <artifact> 파서 + 매니페스트
│           ├── runtime/           ← iframe srcdoc, 마크다운, 내보내기 헬퍼
│           ├── providers/         ← daemon SSE + BYOK API 전송
│           └── state/             ← config + 프로젝트(localStorage + daemon 백업)
│
├── e2e/                           ← Playwright UI + 외부 통합/Vitest 하네스
│
├── skills/                        ← 19개 SKILL.md skill 번들
│   ├── web-prototype/             ← prototype 모드 기본
│   ├── saas-landing/              ← 마케팅 페이지(hero / features / pricing / CTA)
│   ├── dashboard/                 ← 어드민 / 분석
│   ├── pricing-page/              ← 독립형 가격 + 비교
│   ├── docs-page/                 ← 3컬럼 문서
│   ├── blog-post/                 ← 에디토리얼 장문
│   ├── mobile-app/                ← 폰 프레임 화면
│   ├── simple-deck/               ← 수평 스와이프 미니멀
│   ├── guizang-ppt/               ← 번들된 magazine-web-ppt(덱 기본)
│   │   ├── SKILL.md
│   │   ├── assets/template.html   ← seed
│   │   └── references/{themes,layouts,components,checklist}.md
│   ├── pm-spec/                   ← PM 스펙 문서
│   ├── weekly-update/             ← 팀 주간 업데이트
│   ├── meeting-notes/             ← 의사결정 로그
│   ├── eng-runbook/               ← 장애 / 런북
│   ├── finance-report/            ← 임원 요약
│   ├── hr-onboarding/             ← 역할 온보딩
│   ├── invoice/                   ← 단일 페이지 인보이스
│   ├── kanban-board/              ← 보드 스냅샷
│   ├── mobile-onboarding/         ← 다화면 모바일 플로우
│   └── team-okrs/                 ← OKR 스코어시트
│
├── design-systems/                ← 71개 DESIGN.md 시스템
│   ├── default/                   ← Neutral Modern(스타터)
│   ├── warm-editorial/            ← Warm Editorial(스타터)
│   ├── linear-app/  vercel/  stripe/  airbnb/  notion/  cursor/  apple/  …
│   └── README.md                  ← 카탈로그 개요
│
├── assets/
│   └── frames/                    ← 공유 기기 프레임(스킬 간 사용)
│       ├── iphone-15-pro.html
│       ├── android-pixel.html
│       ├── ipad-pro.html
│       ├── macbook.html
│       └── browser-chrome.html
│
├── templates/
│   └── deck-framework.html        ← 덱 기준선(nav / counter / print)
│
├── scripts/
│   └── sync-design-systems.ts     ← 상위 awesome-design-md tarball 재가져오기
│
├── docs/
│   ├── spec.md                    ← 제품 스펙, 시나리오, 차별화
│   ├── architecture.md            ← 토폴로지, 데이터 흐름, 컴포넌트
│   ├── skills-protocol.md         ← 확장된 SKILL.md od: 프론트매터
│   ├── agent-adapters.md          ← CLI별 감지 + 디스패치
│   ├── modes.md                   ← prototype / deck / template / design-system
│   ├── references.md              ← 장문 출처
│   ├── roadmap.md                 ← 단계별 배포
│   ├── schemas/                   ← JSON 스키마
│   └── examples/                  ← 표준 아티팩트 예시
│
└── .od/                           ← 런타임 데이터, gitignore됨, 자동 생성
    ├── app.sqlite                 ← 프로젝트 / 대화 / 메시지 / 탭
    ├── projects/<id>/             ← 프로젝트별 작업 폴더(에이전트의 cwd)
    └── artifacts/                 ← 저장된 일회성 렌더
```

## 디자인 시스템

<p align="center">
  <img src="docs/assets/design-systems-library.png" alt="71개 디자인 시스템 라이브러리 — 스타일 가이드 스프레드" width="100%" />
</p>

기본 제공 71개 시스템, 각각 단일 [`DESIGN.md`](design-systems/README.md)로:

<details>
<summary><b>전체 카탈로그</b> (클릭하여 펼치기)</summary>

**AI & LLM** — `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**개발자 도구** — `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**생산성** — `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**핀테크** — `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**이커머스** — `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**미디어** — `spotify` · `playstation` · `wired` · `theverge` · `meta`

**자동차** — `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**기타** — `apple` · `ibm` · `nvidia` · `vodafone` · `sentry` · `resend` · `spacex`

**스타터** — `default`(Neutral Modern) · `warm-editorial`

</details>

라이브러리는 [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts)를 통해 [`VoltAgent/awesome-design-md`][acd2]에서 가져옵니다. 재실행하면 새로 고침됩니다.

## 시각적 방향

사용자에게 브랜드 스펙이 없을 때, 에이전트가 5개의 엄선된 방향이 있는 두 번째 폼을 내보냅니다 — [`huashu-design`의 "5개 학파 × 20가지 디자인 철학" 폴백](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback)의 OD 적용. 각 방향은 결정론적 스펙입니다 — OKLch의 팔레트, 폰트 스택, 레이아웃 포스처 단서, 참고 자료 — 에이전트가 이를 seed 템플릿의 `:root`에 그대로 바인딩합니다. 라디오 하나 클릭 → 완전히 지정된 시각 시스템. 즉흥 없음, AI-slop 없음.

| 방향 | 무드 | 참고 |
|---|---|---|
| Editorial — Monocle / FT | 인쇄 매거진, 잉크 + 크림 + 따뜻한 러스트 | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | 쿨, 구조적, 미니멀 액센트 | Linear · Vercel · Stripe |
| Tech utility | 정보 밀도, 모노스페이스, 터미널 | Bloomberg · Bauhaus 도구 |
| Brutalist | 날것, 거대한 타입, 그림자 없음, 강한 액센트 | Bloomberg Businessweek · Achtung |
| Soft warm | 여유롭고, 낮은 대비, 복숭아 계열 뉴트럴 | Notion 마케팅 · Apple Health |

전체 스펙 → [`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts).

## Anti-AI-slop 메커니즘

아래의 모든 메커니즘은 [`huashu-design`](https://github.com/alchaincyf/huashu-design) 플레이북을 OD의 프롬프트 스택에 이식하고, 사이드 파일 pre-flight를 통해 skill별로 적용 가능하게 만든 것입니다. 실제 문구는 [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts)를 읽으세요:

- **질문 폼 우선.** Turn 1은 오직 `<question-form>` — 생각하기 없음, 도구 없음, 내레이션 없음. 사용자는 라디오 속도로 기본값을 선택합니다.
- **브랜드 스펙 추출.** 사용자가 스크린샷이나 URL을 첨부하면, 에이전트는 5단계 프로토콜(위치 파악 · 다운로드 · hex grep · `brand-spec.md` 코드화 · 발성)을 실행한 후 CSS를 작성합니다. **절대 기억에서 브랜드 색상을 추측하지 않습니다.**
- **5차원 검토.** `<artifact>`를 내보내기 전, 에이전트가 자신의 출력을 철학 / 계층 / 실행 / 구체성 / 절제 5가지 차원에서 1–5점으로 조용히 채점합니다. 3/5 미만은 퇴보 — 수정 후 재채점. 두 번의 패스는 정상입니다.
- **P0/P1/P2 체크리스트.** 모든 skill은 하드 P0 게이트가 있는 `references/checklist.md`를 제공합니다. 에이전트는 내보내기 전에 P0를 통과해야 합니다.
- **Slop 블랙리스트.** 공격적인 보라색 그라디언트, 일반 이모지 아이콘, 왼쪽 테두리 액센트가 있는 둥근 카드, 손으로 그린 SVG 인물, *디스플레이* 폰트로서의 Inter, 허구 지표 — 프롬프트에서 명시적으로 금지됩니다.
- **정직한 플레이스홀더 > 가짜 통계.** 실제 숫자가 없을 때 에이전트는 `—` 또는 레이블이 있는 회색 블록을 씁니다. "10배 빠릅니다"가 아닙니다.

## 비교

| 축 | [Claude Design][cd] (Anthropic) | [Open CoDesign][ocod] | **Open Design** |
|---|---|---|---|
| 라이선스 | 클로즈드 | MIT | **Apache-2.0** |
| 폼 팩터 | 웹(claude.ai) | 데스크탑(Electron) | **웹앱 + 로컬 daemon** |
| Vercel 배포 가능 | ❌ | ❌ | **✅** |
| 에이전트 런타임 | 번들됨(Opus 4.7) | 번들됨([`pi-ai`][piai]) | **사용자 기존 CLI에 위임** |
| Skill | 독점 | 12개 커스텀 TS 모듈 + `SKILL.md` | **19개 파일 기반 [`SKILL.md`][skill] 번들, 드롭 가능** |
| 디자인 시스템 | 독점 | `DESIGN.md`(v0.2 로드맵) | **`DESIGN.md` × 71개 시스템 기본 제공** |
| 프로바이더 유연성 | Anthropic 전용 | [`pi-ai`][piai]를 통해 7+ | **에이전트가 지원하는 모든 것** |
| 초기화 질문 폼 | ❌ | ❌ | **✅ 하드 규칙, turn 1** |
| 방향 선택기 | ❌ | ❌ | **✅ 5가지 결정론적 방향** |
| 실시간 할 일 진행 + 도구 스트림 | ❌ | ✅ | **✅** (open-codesign의 UX 패턴) |
| 샌드박스 iframe 미리보기 | ❌ | ✅ | **✅** (open-codesign의 패턴) |
| 코멘트 모드 수술적 편집 | ❌ | ✅ | 🚧 로드맵(open-codesign에서 이식) |
| AI 제안 트윅 패널 | ❌ | ✅ | 🚧 로드맵(open-codesign에서 이식) |
| 파일시스템급 워크스페이스 | ❌ | 부분(Electron 샌드박스) | **✅ 실제 cwd, 실제 도구, SQLite 영구 저장** |
| 5차원 자기 검토 | ❌ | ❌ | **✅ 내보내기 전 게이트** |
| 내보내기 형식 | 제한됨 | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX / ZIP / Markdown** |
| PPT skill 재사용 | N/A | 내장 | **[`guizang-ppt-skill`][guizang] 드롭인** |
| 최소 청구 | Pro / Max / Team | BYOK | **BYOK** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/mariozechner/pi-ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## 지원하는 코딩 에이전트

daemon 부팅 시 `PATH`에서 자동 감지됩니다. 설정 필요 없음.

| 에이전트 | 바이너리 | 스트리밍 | 비고 |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `--output-format stream-json` (타입 이벤트) | 1등 지원 — 최고의 충실도 |
| [Codex CLI](https://github.com/openai/codex) | `codex` | 라인 버퍼링 | `codex exec <prompt>` |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | 라인 버퍼링 | `cursor-agent -p` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | 라인 버퍼링 | `gemini -p` |
| [OpenCode](https://opencode.ai/) | `opencode` | 라인 버퍼링 | `opencode run` |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | 라인 버퍼링 | `qwen -p` |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `--output-format json` (타입 이벤트) | `copilot -p <prompt> --allow-all-tools --output-format json` |
| Anthropic API · BYOK | n/a | SSE 직접 | PATH에 CLI가 없을 때 브라우저 폴백 |

새 CLI 추가는 [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts)에 항목 하나 추가하는 것입니다. 스트리밍 형식은 `claude-stream-json`(타입 이벤트) 또는 `plain`(원시 텍스트) 중 하나입니다.

## 참조 및 계보

이 저장소가 차용한 모든 외부 프로젝트. 각 링크는 출처로 이동하여 계보를 확인할 수 있습니다.

| 프로젝트 | 역할 |
|---|---|
| [`Claude Design`][cd] | 이 저장소가 오픈소스 대안을 제공하는 클로즈드 소스 제품. |
| [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) | 디자인 철학 핵심. Junior-Designer 워크플로, 5단계 브랜드 에셋 프로토콜, anti-AI-slop 체크리스트, 5차원 자기 검토, 그리고 방향 선택기 뒤의 "5개 학파 × 20가지 디자인 철학" 라이브러리 — 모두 [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts)와 [`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts)에 녹아들었습니다. |
| [**`op7418/guizang-ppt-skill`**][guizang] | [`skills/guizang-ppt/`](skills/guizang-ppt/) 아래에 원본 그대로 번들된 Magazine-web-PPT skill, 원 LICENSE 보존. 덱 모드 기본. P0/P1/P2 체크리스트 문화는 다른 모든 skill에도 차용됩니다. |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | Daemon + 어댑터 아키텍처. PATH 스캔 에이전트 감지, 단일 특권 프로세스로서의 로컬 daemon, 에이전트-동료 세계관. 모델을 채용했지만 코드는 vendor하지 않습니다. |
| [**`OpenCoworkAI/open-codesign`**][ocod] | 최초의 오픈소스 Claude-Design 대안이자 가장 가까운 동류. 채택된 UX 패턴: 스트리밍 아티팩트 루프, 샌드박스 iframe 미리보기(React 18 + Babel 내장), 실시간 에이전트 패널(todos + tool calls + 중단 가능), 5가지 내보내기 형식(HTML/PDF/PPTX/ZIP/Markdown), 로컬 우선 스토리지 허브, `SKILL.md` 취향 주입. 로드맵의 UX 패턴: 코멘트 모드 수술적 편집, AI 제안 트윅 패널. **[`pi-ai`][piai]는 의도적으로 vendor하지 않습니다** — open-codesign은 이를 에이전트 런타임으로 번들링하지만; 우리는 사용자가 이미 가진 CLI에 위임합니다. |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | 9섹션 `DESIGN.md` 스키마의 출처이자 [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts)를 통해 가져온 69개 제품 시스템. |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | 여러 에이전트 CLI에 걸친 심링크 기반 skill 배포의 영감. |
| [Claude Code skills][skill] | 원본 그대로 채택된 `SKILL.md` 규약 — 모든 Claude Code skill이 `skills/`에 드롭되면 daemon이 감지합니다. |

각각에서 무엇을 채용하고 의도적으로 채용하지 않았는지에 대한 장문의 계보 작성 → [`docs/references.md`](docs/references.md).

## 로드맵

- [x] Daemon + 에이전트 감지 + skill 레지스트리 + 디자인 시스템 카탈로그
- [x] 웹앱 + 채팅 + 질문 폼 + 할 일 진행 + 샌드박스 미리보기
- [x] 19개 skill + 71개 디자인 시스템 + 5가지 시각적 방향 + 5개 기기 프레임
- [x] SQLite 기반 프로젝트 · 대화 · 메시지 · 탭 · 템플릿
- [ ] 코멘트 모드 수술적 편집(요소 클릭 → 지시 → 패치) — [`open-codesign`][ocod]의 패턴
- [ ] AI 제안 트윅 패널(모델이 조정할 가치 있는 파라미터 제시) — [`open-codesign`][ocod]의 패턴
- [ ] Vercel + 터널 배포 레시피(Topology B)
- [ ] `DESIGN.md`로 프로젝트를 스캐폴딩하는 원클릭 `npx od init`
- [ ] Skill 마켓플레이스(`od skills install <github-repo>`)

단계별 배포 → [`docs/roadmap.md`](docs/roadmap.md).

## 상태

이것은 초기 구현입니다 — 닫힌 루프(감지 → skill + 디자인 시스템 선택 → 채팅 → `<artifact>` 파싱 → 미리보기 → 저장)가 end-to-end로 실행됩니다. 프롬프트 스택과 skill 라이브러리가 대부분의 가치가 있으며 안정적입니다. 컴포넌트 수준 UI는 매일 배포되고 있습니다.

## 스타 주세요

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="GitHub에서 Open Design에 스타 주세요 — github.com/nexu-io/open-design" width="100%" /></a>
</p>

이것이 30분을 절약해줬다면 — ★를 주세요. 스타가 임대료를 내지는 않지만, 다음 디자이너, 에이전트, 기여자에게 이 실험이 그들의 관심을 받을 가치가 있다는 것을 알려줍니다. 한 번의 클릭, 3초, 진짜 신호: [github.com/nexu-io/open-design](https://github.com/nexu-io/open-design).

## 기여

이슈, PR, 새로운 skill, 새로운 디자인 시스템 모두 환영합니다. 가장 레버리지가 높은 기여는 보통 폴더 하나, Markdown 파일 하나, 또는 PR 크기의 어댑터입니다:

- **skill 추가** — [`SKILL.md`][skill] 규약을 따르는 폴더를 [`skills/`](skills/)에 드롭하세요.
- **디자인 시스템 추가** — 9섹션 스키마를 사용하여 [`design-systems/<brand>/`](design-systems/)에 `DESIGN.md`를 드롭하세요.
- **새 코딩 에이전트 CLI 연결** — [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts)에 항목 하나 추가.

전체 설명, 병합 기준, 코드 스타일, 받지 않는 것 → [`CONTRIBUTING.md`](CONTRIBUTING.md) ([简体中文](CONTRIBUTING.zh-CN.md)).

## 라이선스

Apache-2.0. 번들된 `skills/guizang-ppt/`는 원래 [LICENSE](skills/guizang-ppt/LICENSE)(MIT)와 [op7418](https://github.com/op7418)에 대한 저작권 표시를 유지합니다.
