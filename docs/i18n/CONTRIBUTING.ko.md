# Open Design 기여 가이드

기여를 고민하고 있다니 고맙습니다. OD는 일부러 작게 유지합니다. 대부분의 가치는 프레임워크 코드가 아니라 **파일**(skill, design system, 프롬프트 조각)에 담겨 있습니다. 그래서 가장 효과가 큰 기여는 대개 폴더 하나, Markdown 파일 하나, 또는 PR 한 건 크기의 adapter입니다.

이 문서는 어떤 종류의 기여를 어디서 시작해야 하는지, 그리고 PR이 머지되려면 어떤 기준을 넘어야 하는지 정확히 알려줍니다.

<p align="center"><a href="../../CONTRIBUTING.md">English</a> · <a href="CONTRIBUTING.pt-BR.md">Português (Brasil)</a> · <a href="CONTRIBUTING.de.md">Deutsch</a> · <a href="CONTRIBUTING.fr.md">Français</a> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <a href="CONTRIBUTING.ja-JP.md">日本語</a> · <b>한국어</b> · <a href="CONTRIBUTING.th.md">ภาษาไทย</a></p>

---

## 오후 한나절이면 끝나는 세 가지 기여

| 하고 싶은 일 | 실제로 추가하는 것 | 위치 | 규모 |
|---|---|---|---|
| OD가 새로운 종류의 artifact를 렌더링하게 만들기 (청구서, iOS 설정 화면, 한 장짜리 문서 등) | **Design template** | [`design-templates/<your-template>/`](../../design-templates/) | `SKILL.md`와 렌더링 asset을 담은 폴더 하나 |
| 작업 중 agent가 호출하는 기능 추가하기 | **Skill** | [`skills/<your-skill>/`](../../skills/) | `SKILL.md`와 선택적 리소스를 담은 폴더 하나 |
| OD가 새 브랜드의 비주얼 언어를 구사하게 만들기 | **Design System** | [`design-systems/<brand>/`](../../design-systems/) | 하나의 package: `manifest.json`, `DESIGN.md`, `tokens.css` |
| 새 coding-agent CLI 연결하기 | **Agent adapter** | [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) | 정의 하나와 registry entry 하나 |
| 기능 추가, 버그 수정, [`open-codesign`][ocod]에서 UX 패턴 가져오기 | 코드 | `apps/web/src/`, `apps/daemon/` | 일반 PR |
| 문서 개선, 일부 섹션을 Français / Deutsch / 中文로 번역, 오타 수정 | 문서 | `README.md`, `README.fr.md`, `README.de.md`, `README.zh-CN.md`, `docs/`, `QUICKSTART.md` | PR 한 건 |

