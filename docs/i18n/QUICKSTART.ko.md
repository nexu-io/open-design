# 빠른 시작

<p align="center"><a href="QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a> · <b>한국어</b></p>

제품 전체를 로컬에서 실행해 보세요.

## 환경 요구사항

- **Node.js:** `~24`(Node 24.x). `package.json#engines`로 버전을 강제합니다.
- **pnpm:** `10.33.x`. `packageManager`에 `pnpm@10.33.2`를 고정해 두었으니, Corepack을 쓰면 고정된 버전이 자동으로 선택됩니다.
- **OS:** macOS, Linux, WSL2가 주요 지원 환경입니다. Windows 네이티브도 지원합니다. 자주 겪는 설치 문제는 [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md)를 참고하세요.
- **선택: 로컬 에이전트 CLI:** Claude Code, Codex, Devin for Terminal, Gemini CLI, OpenCode, Cursor Agent, Qwen, Qoder CLI, GitHub Copilot CLI 등. 설치된 CLI가 없으면 Settings에서 BYOK API 모드를 쓰면 됩니다.

### 로컬 에이전트 CLI와 PATH

daemon은 **`PATH`**(여기에 더해 자주 쓰이는 사용자 툴체인 디렉터리)를 스캔합니다. **`npm install -g`**나 **Homebrew**로 CLI를 설치했는데도 Open Design이 *not installed*로 표시한다면, GUI가 최소한의 `PATH`로 시작하면서 전역 npm이나 Homebrew의 `bin` 디렉터리를 포함하지 못한 경우입니다(앱이 전체 로그인 셸에서 실행되지 않은 macOS에서 흔히 발생). daemon을 실행하는 프로세스의 `PATH`에 실행 파일 디렉터리가 들어 있는지 확인한 뒤, **Settings → Execution mode**에서 **Rescan**을 누르세요.

