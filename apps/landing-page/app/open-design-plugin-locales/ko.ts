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
    github: 'GitHub에서 설치 가이드 보기 ↗',
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