어느 쪽에 해당하는지 모르겠다면 [먼저 discussion이나 issue를 열어주세요](https://github.com/nexu-io/open-design/issues/new). 적절한 위치를 안내해 드리겠습니다.

---

## 로컬 환경 설정

한 페이지짜리 전체 설정 안내는 [`QUICKSTART.ko.md`](QUICKSTART.ko.md)에 있습니다. 기여자를 위한 요약은 다음과 같습니다.

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable           # packageManager에 고정된 pnpm을 선택합니다
pnpm install
pnpm tools-dev run web    # daemon + web 포그라운드 루프
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @open-design/web build  # 필요할 때 web 패키지 빌드
```

Node `~24`와 pnpm `10.33.x`가 필요합니다. `nvm`이나 `fnm`은 선택 사항입니다. Node를 그렇게 관리하는 게 편하다면 `nvm install 24 && nvm use 24` 또는 `fnm install 24 && fnm use 24`를 실행하세요. macOS, Linux, WSL2가 주요 지원 환경입니다. Windows 네이티브도 지원합니다. 흔히 겪는 설정 문제는 [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md)를 참고하세요.

## Docker 설정

Node.js나 pnpm을 설치하지 않고도 Open Design을 실행할 수 있습니다.

### 사전 준비

Compose v2가 포함된 Docker Desktop이 설치되어 있는지 확인하세요.

```bash
docker compose version
```

### Open Design 실행

```bash
cd deploy
docker compose up -d
```

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:7456
```

### 자주 쓰는 명령어

```bash
# 로그 보기
docker compose logs -f

# 컨테이너 재시작
docker compose restart

# 컨테이너 중지
docker compose down

# 최신 이미지 받기
docker compose pull
docker compose up -d
```

### 선택적 환경 변수 재정의

`deploy/.env` 파일을 만듭니다.

```env
OPEN_DESIGN_PORT=7456
OPEN_DESIGN_MEM_LIMIT=384m
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:latest
```

> 프로젝트와 데이터베이스 데이터는 Docker 볼륨에 자동으로 보존됩니다.

전체 Docker 가이드와 고급 설정은 [`QUICKSTART.ko.md`](QUICKSTART.ko.md)를 참고하세요.



---

## 새 Design template 추가하기

Design template은 [`design-templates/`](../../design-templates/) 아래에 두는 폴더로, 루트에 `SKILL.md`를 두고 Claude Code의 [`SKILL.md` 규약][skill]에 우리의 선택적 `od:` 확장을 더한 형태입니다. Templates gallery에 표시할 artifact의 형태와 렌더링 리소스를 묶습니다.

### → 전체 가이드는 [`docs/skills-contributing.md`](../../docs/skills-contributing.md)를 보세요

이 문서가 다음 내용을 단계별로 안내합니다.

- **빠른 시작** — 저장소 클론 → 가장 비슷한 기존 template 복사 → `pnpm tools-dev run web` 실행 → picker 확인 → PR 열기.
- **design template이란 무엇이고 무엇이 아닌가** — 당신의 아이디어가 사실은 기능이나 vendor 연동이었다면, 일주일을 아껴줍니다.
- **design template 구조** — 최소한의 폴더 구성과 `SKILL.md` frontmatter 치트시트.
- **로컬 실행** — 실제로 중요한 네 가지 명령어.
- **머지 기준** — 리뷰어가 확인할 항목을 그대로 복사해 쓸 수 있는 체크리스트.
- **PR 설명 템플릿** — PR 본문에 붙여넣고 채우면 됩니다.
- **자주 거절되는 패턴** — 최근 실제로 사용한 거절 사유와 구체적인 예시.

프로토콜 명세(전체 active frontmatter 문법과 registry가 실제로 읽는 필드)는 [`docs/skills-protocol.md`](../../docs/skills-protocol.md)에 별도로 정리되어 있습니다. `od.inputs`, `od.parameters`, `od.capabilities_required` 같은 오래된 portable 필드는 외부 번들에 남아 있을 수 있지만, skill/template registry는 더 이상 이를 소비하지 않습니다.

---

## Functional Skill 추가하기

Functional Skill은 작업 중 agent가 사용자 입력을 다루기 위해 호출하는 기능입니다. 책임 경계는 [`skills/README.md`](../../skills/README.md), 폴더 계약은 [`skills/AGENTS.md`](../../skills/AGENTS.md), 공통 `SKILL.md` 문법은 [`docs/skills-protocol.md`](../../docs/skills-protocol.md)를 참고하세요. daemon의 lazy scanner는 다음 `/api/skills` 요청에서 Skill root를 다시 훑으므로, 로컬에서는 rebuild도 daemon 재시작도 필요하지 않습니다.

---

## 새 Design System 추가하기

저장소에 추가하는 새 design system은 [`design-systems/<slug>/`](../../design-systems/) 아래의 package이며, Markdown 파일 하나가 아닙니다. 현재 번들된 151개 system은 모두 아래 package contract로 마이그레이션되었습니다. Daemon은 예전 콘텐츠나 사용자가 설치한 콘텐츠와의 호환성을 위해 `DESIGN.md`만 있는 폴더도 계속 허용하지만, 새 번들 system은 이 legacy 형태로 작성하면 안 됩니다. Catalog는 `/api/design-systems` 요청마다 다시 스캔되므로 편집 후 Design System surface를 새로 고치면 되며 daemon 재시작은 필요하지 않습니다.

### 최소 package 구성

```text
design-systems/your-brand/
├── manifest.json
├── DESIGN.md
└── tokens.css
```

`manifest.json`은 안정적인 id, 표시 이름, category, description, provenance와 선언된 package path를 보유합니다. `DESIGN.md`는 agent에게 design intent를 설명하고, `tokens.css`는 canonical compiled semantic-token stylesheet입니다. 전체 contract는 [`docs/design-systems.md`](../../docs/design-systems.md)와 [`design-systems/_schema/AGENTS.md`](../../design-systems/_schema/AGENTS.md)를 참고하세요.

### `DESIGN.md` 형식

```markdown
# YourBrand Design System

## Visual Theme
…

## Color Roles
…

## Typography
…

## Layout and Spacing
## Components and States
## Motion and Interaction
## Accessibility
## Anti-patterns
```

고정된 9개 section schema는 없습니다. Package quality guard는 내용이 있는 H2 section을 7개 이상 요구하지만 이름, 순서, 번호는 지정하지 않습니다. 실제 system에 맞는 제목을 사용하세요.

### 새 design system 머지 기준

1. **필수 파일 3개를 모두 포함하세요.** Folder slug와 `manifest.id`를 일치시키고 정규화된 ASCII를 사용합니다(`linear.app` → `linear-app`, `x.ai` → `x-ai`).
2. **내용이 있는 H2 section을 7개 이상 작성하세요.** 개수만 채우는 빈 제목은 허용되지 않습니다.
3. **Prose와 token을 일치시키세요.** `DESIGN.md`의 color, type, spacing, motion 결정은 `tokens.css`와 같아야 하고 공용 token guard를 통과해야 합니다.
4. **실제 evidence와 명확한 provenance를 사용하세요.** Source product나 site에서 직접 추출하고 manifest/package evidence에 출처를 기록합니다.
5. **유용한 catalog copy를 작성하세요.** `manifest.name`, `category`, `description`이 picker의 기본 metadata입니다. Marketing fluff는 넣지 마세요.

upstream에서 유래한 제품 시스템은 [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts)를 통해 [`VoltAgent/awesome-design-md`][acd2]에서 가져옵니다. 브랜드가 그 upstream에 속한다면 **그쪽에 먼저 PR을 보내세요.** 다음 동기화 때 자동으로 반영됩니다. `design-systems/` 폴더에는 upstream에 맞지 않는 프로젝트 소유의 추가 시스템도 들어 있습니다.

---

## 새 coding-agent CLI 추가하기

새 agent(예: 어느 신생 업체의 `foo-coder` CLI)를 연결하려면 [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/)에 정의를 추가하고 `runtimes/registry.ts`에 등록합니다.

```ts
import type { RuntimeAgentDef } from '../types.js';

export const fooAgentDef = {
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  fallbackModels: [{ id: 'default', label: 'Default', default: true }],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // 또는 해당 형식을 지원하면 'claude-stream-json'
} satisfies RuntimeAgentDef;
```

정의를 [`runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts)로 import해 `BASE_AGENT_DEFS`에 추가하면, 공용 엔진이 `PATH`에서 감지하고 picker에 표시하며 invocation을 구성합니다. wire shape가 같다면 기존 `streamFormat`을 재사용하세요. 완전히 새로운 wire format이라면 [`apps/daemon/src/runtimes/`](../../apps/daemon/src/runtimes/) 또는 [`apps/daemon/src/agent-protocol/`](../../apps/daemon/src/agent-protocol/) 아래의 parser, parser test, 그리고 [`server.ts`](../../apps/daemon/src/server.ts)의 해당 dispatch branch도 필요합니다.

머지 기준:

1. 새 agent로 **실제 세션이 처음부터 끝까지 동작**해야 합니다. artifact가 스트리밍으로 통과한 것을 보여주는 daemon 로그를 PR 설명에 붙여넣으세요.
2. CLI의 특이사항을 **`docs/agent-adapters.md`**에 정리하세요(키 파일이 필요한가? 이미지 입력을 지원하는가? 비대화형 플래그는 무엇인가?).
3. **README의 "Supported coding agents" 표**에 한 줄을 추가하세요.

---

## 모델 `max_tokens` 메타데이터 갱신하기

API 모드 채팅은 매 요청마다 upstream provider에 `max_tokens`를 보냅니다. web 클라이언트는 [`apps/web/src/state/maxTokens.ts`](../../apps/web/src/state/maxTokens.ts)의 3단계 조회로 이 값을 정합니다.

1. 설정에서 사용자가 직접 지정한 값(있는 경우).
2. 없으면 [`apps/web/src/state/litellm-models.json`](../../apps/web/src/state/litellm-models.json)의 모델별 기본값. 이는 [BerriAI/litellm][litellm]의 `model_prices_and_context_window.json`(MIT)에서 잘라온 vendored 데이터로, Anthropic, OpenAI, DeepSeek, Groq, Together, Mistral, Gemini, Bedrock, Vertex, OpenRouter 등 약 2천 개의 채팅 모델을 포함합니다.
3. 그래도 없으면 `FALLBACK_MAX_TOKENS = 8192`.

새로 출시된 모델을 반영하려면 vendored JSON을 다시 생성하세요.

```bash
node --experimental-strip-types scripts/sync-litellm-models.ts
```

이 스크립트는 LiteLLM의 카탈로그를 가져와 `mode: 'chat'` 항목만 걸러내고, 각 항목을 `max_output_tokens`(없으면 `max_tokens`)로 매핑한 뒤 정렬된 스냅샷을 씁니다. 갱신을 유발한 PR과 함께 다시 생성된 `litellm-models.json`을 커밋하세요.

`maxTokens.ts`의 OVERRIDES 표는 실제로 쓰는 모델 id에 대해 LiteLLM에 값이 없거나 틀린 드문 경우를 위한 것입니다. 예를 들어 `mimo-v2.5-pro`가 그렇습니다(LiteLLM은 MiMo를 `openrouter/xiaomi/...`와 `novita/xiaomimimo/...` 별칭으로만 제공하는데, 둘 다 Xiaomi 직접 API가 쓰는 정식 id와 맞지 않습니다). 이 표는 작게 유지하세요. LiteLLM이 제대로 다루는 것은 모두 upstream에 두는 게 맞습니다.

[litellm]: https://github.com/BerriAI/litellm

---

## 현지화 유지보수

독일어는 격식 있는 `Sie`를 씁니다. OD는 1인 창작자, 에이전시, 엔지니어링 팀이 뒤섞인 사용자층에 말을 걸기 때문입니다. 비격식 `du` 어조가 더 잘 맞는다는 프로젝트 피드백이 나오기 전까지는, 격식 독일어가 가장 무난한 기본값입니다. 로케일 PR은 UI 요소, 핵심 문서, 그리고 `apps/web/src/i18n/content.ts`의 표시 전용 갤러리 메타데이터를 번역해야 하지만, `skills/`나 `design-systems/`, 또는 agent가 실행하는 프롬프트 본문은 번역하면 안 됩니다. 이런 원본 프롬프트는 워크플로우 입력으로 관리되며, 원본 언어를 하나로 유지해야 로케일마다 프롬프트 QA가 늘어나는 일을 막을 수 있습니다. skill, design system, 프롬프트 템플릿을 추가하거나 이름을 바꿀 때는 독일어 표시 메타데이터를 갱신하고 `pnpm --filter @open-design/web test`를 실행하세요. 독일어 표시 항목이 누락되면 `content.test.ts`가 실패합니다. daemon 오류, export 파일명, agent가 생성한 artifact 텍스트는 PR이 명시적으로 범위에 넣지 않는 한 알려진 한계로 둡니다.

새 로케일을 추가하는 단계별 안내(UI 사전, README, 언어 전환기, 지역별 용어)는 [`TRANSLATIONS.md`](../../TRANSLATIONS.md)를 참고하세요.

---

## 코드 스타일

포매팅에 까다롭게 굴지는 않지만(저장 시 Prettier로 충분합니다), 두 가지 규칙은 양보할 수 없습니다. 프롬프트 스택과 사용자에게 노출되는 API에 그대로 드러나기 때문입니다.

1. **JS/TS는 작은따옴표.** escape 때문에 보기 흉해지는 경우가 아니라면 문자열은 작은따옴표로 감쌉니다. 코드베이스는 이미 일관되니 맞춰주세요.
2. **주석은 영어로.** PR이 Deutsch나 中文로 번역하는 작업이더라도 코드 주석은 영어로 둡니다. grep으로 찾을 수 있는 참조를 한 벌로 유지하기 위해서입니다.

그 외에:

- **설명조 주석은 쓰지 마세요.** `// import the module`이나 `// loop through items` 같은 것 말입니다. 코드만 봐도 명백하다면 그 주석은 잡음입니다. 주석은 코드로 표현할 수 없는 의도나 제약에만 쓰세요.
- **`apps/web/src/`는 TypeScript를 씁니다.** daemon(`apps/daemon/`)은 타입이 중요한 곳에 JSDoc을 붙인 순수 ESM JavaScript입니다. 그대로 유지하세요.
- **새 최상위 의존성을 추가하지 마세요.** 추가한다면 얻는 것과 늘어나는 번들 크기를 PR 설명에 한 단락으로 적으세요. [`package.json`](../../package.json)의 의존성 목록은 일부러 작게 둡니다.
- **푸시 전에 `pnpm typecheck`를 실행하세요.** CI에서도 돌립니다. 실패하면 "고쳐주세요" 코멘트를 받게 됩니다.

---

## 커밋과 pull request

- **PR 하나에 관심사 하나.** skill 추가 + 파서 리팩터링 + 의존성 버전 업은 PR 세 개입니다.
- **제목은 명령형 + 범위.** `add dating-web skill`, `fix daemon SSE backpressure when CLI hangs`, `docs: clarify storage contract`처럼 씁니다.
- **PR 템플릿을 사용하세요.** [`.github/pull_request_template.md`](../../.github/pull_request_template.md)의 모든 섹션(Why, What users will see, Surface area, Screenshots(UI인 경우), Bug fix verification(버그 수정인 경우), Validation)을 채우세요. 빈 섹션에는 "채워주세요" 답변이 달립니다.
- **본문에는 이유를 적으세요.** "이게 뭘 하는지"는 보통 diff만 봐도 알 수 있습니다. 정작 드러나지 않는 것은 "이게 왜 있어야 하는지"입니다.
- **issue가 있다면 연결하세요.** issue가 없고 PR이 사소하지 않다면 먼저 issue를 열어주세요. 시간을 쏟기 전에 그 변경을 원하는지 합의할 수 있습니다.
- **리뷰 중에는 squash하지 마세요.** fixup 커밋을 푸시하면 머지할 때 우리가 squash합니다.
- **공유 브랜치에 force-push하지 마세요.** 리뷰어가 요청한 경우는 예외입니다.

CLA는 요구하지 않습니다. Apache-2.0으로 충분하며, 당신의 기여도 같은 라이선스를 따릅니다.

---

## 버그 신고하기

다음 내용을 담아 issue를 열어주세요.

- 무엇을 실행했는지(정확한 `pnpm tools-dev ...` 호출).
- 어떤 agent CLI를 선택했는지(또는 BYOK 경로였는지).
- 이를 유발한 skill + design system 조합.
- 관련된 **daemon stderr 끝부분**. "artifact가 렌더링되지 않았다"는 신고 대부분은 `spawn ENOENT`나 CLI의 실제 오류가 보이면 30초 만에 원인이 잡힙니다.
- UI 문제라면 스크린샷.

프롬프트 스택 버그("agent가 보라색 그라데이션 hero를 내보냈는데, slop 블랙리스트가 그걸 막았어야 했다")라면 **assistant 메시지 전문**을 함께 넣어주세요. 위반이 모델 탓인지 프롬프트 탓인지 볼 수 있습니다.

---

## 질문하기

- 아키텍처 질문, 설계 질문, "이게 버그인지 오용인지" → [GitHub Discussions](https://github.com/nexu-io/open-design/discussions) (권장 — 다음 사람이 검색할 수 있습니다).
- "X를 하는 skill을 어떻게 작성하나요" → discussion을 열어주세요. 답해드리고, 빠져 있던 패턴이라면 그 답을 [`docs/skills-protocol.md`](../../docs/skills-protocol.md)에 정리합니다.

---

## 받지 않는 것

프로젝트의 초점을 유지하기 위해, 다음과 같은 PR은 열지 말아주세요.

- **모델 런타임을 vendor로 포함.** OD의 핵심 베팅은 "이미 쓰고 있는 CLI면 충분하다"입니다. `pi-ai`나 OpenAI 키, 모델 로더를 제공하지 않습니다.
- **사전 논의 없이 현재 스택에서 벗어나는 프론트엔드 재작성.** Next.js 16 App Router + React 18 + TS가 기준선입니다. maintainer가 명시적으로 그 마이그레이션을 원하지 않는 한 Astro, Solid, Svelte 같은 다른 프레임워크로의 재작성은 받지 않습니다.
- **daemon을 serverless 함수로 대체.** daemon의 존재 이유는 실제 `cwd`를 소유하고 실제 CLI를 spawn하는 것입니다. SPA를 Vercel에 배포하는 것은 괜찮지만, daemon은 daemon으로 남습니다.
- **개인정보 보호 계약 밖의 텔레메트리 또는 외부 데이터 수집 추가.** 제품 분석과 마스킹된 세션 리플레이는 동의가 필요하며, 구성된 빌드에서는 스크러빙된 안전성/신뢰성 텔레메트리가 항상 활성화됩니다. 새 이벤트, 필드, 전송 대상은 [`PRIVACY.md`](../../PRIVACY.md)의 동의·최소화·스크러빙 경계를 지켜야 합니다.
- **바이너리 번들링** 시 라이선스 파일과 저작자 표기를 옆에 두지 않는 경우.

아이디어가 적합한지 모르겠다면 코드를 작성하기 전에 discussion을 열어주세요.

---

## Maintainer 되기

꾸준히 기여해 왔고 Maintainer가 되는 길이 궁금하다면, 규칙은 **[`MAINTAINERS.ko.md`](MAINTAINERS.ko.md)**에 있습니다. 요약하면 이렇습니다.

- Maintainer는 issue를 리뷰하고 승인하고 닫을 수 있습니다. 머지 버튼은 Core Team이 쥐고 있지만, 당신의 승인은 머지에 필요한 승인으로 그대로 인정됩니다.
- 기준은 **머지된 PR 20건 이상**에 더해, 공개된 계정 품질 검증(봇 방지, sock-puppet 방지)과 기여 품질에 대한 Core Team의 판단입니다. 지원서 양식은 없습니다. Core Team이 내부적으로 후보를 올리고 직접 연락합니다.
- **할당량도, SLA도, 정해진 임기도 없습니다.** 물러나는 일은 쉽고 되돌릴 수 있습니다(Emeritus → 여유가 생기면 복귀).
- 모든 기준, 추천 절차, 물러나는 규칙, 초기 프로젝트 면제 조항은 [`MAINTAINERS.ko.md`](MAINTAINERS.ko.md)에 있습니다. 위 내용 중 관심 가는 게 있다면 그 문서를 읽어보세요.

요컨대 좋은 PR을 내고, 사려 깊게 리뷰하고, [Discussions][discussions]와 [Discord][discord]에서 어울리다 보면 나머지는 알아서 따라옵니다.

[discussions]: https://github.com/nexu-io/open-design/discussions
[discord]: https://discord.gg/mHAjSMV6gz

---

## 라이선스

기여하면, 당신의 기여가 이 저장소의 [Apache-2.0 License](../../LICENSE)를 따른다는 데 동의하는 것입니다. 단 [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/) 안의 파일은 예외로, 원래의 MIT 라이선스와 [op7418](https://github.com/op7418)에 대한 저작자 표기를 그대로 유지합니다.

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[guizang]: https://github.com/op7418/guizang-ppt-skill
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