[`nvm`](https://github.com/nvm-sh/nvm) / [`fnm`](https://github.com/Schniz/fnm)은 편의를 위한 선택 도구일 뿐, 프로젝트 설정에 꼭 필요한 것은 아닙니다. 둘 중 하나를 쓴다면 pnpm을 실행하기 전에 Node 24를 설치하고 선택하세요.

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

그다음 Corepack을 켜고 리포지토리가 pnpm을 선택하도록 합니다.

```bash
corepack enable
corepack pnpm --version   # 10.33.2가 출력되어야 합니다
```

## Docker 설정

Node.js나 pnpm을 로컬에 설치하지 않고도, 완전히 컨테이너화된 환경에서 Open Design을 실행할 수 있습니다.

### 요구사항

* Docker Desktop
* Docker Compose v2

Docker가 제대로 설치됐는지 확인하세요.

```bash
docker compose version
```

---

## Open Design 시작하기

리포지토리 루트에서 진행합니다.

1. deploy 디렉터리로 이동한 뒤 환경 변수 템플릿을 복사합니다.

   ```bash
   cd deploy
   cp .env.example .env
   ```

2. 안전한 토큰을 생성합니다.

   ```bash
   openssl rand -hex 32
   ```

3. 에디터에서 `.env`를 열고 `OD_API_TOKEN=`을 찾아, 방금 생성한 토큰을 붙여 넣습니다.

이제 서비스를 시작합니다.

```bash
docker compose up -d
```

브라우저에서 앱을 엽니다.

```text
http://localhost:7456
```

처음 시작할 때는 Docker가 최신 이미지를 받아오느라 몇 초 걸릴 수 있습니다.

---

## 자주 쓰는 Docker 명령어

### 로그 보기

```bash
docker compose logs -f
```

### 컨테이너 재시작

```bash
docker compose restart
```

### 컨테이너 중지

```bash
docker compose down
```

### 최신 이미지 받아오기

```bash
docker compose pull
docker compose up -d
```

### 로컬 앱 데이터 전부 삭제

```bash
docker compose down -v
```

---

## 환경 설정

기본 설정을 덮어쓰려면 `deploy/.env` 파일을 만드세요. 제공된 예시에서 시작하면 됩니다.

```bash
cp deploy/.env.example deploy/.env
```

`deploy/.env`를 편집해 직접 만든 토큰을 넣고, 나머지 값도 필요에 맞게 조정합니다.

```env
# 호스트에 노출할 포트
OPEN_DESIGN_PORT=7456

# 컨테이너 메모리 제한
OPEN_DESIGN_MEM_LIMIT=384m

# 허용할 CORS origin
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com

# Docker 이미지 태그
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:latest

# daemon 보안에 필요한 API 토큰
# 생성 방법: openssl rand -hex 32
OD_API_TOKEN=
```

---

## 영구 저장소

영구 daemon 저장 경로를 문서화하거나, 변경하거나, 선택하기 전에
반드시 루트 `AGENTS.md`의 **Daemon data directory contract**를 읽어야 합니다.
이 Quickstart는 그 계약을 다시 서술하거나 저장 경로를 정의해서는 안 됩니다.

---

## 참고

* Docker 모드는 로컬에 Node.js나 pnpm을 설치하고 싶지 않은 기여자에게 적합합니다.
* 컨테이너는 프로덕션 daemon 빌드를 `7456` 포트에 직접 노출합니다.
* 개발 워크플로우와 더 깊은 로컬 설정은 이 빠른 시작 가이드의 나머지 부분을 참고하세요.

---

## 한 번에 실행하기 (dev 모드)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # daemon + web을 포그라운드로 시작합니다
# tools-dev가 출력한 web URL을 엽니다
```

데스크톱 셸과 관리 대상 sidecar 전부를 백그라운드로 실행하려면:

```bash
pnpm tools-dev # daemon + web + desktop을 백그라운드로 시작합니다
```

처음 로드할 때 앱은 설치된 코드 에이전트 CLI(Claude Code / Codex / Gemini / OpenCode / Cursor Agent / Qwen)를 감지해 자동으로 선택하고, 기본값으로 `web-prototype` skill과 `Neutral Modern` design system을 사용합니다. 프롬프트를 입력하고 **Send**를 누르세요. 에이전트 출력은 왼쪽 패널에 스트리밍되고, `<artifact>` 태그가 파싱되어 HTML이 오른쪽에 실시간으로 렌더링됩니다. 완료되면 **Save to disk**로 artifact를 저장할 수 있습니다. artifact 저장 경로를 문서화하거나 변경하기 전에 반드시 루트 `AGENTS.md`의 **Daemon data directory contract**를 읽어야 합니다.

**Design system** 드롭다운에는 71개의 내장 시스템이 들어 있습니다. 직접 작성한 스타터 2개(Neutral Modern, Warm Editorial)와 [`awesome-design-md`](https://github.com/VoltAgent/awesome-design-md)에서 가져온 69개의 제품 시스템으로, 카테고리별(AI & LLM, Developer Tools, Productivity, Backend, Design Tools, Fintech, E-Commerce, Media, Automotive)로 묶여 있습니다. 하나를 고르면 모든 프로토타입이 그 브랜드의 미감으로 입혀집니다. 여기에 [`awesome-design-skills`](https://github.com/bergside/awesome-design-skills)에서 가져온 57개의 디자인 skill도 함께 제공됩니다.

**Skill** 드롭다운은 모드별(Prototype / Deck / Template / Design system)로 묶이며, 각 모드의 기본 skill에는 `· default` 접미사가 붙습니다. 함께 제공되는 skill은 다음과 같습니다.

- **Prototype** — `web-prototype`(범용), `saas-landing`, `dashboard`, `pricing-page`, `docs-page`, `blog-post`, `mobile-app`.
- **Deck / PPT** — `simple-deck`(단일 파일 가로 스와이프)과 `magazine-web-ppt`([`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill)에서 가져온 `guizang-ppt` 번들. deck 모드의 기본값이며, 자체 에셋/템플릿과 레퍼런스 4개를 함께 제공). 사이드 파일이 있는 skill에는 "Skill root (absolute)" 머리말이 자동으로 붙어, 에이전트가 `assets/template.html`이나 `references/*.md`를 CWD가 아니라 실제 디스크 경로 기준으로 해석할 수 있습니다.

