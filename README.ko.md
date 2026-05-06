# Open Design

> **[Claude Design][cd]의 오픈소스 대안.** 로컬 우선, 웹 배포 가능, 모든 레이어에서 BYOK — `PATH`에서 자동 감지되는 **15개의 코딩 에이전트 CLI**(Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, Qwen, GitHub Copilot CLI, Hermes, Kimi, Pi, Kiro, Kilo, Mistral Vibe, DeepSeek TUI)가 **31가지 조합 가능한 Skill**과 **72가지 브랜드급 디자인 시스템**으로 구동되는 디자인 엔진이 됩니다. CLI가 하나도 없다? OpenAI 호환 BYOK 프록시가 spawn만 빠진 동일한 루프를 돌립니다.

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design — 노트북 위의 에이전트와 함께 설계하는 표지" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/nexu-io/open-design/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=ffd700&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=2ecc71&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/issues"><img alt="Issues" src="https://img.shields.io/github/issues/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=ff6b6b&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/pulls"><img alt="Pull Requests" src="https://img.shields.io/github/issues-pr/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=9b59b6&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=3498db&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/commits/main"><img alt="Commit activity" src="https://img.shields.io/github/commit-activity/m/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=e67e22&logo=git&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=8e44ad&logo=git&logoColor=white" /></a>
</p>

<p align="center">
  <a href="https://open-design.ai/"><img alt="다운로드" src="https://img.shields.io/badge/%EB%8B%A4%EC%9A%B4%EB%A1%9C%EB%93%9C-open--design.ai-ff6b35?style=flat-square" /></a>
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat-square&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="#지원하는-코딩-에이전트"><img alt="Agents" src="https://img.shields.io/badge/agents-15%20CLIs%20%2B%20BYOK%20proxy-black?style=flat-square" /></a>
  <a href="#디자인-시스템"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-72-orange?style=flat-square" /></a>
  <a href="#내장-skills"><img alt="Skills" src="https://img.shields.io/badge/skills-31-teal?style=flat-square" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="QUICKSTART.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <b>한국어</b> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a></p>

---

## 왜 만들었는가

Anthropic의 [Claude Design][cd](2026-04-17 출시, Opus 4.7 기반)은 LLM이 장문의 글쓰기를 멈추고 디자인 산출물을 직접 내놓기 시작했을 때 어떤 일이 일어나는지 보여주었습니다. 순식간에 화제가 되었지만, 여전히 **클로즈드 소스**, 유료, 클라우드 전용, Anthropic 모델과 Anthropic 내부 skill에 종속된 상태입니다. 체크아웃도, 자가 호스팅도, Vercel 배포도, 에이전트 교체도 불가능합니다.

**Open Design(OD)은 그 오픈소스 대안입니다.** 동일한 루프, 동일한 '아티팩트 우선' 사고방식, 벤더 종속 없음. 우리는 에이전트를 만들지 않습니다 — 가장 강력한 코딩 에이전트는 이미 여러분의 노트북에 있습니다. 우리는 그것을 skill 기반 디자인 워크플로에 연결할 뿐입니다. 로컬에서는 `pnpm tools-dev`로 실행하고, 웹 레이어는 Vercel에 배포할 수 있으며, 모든 레이어에서 BYOK(자체 키 사용)가 가능합니다.

`시드 라운드를 위한 매거진 스타일 피치덱 만들어줘`라고 입력하세요. 모델이 픽셀 하나 그리기 전에 **초기화 질문 폼**이 먼저 등장합니다. 에이전트는 5가지 엄선된 시각적 방향 중 하나를 선택합니다. 실시간 `TodoWrite` 계획 카드가 UI에 스트리밍됩니다. Daemon이 디스크에 실제 프로젝트 폴더를 생성하며, seed 템플릿, 레이아웃 라이브러리, 자가 점검 체크리스트가 포함됩니다. 에이전트는 **pre-flight 점검을 반드시 수행**하고, 자신의 출력물에 대해 **5차원 검토**를 실행하며, 몇 초 후 샌드박스 iframe에 렌더링되는 단일 `<artifact>`를 내보냅니다.

이건 "AI가 디자인을 시도한다"가 아닙니다. 프롬프트 스택에 의해 훈련된 AI가 사용 가능한 파일시스템, 결정론적 팔레트 라이브러리, 체크리스트 문화를 갖춘 수석 디자이너처럼 동작하는 것입니다 — Claude Design이 세운 기준 그대로, 하지만 오픈소스로, 여러분의 것으로.

OD는 네 개의 오픈소스 프로젝트의 어깨 위에 서 있습니다:

- [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) — 디자인 철학의 나침반. Junior-Designer 워크플로, 5단계 브랜드 에셋 프로토콜, anti-AI-slop 체크리스트, 5차원 자기 검토, 그리고 방향 선택기 뒤의 "5가지 학파 × 20가지 디자인 철학" 아이디어 — 모두 [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts)에 녹아들었습니다.
- [**`op7418/guizang-ppt-skill`**](https://github.com/op7418/guizang-ppt-skill) — 덱 모드. [`skills/guizang-ppt/`](skills/guizang-ppt/) 아래에 원본 그대로 번들됨, 원 LICENSE 보존; 매거진 레이아웃, WebGL hero, P0/P1/P2 체크리스트.
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign) — UX의 북극성이자 가장 가까운 동류. 최초의 오픈소스 Claude-Design 대안. 스트리밍 아티팩트 루프, 샌드박스 iframe 미리보기 패턴(React 18 + Babel 내장), 실시간 에이전트 패널(todos + tool calls + 중단 가능한 생성), 5가지 내보내기 형식(HTML / PDF / PPTX / ZIP / Markdown)을 차용했습니다. 폼 팩터에서는 의도적으로 차별화했습니다 — 그쪽은 [`pi-ai`][piai]를 번들링한 Electron 데스크탑 앱이고, 우리는 에이전트 런타임을 이미 설치된 CLI에 **위임**하는 웹앱 + 로컬 daemon입니다.
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica) — Daemon 및 런타임 아키텍처. PATH 스캔 방식의 에이전트 감지, 단일 특권 프로세스로서의 로컬 daemon, 에이전트-동료 세계관.

## 한눈에 보기

