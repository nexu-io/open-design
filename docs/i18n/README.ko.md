<h1 align="center">Open Design: 오픈소스 Claude Design 대안</h1>

> 🔥 **Open Design 0.10.0 출시: 올인원 Agentic 디자인 워크스페이스.** 디자인의 모든 과정이 이제 하나의 창 안에서 이루어집니다 — 막연한 아이디어에서 출발해 레퍼런스 발견, 소재 수집, 인터랙티브 편집, 코멘트 큐잉, 모션 다듬기, 그리고 에디터나 Code Agent로의 인계까지, 앱을 떠나지 않고 완성하세요. 여러 세션을 병렬로 실행하면, 더 이상 한 명의 어시스턴트가 아니라 당신을 위해 일하는 로컬 디자인 팀처럼 느껴집니다. [0.10.0 다운로드](https://github.com/nexu-io/open-design/releases) · [토론 참여하기](https://github.com/nexu-io/open-design/discussions/4153)
>
> ⚡ **Open Design AMR (Agentic Model Router) — 공식 모델 서비스.** 한 번의 충전으로 Open Design 안에서 GPT, Claude, Gemini, DeepSeek를 바로 사용하세요. 20+ 플래그십 모델, 무설정, 실제 토큰 사용량 기반 과금. [AMR 사용해 보기](https://open-design.ai/amr/)
>
> 🏅 **Open Design Fellow 프로그램이 지금 열렸습니다.** 디자인은 열려 있어야 한다고 믿으신다면 — Open Design Fellow가 되어 핵심 팀과 함께 제품을 빚어내고, 더 많은 사람이 디자인의 미래를 정의하는 일에 참여하도록 도와주세요. 자세히 → [`MAINTAINERS.md`](../../MAINTAINERS.md) 및 [Discord](https://discord.gg/qhbcCH8Am4).

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/hero.png" alt="Open Design — The open-source Claude Design alternative · 150 Design Systems · 261 Plugins · 21 Coding Agents · 14 Media Providers" width="100%" />
</p>

<p align="center">
  <a href="https://open-design.ai/">웹사이트</a> ·
  <a href="https://open-design.ai/">다운로드</a> ·
  <a href="https://open-design.ai/amr/">Model Router</a> ·
  <a href="https://discord.gg/qhbcCH8Am4">Discord</a> ·
  <a href="https://x.com/nexudotio">@nexudotio 팔로우</a>
</p>

<p align="center">
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="../../LICENSE"><img alt="license" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="discord" src="https://img.shields.io/discord/1479002485040480266?style=flat&logo=discord&logoColor=white&label=discord&color=5865F2&cacheSeconds=3600" /></a>
  <a href="QUICKSTART.ko.md"><img alt="quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat" /></a>
</p>

<p align="center"><a href="../../README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <b>한국어</b> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a></p>

---

## Open Design란

🎨 **로컬 우선의 오픈소스 [Claude Design][cd] 대안.** &nbsp;🖥️ **macOS와 Windows용 네이티브 데스크톱 앱.** &nbsp;⚡ **100개 이상의 스킬** · ✨ **150개의 브랜드급 `DESIGN.md` 시스템** · 📦 **바로 쓸 수 있는 261개의 플러그인.** &nbsp;🖼️ **웹 · 데스크톱 · 모바일 프로토타입**, **라이브 대시보드 / 아티팩트**, **덱**, **이미지**, **비디오**, 그리고 **HyperFrames** 모션 그래픽을 생성합니다. 🔒 샌드박스 iframe 미리보기 · HTML / PDF / PPTX / MP4 내보내기. &nbsp;🤖 **Claude Code · OpenClaw · Codex · Cursor · OpenCode · Qwen · Copilot · Hermes · Kimi · Antigravity 및 21개의 로컬 CLI에서 실행**되며, BYOK를 통해 OpenAI 호환 엔드포인트라면 무엇이든 사용할 수 있습니다.

Open Design는 Anthropic이 Claude Design과 함께 선보인 **에이전트 네이티브** 루프 — 브리프를 파악하고, 방향을 확정하고, 아티팩트를 스트리밍하고, 비평하고, 전달하는 그 흐름 — 이 더 이상 닫혀 있지 않고, 노트북에 이미 있는 코딩 에이전트가 읽고 쓰고 리믹스할 수 있는 **스킬 · 디자인 시스템 · 플러그인의 파일시스템**이 될 때 얻게 되는 결과물입니다. CLI는 디자인 엔진이 되고, 노트북은 스튜디오가 되며, 팀의 `DESIGN.md`는 브랜드 계약서가 됩니다.

또한 이것은 **에이전트 시대를 위한 Figma 대안**입니다 — 캔버스 위에서 픽셀을 밀어 옮기는 대신, 실제 CSS, 실제 폰트, 실제 컴포넌트로 된 단일 페이지 아티팩트를 HTML / PDF / PPTX / MP4로 곧바로 내보내 전달합니다 — 이미 당신의 디자인 시스템으로 빚어졌고, 이미 당신이 매일 쓰는 에이전트 안에서 실행 가능한 상태로요.

[cd]: https://x.com/claudeai/status/2045156267690213649

---

## 제품 둘러보기

Open Design가 무엇이고 무엇을 하는지 빠르게 살펴봅니다. **Home**에서 시작해 **Automation**으로 반복 워크플로를 조율하고, **Design System**에서 브랜드 계약을 정제하며, **Plugins**와 **통합**으로 확장하세요. 어떤 프로젝트의 **Studio** 안에서든 동일한 디자인 시스템이 프로토타입, 라이브 아티팩트, HyperFrames, 덱, 이미지를 스트리밍해 냅니다.

### 핵심 페이지

<table>
<tr>
<td valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/home.png" alt="Home page" /><br/>
<sub><b>Home</b> — 개요 진입점. 스킬과 디자인 시스템을 고르고, 브리프를 입력한 뒤, 한곳에서 모든 것을 시작하세요.</sub>
</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/automation.png" alt="Automation page" /><br/>
<sub><b>Automation</b> — 반복적인 디자인 워크플로를 재사용 가능하고 예약 가능한 자동화로 조율합니다.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/design-system.png" alt="Design System page" /><br/>
<sub><b>Design System</b> — 팀의 <code>DESIGN.md</code>를 모든 출력물을 빚어내는 브랜드 계약으로 정제합니다.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/plugin.png" alt="Plugin page" /><br/>
<sub><b>Plugin</b> — 워크플로 플러그인을 둘러보고, 설치하고, 배포하여 필요에 따라 생성 기능을 확장합니다.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/integrations.png" alt="Integrations page" /><br/>
<sub><b>Integrations</b> — 외부 시스템과 MCP 도구를 연결하고, 어떤 IDE, 스크립트, 자동화에서든 Open Design를 사용합니다.</sub>
</td>
</tr>
</table>

### Studio — 한 프로젝트 안의 다양한 아티팩트 유형

프로젝트의 Studio 안에서는 동일한 디자인 시스템이 여러 아티팩트 유형을 스트리밍해 냅니다:

<table>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-prototype.png" alt="Prototype" /><br/>
<sub><b>Prototype</b> — 당신의 디자인 시스템을 읽어 샌드박스 iframe에 렌더링되는 단일 페이지 HTML 아티팩트로, 즉시 미리보고 소스로 다운로드할 수 있습니다.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-hyperframe.png" alt="HyperFrame" /><br/>
<sub><b>HyperFrame</b> — 프로그래밍 방식의 모션과 애니메이션 그래픽으로, 실제 MP4(예: 1920×1080 · 30fps)로 렌더링됩니다.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-ppt.png" alt="Deck" /><br/>
<sub><b>Deck</b> — 한 장씩 넘겨 보고, 키보드로 탐색하며, PPTX / PDF로 내보낼 수 있는 피치 덱입니다.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-image.png" alt="Image" /><br/>
<sub><b>Image</b> — 고해상도 생성과 다운로드를 지원하는 브랜드급 이미지와 비주얼 에셋입니다.</sub>
</td>
</tr>
</table>

---

## 플랫폼 호환성

> Open Design는 주류 코딩 에이전트가 네이티브로 사용하는 **스킬, CLI, MCP 서버**로 제공됩니다. OD를 설치한 뒤 `od mcp install <agent>` 한 번이면 MCP 서버가 해당 에이전트의 설정에 연결되고, 어떤 에이전트 안에서든 동일한 도구를 호출할 수 있습니다.

| 코딩 에이전트 / 플랫폼 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | 상태 &nbsp;&nbsp; | 한 줄 MCP 서버 설치 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; |
|---|:---:|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | ✅ 지원됨 | `od mcp install claude` |
| [Codex CLI](https://github.com/openai/codex) | ✅ 지원됨 | `od mcp install codex` |
| [Cursor](https://www.cursor.com/cli) | ✅ 지원됨 | `od mcp install cursor` |
| [VS Code + GitHub Copilot](https://github.com/features/copilot) | ✅ 지원됨 | `od mcp install copilot` |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | ✅ 지원됨 | `od mcp install copilot` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | ✅ 지원됨 | `od mcp install gemini` |
| [OpenCode](https://opencode.ai/) | ✅ 지원됨 | `od mcp install opencode` |
| [OpenClaw](https://github.com/openclaw/openclaw) | ✅ 지원됨 | `od mcp install openclaw` |
| [Antigravity](https://antigravity.google) | ✅ 지원됨 | `od mcp install antigravity` |
| [Cline](https://github.com/cline/cline) | ✅ 지원됨 | `od mcp install cline` |
| [Trae](https://www.trae.ai/) | ✅ 지원됨 | `od mcp install trae` |
| [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) | ✅ 지원됨 | `od mcp install kimi` |
| [Pi Agent](https://github.com/badlogic/pi-mono) | ✅ 지원됨 | `od mcp install pi` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | ✅ 지원됨 | `od mcp install vibe` |
| [Hermes Agent](https://github.com/nousresearch/hermes-agent) | ✅ 지원됨 | `od mcp install hermes` |

`od mcp install <agent> --print`로 드라이런 미리보기 · `--uninstall`로 제거 · 전체 목록은 `od mcp install --help`로 확인.

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/coding-agents.png" alt="The 21 coding-agent CLIs Open Design supports — Claude Code · Codex · OpenCode · Hermes · Antigravity · Gemini · Grok Build · Kimi · Cursor Agent · Qwen · Qoder · GitHub Copilot · Pi · Kiro · Kilo · Mistral Vibe · DeepSeek · Reasonix · Aider · Devin · Trae" width="100%" />
</p>

**CLI를 설치하지 않았다고요?** `POST /api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream`의 BYOK 프록시가 동일한 루프(프로세스 스폰 없이)를 제공합니다 — `baseUrl` + `apiKey` + `model`을 붙여넣기만 하면 되며, OpenAI, Anthropic, Azure OpenAI, Google Gemini, Ollama, LM Studio, vLLM 또는 OpenAI 호환 엔드포인트라면 무엇이든 지원합니다. 대상별 SSRF 보호가 데몬 경계에서 내부 IP / 링크 로컬 / CGNAT를 차단합니다.

어댑터 계약과 스트림 파서는 [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts)에 있습니다. 새 CLI를 추가하는 일은 항목 하나면 됩니다 — [`docs/agent-adapters.md`](../../docs/agent-adapters.md)를 참고하세요.

---

## 데모

네 가지 핵심 제품 카테고리 모두, 당신의 노트북에서 실행되는 코딩 에이전트가 렌더링한 것입니다. 썸네일을 클릭하면 실제 예시를 볼 수 있습니다.

### 1 · 프로토타입 — 웹 · 데스크톱 · 모바일

기본 출력 표면입니다. 당신의 `DESIGN.md`를 읽어 샌드박스 iframe에 렌더링되는 단일 페이지 HTML 아티팩트입니다.

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/01-entry-view.png" alt="Entry view" /><br/>
<sub><b>Entry view</b> — 스킬을 고르고, 디자인 시스템을 고르고, 브리프를 입력합니다. 프로토타입, 대시보드, 덱, 모바일 앱, 매거진 페이지를 위한 하나의 표면입니다.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/mobile-onboarding.png" alt="Mobile onboarding" /><br/>
<sub><b>모바일 프로토타입</b> — 픽셀 단위로 정확한 iPhone 15 Pro 크롬과 다중 화면 흐름. 에이전트는 폰 프레임을 다시 그리는 법이 없으며, 공유 디바이스 프레임은 <code>assets/frames/</code>에 있습니다.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/dating-web.png" alt="Web prototype dating-web" /><br/>
<sub><b>웹 프로토타입</b> — 스크롤바, KPI, 차트가 있는 에디토리얼 대시보드. <code>design-templates/dating-web/</code>에서 곧바로 렌더링됩니다.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/gamified-app.png" alt="Gamified app" /><br/>
<sub><b>모바일 앱 프로토타입</b> — XP 리본과 퀘스트 상세가 있는 3화면 게임화 흐름. Cursor / Codex / Claude Code로 곧바로 넘겨 React/Next/Vue로 전환하세요.</sub>
</td>
</tr>
</table>

### 2 · 라이브 아티팩트 & 대시보드

라이브 대시보드, 디시전 룸, KPI 월 — tweaks 패널을 통해 데이터를 가져오고 그 자리에서 편집 가능한 상태를 유지하는 단일 페이지 아티팩트입니다.

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/live-dashboard.png" alt="Live dashboard" /><br/>
<sub><b>라이브 대시보드</b> — tweaks 패널이 조정할 만한 가치가 있는 파라미터를 드러내는 편집 가능한 KPI 월. 에이전트가 매니페스트를 내보내면 iframe이 새로고침 없이 다시 렌더링됩니다.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/research-decision-room.png" alt="Decision room" /><br/>
<sub><b>디시전 룸</b> — 제품 / 리서치 / 운영 회의를 위한 다중 소스 브리핑 아티팩트.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/github-dashboard.png" alt="GitHub dashboard" /><br/>
<sub><b>GitHub 스타일 대시보드</b> — 라이브 아티팩트로 표현된 저장소 지표.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/flowai-live-dashboard-template.png" alt="Flow live dashboard" /><br/>
<sub><b>Flow 라이브 대시보드 템플릿</b> — 활성 <code>DESIGN.md</code>를 통해 브랜딩된 도메인 특화 KPI 템플릿.</sub>
</td>
</tr>
</table>

### 3 · 덱 — 매거진 덱, 주간 업데이트, 피치

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/07-magazine-deck.png" alt="Magazine deck (guizang-ppt)" /><br/>
<sub><b>Deck 모드 (guizang-ppt)</b> — 매거진 레이아웃, WebGL 히어로, P0/P1/P2 체크리스트. <a href="https://github.com/op7418/guizang-ppt-skill"><code>op7418/guizang-ppt-skill</code></a>에서 원본 라이선스를 그대로 보존한 채 똑같이 번들로 제공됩니다.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/deck-swiss-international.png" alt="Swiss deck" /><br/>
<sub><b>Swiss International 스타일 덱</b> — 그리드에 고정되고 모노크롬 강조색을 쓴 디자인. <code>design-templates/html-ppt-*/</code> 아래의 <b>15개 덱 템플릿</b>과 <b>36개 테마</b> 중 하나입니다.</sub>
</td>
</tr>
</table>

모든 덱은 **HTML**(단일 파일, 에셋 인라인), **PDF**(브라우저 인쇄, 덱 인식), **PPTX**(에이전트 기반 스킬), **ZIP**(아카이브), 또는 **Markdown**으로 내보낼 수 있습니다.

### 4 · 이미지 — `gpt-image-2`, ImageRouter, 커스텀 API

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated city food map" /><br/><sub><b>일러스트 도시 푸드 맵</b><br/>손으로 그린 에디토리얼 여행 포스터</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic elevator scene" /><br/><sub><b>시네마틱 엘리베이터 장면</b><br/>단일 프레임 에디토리얼 스틸</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk anime portrait" /><br/><sub><b>사이버펑크 인물</b><br/>프로필 아바타 — 네온 얼굴 텍스트</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D stone staircase evolution" /><br/><sub><b>3D 돌계단</b><br/>깎은 돌 인포그래픽</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous portrait" /><br/><sub><b>화려한 인물</b><br/>에디토리얼 스튜디오 촬영</sub></td>
</tr>
</table>

**바로 복제할 수 있는 93개의 프롬프트**가 [`prompt-templates/`](../../prompt-templates/)에 있습니다 — 미리보기 썸네일, 전체 프롬프트 본문, 대상 모델, 화면 비율, 출처 표기 포함. 한 번의 클릭으로 브리프가 컴포저에 들어갑니다.

### 5 · 비디오 & HyperFrames — 에이전트 네이티브 모션 그래픽

**[HyperFrames][hyperframes]**는 HeyGen의 오픈소스, 에이전트 네이티브 비디오 프레임워크로, Open Design에 일급 시민으로 통합되어 있습니다. 에이전트가 HTML + CSS + GSAP를 작성하면 HyperFrames가 헤드리스 Chrome + FFmpeg를 통해 결정론적 MP4로 렌더링합니다. 시네마틱 t2v / i2v를 위한 **Seedance 2.0**, 라우팅된 모델 변형을 위한 **Veo 3 / Sora 2 / Kling 2**, 오디오 레이어를 위한 **Suno v5 / Lyria 2**와 함께 사용하세요.

<table>
<tr>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>30초 SaaS 제품 프로모</b> · 16:9 · UI 3D 리빌</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>TikTok 노래방 토킹헤드</b> · 9:16 · TTS + 단어 동기화 자막</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle reel" /></a><br/><sub><b>30초 브랜드 시즐 릴</b> · 16:9 · 오디오 반응형 키네틱 타입</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Bar chart race" /></a><br/><sub><b>막대 차트 레이스</b> · 16:9 · NYT 스타일 데이터 인포그래픽</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>비행 경로 맵</b> · 16:9 · Apple 스타일 경로 리빌</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>4초 시네마틱 로고 아웃트로</b> · 16:9 · 조각별 조립 + 블룸</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>$0 → $10K 머니 카운터</b> · 9:16 · Apple 스타일 하이프</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>웹사이트 투 비디오</b> · 16:9 · 3개 뷰포트에서 사이트를 캡처</sub></td>
</tr>
</table>

11개의 HyperFrames 템플릿 + 39개의 Seedance 프롬프트가 저장소와 함께 제공됩니다. 카탈로그 썸네일 © HeyGen; 프레임워크는 Apache-2.0입니다. OD 특화 렌더 워크플로(컴포지션 캐시, sandbox-exec 우회, MP4-as-chip)는 [`design-templates/hyperframes/`](../../design-templates/hyperframes/)에 자세히 설명되어 있습니다.

[hyperframes]: https://github.com/heygen-com/hyperframes

---

## 왜 Open Design인가

> **2026년 4월, Anthropic은 [Claude Design][cd]을 출시했습니다 — LLM이 산문 작성을 멈추고 디자인 아티팩트를 직접 전달하기 시작한 최초의 순간이었습니다.** 그것은 입소문을 탔습니다. 그러나 그것은 닫힌 소스로, 유료 전용으로, 클라우드 전용으로 머물렀고, Anthropic의 모델, Anthropic의 스킬, Anthropic의 표면에 묶여 있었습니다. 결제도, 셀프 호스트도, Vercel 배포도, 자신의 에이전트로 교체하는 것도 없었습니다.

Open Design(OD)는 그 오픈소스 대안입니다. 같은 루프, 같은 아티팩트 우선의 사고방식, 잠금은 전혀 없이:

- 🤖 **에이전트 네이티브, 모델에 구애받지 않음.** 우리는 에이전트를 제공하지 않습니다. 이미 당신의 `PATH`에 있는 `claude` / `codex` / `cursor-agent` / `copilot` / `hermes` / `kimi`가 디자인 엔진입니다. 한 번의 클릭으로 교체하세요.
- 🧠 **기본부터 브랜드급.** 모든 렌더는 활성 `DESIGN.md`를 읽습니다 — 팔레트, 타이포그래피, 간격, 모션, 보이스, 안티패턴을 다루는 9개 섹션 스키마입니다. 150개 시스템이 저장소와 함께 제공됩니다(Linear, Stripe, Vercel, Airbnb, Apple, Tesla, Notion, Anthropic, Cursor, Supabase, Figma…). 폴더 하나만 넣으면 피커가 찾아냅니다.
- 🖥️ **로컬 우선, 모든 계층에서 BYOK.** 네이티브 데스크톱 앱은 클라우드 왕복 없이 로컬 우선을 유지합니다. daemon 데이터 경로를 설명하기 전에 반드시 루트 `AGENTS.md`의 **Daemon data directory contract**를 읽어야 합니다.
- 🌍 **세 가지 평면에서 조합 가능.** **플러그인**은 실행 가능한 워크플로를 담고 · **스킬**은 에이전트의 디자인 감각을 담으며 · **디자인 시스템**은 브랜드를 담습니다. 세 가지 모두 누구나 작성하고, 버전 관리하고, 게시할 수 있는 평범한 파일입니다.
- 🔁 **기존 코드베이스를 새롭게.** `git` 저장소 + `DESIGN.md`를 에이전트에 넘기면 당신의 실제 컴포넌트를 브랜드 사양에 맞게 리팩터링합니다. 전용 플러그인이 Figma / Pencil 워크플로를 React / Next.js / Vue 코드로 마이그레이션합니다.
- 🔒 **신념에 기반한 프라이버시.** 모든 것은 당신의 데이터가 있는 곳에서 실행됩니다 — 당신의 노트북, 당신 팀의 서버, 당신의 Vercel 프로젝트. 네트워크가 필요할 때 BYOK 프록시는 SSRF로부터 보호됩니다.

### 비교

| | [Claude Design][cd] | Figma | Lovable / v0 / Bolt | **Open Design** |
|---|---|---|---|---|
| 오픈소스 | ❌ | ❌ | ❌ | **✅ Apache-2.0** |
| 셀프 호스트 / 데스크톱 | ❌ | ❌ | ❌ | **✅ macOS + Windows + Vercel** |
| 에이전트 네이티브(당신의 CLI에서 실행) | Anthropic 전용 | ❌ | 클라우드 에이전트 전용 | **✅ 21개 CLI + BYOK** |
| 브랜드급 `DESIGN.md` | 독점 | 테마 JSON | 제한적 토큰 | **✅ 150개 시스템 제공** |
| 스킬 / 플러그인 / 템플릿 | 비공개 | 플러그인 스토어 | 비공개 | **✅ 100개 이상 스킬 · 261개 플러그인** |
| HyperFrames (HTML→MP4) | ❌ | ❌ | ❌ | **✅ 일급 지원** |
| 기존 저장소를 브랜드에 맞게 새롭게 | ❌ | ❌ | ❌ | **✅ 에이전트 + `DESIGN.md`로** |
| 최소 결제 | Pro / Max / Team | Pro / Org | Pro / Team | **BYOK · 호환 엔드포인트라면 무엇이든** |

---

## 빠른 시작

### 🖥️ 데스크톱 앱 다운로드 (권장 — 설정 불필요)

Open Design를 사용하는 가장 빠른 방법입니다. Node도, pnpm도, 클론도 필요 없습니다.

- **macOS** (Apple Silicon · Intel x64) → [**open-design.ai**](https://open-design.ai/) 또는 [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Windows** (x64) → [**open-design.ai**](https://open-design.ai/) 또는 [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Linux** (AppImage, 선택적 레인) → [GitHub Releases](https://github.com/nexu-io/open-design/releases)

설치 후: 앱이 당신의 `PATH`에 있는 모든 코딩 에이전트 CLI를 자동으로 감지하고, 100개 이상의 스킬과 150개의 디자인 시스템을 불러오며, entry view에서 브리프를 입력할 수 있게 합니다.

### 🤖 코딩 에이전트에 설치 (UI 없이)

GUI를 한 번도 열지 않고도 Open Design를 사용할 수 있습니다 — Claude Code, Codex, Cursor, Copilot, OpenClaw, Antigravity, Hermes, Kimi 등의 내부에서 스킬, 플러그인, 또는 MCP 서버로 호출하세요.

```bash
# One-line install into the agent you're using:
curl -fsSL https://open-design.ai/install.sh | sh -s <agent>
# <agent> = claude | codex | cursor | copilot | openclaw | antigravity | gemini
#         | pi | vibe | hermes | cline | kimi | trae | opencode
```

그런 다음 에이전트 안에서:

```
> Use open-design to generate a landing page with the Linear design system
```

에이전트는 `skills/`를 읽고, 알맞은 `SKILL.md`를 고르고, 당신이 지정한 `DESIGN.md`를 바인딩한 뒤, `http://localhost:7456`에서 미리볼 수 있는 `<artifact>`를 내보냅니다.

### 🐳 Docker로 실행

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design/deploy
cp .env.example .env
echo "OD_API_TOKEN=$(openssl rand -hex 32)" >> .env
docker compose up -d
# open http://localhost:7456
```

### 🧑‍💻 소스에서 실행

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable && pnpm install
pnpm tools-dev run web
```

Node `~24`, pnpm `10.33.x`. Windows 사용자는 [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md)를 참고하세요. 전체 빠른 시작, 환경 변수, Nix flake, 패키징 빌드 흐름 → [`QUICKSTART.ko.md`](QUICKSTART.ko.md).

### 전체 워크플로 — 브리프에서 아티팩트까지

`brief → plugin → direction → design system → artifact → handoff → memory`

1. **PM이 브리프를 제출합니다.** 플러그인 피커가 랜딩 페이지 · 피치 덱 · 대시보드 · 소셜 포스트 · PM 스펙 · OKR 스코어카드… 를 제안합니다.
2. **디자이너(또는 에이전트)가 방향을 확정합니다.** 브랜드가 없나요? 엄선된 5가지 방향 중에서 고르세요. 브랜드가 있나요? 스크린샷 / URL을 넣으면 → 에이전트가 GitHub에 연결하고, Figma를 가져오고, 재사용 가능한 `DESIGN.md`로 코드화합니다.
3. **에이전트가 첫 `<artifact>`를 내보냅니다.** 플러그인 + 스킬 + `DESIGN.md`가 바인딩됩니다. 그것은 샌드박스 iframe으로 스트리밍되어 그 자리에서 편집 가능합니다 — "처음부터 다시 생성"이 아닙니다.
4. **엔지니어링으로 넘깁니다.** 아티팩트는 실제 HTML/CSS입니다 — Cursor, Codex, 또는 Claude Code에 넣어 코드로 계속 빌드하세요. 또는 PPTX / PDF / MP4를 마케팅으로 곧바로 내보내세요.
5. **Open Design는 사용할수록 더 똑똑해집니다.** 당신의 스크린샷, 폰트, 팔레트, 확정된 아티팩트가 다음 세션의 기본값으로 쌓입니다. 재작업도 줄고, 표류도 줄어듭니다.

---

## 코딩 에이전트에서 Open Design 사용하기

Open Design는 **stdio MCP 서버**와 에이전트별 **설치 스크립트**를 제공합니다. 다른 저장소에 있는 MCP 호환 에이전트라면 무엇이든 당신의 로컬 Open Design 프로젝트에서 파일을 직접 읽을 수 있습니다 — 토큰 CSS, JSX 컴포넌트, entry HTML — 이름으로 질의 가능한 구조화된 API로요. 에이전트는 언제나 오래된 내보내기가 아니라 살아 있는 파일을 봅니다.

```bash
# One-line install (16+ CLIs supported):
curl -fsSL https://open-design.ai/install.sh | sh -s <agent>

# Then the agent can:
od search-files "primary button"      # search files across projects
od get-file design-systems/linear-app/DESIGN.md
od get-artifact <slug>                # latest rendered artifact
od plugin run web-prototype --brief "..."
od skill list --scenario marketing
```

**왜 MCP인가?** 반복할 때마다 zip을 내보내고 다시 첨부하는 일은 흐름을 끊습니다. MCP는 디자인 소스를 직접 노출합니다 — 에이전트는 언제나 살아 있는 파일을 봅니다.

**처음부터 시작하는 에이전트라면,** 설치 프로그램이 `~/.config/<agent>/open-design.json`(또는 플랫폼에 해당하는 경로)과 복사해 붙여넣을 수 있는 MCP 스니펫을 배치합니다. Cursor는 원클릭 딥링크를, Claude Code는 `claude mcp add-json` 한 줄을, 그 외 모든 에이전트는 각자의 설정이 기대하는 스키마의 JSON을 받습니다. 전체 에이전트별 흐름 → 데스크톱 앱의 **Settings → MCP server**, 또는 [`docs/agent-adapters.md`](../../docs/agent-adapters.md).

**보안 모델.** 기본은 읽기 전용이며, 데몬은 `127.0.0.1`에 바인딩되고, SSRF는 프록시 경계에서 차단됩니다. LAN 노출에는 명시적인 `OD_BIND_HOST`와 `OD_ALLOWED_ORIGINS`가 필요합니다. 커넥터 자격 증명과 라이브 아티팩트 미리보기 경로는 어떤 경우에도 루프백 전용으로 유지됩니다.

---

## 스킬

**100개 이상의 스킬이 기본으로 제공됩니다** — 각각은 Claude Code [`SKILL.md`][skill] 관례를 따르는 [`skills/`](../../skills/) 아래의 폴더이며, `od:` 프론트매터(`mode`, `platform`, `scenario`, `preview.type`, `design_system.requires`, `default_for`, `fidelity`, `example_prompt`)로 확장되어 있습니다. 폴더 하나를 넣고 데몬을 재시작하면 피커에 나타납니다.

두 가지 **모드**가 카탈로그를 떠받칩니다: `prototype`(웹/모바일/데스크톱 단일 페이지 아티팩트)와 `deck`(가로 스와이프 프레젠테이션). 그 밖에도 `image`, `video`, `audio`, `template`, `design-system`, `utility` 모드가 있습니다. **`scenario`** 필드는 대상에 따라 그것들을 묶습니다: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`.

| 스킬 | 모드 | 시나리오 | 생성하는 것 |
|---|---|---|---|
| [`web-prototype`](../../design-templates/web-prototype/) | prototype | design | 기본 랜딩 페이지 / 히어로 |
| [`saas-landing`](../../design-templates/saas-landing/) | prototype | marketing | 히어로 / 기능 / 가격 / CTA |
| [`dashboard`](../../design-templates/dashboard/) | prototype | operation | 관리자 / 분석(사이드바 포함) |
| [`mobile-app`](../../design-templates/mobile-app/) | prototype | design | iPhone 15 Pro / Pixel 프레임 앱 |
| [`mobile-onboarding`](../../design-templates/mobile-onboarding/) | prototype | design | 스플래시 · 가치 제안 · 로그인 흐름 |
| [`social-carousel`](../../design-templates/social-carousel/) | prototype | marketing | 3카드 1080×1080 캐러셀 |
| [`email-marketing`](../../design-templates/email-marketing/) | prototype | marketing | 테이블 폴백 안전 브랜드 이메일 |
| [`magazine-poster`](../../design-templates/magazine-poster/) | prototype | marketing | 단일 페이지 매거진 레이아웃 |
| [`motion-frames`](../../design-templates/motion-frames/) | prototype | marketing | 반복되는 CSS 모션 히어로 |
| [`sprite-animation`](../../design-templates/sprite-animation/) | prototype | marketing | 8비트 픽셀 애니메이션 설명 |
| [`pm-spec`](../../design-templates/pm-spec/) | prototype | product | PM 스펙 문서(TOC + 결정 로그 포함) |
| [`team-okrs`](../../design-templates/team-okrs/) | prototype | product | OKR 스코어카드 |
| [`eng-runbook`](../../design-templates/eng-runbook/) | prototype | engineering | 인시던트 런북 |
| [`finance-report`](../../design-templates/finance-report/) | prototype | finance | 경영진 재무 요약 |
| [`hr-onboarding`](../../design-templates/hr-onboarding/) | prototype | hr | 직무 온보딩 계획 |
| [`guizang-ppt`](../../design-templates/guizang-ppt/) | deck | marketing | 매거진 스타일 웹 PPT(덱 기본값) |
| [`html-ppt-*`](../../design-templates/) | deck | marketing | 15개 덱 템플릿 × 36개 테마(마스터 템플릿은 [`design-templates/html-ppt/`](../../design-templates/html-ppt/)에) |
| [`hyperframes`](../../design-templates/hyperframes/) | video | marketing | HTML → MP4 모션 그래픽(HeyGen OSS 프레임워크) |
| [`critique`](../../design-templates/critique/) | utility | design | 5차원 자가 비평 점수표 |
| [`tweaks`](../../design-templates/tweaks/) | utility | design | AI가 내보낸 tweaks 패널 매니페스트 |

전체 스킬 프로토콜 → [`docs/skills-protocol.md`](../../docs/skills-protocol.md). 스킬 레지스트리 엔드포인트: `GET /api/skills`.

---

## 디자인 시스템

**150개의 브랜드급 `DESIGN.md` 시스템**이 저장소와 함께 제공됩니다 — 각각은 9개 섹션 스키마(색상, 타이포그래피, 간격, 레이아웃, 컴포넌트, 모션, 보이스, 브랜드, 안티패턴)를 갖춘 단일 Markdown 파일로, [`VoltAgent/awesome-design-md`][acd2]에서 가져왔습니다. 시스템을 전환하면 → 다음 렌더가 새 토큰을 사용합니다. 테마 JSON은 없습니다.

<details>
<summary><b>전체 카탈로그(클릭하여 펼치기)</b></summary>

**AI & LLM** — `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**개발자 도구** — `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**생산성** — `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**핀테크** — `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**이커머스** — `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**미디어** — `spotify` · `playstation` · `wired` · `theverge` · `meta`

**자동차** — `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**기타** — `apple` · `ibm` · `nvidia` · `vodafone` · `resend` · `spacex`

**스타터** — `default` (Neutral Modern) · `warm-editorial`

</details>

라이브러리를 다시 가져오려면 [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts)를 사용하세요. 자신의 브랜드를 추가하려면 → `design-systems/<brand>/`에 `DESIGN.md`를 넣으세요. 전체 가이드 → [`design-systems/README.md`](../../design-systems/README.md).

[acd2]: https://github.com/VoltAgent/awesome-design-md

---

## 플러그인

**261개의 공식 플러그인**이 [`plugins/_official/`](../../plugins/_official/)에 있습니다. 각 플러그인은 **이식 가능한 에이전트 스킬 폴더**입니다 — `SKILL.md`(Agent Skills를 지원하는 어떤 에이전트든 읽을 수 있음)와, Open Design에 마켓플레이스 메타데이터, 입력, 미리보기, 파이프라인, 기능 선언을 제공하는 선택적 `open-design.json` 매니페스트로 구성됩니다. 카테고리로 바로 이동하세요:

| 카테고리 | 개수 | 내용 |
|---|---|---|
| [`scenarios/`](../../plugins/_official/scenarios/) | 11 | 완전한 디자인 시나리오 — [`od-default`](../../plugins/_official/scenarios/od-default/), [`od-design-refine`](../../plugins/_official/scenarios/od-design-refine/), [`od-figma-migration`](../../plugins/_official/scenarios/od-figma-migration/), [`od-code-migration`](../../plugins/_official/scenarios/od-code-migration/), [`od-react-export`](../../plugins/_official/scenarios/od-react-export/), [`od-nextjs-export`](../../plugins/_official/scenarios/od-nextjs-export/), [`od-vue-export`](../../plugins/_official/scenarios/od-vue-export/), [`od-media-generation`](../../plugins/_official/scenarios/od-media-generation/), [`od-new-generation`](../../plugins/_official/scenarios/od-new-generation/), [`od-tune-collab`](../../plugins/_official/scenarios/od-tune-collab/), [`od-plugin-authoring`](../../plugins/_official/scenarios/od-plugin-authoring/) |
| [`image-templates/`](../../plugins/_official/image-templates/) | 45 | 원샷 이미지 프롬프트 — 에디토리얼, 시네마틱, 제품, 인물 |
| [`video-templates/`](../../plugins/_official/video-templates/) | 50 | HyperFrames / Seedance / Veo 모션 템플릿 |
| [`design-systems/`](../../plugins/_official/design-systems/) | 142 | 플러그인으로 감싼 브랜드 `DESIGN.md` |
| [`atoms/`](../../plugins/_official/atoms/) | 13 | 재사용 가능한 UI 조각(버튼, 히어로, KPI 카드) |
| [`examples/`](../../plugins/_official/examples/) | 140 | 리믹스 가능한 참조 출력물 |

또한 커뮤니티 플러그인을 위한 [`plugins/community/`](../../plugins/community/)와 게시 흐름을 위한 [`plugins/registry/`](../../plugins/registry/)가 있습니다.

### 플러그인이 할 수 있는 일

- 🤖 **어떤 코딩 에이전트에서든 실행** — [Claude Code](../../docs/agent-adapters.md), Codex, Cursor, Copilot, [OpenClaw](https://github.com/openclaw/openclaw), [Antigravity](https://antigravity.google), Hermes, Kimi… 에이전트가 이미 알고 있는 동일한 스킬 프로토콜을 통해.
- 🔁 **Figma / Pencil 워크플로 마이그레이션** → React, Next.js, 또는 Vue 소스. [`od-figma-migration`](../../plugins/_official/scenarios/od-figma-migration/)을 참고하세요.
- 🛠️ **기존 코드베이스를 브랜드 사양에 맞게 새롭게** — 플러그인을 `git` 저장소 + `DESIGN.md`에 겨누면 PR을 받습니다. [`od-code-migration`](../../plugins/_official/scenarios/od-code-migration/)을 참고하세요.
- 💾 **커스텀 워크플로 영구 저장** — 팀의 재사용 가능한 템플릿이 기본 제공 템플릿 옆에 놓입니다.

### 플러그인 사용하기

플러그인은 **웹 UI**와 **`od` CLI**에서 완전히 동등하게 동작합니다 — 동일한 `/api/plugins` 엔드포인트를 쓰니, 맞는 쪽을 고르세요.

**데스크톱 / 웹 앱에서:** **Plugin** 페이지를 열어 마켓플레이스를 둘러보고 **Install**을 클릭하세요. 프로젝트의 Studio 안에서 플러그인은 클릭하여 적용하는 컴포저 칩으로 나타납니다(선언된 입력과 함께).

**커맨드 라인에서**(UI 없이 실행됩니다 — 외부 에이전트가 사용하는 경로입니다):

```bash
od plugin list                       # list installed plugins (--task-kind / --mode / --tag filters)
od plugin search "landing page"      # search by keyword
od plugin info od-default            # inspect a plugin's metadata, inputs, capabilities
od plugin install od-figma-migration # install from a registry; also accepts ./local-folder or an https://… link
od plugin apply od-default --input brief="a one-page pitch for our seed round"
od plugin upgrade od-default         # upgrade
od plugin uninstall od-default       # uninstall
```

모든 명령은 `--json`을 지원하므로 `jq` / `xargs`를 거쳐 자동화로 파이프할 수 있습니다.

### 플러그인 만들기

플러그인은 **최소한 `SKILL.md` 하나만 있으면 됩니다**; Open Design 마켓플레이스에 등록하려면 `open-design.json`을 추가하세요:

```
my-plugin/
├── SKILL.md            ← required: YAML frontmatter (name · description) + trigger phrasing + workflow (aim for < 500 lines)
├── open-design.json    ← needed to list: marketplace metadata + inputs + pipeline + capabilities
├── README.md           ← optional: usage, install, registry links
├── preview/            ← optional: index.html / poster.png (strongly recommended for visual plugins)
└── examples/           ← optional: concrete use cases
```

핵심 `open-design.json` 필드: `specVersion`(현재 `1.0.0`), `name`(안정적 ID), `version`(semver), `compat.agentSkills[].path`(`./SKILL.md`를 가리킴), `od.kind`(`skill` / `scenario` / `atom` / `bundle`), `od.taskKind`(`new-generation` / `figma-migration` / `code-migration` / `tune-collab`), `od.mode`(출력 표면, 예: `prototype` / `deck` / `live-artifact` / `image` / `video` / `hyperframes` / `audio` / `design-system` / `scenario`), `od.capabilities[]`(**최소한만 선언하세요** — 제한된 설치는 기본적으로 `prompt:inject`만 부여합니다), `od.inputs[]`(적용 시점 파라미터).

로컬에서 스캐폴드 + 검증:

```bash
od plugin scaffold --id my-plugin --title "My Plugin"   # generate the skeleton
od plugin validate ./my-plugin                          # check manifest / file layout
pnpm guard && pnpm --filter @open-design/plugin-runtime typecheck
```

전체 필드 집합과 런타임 계약 → [`plugins/spec/SPEC.md`](../../plugins/spec/SPEC.md); 코딩 에이전트로 플러그인 개발하기 → [`plugins/spec/AGENT-DEVELOPMENT.md`](../../plugins/spec/AGENT-DEVELOPMENT.md); 복사해 붙여넣을 최소 템플릿 → [`plugins/spec/examples/`](../../plugins/spec/examples/).

### 플러그인 기여하기

1. 플러그인 폴더를 [`plugins/community/`](../../plugins/community/)(서드파티 플러그인)에 넣거나 — Open Design와 함께 번들로 제공하려면 — [`plugins/_official/`](../../plugins/_official/)의 알맞은 티어에 넣으세요.
2. 검증 통과: `od plugin validate`, `pnpm guard`, `pnpm --filter @open-design/plugin-runtime typecheck`.
3. [`plugins/spec/CONTRIBUTING.md`](../../plugins/spec/CONTRIBUTING.md)의 템플릿을 사용해 PR을 작성하세요(ID, 버전, 레인, 모드, 기능, 트리거 예시; 비주얼 플러그인에는 스크린샷 / 미리보기 첨부).
4. 외부 레지스트리(skills.sh / ClawHub / 독립 GitHub)에 게시하려면 → [`plugins/spec/PUBLISHING-REGISTRIES.md`](../../plugins/spec/PUBLISHING-REGISTRIES.md).

플러그인 레지스트리 엔드포인트: `GET /api/plugins`. 디렉터리 개요 → [`plugins/README.md`](../../plugins/README.md) ([简体中文](../../plugins/README.zh-CN.md)).

---

## 아키텍처

```
┌────────────────── browser (Next.js 16) / Electron shell ──────────────┐
│  chat · file workspace · iframe preview · settings · import · MCP     │
└──────────────┬─────────────────────────────────────┬─────────────────┘
               │ /api/*                              │
               ▼                                     ▼
   ┌─────────────────────────────────┐   /api/proxy/{provider}/stream (SSE)
   │  local daemon (Express+SQLite)  │   ─→ any OpenAI-compatible BYOK,
   │                                  │       SSRF-guarded at the edge
   │  /api/skills    /api/plugins    │
   │  /api/design-systems            │
   │  /api/chat (SSE)   /api/proxy/* │
   │  /api/projects/:id/files/...    │
   │  /api/artifacts/{save,lint}     │
   │  /api/import/claude-design      │
   │  MCP stdio server                │
   └─────────┬───────────────────────┘
             │ spawn(cli, [...], { cwd: managed project cwd })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  claude · codex · cursor-agent · copilot · openclaw · antigravity ·│
   │  gemini · opencode · qwen · qoder · hermes (ACP) · kimi (ACP) ·    │
   │  pi (RPC) · kiro · kilo · vibe (ACP) · cline · trae · deepseek     │
   │  reads SKILL.md + DESIGN.md, writes artifacts to disk             │
   └──────────────────────────────────────────────────────────────────┘
```

| 계층 | 스택 |
|---|---|
| 프론트엔드 | Next.js 16 App Router + React 18 + TypeScript |
| 데몬 | Node 24 · Express · SSE 스트리밍 · `better-sqlite3` |
| 스토리지 | daemon 저장 경로를 변경하거나 문서화하기 전에 반드시 루트 `AGENTS.md`의 **Daemon data directory contract**를 읽어야 합니다. 이 README는 그 내용을 다시 서술해서는 안 됩니다. |
| 미리보기 | 샌드박스 `srcdoc` iframe + 스트리밍 `<artifact>` 파서 |
| 내보내기 | HTML(인라인) · PDF(브라우저 인쇄) · PPTX(에이전트 기반) · ZIP · Markdown · MP4(HyperFrames) |
| 데스크톱 | Electron 셸 + 샌드박스 렌더러 + 사이드카 IPC(STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN) |
| 라이프사이클 | 단일 진입점: `pnpm tools-dev` (start / stop / run / status / logs / inspect / check) |

전체 아키텍처 → [`docs/architecture.md`](../../docs/architecture.md). 스킬 프로토콜 → [`docs/skills-protocol.md`](../../docs/skills-protocol.md). 에이전트 어댑터 계약 → [`docs/agent-adapters.md`](../../docs/agent-adapters.md).

---

## 로드맵

- [x] 데몬 + 21개 코딩 에이전트 CLI 어댑터 + 스킬 레지스트리 + 디자인 시스템 카탈로그
- [x] 웹 앱 + 챗 + 질문 폼 + 5방향 피커 + 할 일 진행 상황 + 샌드박스 미리보기
- [x] 100개 이상의 스킬 · 150개의 디자인 시스템 · 5개의 비주얼 방향 · 5개의 디바이스 프레임
- [x] SQLite 기반 프로젝트 · 대화 · 메시지 · 탭 · 템플릿
- [x] 다중 프로바이더 BYOK 프록시(`/api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream`) + SSRF 가드
- [x] Claude Design ZIP 가져오기(`/api/import/claude-design`)
- [x] 사이드카 프로토콜 + Electron 데스크톱 + IPC 자동화
- [x] 아티팩트 린트 API + 5차원 자가 비평 내보내기 전 게이트
- [x] **0.8.0** — 플러그인 마켓플레이스 인프라(261개 공식 플러그인, 매니페스트 사양, 에이전트별 설치 스크립트)
- [x] **0.9.0** — Open Design AMR(앱에 내장된 공식 Model Router: 설정 불필요, 원클릭 로그인)
- [x] 패키징된 Electron 빌드 — macOS(Apple Silicon + Intel) + Windows(x64) + Linux AppImage(선택적 레인)
- [ ] 코멘트 모드 정밀 편집 — 부분 출시됨; 안정적인 타깃 패칭 진행 중
- [ ] AI가 내보내는 tweaks 패널 UX — 아직 구현되지 않음
- [ ] `DESIGN.md`로 프로젝트를 스캐폴드하는 `npx od init`
- [ ] 플러그인 SDK + `od plugin {add,list,remove,test,publish}` CLI
- [ ] Figma / Pencil → React / Next / Vue 마이그레이션 플러그인(알파)
- [ ] 기존 코드베이스 새롭게 하기 플러그인(git 저장소 + `DESIGN.md`에 겨눔)

단계별 제공 → [`docs/roadmap.md`](../../docs/roadmap.md).

---

## 커뮤니티

모든 채널 뒤에는 실제 사람이 있습니다.

- 💬 **Discord** — 매일의 대화, 플러그인 공유, 질문 → [**discord.gg/qhbcCH8Am4**](https://discord.gg/qhbcCH8Am4)
- 🐦 **X / Twitter** — 릴리스 노트, 마일스톤, 비하인드 → [**@nexudotio**](https://x.com/nexudotio)
- 🗣️ **GitHub Discussions** — 깊이 있는 Q&A, RFC, "당신의 작업을 보여주세요" → [**Discussions**](https://github.com/nexu-io/open-design/discussions)
- 🐛 **GitHub Issues** — 버그 리포트, 기능 요청 → [**Issues**](https://github.com/nexu-io/open-design/issues)

[`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)와 [`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) 라벨이 가장 쉬운 진입로입니다.

---

## 기여하기

Open Design가 계속 나아가는 것은 기여자들 — 디자이너, 엔지니어, 프롬프트 작성자 — 이 계속 모습을 드러내기 때문입니다. 가장 많이 쓰이는 스킬, 디자인 시스템, 플러그인의 상당수는 핵심 팀 바깥의 사람들이 작성했습니다.

### 🎯 어디서 시작할까 (최대 레버리지, 최소 변경)

| 만들고 싶은 것… | 방법 | 위치 |
|---|---|---|
| 새 **스킬** | `SKILL.md` + `assets/` + `references/`가 있는 폴더를 넣기 | [`skills/`](../../skills/) · 사양은 [`docs/skills-protocol.md`](../../docs/skills-protocol.md)에 |
| 새 **디자인 시스템** | 9개 섹션 스키마를 쓴 `DESIGN.md`를 넣기 | [`design-systems/<brand>/`](../../design-systems/) |
| 새 **플러그인** | 카테고리 폴더 아래에 `open-design.json` + 매니페스트를 넣기 | [`plugins/community/`](../../plugins/community/) · 사양은 [`plugins/spec/SPEC.md`](../../plugins/spec/SPEC.md)에 · 에이전트 개발 가이드는 [`plugins/spec/AGENT-DEVELOPMENT.md`](../../plugins/spec/AGENT-DEVELOPMENT.md)에 |
| 새 **코딩 에이전트 CLI** 지원 | 어댑터 항목 하나 + 스트림 파서 | [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts) |
| 버그 수정 또는 UI 다듬기 | [`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) 라벨 둘러보기 | [Issues →](https://github.com/nexu-io/open-design/issues) |
| 문서 번역 | `README.<lang>.md` 파일 업데이트 | [`TRANSLATIONS.md`](../../TRANSLATIONS.md) |

### 🤖 에이전트로서 기여하기

*당신이 이 글을 읽는 에이전트라면*, 가장 빠른 경로는:

```bash
# 1. Boot locally
git clone https://github.com/nexu-io/open-design.git
cd open-design && corepack enable && pnpm install
pnpm tools-dev run web

# 2. Find a good-first-issue and assign yourself
gh issue list --label "good first issue" --state open --limit 20
gh issue develop <number>   # create a branch and worktree

# 3. Make the change, run the checks
pnpm guard && pnpm typecheck
pnpm --filter @open-design/<package> test

# 4. Open the PR
gh pr create --fill
```

전체 에이전트 친화적 기여 흐름, 코드 스타일, PR 기준 → [`CONTRIBUTING.ko.md`](CONTRIBUTING.ko.md) ([Deutsch](CONTRIBUTING.de.md) · [Français](CONTRIBUTING.fr.md) · [简体中文](CONTRIBUTING.zh-CN.md) · [日本語](CONTRIBUTING.ja-JP.md) · [Português](CONTRIBUTING.pt-BR.md)).

### 🏅 Open Design Fellow 프로그램

우리는 전 세계에서 **Open Design Fellow**를 모집하고 있습니다 — Fellow는 핵심 팀과 함께 제품을 빚어내고, 자신의 지역에서 Open Design를 공식적으로 대표하며, 지역 커뮤니티를 키웁니다. 여기에는 자금 지원($1,000 / MR), 무료 LLM 크레딧, 직통 리뷰 트랙이 뒷받침됩니다. 자세히 → [`MAINTAINERS.md`](../../MAINTAINERS.md) 및 [Discord](https://discord.gg/qhbcCH8Am4)의 공지.

---

## 메인테이너

이들은 많은 짐을 짊어집니다 — 매일의 유지보수, 리뷰, 그리고 커뮤니티 지원.

<table>
  <tr>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Nagendhra-web">
        <img src="https://github.com/Nagendhra-web.png" width="96" alt="@Nagendhra-web" /><br/>
        <sub><b>@Nagendhra-web</b></sub>
      </a><br/>
      <sub>Maintainer</sub>
    </td>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Sid-Qin">
        <img src="https://github.com/Sid-Qin.png" width="96" alt="@Sid-Qin" /><br/>
        <sub><b>@Sid-Qin</b></sub>
      </a><br/>
      <sub>Maintainer</sub>
    </td>
  </tr>
</table>

메인테이너 규칙, 승급 기준, 그리고 이탈 프로토콜 → [`MAINTAINERS.md`](../../MAINTAINERS.md) (또한 [Deutsch](MAINTAINERS.de.md) · [Français](MAINTAINERS.fr.md) · [简体中文](MAINTAINERS.zh-CN.md) · [日本語](MAINTAINERS.ja-JP.md) · [Português](MAINTAINERS.pt-BR.md)).

## 기여자

참여해 주신 모든 분께 감사드립니다 — 코드, 문서, 피드백, 날카로운 이슈, 새 스킬, 새 디자인 시스템.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&max=500&columns=20&anon=1&cache_bust=2026-05-30" alt="Open Design contributors" />
</a>

---

## 저장소 활동

<picture>
  <img alt="Open Design — repository metrics" src="https://repo-assets.open-design.ai/resources/images/github-metrics.svg" />
</picture>

위의 SVG는 [`lowlighter/metrics`](https://github.com/lowlighter/metrics)를 사용해 [`.github/workflows/metrics.yml`](../../.github/workflows/metrics.yml)에 의해 매일 다시 생성됩니다.

---

## 스타를 눌러주세요

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="https://repo-assets.open-design.ai/resources/images/star-us.png" alt="Star Open Design on GitHub — github.com/nexu-io/open-design" width="100%" /></a>
</p>

이것이 당신의 30분을 아껴줬다면 ★를 눌러주세요. 스타가 집세를 내주지는 않지만 — 다음 디자이너, 에이전트, 기여자에게 이 실험이 관심을 쏟을 가치가 있다고 알려줍니다. 한 번의 클릭, 3초, 진짜 신호입니다.

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-28" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-28" />
    <img alt="Open Design star history" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-28" />
  </picture>
</a>

---

## 참고 자료 & 계보

| 프로젝트 | 역할 |
|---|---|
| [Claude Design][cd] | 이 저장소가 오픈소스 대안으로 삼는 폐쇄 소스 제품. |
| [`alchaincyf/huashu-design`](https://github.com/alchaincyf/huashu-design) | 디자인 철학의 나침반 — 주니어 디자이너 워크플로, 브랜드 에셋 프로토콜, 안티 AI 슬롭 체크리스트, 5차원 비평. |
| [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) | 매거진 스타일 웹 PPT 스킬로, [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/) 아래에 똑같이 번들로 제공됨. 덱 모드의 기본값. |
| [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) | HTML PPT Studio 제품군 — 15개 덱 템플릿, 36개 테마, 31개 페이지 레이아웃, 애니메이션 런타임, 마그네틱 카드 프레젠터 모드. |
| [`OpenCoworkAI/open-codesign`](https://github.com/OpenCoworkAI/open-codesign) | 최초의 오픈소스 Claude Design 대안; 우리가 빌려온 UX 패턴(스트리밍 아티팩트 루프, 샌드박스 iframe, 라이브 에이전트 패널). |
| [`multica-ai/multica`](https://github.com/multica-ai/multica) | 데몬 + 어댑터 아키텍처 — PATH 스캔 에이전트 감지, 유일한 특권 프로세스로서의 로컬 데몬. |
| [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) | 9개 섹션 `DESIGN.md` 스키마와 70개 제품 시스템의 출처. |
| [`bergside/awesome-design-skills`](https://github.com/bergside/awesome-design-skills) | `design-systems/` 아래에 추가된 57개 디자인 스킬의 출처. |
| [`heygen-com/hyperframes`](https://github.com/heygen-com/hyperframes) | HTML→MP4 모션 그래픽 프레임워크로, Open Design에 일급 `hyperframes-html`로 통합됨. |
| [Claude Code skills][skill] | 우리가 그대로 채택한 `SKILL.md` 관례. |

자세한 출처 → [`docs/references.md`](../../docs/references.md).

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## 라이선스

Apache-2.0. 번들로 제공되는 `design-templates/guizang-ppt/`는 원본 [LICENSE](../../design-templates/guizang-ppt/LICENSE)(MIT, [@op7418](https://github.com/op7418))를 유지합니다. 번들로 제공되는 `design-templates/html-ppt/`는 원본 [LICENSE](../../design-templates/html-ppt/LICENSE)(MIT, [@lewislulu](https://github.com/lewislulu))를 유지합니다.