skill과 디자인 시스템을 짝지으면, 프롬프트 하나로 선택한 시각 언어에 맞는 프로토타입이나 deck이 레이아웃에 맞게 생성됩니다.

## 그 밖의 스크립트

```bash
pnpm tools-dev                 # daemon + web + desktop을 백그라운드로
pnpm tools-dev start web       # daemon + web을 백그라운드로
pnpm tools-dev run web         # daemon + web을 포그라운드로 (e2e/dev 서버)
pnpm tools-dev restart         # daemon + web + desktop 재시작
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # 관리 중인 런타임 확인
pnpm tools-dev logs            # daemon/web/desktop 로그 보기
pnpm tools-dev check           # 상태 + 최근 로그 + 일반 진단
pnpm tools-dev stop            # 관리 중인 런타임 중지
pnpm --filter @open-design/daemon build  # `od`용 apps/daemon/dist/cli.js 빌드
pnpm --filter @open-design/web build     # 필요할 때 web 패키지 빌드
pnpm typecheck                 # 워크스페이스 타입 체크
```

로컬 라이프사이클의 진입점은 `pnpm tools-dev` 하나뿐입니다. 삭제된 옛 루트 alias(`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`)는 쓰지 마세요.

로컬 개발 중에는 `tools-dev`가 daemon을 먼저 띄우고 그 포트를 `apps/web`에 넘깁니다. `apps/web/next.config.ts`는 `/api/*`, `/artifacts/*`, `/frames/*`를 그 daemon 포트로 다시 매핑하므로, App Router 앱이 CORS 설정 없이도 옆에서 도는 Express 프로세스와 통신할 수 있습니다.

## 미디어 생성 / 에이전트 dispatcher 점검

이미지, 비디오, 오디오, HyperFrames skill은 daemon이 에이전트를 spawn할 때 주입하는 환경 변수를 통해 로컬 `od` CLI를 호출합니다.

- `OD_BIN` — `apps/daemon/dist/cli.js`의 절대 경로.
- `OD_DAEMON_URL` — 실행 중인 daemon URL.
- `OD_PROJECT_ID` — 활성 프로젝트 id.
- `OD_PROJECT_DIR` — 활성 프로젝트의 파일 디렉터리.

미디어 생성이 `OD_BIN: parameter not set`, `apps/daemon/dist/cli.js` 누락, `failed to reach daemon at http://127.0.0.1:0` 같은 메시지로 실패하면, daemon CLI를 다시 빌드하고 관리 중인 런타임을 재시작하세요.

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

그다음 오래된 터미널 에이전트 세션을 이어 가지 말고, Open Design 앱에서 프로젝트를 다시 여세요. daemon이 spawn한 에이전트라면 다음과 같은 값이 보여야 합니다.

```bash
echo "OD_BIN=$OD_BIN"
echo "OD_PROJECT_ID=$OD_PROJECT_ID"
echo "OD_PROJECT_DIR=$OD_PROJECT_DIR"
echo "OD_DAEMON_URL=$OD_DAEMON_URL"
ls -la "$OD_BIN"
```

`OD_DAEMON_URL`은 `http://127.0.0.1:7457`처럼 실제 daemon 포트여야 하며, `http://127.0.0.1:0`이어서는 안 됩니다. `:0` 값은 "빈 포트를 골라라"라는 내부 실행 힌트일 뿐이라, 에이전트 세션으로 새어 나가면 안 됩니다.

