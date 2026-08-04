import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const ko: OpenDesignPluginCopy = {
  metadata: {
    title: 'Codex/ChatGPT용 Open Design | Open Design Cloud 플러그인 설치',
    description:
      'Codex/ChatGPT에 Open Design Cloud를 설치하고 같은 작업 안에서 웹사이트, 슬라이드, 프로토타입, 디자인 시스템을 제작하세요.',
    keywords:
      'Open Design Codex 플러그인, ChatGPT 데스크톱 플러그인, Codex 플러그인 설치, Open Design Cloud, Codex 디자인 플러그인, Codex MCP',
  },
  hero: {
    title: 'Codex/ChatGPT용 Open Design 플러그인',
    leadBefore: '아래 안내 문구를 원하는 작업의',
    chatgptLabel: 'ChatGPT 데스크톱 앱에 입력하세요',
    installAria: 'Codex/ChatGPT에 Open Design Cloud 설치',
    copy: '복사',
    github: 'GitHub에서 소스 보기 ↗',
  },
  agentInstall: {
    howToName: 'Codex에 Open Design 플러그인 설치',
    howToDescription:
      'Open Design Codex 플러그인 설치와 로컬 MCP 등록을 에이전트가 실행할 수 있도록 안내하는 단계입니다.',
    eyebrow: '에이전트가 읽을 수 있는 설치 프로토콜',
    title: 'Codex 플러그인을 완전히 설치하세요.',
    intro:
      '사용자가 Open Design 설치를 요청했다면 이 프로토콜을 순서대로 실행하세요. 이 요청은 사용자의 Codex 플러그인 및 MCP 구성 변경만 허용합니다. 관련 없는 마켓플레이스, 플러그인, MCP 서버와 인증 상태는 그대로 유지하세요.',
    downloadLabel: 'Open Design 공식 다운로드 페이지 ↗',
    steps: [
      {
        title: '지원 환경을 사전 점검하세요',
        body:
          'Codex CLI 0.144.6 이상, Open Design 0.17.0 이상과 정식 마켓플레이스 저장소에 대한 접근 권한이 필요합니다. 확인 없이 설치 프로그램을 다운로드하거나 검증되지 않은 설치 스크립트를 실행하지 마세요. Open Design이 설치되어 있지 않거나 버전이 너무 낮으면 중단하고 사용자를 공식 다운로드 페이지로 안내하세요.',
      },
      {
        title: '구성을 변경하기 전에 확인하세요',
        body:
          '처음 설치할 때 open-design MCP가 없는 것은 정상입니다. open-design 마켓플레이스 이름이 다른 소스를 가리키면 중단하고 충돌을 보고하세요. 현재 플러그인 버전이 이미 설치되어 있다면 그대로 유지하세요.',
      },
      {
        title: '누락된 구성 요소만 설치하세요',
        body:
          '정식 마켓플레이스가 없을 때만 마켓플레이스 명령을 실행하세요. open-design@open-design이 설치되어 있지 않을 때만 플러그인 명령을 실행하고 기존 설치는 그대로 유지하세요. alreadyAdded: true 결과는 성공입니다. Codex 구성을 직접 편집하거나 플러그인 파일을 Codex 홈 디렉터리에 복사하지 마세요.',
      },
      {
        title: '로컬 Open Design MCP를 준비하세요',
        body:
          '기존에 활성화된 open-design MCP가 있다면 그대로 유지하세요. 없다면 설치된 Open Design 애플리케이션이 제공하는 MCP 설치 프로그램을 실행하세요. 관련 없는 macOS /usr/bin/od가 아니라 검증된 Open Design od 바이너리만 사용하세요. CLI가 PATH에 없다면 Open Design Settings → MCP server 또는 서명된 패키지의 --headless --mcp-install codex 작업을 사용하세요. localhost 포트를 추측하거나 codex mcp login을 실행하지 마세요. Vela 로그인은 Open Design에서 해야 합니다.',
      },
      {
        title: '확인하고 보고한 뒤 새 작업을 시작하세요',
        body:
          '플러그인 ID open-design@open-design과 open-design이라는 활성화된 stdio MCP를 확인하세요. 해당 명령은 Open Design의 절대 실행 경로여야 하며 bearer token, API key 또는 Vela 자격 증명을 포함해서는 안 됩니다. 설치된 항목과 아직 필요한 Open Design 또는 Vela 로그인 조건을 보고하세요. 새 Codex 작업을 시작해 설치된 플러그인 스냅샷을 불러온 다음 @open-design을 호출하세요.',
      },
    ],
  },
  demo: {
    title: '한 번 설치하고, Codex/ChatGPT에서 바로 제작하세요.',
    lead:
      '먼저 Codex와 Open Design의 전체 작업 공간을 살펴본 뒤, 실제 설치부터 결과물 완성까지의 과정을 따라가세요.',
    overviewAlt:
      'Open Design 플러그인을 사용한 실제 Codex 작업과 완성된 Goodfield 카페 웹사이트',
    overviewLabel: '실제 Codex 작업',
    overviewCaption:
      '프롬프트, Open Design으로의 작업 전달, 생성된 파일, 완성된 웹사이트를 하나의 작업 공간에서 모두 확인할 수 있습니다.',
    stepListAria: '실제 Codex 플러그인 실행의 다섯 단계',
    installPhase: '설치',
    installTitle: 'Codex에 설치를 요청하세요',
    installBody:
      '이 안내 문구를 Codex 작업에 붙여 넣으세요. Codex는 정식 Git 마켓플레이스 소스를 추가하고, 플러그인이 없을 때만 설치하며, 공개 카탈로그 등록 없이 로컬 MCP 설정을 완료합니다.',
    installNote: 'Codex에 한 번만 붙여 넣으면 나머지 설치 과정은 자동으로 처리됩니다.',
    steps: [
      {
        phase: '사용',
        title: '새 Codex 작업을 시작하세요',
        body:
          'Codex가 설치를 마치면 새 작업에서 설치된 Open Design 플러그인을 열고 “Try now”를 선택해 시작하세요.',
        alt: 'Try now 버튼이 보이는 실제 Codex의 Open Design 플러그인 상세 화면',
      },
      {
        phase: '제작',
        title: '디자인 브리프를 작성하세요',
        body:
          'Open Design을 멘션한 뒤 만들 결과물과 콘텐츠, 시각적 방향, 반응형 요구사항을 설명하세요.',
        alt: 'Open Design에 따뜻한 분위기의 동네 카페 웹사이트 제작을 요청하는 실제 Codex 프롬프트',
      },
      {
        phase: '제작',
        title: '실시간 작업 전달 과정을 확인하세요',
        body:
          'Codex가 방향을 확인하고 프로젝트를 만든 뒤 Open Design에 작업을 넘기면 파일이 실시간으로 나타납니다.',
        alt: '동네 카페 웹사이트를 생성하고 있는 실제 Codex 및 Open Design 작업 공간',
      },
      {
        phase: '제작',
        title: '완성된 결과를 검토하세요',
        body:
          '같은 작업 안에서 반응형 Goodfield 카페 랜딩 페이지와 생성된 이미지, 편집 가능한 파일을 받을 수 있습니다.',
        alt: 'Codex의 Open Design 플러그인으로 완성한 Goodfield 동네 카페 랜딩 페이지',
      },
    ],
  },
  use: {
    title: '정확한 프롬프트로 시작하세요.',
    lead:
      'Codex의 플러그인 메뉴에서 Open Design을 선택하고 결과물을 설명한 뒤 같은 작업에서 계속 다듬으세요. Codex는 플러그인 멘션을 Open Design 칩으로 표시합니다.',
    promptLabel: '실제 Codex 작업에서 사용한 프롬프트',
    copyPrompt: 'Codex 프롬프트 복사',
    galleryAria: 'Open Design으로 만든 사례',
    templates: [
      {
        alt: '질감이 느껴지는 커팅 매트와 코르크 오브젝트를 활용한 Oryzo 제품 랜딩 페이지',
        label: '제품 출시',
      },
      {
        alt: '타이포그래피 지도를 활용한 Open Design Osaka 이벤트 랜딩 페이지',
        label: '이벤트 페이지',
      },
      {
        alt: '어두운 편집 디자인 스타일의 Fable 5 제품 웹사이트',
        label: '편집 디자인 사이트',
      },
      {
        alt: '밝은 캔버스 위에 구성한 Open Design 모델 타임라인 인터페이스',
        label: '인터랙티브 스토리',
      },
    ],
    promptListAria: 'Open Design Cloud 프롬프트 예시',
    prompts: [
      { title: '웹사이트' },
      { title: '슬라이드' },
      { title: '프로토타입' },
      { title: '디자인 시스템' },
    ],
  },
  faq: {
    title: '설치 전에 확인할 내용',
    lead: '작업 제어는 Codex가 맡고, 시각적 제작 과정은 Open Design이 처리합니다.',
    items: [
      {
        q: '이 플러그인을 설치하면 Codex에 무엇이 추가되나요?',
        a:
          '웹사이트, 슬라이드, 프로토타입, 디자인 시스템을 위한 Open Design 워크플로가 Codex에 추가됩니다. 플러그인은 브리프, 프로젝트, 결과물 생성을 위해 로컬 Open Design MCP에 연결됩니다.',
      },
      {
        q: '어떤 Codex 제품을 지원하나요?',
        a:
          '현재 패키지는 Codex Desktop과 Codex CLI를 지원합니다. Codex가 첫 번째 지원 호스트입니다.',
      },
      {
        q: '설치 전에 무엇이 필요한가요?',
        a:
          'Codex CLI 0.144.6 이상과 Open Design 0.17.0 이상이 필요합니다. 로컬 MCP를 등록하기 전에 Open Design을 설치하세요.',
      },
      {
        q: '왜 새 Codex 작업을 시작해야 하나요?',
        a:
          'Codex는 작업을 시작할 때 플러그인과 MCP 기능을 불러옵니다. 새 작업을 열어야 방금 설치한 Open Design Cloud 플러그인을 사용할 수 있습니다.',
      },
      {
        q: 'Open Design 창을 계속 열어 두어야 하나요?',
        a:
          '아니요. 등록된 로컬 MCP는 필요할 때 서명된 Open Design 런타임을 헤드리스 모드로 시작할 수 있습니다.',
      },
    ],
  },
  final: {
    aria: 'Codex/ChatGPT에 Open Design Cloud 설치',
    title: '다음 Codex/ChatGPT 작업에 Open Design을 더하세요.',
    bodyBeforeMention: '플러그인을 설치하고 로컬 MCP를 연결한 뒤',
    bodyAfterMention: '을 호출하세요.',
    copy: '복사',
    download: 'Open Design 다운로드',
    source: '소스 보기',
  },
  clipboard: {
    copying: '복사 중…',
    copied: '복사됨',
    failed: '선택하여 복사',
  },
  schema: {
    pageName: 'Codex/ChatGPT용 Open Design Cloud 플러그인',
    applicationName: 'Codex/ChatGPT용 Open Design Cloud 플러그인',
  },
};

export default ko;