| | 제공 내용 |
|---|---|
| **코딩 에이전트 CLI(15개)** | Claude Code · Codex CLI · Devin for Terminal · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · GitHub Copilot CLI · Hermes(ACP) · Kimi CLI(ACP) · Pi(RPC) · Kiro CLI(ACP) · Kilo(ACP) · Mistral Vibe CLI(ACP) · DeepSeek TUI — `PATH`에서 자동 감지, 한 번의 클릭으로 전환 |
| **BYOK 폴백** | OpenAI 호환 프록시 `/api/proxy/stream` — `baseUrl` + `apiKey` + `model`만 붙여 넣으면 어떤 벤더(Anthropic-via-OpenAI 어댑터, DeepSeek, Groq, MiMo, OpenRouter, 자체 호스팅 vLLM, 또는 OpenAI 호환 프로바이더 무엇이든)든 엔진이 됩니다. daemon 경계에서 내부 IP / SSRF를 차단합니다. |
| **내장 디자인 시스템** | **72개** — 2개의 수작업 스타터 + [`awesome-design-md`][acd2]에서 가져온 70개의 제품 시스템(Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Anthropic, Apple, Cursor, Supabase, Figma, Xiaohongshu …) |
| **내장 Skill** | **31개** — `prototype` 모드 27개(web-prototype, saas-landing, dashboard, mobile-app, gamified-app, social-carousel, magazine-poster, dating-web, sprite-animation, motion-frames, critique, tweaks, wireframe-sketch, pm-spec, eng-runbook, finance-report, hr-onboarding, invoice, kanban-board, team-okrs …) + `deck` 모드 4개(`guizang-ppt` · `simple-deck` · `replit-deck` · `weekly-update`). picker에서 `scenario`로 그룹화: design / marketing / operation / engineering / product / finance / hr / sale / personal. |
| **미디어 생성** | 이미지 · 비디오 · 오디오 surface가 디자인 루프와 함께 작동합니다. **gpt-image-2**(Azure / OpenAI)로 포스터, 아바타, 인포그래픽, 일러스트 도시 지도 · **Seedance 2.0**(ByteDance)로 15초 시네마틱 text-to-video / image-to-video · **HyperFrames**([heygen-com/hyperframes](https://github.com/heygen-com/hyperframes))로 HTML→MP4 모션 그래픽(제품 리빌, 키네틱 타이포그래피, 데이터 차트, 소셜 오버레이, 로고 아웃트로). **93개**의 즉시 복제 가능한 prompt 갤러리 — 43 gpt-image-2 + 39 Seedance + 11 HyperFrames — 모두 [`prompt-templates/`](prompt-templates/) 아래에 미리보기 썸네일과 출처 표기와 함께 배치. 채팅 입구는 코드와 동일; 실제 `.mp4` / `.png`이 프로젝트 워크스페이스에 chip으로 떨어집니다. |
| **시각적 방향** | 5가지 엄선된 학파(Editorial Monocle · Modern Minimal · Warm Soft · Tech Utility · Brutalist Experimental) — 각각 결정론적 OKLch 팔레트 + 폰트 스택 제공([`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts)) |
| **기기 프레임** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome — 픽셀 정확도, skill 간 공유, [`assets/frames/`](assets/frames/)에 통합 |
| **에이전트 런타임** | 로컬 daemon이 프로젝트 폴더에서 CLI를 실행 — 에이전트가 실제 디스크 환경에 대한 실제 `Read`, `Write`, `Bash`, `WebFetch` 도구 사용; 모든 어댑터에 Windows `ENAMETOOLONG` 폴백(stdin / 임시 prompt 파일) |
| **임포트** | [Claude Design][cd] 익스포트 ZIP을 환영 다이얼로그에 드롭하면 `POST /api/import/claude-design`이 진짜 프로젝트로 풀어주고, 로컬 에이전트는 Anthropic이 멈춘 지점에서 그대로 편집을 이어받습니다. |
| **영속성** | `.od/app.sqlite`의 SQLite: projects · conversations · messages · tabs · 사용자 templates. 내일 다시 열면 todo 카드와 열린 파일 모두 어제 그 자리. |
| **라이프사이클** | 단일 입구 `pnpm tools-dev`(start / stop / run / status / logs / inspect / check) — 타입화된 sidecar 스탬프로 daemon + web(+ desktop) 구동 |
| **데스크탑** | 선택적 Electron 셸: 샌드박스 렌더러 + sidecar IPC(STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN) — 같은 채널이 `tools-dev inspect desktop screenshot`을 구동해 E2E를 돌립니다 |
| **배포 대상** | 로컬 (`pnpm tools-dev`) · Vercel 웹 레이어 · macOS (Apple Silicon)와 Windows (x64)용 패키지된 Electron 데스크톱 앱 — [open-design.ai](https://open-design.ai/) 또는 [최신 릴리스](https://github.com/nexu-io/open-design/releases)에서 다운로드 |
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
<sub><b>방향 선택기</b> — 사용자에게 브랜드가 없을 때, 에이전트가 두 번째 폼을 띄워 5가지 엄선된 방향(Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm)을 제시합니다. 라디오 하나 클릭 → 결정론적 팔레트 + 폰트 스택, 모델 자유 재량 없음.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · 실시간 할 일 진행" /><br/>
<sub><b>실시간 할 일 진행</b> — 에이전트의 계획이 실시간 카드로 스트리밍됩니다. <code>in_progress</code> → <code>completed</code> 업데이트가 실시간으로 반영됩니다. 작업 중에도 저렴한 비용으로 방향을 조정할 수 있습니다.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · 샌드박스 미리보기" /><br/>
<sub><b>샌드박스 미리보기</b> — 모든 <code>&lt;artifact&gt;</code>가 깨끗한 srcdoc iframe에서 렌더링됩니다. 파일 워크스페이스에서 바로 편집 가능; HTML, PDF, ZIP으로 다운로드 가능.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · 72개 시스템 라이브러리" /><br/>
<sub><b>72개 시스템 라이브러리</b> — 모든 제품 시스템이 4색 시그니처를 표시합니다. 클릭하면 전체 <code>DESIGN.md</code>, 색상 견본 그리드, 라이브 쇼케이스를 볼 수 있습니다.</sub>
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

**31개의 skill이 기본 제공됩니다.** 각각은 Claude Code의 [`SKILL.md`][skill] 규약을 따르는 [`skills/`](skills/) 아래의 폴더이며, daemon이 그대로 파싱하는 확장된 `od:` 프론트매터를 포함합니다 — `mode`, `platform`, `scenario`, `preview.type`, `design_system.requires`, `default_for`, `featured`, `fidelity`, `speaker_notes`, `animations`, `example_prompt`([`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts)).

두 가지 최상위 **mode**가 카탈로그를 떠받칩니다: **`prototype`**(27개 — 매거진 랜딩부터 폰 화면, PM 스펙 문서까지 단일 페이지 아티팩트로 렌더링되는 모든 것) 그리고 **`deck`**(4개 — 덱 프레임워크 크롬을 입은 수평 스와이프 프레젠테이션). picker가 그룹화에 사용하는 필드는 **`scenario`**: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`.

### 쇼케이스 예시

시각적으로 가장 눈에 띄어 먼저 실행해 볼 skill들입니다. 각각은 저장소에서 바로 열 수 있는 실제 `example.html`을 제공합니다 — 인증 없이, 설정 없이, 에이전트가 무엇을 생산하는지 미리 확인할 수 있습니다.

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>소비자용 데이팅 / 매칭 대시보드 — 좌측 레일 내비게이션, 티커 바, KPI, 30일 상호 매칭 차트, 에디토리얼 타이포그래피.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>2페이지 디지털 e-가이드 — 표지(제목, 저자, TOC 티저) + 풀 쿼트 및 단계 목록이 있는 레슨 스프레드. 크리에이터 / 라이프스타일 톤.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>브랜드 제품 출시 HTML 이메일 — 마스트헤드, 히어로 이미지, 헤드라인 락업, CTA, 스펙 그리드. 중앙 단일 컬럼, 테이블 폴백 안전.</sub>
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
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>픽셀 / 8비트 애니메이션 설명 슬라이드 — 전면 크림 스테이지, 애니메이션 픽셀 마스코트, 역동적인 일본어 표시 타이포그래피, 루핑 CSS 키프레임.</sub>
</td>
</tr>
</table>

### 디자인 & 마케팅 표면(prototype 모드)

| Skill | 플랫폼 | Scenario | 생산물 |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | 데스크탑 | design | 단일 페이지 HTML — 랜딩, 마케팅, 히어로 페이지(prototype 기본) |
| [`saas-landing`](skills/saas-landing/) | 데스크탑 | marketing | Hero / features / pricing / CTA 마케팅 레이아웃 |
| [`dashboard`](skills/dashboard/) | 데스크탑 | operation | 사이드바 + 데이터 밀집 레이아웃의 어드민 / 분석 |
| [`pricing-page`](skills/pricing-page/) | 데스크탑 | sale | 독립형 가격 + 비교 테이블 |
| [`docs-page`](skills/docs-page/) | 데스크탑 | engineering | 3컬럼 문서 레이아웃 |
| [`blog-post`](skills/blog-post/) | 데스크탑 | marketing | 에디토리얼 장문 |
| [`mobile-app`](skills/mobile-app/) | 모바일 | design | iPhone 15 Pro / Pixel 프레임 앱 화면 |
| [`mobile-onboarding`](skills/mobile-onboarding/) | 모바일 | design | 다중 화면 모바일 온보딩 플로우(스플래시 · 가치 제안 · 로그인) |
| [`gamified-app`](skills/gamified-app/) | 모바일 | personal | 3화면 게임화 모바일 앱 프로토타입 |
| [`email-marketing`](skills/email-marketing/) | 데스크탑 | marketing | 브랜드 제품 출시 HTML 이메일(테이블 폴백 안전) |
| [`social-carousel`](skills/social-carousel/) | 데스크탑 | marketing | 1080×1080 3장 소셜 캐러셀 |
| [`magazine-poster`](skills/magazine-poster/) | 데스크탑 | marketing | 단일 페이지 매거진 스타일 포스터 |
| [`motion-frames`](skills/motion-frames/) | 데스크탑 | marketing | 루핑 CSS 애니메이션의 모션 디자인 히어로 |
| [`sprite-animation`](skills/sprite-animation/) | 데스크탑 | marketing | 픽셀 / 8비트 애니메이션 설명 슬라이드 |
| [`dating-web`](skills/dating-web/) | 데스크탑 | personal | 소비자용 데이팅 대시보드 목업 |
| [`digital-eguide`](skills/digital-eguide/) | 데스크탑 | marketing | 2페이지 디지털 e-가이드(표지 + 레슨) |
| [`wireframe-sketch`](skills/wireframe-sketch/) | 데스크탑 | design | 손그림 아이데이션 스케치 — "회색 블록이라도 일찍 보여주기" 패스를 위한 |
| [`critique`](skills/critique/) | 데스크탑 | design | 5차원 자기 검토 점수표(Philosophy · Hierarchy · Detail · Function · Innovation) |
| [`tweaks`](skills/tweaks/) | 데스크탑 | design | AI 송출 tweaks 패널 — 모델이 직접 조정할 만한 파라미터를 떠올림 |

### 덱 표면(deck 모드)

| Skill | 기본 | 생산물 |
|---|---|---|
| [`guizang-ppt`](skills/guizang-ppt/) | 덱 **기본** | 매거진 스타일 웹 PPT — [op7418/guizang-ppt-skill][guizang]에서 그대로 번들됨, 원 LICENSE 보존 |
| [`simple-deck`](skills/simple-deck/) | — | 미니멀 수평 스와이프 덱 |
| [`replit-deck`](skills/replit-deck/) | — | 제품 워크스루 덱(Replit 스타일) |
| [`weekly-update`](skills/weekly-update/) | — | 팀 주간 업데이트(진행 · 블로커 · 다음 단계)를 스와이프 덱으로 |

### 사무 & 운영 표면(prototype 모드, 문서 지향 시나리오)

| Skill | Scenario | 생산물 |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | product | TOC + 의사결정 로그가 있는 PM 스펙 문서 |
| [`team-okrs`](skills/team-okrs/) | product | OKR 스코어시트 |
| [`meeting-notes`](skills/meeting-notes/) | operation | 회의 의사결정 로그 |
| [`kanban-board`](skills/kanban-board/) | operation | 보드 스냅샷 |
| [`eng-runbook`](skills/eng-runbook/) | engineering | 장애 런북 |
| [`finance-report`](skills/finance-report/) | finance | 임원 재무 요약 |
| [`invoice`](skills/invoice/) | finance | 단일 페이지 인보이스 |
| [`hr-onboarding`](skills/hr-onboarding/) | hr | 역할 온보딩 계획 |

skill 추가는 폴더 하나면 됩니다. [`docs/skills-protocol.md`](docs/skills-protocol.md)에서 확장 프론트매터를 읽고, 기존 skill을 포크하고, daemon을 재시작하면 picker에 나타납니다. 카탈로그 엔드포인트는 `GET /api/skills`이며, 스킬별 시드 조립(template + 사이드 파일 references)은 `GET /api/skills/:id/example`에 있습니다.

## 6가지 핵심 아이디어

### 1 · 에이전트를 제공하지 않습니다. 여러분의 것으로 충분합니다.

Daemon은 시작 시 `PATH`에서 [`claude`](https://docs.anthropic.com/en/docs/claude-code), [`codex`](https://github.com/openai/codex), [`cursor-agent`](https://www.cursor.com/cli), [`gemini`](https://github.com/google-gemini/gemini-cli), [`opencode`](https://opencode.ai/), [`qwen`](https://github.com/QwenLM/qwen-code), [`copilot`](https://github.com/features/copilot/cli), `hermes`, `kimi`, [`pi`](https://github.com/mariozechner/pi-ai)를 스캔합니다. 찾은 것들 모두가 후보 디자인 엔진이 됩니다 — stdio를 통해 구동되며 CLI당 하나의 어댑터, 모델 picker에서 즉시 전환 가능. [`multica`](https://github.com/multica-ai/multica)와 [`cc-switch`](https://github.com/farion1231/cc-switch)에서 영감을 받았습니다. CLI가 하나도 설치되어 있지 않다면? `POST /api/proxy/stream`이 spawn만 없는 동일한 파이프라인입니다 — 임의의 OpenAI 호환 `baseUrl` + `apiKey`만 붙여 넣으면 daemon이 SSE 청크를 브라우저로 그대로 전달하며, loopback / link-local / RFC1918 목적지는 경계에서 거부됩니다.

### 2 · Skill은 파일이지 플러그인이 아닙니다.

Claude Code의 [`SKILL.md` 규약](https://docs.anthropic.com/en/docs/claude-code/skills)을 따라 각 skill은 `SKILL.md` + `assets/` + `references/`입니다. [`skills/`](skills/)에 폴더를 드롭하고 daemon을 재시작하면 picker에 나타납니다. 번들된 `magazine-web-ppt`는 [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill)을 그대로 커밋한 것입니다 — 원본 라이선스와 저작권 표시 보존.

### 3 · 디자인 시스템은 테마 JSON이 아닌 이식 가능한 Markdown입니다.

[`VoltAgent/awesome-design-md`][acd2]의 9섹션 `DESIGN.md` 스키마 — color, typography, spacing, layout, components, motion, voice, brand, anti-patterns. 모든 아티팩트가 활성 시스템에서 읽습니다. 시스템 전환 → 다음 렌더에 새 토큰 사용. 드롭다운에는 **Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Apple, Anthropic, Cursor, Supabase, Figma, Resend, Raycast, Lovable, Cohere, Mistral, ElevenLabs, X.AI, Spotify, Webflow, Sanity, PostHog, Sentry, MongoDB, ClickHouse, Cal, Replicate, Clay, Composio, Xiaohongshu …** 총 72개가 있습니다.

### 4 · 초기화 질문 폼이 수정 작업의 80%를 막아줍니다.

OD의 프롬프트 스택에는 `RULE 1`이 하드코딩되어 있습니다: 모든 새 디자인 브리프는 코드 대신 `<question-form id="discovery">`로 시작합니다. 화면 · 대상 · 톤 · 브랜드 컨텍스트 · 규모 · 제약 조건. 긴 브리프라도 시각적 톤, 색상 입장, 규모 같은 디자인 결정 사항은 여전히 열려 있습니다 — 폼이 정확히 이것들을 30초 안에 고정합니다. 잘못된 방향의 비용은 한 번의 채팅 라운드이지, 완성된 덱 하나가 아닙니다.

이것이 [`huashu-design`](https://github.com/alchaincyf/huashu-design)에서 추출한 **Junior-Designer 모드**입니다: 미리 일괄 질문하고, 일찍 가시적인 것을 보여주며(와이어프레임에 회색 블록이라도), 사용자가 저렴한 비용으로 방향을 바꿀 수 있도록 합니다. 브랜드 에셋 프로토콜(위치 파악 · 다운로드 · `grep` hex · `brand-spec.md` 작성 · 발성)과 결합하면, 출력이 "AI 자유 창작"에서 "그리기 전에 주의를 기울인 디자이너"처럼 느껴지게 되는 가장 큰 이유입니다.

### 5 · Daemon은 에이전트가 여러분의 노트북에 있는 것처럼 느끼게 합니다. 실제로 그러니까요.

Daemon은 프로젝트의 아티팩트 폴더 `.od/projects/<id>/`로 `cwd`를 설정해 CLI를 spawn합니다. 에이전트는 실제 파일시스템에 대한 실제 도구인 `Read`, `Write`, `Bash`, `WebFetch`를 사용합니다. skill의 `assets/template.html`을 `Read`하고, CSS에서 hex 값을 `grep`하고, `brand-spec.md`를 작성하고, 생성된 이미지를 저장하고, `.pptx` / `.zip` / `.pdf` 파일을 생성할 수 있습니다 — 이 파일들은 턴이 끝날 때 파일 워크스페이스에 다운로드 칩으로 나타납니다. 세션, 대화, 메시지, 탭은 로컬 SQLite DB에 영구 저장됩니다 — 내일 프로젝트를 열면 에이전트의 할 일 카드가 어제 멈춘 곳에 그대로 있습니다.

### 6 · 프롬프트 스택 자체가 제품입니다.

전송 시 구성되는 것은 "system + user"가 아닙니다. 다음과 같습니다:

```
DISCOVERY 지시문    (turn-1 폼, turn-2 브랜드 분기, TodoWrite, 5차원 검토)
  + 신원 헌장        (OFFICIAL_DESIGNER_PROMPT, anti-AI-slop, junior-pass)
  + 활성 DESIGN.md   (72개 시스템 사용 가능)
  + 활성 SKILL.md    (31개 skill 사용 가능)
  + 프로젝트 메타데이터 (kind, fidelity, speakerNotes, animations, inspiration ids)
  + skill 사이드 파일 (pre-flight 자동 주입: assets/template.html + references/*.md 읽기)
  + (덱 kind, skill seed 없음) DECK_FRAMEWORK_DIRECTIVE   (nav / counter / scroll / print)
```

모든 레이어는 조합 가능합니다. 모든 레이어는 편집 가능한 파일입니다. 실제 계약을 보려면 [`apps/web/src/prompts/system.ts`](apps/web/src/prompts/system.ts)와 [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts)를 읽으세요.

## 아키텍처

```
┌────────────── 브라우저(Next.js 16) ─────────────────────────────┐
│  채팅 · 파일 워크스페이스 · iframe 미리보기 · 설정 · 임포트     │
└──────────────┬───────────────────────────────┬────────────────┘
               │ /api/*(dev에서 rewrite)        │
               ▼                                ▼
   ┌─────────────────────────────────┐   /api/proxy/stream (SSE)
   │  로컬 daemon(Express + SQLite)  │   ─→ 임의의 OpenAI 호환
   │                                 │      엔드포인트(BYOK)
   │  /api/agents         /api/skills│      SSRF 차단 포함
   │  /api/design-systems /api/projects/…
   │  /api/chat (SSE)     /api/proxy/stream (SSE)
   │  /api/templates      /api/import/claude-design
   │  /api/artifacts/save /api/artifacts/lint
   │  /api/upload         /api/projects/:id/files…
   │  /artifacts (정적)   /frames (정적)
   │
   │  선택적 sidecar IPC: /tmp/open-design/ipc/<ns>/<app>.sock
   │  (STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN)
   └─────────┬───────────────────────┘
             │ spawn(cli, [...], { cwd: .od/projects/<id> })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  claude · codex · gemini · opencode · cursor-agent · qwen        │
   │  copilot · hermes (ACP) · kimi (ACP) · pi (RPC)                  │
   │  SKILL.md + DESIGN.md 읽기, 디스크에 아티팩트 쓰기               │
   └──────────────────────────────────────────────────────────────────┘
```

| 레이어 | 스택 |
|---|---|
| 프론트엔드 | Next.js 16 App Router + React 18 + TypeScript, Vercel 배포 가능 |
| Daemon | Node 24 · Express · SSE 스트리밍 · `better-sqlite3`; 테이블: `projects` · `conversations` · `messages` · `tabs` · `templates` |
| 에이전트 전송 | `child_process.spawn`; 타입 이벤트 파서: `claude-stream-json`(Claude Code), `copilot-stream-json`(Copilot), `json-event-stream` + 각 CLI 파서(Codex / Gemini / OpenCode / Cursor Agent), `acp-json-rpc`(Hermes / Kimi via Agent Client Protocol), `pi-rpc`(Pi via stdio JSON-RPC), `plain`(Qwen Code) |
| BYOK 프록시 | `POST /api/proxy/stream` → OpenAI 호환 `/v1/chat/completions`, SSE 통과; daemon 경계에서 loopback / link-local / RFC1918 호스트 거부 |
| 저장소 | `.od/projects/<id>/`의 평문 파일 + `.od/app.sqlite`의 SQLite(gitignore됨, 자동 생성). 테스트 격리를 위해 `OD_DATA_DIR`로 루트 변경 가능 |
| 미리보기 | `srcdoc`를 통한 샌드박스 iframe + 스킬별 `<artifact>` 파서([`apps/web/src/artifacts/parser.ts`](apps/web/src/artifacts/parser.ts)) |
| 내보내기 | HTML(인라인 에셋) · PDF(브라우저 인쇄, deck-aware) · PPTX(에이전트 주도 + skill) · ZIP(archiver) · Markdown |
| 라이프사이클 | `pnpm tools-dev start \| stop \| run \| status \| logs \| inspect \| check`; 포트는 `--daemon-port` / `--web-port`, 네임스페이스는 `--namespace` |
| 데스크탑(선택) | Electron 셸 — sidecar IPC를 통해 web URL 발견, 포트 추측 없음; 같은 채널(`STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN`)이 `tools-dev inspect desktop …`로 E2E 구동 |

## 빠른 시작

### 데스크톱 앱 다운로드 (빌드 불필요)

Open Design을 가장 빠르게 사용해 보는 방법은 사전 빌드된 데스크톱 앱입니다 — Node도, pnpm도, clone도 필요 없습니다:

- **[open-design.ai](https://open-design.ai/)** — 공식 다운로드 페이지
- **[GitHub 릴리스](https://github.com/nexu-io/open-design/releases)**

### 소스에서 실행

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # 10.33.2가 출력되어야 합니다
pnpm install
pnpm tools-dev run web
# tools-dev가 출력한 web URL을 여세요
```

환경 요구사항: Node `~24`와 pnpm `10.33.x`. `nvm` / `fnm`은 선택적 보조 도구일 뿐입니다; 사용한다면 `pnpm install` 전에 `nvm install 24 && nvm use 24` 또는 `fnm install 24 && fnm use 24`를 실행하세요.

첫 번째 로드 시:

1. `PATH`에 어떤 에이전트 CLI가 있는지 감지하고 자동으로 하나를 선택합니다.
2. 31개의 skill + 72개의 디자인 시스템을 로드합니다.
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
├── README.de.md                   ← Deutsch
├── README.zh-CN.md                ← 简体中文
├── README.ko.md                   ← 한국어 (이 파일)
├── QUICKSTART.md                  ← 실행 / 빌드 / 배포 가이드
├── package.json                   ← pnpm 워크스페이스, 단일 bin: od
│
├── apps/
│   ├── daemon/                    ← Node + Express, 유일한 서버
│   │   ├── src/                   ← TypeScript daemon 소스
│   │   │   ├── cli.ts             ← `od` bin 소스, dist/cli.js로 컴파일
│   │   │   ├── server.ts          ← /api/* 라우트(projects, chat, files, exports)
│   │   │   ├── agents.ts          ← PATH 스캐너 + CLI별 argv 빌더
│   │   │   ├── claude-stream.ts   ← Claude Code stdout 스트리밍 JSON 파서
│   │   │   ├── skills.ts          ← SKILL.md 프론트매터 로더
│   │   │   └── db.ts              ← SQLite 스키마(projects/messages/templates/tabs)
│   │   ├── sidecar/               ← tools-dev daemon sidecar 래퍼
│   │   └── tests/                 ← daemon 패키지 테스트
│   │
│   └── web/                       ← Next.js 16 App Router + React 클라이언트
│       ├── app/                   ← App Router 진입점
│       ├── next.config.ts         ← 개발 rewrite + 프로덕션 정적 내보내기 to out/
│       └── src/                   ← React + TypeScript 클라이언트 모듈
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
├── packages/
│   ├── contracts/                 ← 공유 web/daemon app contracts
│   ├── sidecar-proto/             ← Open Design sidecar protocol contract
│   ├── sidecar/                   ← generic sidecar runtime primitives
│   └── platform/                  ← generic process/platform primitives
│
├── skills/                        ← 31개 SKILL.md skill 번들(27 prototype + 4 deck)
│   ├── web-prototype/             ← prototype 기본
│   ├── saas-landing/  dashboard/  pricing-page/  docs-page/  blog-post/
│   ├── mobile-app/  mobile-onboarding/  gamified-app/
│   ├── email-marketing/  social-carousel/  magazine-poster/
│   ├── motion-frames/  sprite-animation/  digital-eguide/  dating-web/
│   ├── critique/  tweaks/  wireframe-sketch/
│   ├── pm-spec/  team-okrs/  meeting-notes/  kanban-board/
│   ├── eng-runbook/  finance-report/  invoice/  hr-onboarding/
│   ├── simple-deck/  replit-deck/  weekly-update/   ← deck 모드
│   └── guizang-ppt/               ← 번들된 magazine-web-ppt(덱 기본)
│       ├── SKILL.md
│       ├── assets/template.html   ← seed
│       └── references/{themes,layouts,components,checklist}.md
│
├── design-systems/                ← 72개 DESIGN.md 시스템
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
  <img src="docs/assets/design-systems-library.png" alt="72개 디자인 시스템 라이브러리 — 에디토리얼 스프레드" width="100%" />
</p>

기본 제공 72개 시스템, 각각 단일 [`DESIGN.md`](design-systems/README.md)로:

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

사용자에게 브랜드 스펙이 없을 때, 에이전트가 5가지 엄선된 방향이 있는 두 번째 폼을 내보냅니다 — [`huashu-design`의 "5가지 학파 × 20가지 디자인 철학" 폴백](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback)의 OD 적용. 각 방향은 결정론적 스펙입니다 — OKLch의 팔레트, 폰트 스택, 레이아웃 포스처 단서, 참고 자료 — 에이전트가 이를 seed 템플릿의 `:root`에 그대로 바인딩합니다. 라디오 하나 클릭 → 완전히 지정된 시각 시스템. 즉흥 없음, AI-slop 없음.

| 방향 | 무드 | 참고 |
|---|---|---|
| Editorial — Monocle / FT | 인쇄 매거진, 잉크 + 크림 + 따뜻한 러스트 | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | 쿨, 구조적, 미니멀 액센트 | Linear · Vercel · Stripe |
| Tech utility | 정보 밀도, 모노스페이스, 터미널 | Bloomberg · Bauhaus 도구 |
| Brutalist | 날것, 거대한 타입, 그림자 없음, 강한 액센트 | Bloomberg Businessweek · Achtung |
| Soft warm | 여유롭고, 낮은 대비, 복숭아 계열 뉴트럴 | Notion 마케팅 · Apple Health |

전체 스펙 → [`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts).

## 미디어 생성

OD는 코드에서 끝나지 않습니다. `<artifact>` HTML을 만드는 동일한 채팅 입구가 **이미지**, **비디오**, **오디오** 생성도 구동합니다 — 모델 어댑터는 daemon의 미디어 파이프라인([`apps/daemon/src/media-models.ts`](apps/daemon/src/media-models.ts), [`apps/web/src/media/models.ts`](apps/web/src/media/models.ts))에 연결되어 있습니다. 모든 렌더링은 프로젝트 워크스페이스에 실제 파일로 떨어지며 — 이미지는 `.png`, 비디오는 `.mp4` — 턴이 끝날 때 다운로드 chip으로 표시됩니다.

오늘날 부하를 짊어진 세 모델 패밀리:

| Surface | 모델 | 제공자 | 용도 |
|---|---|---|---|
| **이미지** | `gpt-image-2` | Azure / OpenAI | 포스터, 프로필 아바타, 일러스트 도시 지도, 인포그래픽, 매거진 풍 소셜 카드, 사진 복원, 분해도 제품 일러스트 |
| **비디오** | `seedance-2.0` | ByteDance Volcengine | 15초 시네마틱 t2v + i2v + 오디오 — 내러티브 쇼트, 인물 클로즈업, 제품 영상, MV 안무 |
| **비디오** | `hyperframes-html` | [HeyGen / OSS](https://github.com/heygen-com/hyperframes) | HTML→MP4 모션 그래픽 — 제품 리빌, 키네틱 타이포그래피, 데이터 차트, 소셜 오버레이, 로고 아웃트로, 카라오케 자막을 단 세로형 TikTok |

성장하는 **prompt 갤러리**는 [`prompt-templates/`](prompt-templates/)에서 — **즉시 복제 가능한 93개 prompt** 동봉: 43개 이미지(`prompt-templates/image/*.json`), 39개 Seedance(`prompt-templates/video/*.json` 중 `hyperframes-*` 제외), 11개 HyperFrames(`prompt-templates/video/hyperframes-*.json`). 각 항목은 미리보기 썸네일, 원본 prompt 본문, 대상 모델, 화면비, 라이선스 + 저작자 표기를 담은 `source` 블록을 포함합니다. daemon은 `GET /api/prompt-templates`로 서빙하고, 웹 앱은 진입 화면의 **Image templates** / **Video templates** 탭에서 카드 그리드로 보여줍니다; 한 번 클릭하면 적합한 모델이 미리 선택된 prompt가 composer에 떨어집니다.

### gpt-image-2 — 이미지 갤러리(43개 중 5개)

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D Stone Staircase Evolution" /><br/><sub><b>3D Stone Staircase Evolution Infographic</b><br/>3단계 석재 풍 인포그래픽</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated City Food Map" /><br/><sub><b>Illustrated City Food Map</b><br/>편집급 손그림 여행 포스터</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic Elevator Scene" /><br/><sub><b>Cinematic Elevator Scene</b><br/>편집급 패션 단일 프레임</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk Anime Portrait" /><br/><sub><b>Cyberpunk Anime Portrait</b><br/>프로필 아바타 — 네온 페이스 텍스트</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous Woman in Black" /><br/><sub><b>Glamorous Woman in Black Portrait</b><br/>편집급 스튜디오 초상</sub></td>
</tr>
</table>

전체 목록 → [`prompt-templates/image/`](prompt-templates/image/). 출처: 대부분 [`YouMind-OpenLab/awesome-gpt-image-prompts`](https://github.com/YouMind-OpenLab/awesome-gpt-image-prompts)(CC-BY-4.0)에서, 템플릿마다 작성자 표기를 보존.

### Seedance 2.0 — 비디오 갤러리(39개 중 5개)

<table>
<tr>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/thumbnails/thumbnail.jpg" alt="Music Podcast Guitar" /></a><br/><sub><b>Music Podcast & Guitar Technique</b><br/>4K 시네마틱 스튜디오 영상</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/thumbnails/thumbnail.jpg" alt="Emotional Face" /></a><br/><sub><b>Emotional Face Close-up</b><br/>시네마틱 미세 표정 연구</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/thumbnails/thumbnail.jpg" alt="Luxury Supercar" /></a><br/><sub><b>Luxury Supercar Cinematic</b><br/>내러티브 제품 영상</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/thumbnails/thumbnail.jpg" alt="Forbidden City Cat" /></a><br/><sub><b>Forbidden City Cat Satire</b><br/>스타일라이즈드 풍자 쇼트</sub></td>
<td width="20%" valign="top"><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg" alt="Japanese Romance" /></a><br/><sub><b>Japanese Romance Short Film</b><br/>15초 Seedance 2.0 내러티브</sub></td>
</tr>
</table>

썸네일을 클릭하면 실제 렌더된 MP4가 재생됩니다. 전체 목록 → [`prompt-templates/video/`](prompt-templates/video/)(`*-seedance-*` 및 Cinematic 태그가 붙은 항목). 출처: [`YouMind-OpenLab/awesome-seedance-2-prompts`](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts)(CC-BY-4.0), 원 트윗 링크와 작성자 핸들 보존.

### HyperFrames — HTML→MP4 모션 그래픽(11개의 즉시 복제 가능한 템플릿)

[**`heygen-com/hyperframes`**](https://github.com/heygen-com/hyperframes)는 HeyGen이 오픈소스화한 에이전트 네이티브 비디오 프레임워크입니다 — 당신(또는 에이전트)이 HTML + CSS + GSAP을 작성하면 HyperFrames가 headless Chrome + FFmpeg로 결정론적으로 MP4를 렌더링합니다. Open Design은 HyperFrames를 일급 비디오 모델(`hyperframes-html`)로 daemon dispatch에 연결하고, 추가로 `skills/hyperframes/` skill을 동봉해 timeline 계약, 씬 트랜지션 규칙, audio-reactive 패턴, 자막/TTS, 카탈로그 블록(`npx hyperframes add <slug>`)을 에이전트에게 가르칩니다.

11개의 HyperFrames prompt가 [`prompt-templates/video/hyperframes-*.json`](prompt-templates/video/)에 들어 있고, 각각이 특정 아키타입을 만들어내는 구체적인 brief입니다:

<table>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-product-reveal-minimal.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Product reveal" /></a><br/><sub><b>5초 미니멀 제품 리빌</b> · 16:9 · 푸시인 타이틀 카드 + 셰이더 트랜지션</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>30초 SaaS 제품 프로모</b> · 16:9 · Linear/ClickUp 풍 + UI 3D 리빌</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>TikTok 카라오케 토킹헤드</b> · 9:16 · TTS + 단어 동기화 자막</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle" /></a><br/><sub><b>30초 브랜드 sizzle 릴</b> · 16:9 · 비트 동기화 키네틱 타이포, audio-reactive</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Data chart" /></a><br/><sub><b>애니메이션 bar-chart race</b> · 16:9 · NYT 풍 데이터 인포그래픽</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>비행 경로 지도(출발 → 도착)</b> · 16:9 · Apple 풍 시네마틱 경로 리빌</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>4초 시네마틱 로고 아웃트로</b> · 16:9 · 조각별 어셈블 + bloom</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>$0 → $10K 머니 카운터</b> · 9:16 · Apple 풍 hype + 그린 플래시 + 버스트</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-app-showcase-three-phones.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="App showcase" /></a><br/><sub><b>폰 3대 앱 쇼케이스</b> · 16:9 · 떠 있는 폰 + 기능 콜아웃</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-social-overlay-stack.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Social overlay" /></a><br/><sub><b>소셜 오버레이 스택</b> · 9:16 · X · Reddit · Spotify · Instagram 순차</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>웹사이트→비디오 파이프라인</b> · 16:9 · 3가지 뷰포트 캡처 + 트랜지션</sub></td>
<td width="25%" valign="top">&nbsp;</td>
</tr>
</table>

패턴은 다른 것과 동일합니다: 템플릿을 고르고, brief를 편집하고, 보냅니다. 에이전트는 동봉된 `skills/hyperframes/SKILL.md`(OD 전용 렌더링 워크플로 — composition 소스 파일을 `.hyperframes-cache/`에 격리해 파일 워크스페이스를 어지럽히지 않고, daemon이 `npx hyperframes render`를 대신 실행해 macOS sandbox-exec / Puppeteer 행 현상을 우회하고, 최종 `.mp4`만 프로젝트 chip으로 표시되도록)를 읽고, composition을 작성하고, MP4를 출력합니다. 카탈로그 블록 썸네일은 © HeyGen, 그들의 CDN에서 제공; OSS 프레임워크 자체는 Apache-2.0입니다.

> **연결되었지만 아직 템플릿으로 노출되지 않은 모델:** Kling 2.0 / 1.6 / 1.5, Veo 3 / Veo 2, Sora 2 / Sora 2-Pro(via Fal), MiniMax video-01 — 모두 `VIDEO_MODELS`([`apps/web/src/media/models.ts`](apps/web/src/media/models.ts))에 있습니다. Suno v5 / v4.5, Udio v2, Lyria 2(음악)와 gpt-4o-mini-tts, MiniMax TTS(음성)가 오디오 surface를 커버합니다. 이들 prompt 템플릿은 오픈 컨트리뷰션입니다 — JSON을 `prompt-templates/video/` 또는 `prompt-templates/audio/`에 떨구면 picker에 나타납니다.

## 채팅 그 이상 — 더 들어 있는 것들

채팅 / 아티팩트 루프가 가장 눈에 잘 띄지만, 이 저장소에는 다른 제품과 비교하기 전에 한번쯤 스캔해 볼 가치가 있는 잘 안 보이는 능력들이 더 있습니다:

- **Claude Design ZIP 임포트.** claude.ai에서 익스포트한 ZIP을 환영 다이얼로그에 드롭하세요. `POST /api/import/claude-design`이 그것을 진짜 `.od/projects/<id>/`로 풀어주고, 엔트리 파일을 탭으로 열고, 로컬 에이전트에게 "Anthropic이 멈춘 곳에서 그대로 이어서 편집해" 프롬프트를 미리 박아둡니다. 다시 묻지 않아도 됩니다, "방금 만든 것을 다시 만들어줘"도 안 합니다. ([`apps/daemon/src/server.ts`](apps/daemon/src/server.ts) — `/api/import/claude-design`)
- **OpenAI 호환 BYOK 프록시.** `POST /api/proxy/stream`은 `{ baseUrl, apiKey, model, messages }`를 받아 경로를 정규화(`…/v1/chat/completions`)하고, SSE 청크를 브라우저로 전달하며, SSRF를 막기 위해 loopback / link-local / RFC1918 목적지를 거부합니다. OpenAI chat 스키마를 말하는 모든 것이 작동합니다 — Anthropic-via-OpenAI 어댑터, DeepSeek, Groq, MiMo, OpenRouter, 자체 호스팅 vLLM. MiMo는 자유 생성에서 tool 스키마가 잘 동작하지 않아 자동으로 `tool_choice: 'none'`이 적용됩니다.
- **사용자 저장 templates.** 마음에 든 렌더가 있으면 `POST /api/templates`가 HTML + 메타데이터를 SQLite `templates` 테이블에 스냅샷으로 저장합니다. 다음 프로젝트의 picker에는 "내 템플릿" 행이 추가됩니다 — 기본 31개와 동일한 표면, 그러나 당신의 것.
- **탭 영속성.** 모든 프로젝트는 `tabs` 테이블에 자기가 연 파일들과 활성 탭을 기억합니다. 내일 다시 열어도 워크스페이스는 어제 떠난 그 모습 그대로.
- **Artifact lint API.** `POST /api/artifacts/lint`는 생성된 아티팩트에 대해 구조 검사(파괴된 `<artifact>` 프레임, 누락된 필수 사이드 파일, 오래된 팔레트 토큰)를 실행하고, 에이전트가 다음 턴에 다시 읽어들일 수 있는 findings를 반환합니다. 5차원 자기 검토는 이걸로 점수를 vibe가 아닌 실제 증거에 묶어둡니다.
- **Sidecar 프로토콜 + 데스크탑 자동화.** Daemon, web, desktop 프로세스 모두 타입화된 5필드 스탬프(`app · mode · namespace · ipc · source`)를 들고 다니며, JSON-RPC IPC 채널을 `/tmp/open-design/ipc/<namespace>/<app>.sock`에 노출합니다. `tools-dev inspect desktop status \| eval \| screenshot`이 그 채널 위에서 동작하므로, 헤드리스 E2E가 진짜 Electron 셸을 상대로 자체 하네스 없이 동작합니다([`packages/sidecar-proto/`](packages/sidecar-proto/), [`apps/desktop/src/main/`](apps/desktop/src/main/)).
- **Windows 친화적 spawn.** 긴 합성 prompt에서 `CreateProcess`의 약 32 KB argv 한계를 넘을 만한 모든 어댑터(Codex, Gemini, OpenCode, Cursor Agent, Qwen, Pi)는 prompt를 stdin으로 보냅니다. Claude Code와 Copilot은 `-p`를 유지하고, 그것마저 넘치면 daemon은 임시 prompt 파일로 폴백합니다.
- **네임스페이스별 런타임 데이터.** `OD_DATA_DIR`과 `--namespace`로 완전히 격리된 `.od/`-스타일 트리를 받습니다. Playwright, 베타 채널, 실제 작업 프로젝트가 SQLite 파일을 공유하는 일은 절대 없습니다.

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
| Skill | 독점 | 12개 커스텀 TS 모듈 + `SKILL.md` | **31개 파일 기반 [`SKILL.md`][skill] 번들, 드롭 가능** |
| 디자인 시스템 | 독점 | `DESIGN.md`(v0.2 로드맵) | **`DESIGN.md` × 72개 시스템 기본 제공** |
| 프로바이더 유연성 | Anthropic 전용 | [`pi-ai`][piai]를 통해 7+ | **15개 CLI 어댑터 + OpenAI 호환 BYOK 프록시** |
| 초기화 질문 폼 | ❌ | ❌ | **✅ 하드 규칙, turn 1** |
| 방향 선택기 | ❌ | ❌ | **✅ 5가지 결정론적 방향** |
| 실시간 할 일 진행 + 도구 스트림 | ❌ | ✅ | **✅** (open-codesign의 UX 패턴) |
| 샌드박스 iframe 미리보기 | ❌ | ✅ | **✅** (open-codesign의 패턴) |
| Claude Design ZIP 임포트 | n/a | ❌ | **✅ `POST /api/import/claude-design` — Anthropic이 멈춘 곳에서 그대로 이어서** |
| 코멘트 모드 수술적 편집 | ❌ | ✅ | 🚧 로드맵(open-codesign에서 이식) |
| AI 제안 트윅 패널 | ❌ | ✅ | 🟡 부분 — [`tweaks` skill](skills/tweaks/) 출시, 채팅 통합 패널 UX는 로드맵 |
| 파일시스템급 워크스페이스 | ❌ | 부분(Electron 샌드박스) | **✅ 실제 cwd, 실제 도구, SQLite 영구 저장(projects · conversations · messages · tabs · templates)** |
| 5차원 자기 검토 | ❌ | ❌ | **✅ 내보내기 전 게이트** |
| Artifact lint | ❌ | ❌ | **✅ `POST /api/artifacts/lint` — findings를 에이전트로 다시 피드** |
| Sidecar IPC + 헤드리스 데스크탑 | ❌ | ❌ | **✅ 스탬프된 프로세스 + `tools-dev inspect desktop status \| eval \| screenshot`** |
| 내보내기 형식 | 제한됨 | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX(에이전트 주도) / ZIP / Markdown** |
| PPT skill 재사용 | N/A | 내장 | **[`guizang-ppt-skill`][guizang] 드롭인(덱 모드 기본)** |
| 최소 청구 | Pro / Max / Team | BYOK | **BYOK — 임의의 OpenAI 호환 `baseUrl` 붙여넣기** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/mariozechner/pi-ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## 지원하는 코딩 에이전트

daemon 부팅 시 `PATH`에서 자동 감지됩니다. 설정 필요 없음. 스트리밍 디스패치 로직은 [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts)의 `AGENT_DEFS`에 있고, CLI별 파서도 같은 디렉터리에 있습니다. 모델 목록은 `<bin> --list-models` / `<bin> models` / ACP 핸드셰이크로 탐지하거나, CLI가 목록을 노출하지 않을 때 큐레이션된 폴백을 사용합니다.

| 에이전트 | 바이너리 | 스트리밍 형식 | argv 형태(합성된 prompt 경로) |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `claude-stream-json`(타입 이벤트) | `claude -p <prompt> --output-format stream-json --verbose [--include-partial-messages] [--add-dir …] --permission-mode bypassPermissions` |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `json-event-stream` + `codex` 파서 | `codex exec --json --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true [-C cwd] [--model …] [-c model_reasoning_effort=…]`(prompt는 stdin) |
| Devin for Terminal | `devin` | `acp-json-rpc` | `devin --permission-mode dangerous --respect-workspace-trust false acp` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | `json-event-stream` + `gemini` 파서 | `GEMINI_CLI_TRUST_WORKSPACE=true gemini --output-format stream-json --yolo [--model …]`(prompt는 stdin) |
| [OpenCode](https://opencode.ai/) | `opencode` | `json-event-stream` + `opencode` 파서 | `opencode run --format json --dangerously-skip-permissions [--model …] -`(prompt는 stdin) |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | `json-event-stream` + `cursor-agent` 파서 | `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust [--workspace cwd] [--model …] -`(prompt는 stdin) |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | `plain`(원시 stdout 청크) | `qwen --yolo [--model …] -`(prompt는 stdin) |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `copilot-stream-json`(타입 이벤트) | `copilot -p <prompt> --allow-all-tools --output-format json [--model …] [--add-dir …]` |
| [Hermes](https://github.com/eqlabs/hermes) | `hermes` | `acp-json-rpc`(Agent Client Protocol) | `hermes acp --accept-hooks` |
| Kimi CLI | `kimi` | `acp-json-rpc` | `kimi acp` |
| [Pi](https://github.com/mariozechner/pi-ai) | `pi` | `pi-rpc`(stdio JSON-RPC) | `pi --mode rpc [--model …] [--thinking …]`(prompt는 RPC `prompt` 명령으로 전송) |
| [Kiro CLI](https://kiro.dev) | `kiro-cli` | `acp-json-rpc` | `kiro-cli acp` |
| Kilo | `kilo` | `acp-json-rpc` | `kilo acp` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | `vibe-acp` | `acp-json-rpc` | `vibe-acp` |
| DeepSeek TUI | `deepseek` | `plain`(원시 stdout 청크) | `deepseek exec --auto [--model …] <prompt>`(prompt는 위치 인수) |
| **멀티 프로바이더 BYOK** | n/a | SSE 정규화 | `POST /api/proxy/{anthropic,openai,azure,google}/stream` → Anthropic / OpenAI 호환 / Azure OpenAI / Gemini; loopback / link-local / RFC1918에 대한 SSRF 차단 |

새 CLI 추가는 [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts)에 항목 하나 추가하는 것입니다. 스트리밍 형식은 `claude-stream-json`, `copilot-stream-json`, `json-event-stream`(CLI별 `eventParser`와 함께), `acp-json-rpc`, `pi-rpc`, `plain` 중 하나입니다.

## 참조 및 계보

이 저장소가 차용한 모든 외부 프로젝트. 각 링크는 출처로 이동하여 계보를 확인할 수 있습니다.

| 프로젝트 | 역할 |
|---|---|
| [`Claude Design`][cd] | 이 저장소가 오픈소스 대안을 제공하는 클로즈드 소스 제품. |
| [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) | 디자인 철학 핵심. Junior-Designer 워크플로, 5단계 브랜드 에셋 프로토콜, anti-AI-slop 체크리스트, 5차원 자기 검토, 그리고 방향 선택기 뒤의 "5가지 학파 × 20가지 디자인 철학" 라이브러리 — 모두 [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts)와 [`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts)에 녹아들었습니다. |
| [**`op7418/guizang-ppt-skill`**][guizang] | [`skills/guizang-ppt/`](skills/guizang-ppt/) 아래에 원본 그대로 번들된 Magazine-web-PPT skill, 원 LICENSE 보존. 덱 모드 기본. P0/P1/P2 체크리스트 문화는 다른 모든 skill에도 차용됩니다. |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | Daemon + 어댑터 아키텍처. PATH 스캔 에이전트 감지, 단일 특권 프로세스로서의 로컬 daemon, 에이전트-동료 세계관. 모델을 채용했지만 코드는 vendor하지 않습니다. |
| [**`OpenCoworkAI/open-codesign`**][ocod] | 최초의 오픈소스 Claude-Design 대안이자 가장 가까운 동류. 채택된 UX 패턴: 스트리밍 아티팩트 루프, 샌드박스 iframe 미리보기(React 18 + Babel 내장), 실시간 에이전트 패널(todos + tool calls + 중단 가능), 5가지 내보내기 형식(HTML/PDF/PPTX/ZIP/Markdown), 로컬 우선 designs 허브, `SKILL.md` 취향 주입. 로드맵의 UX 패턴: 코멘트 모드 수술적 편집, AI 제안 트윅 패널. **[`pi-ai`][piai]는 의도적으로 vendor하지 않습니다** — open-codesign은 이를 에이전트 런타임으로 번들링하지만 우리는 사용자가 이미 가진 CLI에 위임합니다. |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | 9섹션 `DESIGN.md` 스키마의 출처이자 [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts)를 통해 가져온 69개 제품 시스템. |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | 여러 에이전트 CLI에 걸친 심링크 기반 skill 배포의 영감. |
| [Claude Code skills][skill] | 원본 그대로 채택된 `SKILL.md` 규약 — 모든 Claude Code skill이 `skills/`에 드롭되면 daemon이 감지합니다. |

각각에서 무엇을 채용하고 의도적으로 채용하지 않았는지에 대한 장문의 계보 작성 → [`docs/references.md`](docs/references.md).

## 로드맵

- [x] Daemon + 에이전트 감지(15개 CLI 어댑터) + skill 레지스트리 + 디자인 시스템 카탈로그
- [x] 웹앱 + 채팅 + 질문 폼 + 5가지 방향 선택기 + 할 일 진행 + 샌드박스 미리보기
- [x] 31개 skill + 72개 디자인 시스템 + 5가지 시각적 방향 + 5개 기기 프레임
- [x] SQLite 기반 projects · conversations · messages · tabs · templates
- [x] OpenAI 호환 BYOK 프록시(`/api/proxy/stream`) + SSRF 차단
- [x] Claude Design ZIP 임포트(`/api/import/claude-design`)
- [x] Sidecar 프로토콜 + Electron 데스크탑 + IPC 자동화(STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN)
- [x] Artifact lint API + 5차원 자기 검토 내보내기 전 게이트
- [ ] 코멘트 모드 수술적 편집(요소 클릭 → 지시 → 패치) — [`open-codesign`][ocod]에서 가져온 패턴
- [ ] AI 제안 트윅 패널 UX — 빌딩 블록([`tweaks` skill](skills/tweaks/))은 출시, 채팅 통합 패널은 미완
- [ ] Vercel + 터널 배포 레시피(Topology B)
- [ ] `DESIGN.md`로 프로젝트를 스캐폴딩하는 원클릭 `npx od init`
- [ ] Skill 마켓플레이스(`od skills install <github-repo>`)와 `od skill add | list | remove | test` CLI 표면([`docs/skills-protocol.md`](docs/skills-protocol.md)에 초안 작성됨, 구현 미완)
- [x] `apps/packaged/`에서 패키지된 Electron 빌드 — macOS (Apple Silicon) 및 Windows (x64) 다운로드는 [open-design.ai](https://open-design.ai/)와 [GitHub 릴리스 페이지](https://github.com/nexu-io/open-design/releases)에서 제공

단계별 배포 → [`docs/roadmap.md`](docs/roadmap.md).

## 상태

이것은 초기 구현입니다 — 닫힌 루프(감지 → skill + 디자인 시스템 선택 → 채팅 → `<artifact>` 파싱 → 미리보기 → 저장)가 end-to-end로 실행됩니다. 프롬프트 스택과 skill 라이브러리가 대부분의 가치가 있으며, 안정적입니다. 컴포넌트 수준 UI는 매일 배포되고 있습니다.

## 스타 주세요

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="GitHub에서 Open Design에 스타 주기 — github.com/nexu-io/open-design" width="100%" /></a>
</p>

이것이 30분을 절약해줬다면 — ★를 주세요. 스타가 사용료를 대신 내지는 않지만, 다음 디자이너, 에이전트, 기여자에게 이 실험이 그들의 관심을 받을 가치가 있다는 것을 알려줍니다. 한 번의 클릭, 3초, 진짜 신호: [github.com/nexu-io/open-design](https://github.com/nexu-io/open-design).

## 기여

이슈, PR, 새로운 skill, 새로운 디자인 시스템 모두 환영합니다. 가장 레버리지가 높은 기여는 보통 폴더 하나, Markdown 파일 하나, 또는 PR 크기의 어댑터입니다:

- **skill 추가** — [`SKILL.md`][skill] 규약을 따르는 폴더를 [`skills/`](skills/)에 드롭하세요.
- **디자인 시스템 추가** — 9섹션 스키마를 사용하여 [`design-systems/<brand>/`](design-systems/)에 `DESIGN.md`를 드롭하세요.
- **새 코딩 에이전트 CLI 연결** — [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts)에 항목 하나 추가.

전체 설명, 병합 기준, 코드 스타일, 받지 않는 것 → [`CONTRIBUTING.md`](CONTRIBUTING.md) ([Deutsch](CONTRIBUTING.de.md), [Français](CONTRIBUTING.fr.md), [简体中文](CONTRIBUTING.zh-CN.md)).

## 컨트리뷰터

Open Design을 앞으로 나아가게 도와준 모든 분께 감사드립니다 — 코드, 문서, 피드백, 새 skill, 새 디자인 시스템, 또는 날카로운 이슈 하나라도. 모든 진짜 기여가 의미 있고, 아래의 벽이 가장 직접적인 "감사합니다"입니다.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&cache_bust=2026-05-06" alt="Open Design 컨트리뷰터" />
</a>

첫 PR을 보냈다면 — 환영합니다. [`good-first-issue`/`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22%2C%22help+wanted%22) 레이블이 시작점입니다.

## 저장소 활동

<picture>
  <img alt="Open Design — 저장소 지표" src="docs/assets/github-metrics.svg" />
</picture>

위의 SVG는 [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml)이 [`lowlighter/metrics`](https://github.com/lowlighter/metrics)를 사용해 매일 자동으로 다시 생성합니다. 즉시 새로 고치려면 **Actions** 탭에서 수동 트리거하세요; 더 풍부한 플러그인(traffic, follow-up time 등)을 켜려면 저장소 secrets에 fine-grained PAT를 `METRICS_TOKEN`이라는 이름으로 추가하세요.

## Star History

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-06" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-06" />
    <img alt="Open Design star history" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-06" />
  </picture>
</a>

곡선이 위로 휘면 — 그것이 우리가 찾는 신호입니다. ★를 눌러 위로 밀어주세요.

## 크레딧 / Credits

마스터 [`skills/html-ppt/`](skills/html-ppt/) skill과 [`skills/html-ppt-*/`](skills/) 아래의 15개 per-template wrapper(15개 full-deck 템플릿, 36개 테마, 31개 single-page 레이아웃, 27개 CSS 애니메이션 + 20개 canvas FX, 키보드 runtime, 자석식 카드 presenter mode 포함)는 오픈소스 프로젝트 [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)(MIT)에서 통합되었습니다. 원본 LICENSE는 [`skills/html-ppt/LICENSE`](skills/html-ppt/LICENSE)에 보존되어 있고 저작권 표시는 [@lewislulu](https://github.com/lewislulu)에게 있습니다. 각 per-template Examples 카드(`html-ppt-pitch-deck`, `html-ppt-tech-sharing`, `html-ppt-presenter-mode`, `html-ppt-xhs-post` …)는 authoring 가이드를 마스터 skill에 위임하므로, **Use this prompt** 클릭 시 업스트림과 동일한 prompt → 출력 동작이 그대로 보존됩니다.

[`skills/guizang-ppt/`](skills/guizang-ppt/) 매거진/가로 스와이프 deck flow는 [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill)(MIT)에서 통합되었으며, 저작권 표시는 [@op7418](https://github.com/op7418)에게 있습니다.

## 라이선스

Apache-2.0. 번들된 `skills/guizang-ppt/`는 원래 [LICENSE](skills/guizang-ppt/LICENSE)(MIT)와 [op7418](https://github.com/op7418)에 대한 저작권 표시를 유지합니다. 번들된 `skills/html-ppt/`는 원래 [LICENSE](skills/html-ppt/LICENSE)(MIT)와 [lewislulu](https://github.com/lewislulu)에 대한 저작권 표시를 유지합니다.