daemon 단독 프로덕션 모드에서는 daemon이 정적 Next.js export를 `http://localhost:7456`에서 직접 서빙하므로, reverse proxy가 끼어들지 않습니다.

daemon 앞에 nginx를 둔다면, SSE 경로는 버퍼링과 압축을 끄세요. 흔한 실패는 80~90초 뒤 브라우저 콘솔에 `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)`가 뜨는 경우입니다. daemon이 `X-Accel-Buffering: no`를 보내도 nginx의 `gzip on`이 청크 SSE 응답을 버퍼링하기 때문입니다.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:7456;

    proxy_buffering off;
    gzip off;

    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 두 가지 실행 모드

| 모드 | 선택값 | 요청이 흐르는 경로 |
|---|---|---|
| **Local CLI** (daemon이 에이전트를 감지하면 기본값) | "Local CLI" | 프론트엔드 → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → artifact 파서 → 미리보기 |
| **API 모드** (대체 수단 / CLI 없음) | "Anthropic API" / "OpenAI API" / "Azure OpenAI" / "Google Gemini" | 프론트엔드 → daemon `/api/proxy/{provider}/stream` → 프로바이더 SSE를 `delta/end/error`로 정규화 → artifact 파서 → 미리보기 |

두 모드 모두 **같은** `<artifact>` 파서와 **같은** 샌드박스 iframe으로 들어갑니다. 다른 점은 전송 방식과 시스템 프롬프트 전달 방식뿐입니다(로컬 CLI는 별도의 시스템 채널이 없어서, 조합된 프롬프트를 사용자 메시지 안에 접어 넣습니다).

## 프롬프트 구성

전송할 때마다 앱은 세 개의 레이어로 시스템 프롬프트를 만들어 프로바이더에 보냅니다.

```
BASE_SYSTEM_PROMPT   (출력 규약: <artifact>로 감싸고, 코드 펜스는 쓰지 않는다)
   + 활성 디자인 시스템 본문  (DESIGN.md — 팔레트/타입/레이아웃)
   + 활성 skill 본문          (SKILL.md — 워크플로우와 출력 규칙)
```

상단 바에서 skill이나 디자인 시스템을 바꾸면, 다음 전송부터 새 조합이 적용됩니다. 본문은 세션별로 메모리에 캐시되므로, 한 번 선택할 때 daemon에 한 번만 요청합니다.

## 파일 맵

```
open-design/
├── apps/
│   ├── daemon/                # Node/Express — 로컬 에이전트 spawn + API 서빙
│   │   └── src/
│   │       ├── cli.ts             # `od` bin 진입점
│   │       ├── server.ts          # /api/* + 정적 서빙
│   │       ├── agents.ts          # claude/codex/devin/gemini/opencode/cursor-agent/qwen/qoder/copilot용 PATH 스캐너
│   │       ├── skills.ts          # SKILL.md 로더 (frontmatter 파서)
│   │       └── design-systems.ts  # DESIGN.md 로더
│   │   ├── sidecar/           # tools-dev daemon sidecar 래퍼
│   │   └── tests/             # daemon 패키지 테스트
│   ├── web/                   # Next.js 16 App Router + React 클라이언트
│       ├── app/               # App Router 진입점
│       ├── src/               # React + TypeScript 클라이언트/런타임 모듈
│       │   ├── App.tsx        # 모드 / skill / DS 선택기 + 전송 조율
│       │   ├── providers/     # daemon + BYOK API 전송 계층
│       │   ├── prompts/       # system, discovery, directions, deck framework
│       │   ├── artifacts/     # 스트리밍 <artifact> 파서 + manifest
│       │   ├── runtime/       # iframe srcdoc, markdown, export 헬퍼
│       │   └── state/         # localStorage + daemon 기반 프로젝트 상태
│       ├── sidecar/           # tools-dev web sidecar 래퍼
│       └── next.config.ts     # tools-dev rewrite + prod apps/web/out export 설정
│   └── desktop/               # tools-dev가 실행/점검하는 Electron 런타임
├── packages/
│   ├── contracts/             # 공유 web/daemon 앱 contract
│   ├── sidecar-proto/         # Open Design sidecar 프로토콜 contract
│   ├── sidecar/               # 범용 sidecar 런타임 프리미티브
│   └── platform/              # 범용 process/platform 프리미티브
├── tools/dev/                 # `pnpm tools-dev` 라이프사이클 및 inspect CLI
├── e2e/                       # Playwright UI + 외부 통합/Vitest 하네스
├── skills/                    # SKILL.md — 어떤 Claude Code skill 리포지토리에서든 그대로 넣을 수 있음
│   ├── web-prototype/         # 범용 단일 화면 프로토타입 (prototype 모드 기본값)
│   ├── saas-landing/          # 마케팅 페이지 (hero / features / pricing / CTA)
│   ├── dashboard/             # 관리자 / 분석 대시보드
│   ├── pricing-page/          # 단독 가격 + 비교
│   ├── docs-page/             # 3단 문서 레이아웃
│   ├── blog-post/             # 에디토리얼 롱폼
│   ├── mobile-app/            # 휴대폰 프레임 단일 화면
│   ├── simple-deck/           # 미니멀 가로 스와이프 deck
│   └── guizang-ppt/           # magazine-web-ppt — 번들된 deck/PPT 기본값
│       ├── SKILL.md
│       ├── assets/template.html
│       └── references/{themes,layouts,components,checklist}.md
├── design-systems/            # DESIGN.md — 9개 섹션 스키마 (awesome-claude-design)
│   ├── default/               # Neutral Modern (스타터)
│   ├── warm-editorial/        # Warm Editorial (스타터)
│   ├── README.md              # 카탈로그 개요
│   └── …129개 시스템          # 스타터 2개 · 제품 시스템 70개 · 디자인 skill 57개
├── scripts/sync-design-systems.ts    # 업스트림 getdesign tarball에서 다시 import
├── docs/                      # 제품 비전 + 스펙
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # 루트 품질 스크립트 + `od` bin
```

## 문제 해결

- **Node.js 버전을 바꾼 뒤 `better-sqlite3`가 로드되지 않거나 ABI가 맞지 않을 때** — `pnpm install`이 `postinstall`을 자동으로 다시 돌려 현재 Node.js에 맞게 네이티브 애드온을 리빌드합니다. 직접 리빌드하거나 수정을 확인하려면 `pnpm --filter @open-design/daemon rebuild better-sqlite3`를 실행한 뒤 `pnpm --filter @open-design/daemon exec node -e "require('better-sqlite3')"`를 돌리세요. 빌드 도구 `python3`, `make`, `g++`(또는 `clang++`)가 필요합니다. `.npmrc`에 `ignore-scripts=true`가 있다면, `pnpm install` 후 `node scripts/postinstall.mjs`를 실행하세요.
- **"no agents found on PATH"** — `claude`, `codex`, `devin`, `gemini`, `opencode`, `cursor-agent`, `qwen`, `qodercli`, `copilot` 중 하나를 설치하세요. 아니면 Settings에서 API 모드로 바꾸고 프로바이더 키를 붙여 넣으세요.
- **Claude Code가 코드 1로 종료될 때** — Open Design이 `claude`를 시작하긴 했지만, spawn된 비대화형 실행이 응답을 내기 전에 실패한 경우입니다. Open Design을 시작하는 셸이나 앱 환경과 같은 곳에서 다음을 확인하세요.
  ```bash
  claude --version
  claude auth status --text
  printf 'hello' | claude -p --output-format stream-json --verbose --permission-mode bypassPermissions
  ```
  스모크 테스트가 커스텀 엔드포인트 없이 `401`, `apiKeySource: "none"`, 또는 다른 인증 오류를 낸다면, `claude`를 실행해 `/login`한 뒤 Claude를 종료하고 Open Design을 다시 시도하세요. Claude 프로필을 여러 개 쓴다면 **Settings -> Execution mode -> Claude Code config directory**를 `~/.claude-2` 같은 프로필 경로로 지정하세요. `ANTHROPIC_BASE_URL`이나 프록시가 설정돼 있다면 엔드포인트 URL, 프록시 자격 증명, 엔드포인트 인증 환경, 모델 접근 권한을 확인하세요. 표준 Claude Code 인증으로 다시 시도하려는 게 아니라면 커스텀 엔드포인트는 그대로 두세요. Windows에서는 네이티브 PowerShell과 WSL이 서로 다른 Claude 설치본과 자격 증명 저장소를 쓰므로, Open Design이 쓰는 것과 같은 환경에서 다시 인증하고, `/login`으로도 네이티브 Windows 자격 증명이 복구되지 않으면 Windows 자격 증명 관리자를 확인하세요.
- **`/api/chat`에서 daemon 500** — daemon 터미널의 stderr 끝부분을 확인하세요. 대개 CLI가 자신의 인자를 거부한 경우입니다. CLI마다 받는 argv 형태가 다릅니다. 손봐야 한다면 `apps/daemon/src/agents.ts`의 `buildArgs`를 보세요.
- **미디어 생성이 `OD_BIN` 누락 또는 daemon URL이 `:0`이라고 할 때** — 위의 미디어 dispatcher 점검을 실행하세요. 옛 CLI 세션을 이어 가지 말고, Open Design 앱에서 프로젝트를 다시 열어 daemon이 새 `OD_*` 변수를 주입하게 하세요.
- **Codex가 플러그인 컨텍스트를 너무 많이 로드할 때** — `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev`로 Open Design을 시작하면, daemon이 spawn하는 Codex 프로세스가 `--disable plugins`로 실행됩니다.
- **artifact가 끝내 렌더링되지 않을 때** — 모델이 `<artifact>`로 감싸지 않은 텍스트를 만든 경우입니다. 시스템 프롬프트가 제대로 전달되는지 확인하고(daemon 로그 확인), 더 강력한 모델이나 더 엄격한 skill로 바꿔 보세요.

## 비전과 다시 잇기

이 빠른 시작은 [`docs/`](../../docs/)에 담긴 스펙을 실제로 돌릴 수 있게 만든 씨앗입니다. 스펙은 이것이 어디로 자라날지 설명합니다([`docs/roadmap.md`](../../docs/roadmap.md) 참고). 핵심만 짚으면 다음과 같습니다.

- `docs/architecture.md`는 출시된 스택을 설명합니다. 앞단의 Next.js 16 App Router, 그 뒤의 로컬 daemon, 그리고 dev에서 `apps/web/next.config.ts`의 rewrite가 브라우저를 같은 `/api` 표면과 계속 통신하게 유지하는 구조입니다.
- `docs/skills-protocol.md`는 `od:` frontmatter 전체(타입 입력, 슬라이더, 기능 게이팅)를 설명합니다. 이 MVP는 `name` / `description` / `triggers` / `od.mode` / `od.design_system.requires`만 읽습니다. 나머지를 추가하려면 `apps/daemon/src/skills.ts`를 확장하세요.
- `docs/agent-adapters.md`는 더 풍부한 dispatch(기능 감지, 스트리밍 tool-call)를 내다봅니다. 우리의 `apps/daemon/src/agents.ts`는 배선을 증명할 만큼만 갖춘 최소 dispatcher입니다.
- `docs/modes.md`는 네 가지 모드를 나열합니다. prototype / deck / template / design-system. 우리는 앞의 두 가지를 위한 skill을 제공하며, 선택기는 이미 `mode`로 필터링합니다.
