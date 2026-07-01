import type { SolutionLocaleCopy } from './types';

export const KO: SolutionLocaleCopy = {
  aiWireframeGenerator: {
    title: 'AI 와이어프레임 생성기 — Open Design으로 프롬프트에서 와이어프레임까지',
    description:
      '프롬프트를 편집 가능한 멀티 스크린 와이어프레임으로 바꾸고, 나아가 출시할 수 있는 코드까지 끌고 가는 무료 오픈소스 AI 와이어프레임 생성기입니다. Open Design은 이미 사용 중인 코딩 에이전트 안에서 실행되므로 와이어프레임과 실제 제품이 하나의 원천을 공유합니다.',
    breadcrumb: 'AI 와이어프레임 생성기',
    label: '도구 · AI 와이어프레임 생성기',
    heading: '프롬프트의 속도로 와이어프레임',
    lead: '화면이나 플로우를 설명하면 에이전트가 깔끔하고 편집 가능한 와이어프레임을 생성합니다 — 일관된 레이아웃, 진짜 컴포넌트, 여러 화면. 그리고 멈추지 않습니다: 같은 산출물이 스타일이 잡힌 프로토타입과 출시 코드가 되며, 이미 실행 중인 에이전트 안에서 이루어집니다.',
    heroImageAlt:
      '프롬프트가 편집 가능한 와이어프레임으로, 다시 완성된 UI로 바뀌고 초록색 선택 상자로 둘러싸인 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      '대부분의 AI 와이어프레임 생성기는 나중에 다시 만들어야 할 그림 하나를 건넵니다. Open Design은 코딩 에이전트 안에서 와이어프레임을 생성하고 프롬프트에서 출시 코드까지 그대로 끌고 갑니다 — 내보내기 단계도, 인계의 단절도, 좌석당 과금도 없이.',
    stepsTitle: 'AI 와이어프레임 생성기가 작동하는 방식',
    steps: [
      {
        title: '화면을 설명한다',
        body: '무엇을 와이어프레임으로 만들지 평범한 언어로 에이전트에게 말합니다 — "사이드바, 통계 행, 최근 활동 테이블이 있는 대시보드"처럼. Open Design이 와이어프레임 기술을 불러와 에이전트가 단일 정적 이미지가 아니라 구조와 위계를 배치하게 합니다.',
        imageAlt: '평범한 언어로 된 화면 설명을 터미널에 입력하는 일러스트',
      },
      {
        title: '편집 가능한 와이어프레임을 생성한다',
        body: '에이전트는 재사용 가능한 디자인 시스템에서 가져온 레이아웃 패턴과 컴포넌트를 적용하므로 모든 화면이 여백, 그리드, 구조를 공유합니다. 동떨어진 박스가 아니라 한 세트로 묶인 여러 화면 — 편집 가능하고 일관된 와이어프레임을 얻습니다.',
        imageAlt: '여러 와이어프레임 화면이 하나의 일관된 레이아웃 그리드로 나타나는 일러스트',
      },
      {
        title: '완성도를 높인다',
        body: '에이전트에게 와이어프레임을 스타일이 잡히고 클릭 가능한 프로토타입으로 끌어올려 달라고 합니다 — 타이포그래피, 색상, 진짜 인터랙션. 같은 산출물이 다시 그려지는 대신 완성도를 더해 가므로 로파이와 하이파이 사이에서 버려지는 것이 없습니다.',
        imageAlt: '로파이 와이어프레임이 정교한 하이파이 화면으로 바뀌는 일러스트',
      },
      {
        title: '내가 소유한 코드를 출시한다',
        body: '산출물이 프로젝트 안에 있기 때문에 와이어프레임과 최종 코드가 하나의 진실 공급원을 공유합니다. 에이전트와 대화하며 반복하세요; 출력은 내가 소유하고 출시할 수 있는 HTML/코드입니다 — 벤더 종속 없이.',
        imageAlt: '와이어프레임이 초록색 선택 프레임에 담긴 출시 코드로 흘러 들어가는 일러스트',
      },
    ],
    tableTitle: 'Open Design vs 일반적인 AI 와이어프레임 생성기',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '일반적인 AI 와이어프레임 생성기',
    tableRows: [
      {
        capability: '프롬프트에서 생성',
        withOd: '이미 열어 둔 에이전트에 프롬프트 하나',
        without: '별도 웹 도구에 가입하고 그들의 클라우드에서 생성',
      },
      {
        capability: '연결된 여러 화면',
        withOd: '공유 레이아웃과 컴포넌트를 갖춘 한 세트로 생성',
        without: '대개 한 번에 한 화면',
      },
      {
        capability: '로파이에서 하이파이로',
        withOd: '같은 산출물이 완성도를 더함 — 와이어프레임 → 프로토타입 → 코드',
        without: '와이어프레임은 막다른 길; 하이파이와 코드를 위해 다시 제작',
      },
      {
        capability: '결과물을 소유',
        withOd: '리포지토리 안의 평범한 파일과 코드, 온전히 내 것',
        without: '그들의 앱 안에서만 편집 가능; 내보내기 제한',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '좌석당 또는 크레딧당 구독, 벤더 호스팅',
      },
    ],
    featuresTitle: '와이어프레임으로 만들 수 있는 것',
    features: [
      {
        title: '웹 앱 화면',
        body: '대시보드, 설정, 멀티 스크린 플로우 — 일관된 한 세트로 와이어프레임을 만들고 코드로 이어 갑니다.',
        thumb: 'example-web-prototype',
      },
      {
        title: '모바일 앱 플로우',
        body: '일관된 구조와 상태를 갖춘 화면별 모바일 여정.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'SaaS 랜딩 페이지',
        body: '와이어프레임을 만들고, 스타일을 입히고, 출시할 수 있는 마케팅·SaaS 랜딩 레이아웃.',
        thumb: 'example-saas-landing',
      },
      {
        title: '온보딩과 폼',
        body: '명확한 위계로 배치된 다단계 온보딩, 가입, 폼 플로우.',
        thumb: 'example-hr-onboarding',
      },
      {
        title: '어떤 비주얼 취향이든',
        body: '로파이로 시작해 처음부터 끝까지 일관된 스타일을 이어 갑니다 — 에디토리얼, 소프트, 볼드.',
        thumb: 'example-gamified-app',
      },
      {
        title: '랜딩과 전환',
        body: '히어로, 요금, 대기자 명단 레이아웃이 첫 시도부터 연결되고 브랜드에 맞게.',
        thumb: 'example-kami-landing',
      },
    ],
    galleryTitle: 'Open Design으로 만든 와이어프레임',
    galleryLead:
      '모두가 프롬프트로 시작해 편집 가능하고 클릭 가능한 산출물로 렌더링되었습니다. 아이디어에 가까운 템플릿을 고르고 변형을 설명하면 에이전트가 그것을 적응시킵니다 — 와이어프레임에서 출시 코드까지.',
    gallery: [
      { thumb: 'example-dating-web', caption: '데이팅 웹 앱 — 멀티 스크린 와이어프레임' },
      { thumb: 'example-hr-onboarding', caption: '인사 온보딩 플로우' },
      { thumb: 'example-kami-landing', caption: '제품 랜딩 레이아웃' },
      { thumb: 'example-web-prototype-taste-soft', caption: '소프트 스타일 웹 와이어프레임' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '템플릿 둘러보기',
    faqTitle: 'AI 와이어프레임 생성기 FAQ',
    faq: [
      {
        q: 'AI 와이어프레임 생성기는 무료인가요?',
        a: '네. Open Design은 오픈소스이며 자신의 프로바이더 키로 이미 사용 중인 코딩 에이전트 안에서 실행됩니다 — 와이어프레임 생성기 자체에는 좌석당이나 크레딧당 과금이 없습니다.',
      },
      {
        q: '와이어프레임은 편집 가능한가요, 아니면 그냥 이미지인가요?',
        a: '편집 가능합니다. 출력이 진짜 HTML과 코드이므로 에이전트와 대화하며 레이아웃, 컴포넌트, 콘텐츠를 다듬을 수 있습니다 — 다시 만들어야 할 그림에 박힌 픽셀이 아니라.',
      },
      {
        q: '와이어프레임이 하이파이 프로토타입과 실제 코드가 될 수 있나요?',
        a: '바로 그게 핵심입니다. 같은 산출물이 완성도를 더해 갑니다 — 와이어프레임에서 스타일이 잡힌 프로토타입, 출시 코드까지 — 단계마다 다시 그려지는 대신 프로젝트 안에 살아 있기 때문입니다.',
      },
      {
        q: '어떤 에이전트와 함께 작동하나요?',
        a: 'Open Design은 Claude Code, Codex, Cursor Agent, Gemini CLI 및 12종 이상의 퍼스트파티 어댑터와 함께 작동합니다. 자신의 프로바이더 키를 가져오며, 무엇도 대신 호스팅되지 않습니다.',
      },
    ],
    ctaTitle: '오늘 밤 첫 와이어프레임을 생성하세요',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 다음 화면 아이디어를 편집 가능한 와이어프레임으로 — 그리고 출시 코드로 — 이미 사용 중인 에이전트 안에서 바꿔 보세요.',
    relatedTitle: '관련 도구와 가이드',
    related: [
      { href: '/solutions/ai-ui-generator/', label: 'AI UI 생성기' },
      { href: '/solutions/design-to-code/', label: 'Open Design으로 디자인에서 코드로' },
      { href: '/blog/design-to-code-tools/', label: '최고의 디자인-투-코드 도구' },
      { href: '/solutions/prototype/', label: 'Open Design으로 프로토타이핑' },
    ],
  },
  aiUiGenerator: {
    title: 'AI UI 생성기 — Open Design으로 프롬프트에서 프로덕션 UI까지',
    description:
      '프롬프트를 진짜 컴포넌트 기반 인터페이스로 바꾸고, 나아가 출시할 수 있는 코드까지 끌고 가는 무료 오픈소스 AI UI 생성기입니다. Open Design은 이미 사용 중인 코딩 에이전트 안에서 실행되므로 생성된 UI와 프로덕션 코드가 같은 산출물입니다.',
    breadcrumb: 'AI UI 생성기',
    label: '도구 · AI UI 생성기',
    heading: '진짜로 출시할 수 있는 UI를 생성하세요',
    lead: '인터페이스를 설명하면 에이전트가 진짜 컴포넌트 기반 UI를 생성합니다 — 일관된 디자인 시스템, 반응형 레이아웃, 작동하는 상태. 그리고 멈추지 않습니다: 같은 산출물이 출시 코드가 되며, 이미 실행 중인 에이전트 안에서 이루어집니다.',
    heroImageAlt:
      '프롬프트가 컴포넌트 기반 UI로, 다시 프로덕션 코드로 바뀌고 초록색 선택 상자로 둘러싸인 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      '대부분의 AI UI 생성기는 목업이나 한 번 쓰고 버릴 React 스니펫을 줍니다. Open Design은 코딩 에이전트 안에서 UI를 생성하고 프롬프트에서 출시 코드까지 그대로 끌고 갑니다 — 진짜 컴포넌트, 내 디자인 시스템, 내보내기 단계도 좌석당 과금도 없이.',
    stepsTitle: 'AI UI 생성기가 작동하는 방식',
    steps: [
      {
        title: '인터페이스를 설명한다',
        body: '무엇을 만들지 평범한 언어로 에이전트에게 말합니다 — "사이드바, 탭으로 나뉜 섹션, 저장 바가 있는 설정 페이지"처럼. Open Design이 UI 기술을 불러와 에이전트가 일회성 화면이 아니라 진짜 컴포넌트와 디자인 시스템을 끌어옵니다.',
        imageAlt: '평범한 언어로 된 UI 설명을 터미널에 입력하는 일러스트',
      },
      {
        title: '컴포넌트 기반 UI를 생성한다',
        body: '에이전트는 재사용 가능한 컴포넌트와 디자인 토큰으로 인터페이스를 조립하므로 여백, 타입 스케일, 색상이 모든 화면에서 일관되게 유지됩니다. 풀어내야 할 인라인 스타일 더미가 아니라 일관된 UI를 얻습니다.',
        imageAlt: '재사용 가능한 컴포넌트 블록으로 UI가 그리드 위에서 조립되는 일러스트',
      },
      {
        title: '대화하며 다듬는다',
        body: '레이아웃, 상태, 테마를 대화로 조정합니다 — "여백을 좁혀줘", "빈 상태를 추가해줘", "기본을 다크로 만들어줘"처럼. 산출물은 처음부터 다시 생성되는 대신 그 자리에서 갱신됩니다.',
        imageAlt: '채팅으로 UI가 다듬어지고 미묘한 전후 상태를 보여주는 일러스트',
      },
      {
        title: '내가 소유한 코드를 출시한다',
        body: 'UI가 프로젝트 안에 있기 때문에 디자인과 프로덕션 코드가 하나의 진실 공급원을 공유합니다. 출력은 내가 소유하고 출시할 수 있는 HTML/코드입니다 — 벤더 종속도, 디자인과 빌드 사이의 재작성도 없이.',
        imageAlt: '생성된 UI가 초록색 선택 프레임에 담긴 출시 코드로 흘러 들어가는 일러스트',
      },
    ],
    tableTitle: 'Open Design vs 일반적인 AI UI 생성기',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '일반적인 AI UI 생성기',
    tableRows: [
      {
        capability: '프롬프트에서 생성',
        withOd: '이미 열어 둔 에이전트에 프롬프트 하나',
        without: '별도 웹 도구에 가입하고 그들의 클라우드에서 생성',
      },
      {
        capability: '진짜 컴포넌트',
        withOd: '재사용 가능한 디자인 시스템에서 만들어지고 화면 전반에 일관됨',
        without: '나중에 리팩터링할 일회성 마크업이나 인라인 스타일',
      },
      {
        capability: '디자인에서 코드로',
        withOd: '같은 산출물이 출시 코드가 됨 — 재작성 없이',
        without: 'UI 목업은 막다른 길; 프로덕션을 위해 다시 제작',
      },
      {
        capability: '결과물을 소유',
        withOd: '리포지토리 안의 평범한 파일과 코드, 온전히 내 것',
        without: '그들의 앱 안에서만 편집 가능; 내보내기 제한',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '좌석당 또는 크레딧당 구독, 벤더 호스팅',
      },
    ],
    featuresTitle: '생성할 수 있는 것',
    features: [
      {
        title: '웹 앱 인터페이스',
        body: '대시보드, 설정, 데이터 테이블 — 일관된 컴포넌트 세트로 생성하고 코드로 이어 갑니다.',
        thumb: 'example-web-prototype',
      },
      {
        title: '모바일 앱 UI',
        body: '일관된 컴포넌트와 상태를 갖춘 화면별 모바일 인터페이스.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'SaaS와 마케팅 페이지',
        body: '생성하고, 테마를 입히고, 출시할 수 있는 랜딩·요금·마케팅 UI.',
        thumb: 'example-saas-landing',
      },
      {
        title: '폼과 플로우',
        body: '명확한 위계와 상태를 갖춘 다단계 폼, 온보딩, 인증 플로우.',
        thumb: 'example-hr-onboarding',
      },
      {
        title: '디자인 시스템',
        body: '공유 디자인 시스템을 따르는 UI를 생성합니다 — 토큰, 컴포넌트, 여백.',
        thumb: 'example-gamified-app',
      },
      {
        title: '어떤 비주얼 취향이든',
        body: '에디토리얼, 소프트, 볼드 — 처음부터 끝까지 하나의 일관된 스타일을 이어 갑니다.',
        thumb: 'example-kami-landing',
      },
    ],
    galleryTitle: 'Open Design으로 만든 UI',
    galleryLead:
      '모두가 프롬프트로 시작해 진짜 컴포넌트 기반 산출물로 렌더링되었습니다. 아이디어에 가까운 템플릿을 고르고 변형을 설명하면 에이전트가 그것을 적응시킵니다 — UI에서 출시 코드까지.',
    gallery: [
      { thumb: 'example-dating-web', caption: '데이팅 웹 앱 — 컴포넌트 기반 UI' },
      { thumb: 'example-hr-onboarding', caption: '인사 온보딩 플로우' },
      { thumb: 'example-kami-landing', caption: '제품 랜딩 UI' },
      { thumb: 'example-web-prototype-taste-soft', caption: '소프트 스타일 웹 UI' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '템플릿 둘러보기',
    faqTitle: 'AI UI 생성기 FAQ',
    faq: [
      {
        q: 'AI UI 생성기는 무료인가요?',
        a: '네. Open Design은 오픈소스이며 자신의 프로바이더 키로 이미 사용 중인 코딩 에이전트 안에서 실행됩니다 — UI 생성기 자체에는 좌석당이나 크레딧당 과금이 없습니다.',
      },
      {
        q: '진짜 컴포넌트를 생성하나요, 아니면 그냥 목업인가요?',
        a: '진짜 컴포넌트입니다. 출력은 재사용 가능한 디자인 시스템에서 만들어진 HTML과 코드이므로 평면적인 목업을 다시 만드는 대신 에이전트와 대화하며 레이아웃, 상태, 테마를 다듬습니다.',
      },
      {
        q: '생성된 UI가 프로덕션 코드가 될 수 있나요?',
        a: '바로 그게 핵심입니다. 같은 산출물이 출시 코드가 됩니다, 프로젝트 안에 살아 있기 때문입니다 — 생성된 UI와 배포하는 것 사이에 재작성이나 인계의 단절이 없습니다.',
      },
      {
        q: '어떤 에이전트와 함께 작동하나요?',
        a: 'Open Design은 Claude Code, Codex, Cursor Agent, Gemini CLI 및 12종 이상의 퍼스트파티 어댑터와 함께 작동합니다. 자신의 프로바이더 키를 가져오며, 무엇도 대신 호스팅되지 않습니다.',
      },
    ],
    ctaTitle: '오늘 밤 첫 UI를 생성하세요',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 다음 인터페이스 아이디어를 진짜 컴포넌트 기반 UI로 — 그리고 출시 코드로 — 이미 사용 중인 에이전트 안에서 바꿔 보세요.',
    relatedTitle: '관련 도구와 가이드',
    related: [
      { href: '/solutions/ai-wireframe-generator/', label: 'AI 와이어프레임 생성기' },
      { href: '/solutions/design-to-code/', label: 'Open Design으로 디자인에서 코드로' },
      { href: '/blog/best-ai-design-tools/', label: '최고의 AI 디자인 도구' },
      { href: '/solutions/designer/', label: '디자이너를 위한 Open Design' },
    ],
  },
  designToCode: {
    title: '디자인에서 코드로 — Open Design으로 디자인을 출시 코드로 바꾸기',
    description:
      '프롬프트나 디자인을 진짜 편집 가능한 코드로 바꾸는 무료 오픈소스 디자인-투-코드 워크플로우입니다 — 이미 사용 중인 코딩 에이전트 안에서. 내보내기도, 인계도 없이: 디자인과 프로덕션 코드가 내가 소유하고 출시하는 하나의 산출물입니다.',
    breadcrumb: '디자인에서 코드로',
    label: '도구 · 디자인에서 코드로',
    heading: '인계 없는 디자인에서 코드로',
    lead: '화면을 설명하거나 디자인을 가져오면 에이전트가 그것을 깔끔한 컴포넌트 기반 코드로 바꿉니다 — 반응형 레이아웃, 진짜 상태, 내 스택. 디자인과 코드가 같은 산출물이므로 옮기는 과정에서 잃는 것이 없습니다.',
    heroImageAlt:
      '디자인이 깔끔한 프로덕션 코드로 바뀌고 초록색 선택 상자로 둘러싸인 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      '대부분의 디자인-투-코드 도구는 그 뒤로 계속 손봐야 할 일회성 스냅샷을 내보냅니다. Open Design은 디자인과 코드를 에이전트 안의 하나의 살아있는 산출물로 유지합니다 — 대화하며 반복하고, 내가 소유한 코드를 출시하며, 좌석당 과금이 없습니다.',
    stepsTitle: '디자인에서 코드로가 작동하는 방식',
    steps: [
      {
        title: '프롬프트나 디자인에서 시작한다',
        body: '화면을 평범한 언어로 설명하거나 에이전트에게 디자인 방향을 가리킵니다. Open Design이 알맞은 기술을 불러와 에이전트가 부서지기 쉬운 일회성 변환이 아니라 구조와 컴포넌트를 만듭니다.',
        imageAlt: '디자인과 프롬프트가 터미널로 들어가는 일러스트',
      },
      {
        title: '컴포넌트 기반 코드를 생성한다',
        body: '에이전트는 재사용 가능한 컴포넌트와 디자인 토큰으로 만들어진 깔끔하고 읽기 쉬운 코드를 만듭니다 — 일관된 여백, 타입, 색상 — 리팩터링으로 걷어낼 생성 마크업의 벽 대신.',
        imageAlt: '디자인이 구조화된 컴포넌트 기반 코드로 변환되는 일러스트',
      },
      {
        title: '대화로 반복한다',
        body: '레이아웃, 상태, 동작을 대화로 다듬습니다 — "반응형으로 만들어줘", "폼을 연결해줘", "우리 토큰에 맞춰줘"처럼. 코드는 그 자리에서 갱신되고, 디자인은 하나의 산출물이기 때문에 동기 상태를 유지합니다.',
        imageAlt: '디자인이 동기 상태를 유지하는 동안 채팅으로 코드가 다듬어지는 일러스트',
      },
      {
        title: '내가 소유한 코드를 출시한다',
        body: '출력은 리포지토리 안의 HTML/코드로, 온전히 내 것입니다 — 내보내기 단계도, 벤더에 종속된 에디터도, 디자인과 빌드 사이의 재작성도 없이. 출시하고, 에이전트 안에서 계속 발전시키세요.',
        imageAlt: '초록색 선택 프레임에 담겨 출시 준비가 된 완성 코드의 일러스트',
      },
    ],
    tableTitle: 'Open Design vs 일반적인 디자인-투-코드 도구',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '일반적인 디자인-투-코드 도구',
    tableRows: [
      {
        capability: '변환을 시작',
        withOd: '이미 열어 둔 에이전트에 프롬프트 하나',
        without: '플러그인을 설치하거나 별도 웹 도구에 업로드',
      },
      {
        capability: '코드 품질',
        withOd: '디자인 시스템에서 나온 깔끔한 컴포넌트 기반 코드',
        without: '다시 작성할 절대 위치 지정 또는 일회성 마크업',
      },
      {
        capability: '디자인 ↔ 코드 동기화',
        withOd: '하나의 산출물 — 디자인과 코드가 결코 어긋나지 않음',
        without: '첫 편집 후 낡아 버리는 일회성 내보내기',
      },
      {
        capability: '결과물을 소유',
        withOd: '리포지토리 안의 평범한 파일과 코드, 온전히 내 것',
        without: '그들의 에디터나 컴포넌트 라이브러리에 종속',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '좌석당 또는 크레딧당 구독, 벤더 호스팅',
      },
    ],
    featuresTitle: '변환할 수 있는 것',
    features: [
      {
        title: '프롬프트에서 코드로',
        body: '화면을 설명하면 내 스택에 맞는 깔끔한 컴포넌트 기반 코드를 얻습니다.',
        thumb: 'example-web-prototype',
      },
      {
        title: '와이어프레임에서 코드로',
        body: '생성된 와이어프레임을 출시 코드까지 끌고 갑니다 — 같은 산출물.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'UI에서 프로덕션으로',
        body: '생성된 UI를 반응형이고 진짜 상태를 갖춘 프로덕션 코드로 바꿉니다.',
        thumb: 'example-saas-landing',
      },
      {
        title: '랜딩 페이지',
        body: '히어로, 요금, 대기자 명단 섹션을 깔끔하고 브랜드에 맞는 코드로 변환.',
        thumb: 'example-kami-landing',
      },
      {
        title: '폼과 플로우',
        body: '진짜 유효성 검사와 상태로 연결된 다단계 폼과 온보딩.',
        thumb: 'example-hr-onboarding',
      },
      {
        title: '어떤 비주얼 취향이든',
        body: '에디토리얼, 소프트, 볼드 — 코드가 처음부터 끝까지 하나의 일관된 스타일을 담습니다.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Open Design으로 디자인에서 출시까지',
    galleryLead:
      '모두가 프롬프트나 디자인으로 시작해 출시할 수 있는 코드가 되었습니다. 아이디어에 가까운 템플릿을 고르고 변형을 설명하면 에이전트가 그것을 변환합니다 — 인계 없는 디자인에서 코드로.',
    gallery: [
      { thumb: 'example-dating-web', caption: '데이팅 웹 앱 — 디자인에서 코드로' },
      { thumb: 'example-hr-onboarding', caption: '인사 온보딩 플로우' },
      { thumb: 'example-kami-landing', caption: '코드로 만든 제품 랜딩' },
      { thumb: 'example-web-prototype-taste-soft', caption: '소프트 스타일 웹 빌드' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '템플릿 둘러보기',
    faqTitle: '디자인에서 코드로 FAQ',
    faq: [
      {
        q: '디자인-투-코드 워크플로우는 무료인가요?',
        a: '네. Open Design은 오픈소스이며 자신의 프로바이더 키로 이미 사용 중인 코딩 에이전트 안에서 실행됩니다 — 디자인-투-코드 워크플로우 자체에는 좌석당이나 크레딧당 과금이 없습니다.',
      },
      {
        q: '어떤 종류의 코드를 만들어 내나요?',
        a: '재사용 가능한 디자인 시스템에서 만들어진 깔끔한 컴포넌트 기반 HTML과 코드이므로 읽고, 다듬고, 출시할 수 있습니다 — 다시 작성해야 할 절대 위치 지정 마크업이 아니라.',
      },
      {
        q: '디자인과 코드가 동기 상태를 유지하나요?',
        a: '네 — 하나의 산출물입니다. 디자인과 코드가 프로젝트 안에 함께 살아 있기 때문에 첫 편집 후 낡아 버리는 일회성 내보내기가 없습니다.',
      },
      {
        q: '어떤 에이전트와 함께 작동하나요?',
        a: 'Open Design은 Claude Code, Codex, Cursor Agent, Gemini CLI 및 12종 이상의 퍼스트파티 어댑터와 함께 작동합니다. 자신의 프로바이더 키를 가져오며, 무엇도 대신 호스팅되지 않습니다.',
      },
    ],
    ctaTitle: '오늘 밤 다음 디자인을 코드로 바꾸세요',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 다음 화면을 — 프롬프트, 와이어프레임, 또는 디자인을 — 이미 사용 중인 에이전트 안에서 깔끔하고 출시 가능한 코드로 바꿔 보세요.',
    relatedTitle: '관련 도구와 가이드',
    related: [
      { href: '/solutions/ai-wireframe-generator/', label: 'AI 와이어프레임 생성기' },
      { href: '/solutions/ai-ui-generator/', label: 'AI UI 생성기' },
      { href: '/blog/design-to-code-tools/', label: '최고의 디자인-투-코드 도구' },
      { href: '/solutions/engineering/', label: '엔지니어링을 위한 Open Design' },
    ],
  },
  prototype: {
    title: 'Open Design + Claude Code로 인터랙티브 프로토타입 만들기',
    description:
      '프롬프트 하나를, 터미널을 벗어나지 않고 클릭 가능한 멀티 스크린 프로토타입으로 바꿉니다. Open Design은 코딩 에이전트에게 디자인 기술, 템플릿, 디자인 시스템을 제공하여 브라우저에서 열 수 있는 진짜 프로토타입을 만들어 냅니다.',
    breadcrumb: '프로토타입',
    label: '활용 사례 · 프로토타입',
    heading: '프롬프트의 속도로 프로토타이핑',
    lead: '머릿속에 있는 플로우를 설명하기만 하면 에이전트가 진짜 클릭 가능한 프로토타입을 조립합니다 — 여러 화면, 공유된 스타일, 살아있는 인터랙션이 열고, 공유하고, 엔지니어링에 넘길 수 있는 HTML로 곧장 렌더링됩니다.',
    heroImageAlt:
      '손이 와이어프레임을 스케치하고 그것이 클릭 가능한 멀티 스크린 앱 프로토타입으로 바뀌는 모습을 그린 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 이미 사용 중인 코딩 에이전트를 위한 디자인 레이어입니다. 프로토타이핑에서는 한 단락짜리 아이디어에서 탐색 가능하고 스타일이 잡힌 프로토타입까지 한 번의 세션으로 간다는 뜻입니다 — 디자인 도구도, 내보내기 단계도, 인계의 단절도 없이.',
    stepsTitle: 'Open Design에서 프로토타이핑이 작동하는 방식',
    steps: [
      {
        title: '플로우를 설명한다',
        body: '무엇을 만드는지 평범한 언어로 에이전트에게 말합니다 — "환영 화면, 요금제 선택, 확인 화면이 있는 온보딩 플로우"처럼. Open Design이 프로토타입 기술을 불러와 에이전트가 단일 페이지가 아니라 여러 화면을 만들어야 한다는 것을 알게 합니다.',
        imageAlt:
          '앱 플로우 설명을 평범한 언어로 터미널에 입력하는 사람의 일러스트',
      },
      {
        title: '스타일이 잡힌 화면을 생성한다',
        body: '에이전트는 Open Design의 디자인 시스템과 프로토타입 템플릿을 적용하므로 모든 화면이 타이포그래피, 여백, 컴포넌트를 공유하며 거친 초안처럼 보이지 않습니다. 동떨어진 목업이 아니라 일관된 화면 묶음을 얻습니다.',
        imageAlt:
          '여러 앱 화면이 차례로 나타나며 모두 하나의 일관된 비주얼 스타일을 공유하는 일러스트',
      },
      {
        title: '인터랙션을 연결한다',
        body: '버튼이 이동하고, 탭이 전환되고, 모달이 열립니다. 프로토타입은 자체 완결형 HTML로 렌더링되어 어떤 브라우저에서도 진짜처럼 동작합니다 — 보기 위해 프로토타이핑 도구 계정이 필요 없습니다.',
        imageAlt:
          '커서가 연결된 화면들을 클릭해 나가고 화살표가 화면 간 이동을 보여주는 일러스트',
      },
      {
        title: '반복하고 인계한다',
        body: '에이전트와 대화하며 다듬습니다 — "요금제 선택을 3열 레이아웃으로 만들어줘"처럼. 산출물이 프로젝트 안에 있기 때문에 디자인과 최종 코드가 하나의 진실 공급원을 공유하여, 흔한 디자이너-엔지니어 인계의 단절을 메웁니다.',
        imageAlt:
          '프로토타입이 수정된 뒤 엔지니어에게 넘겨지고, 디자인과 코드가 하나의 파일로 합쳐지는 일러스트',
      },
    ],
    tableTitle: 'Open Design 프로토타이핑 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '기존 프로토타이핑 도구',
    tableRows: [
      {
        capability: '아이디어에서 첫 화면으로',
        withOd: '이미 열어 둔 에이전트에 프롬프트 하나',
        without: '별도 도구를 열고, 파일을 시작하고, 박스를 손으로 드래그',
      },
      {
        capability: '연결된 여러 화면',
        withOd: '공유 스타일과 작동하는 내비게이션을 갖춘 한 세트로 생성',
        without: '각 프레임을 손으로 그리고 손으로 연결',
      },
      {
        capability: '일관된 비주얼 시스템',
        withOd: '에이전트가 적용하는 재사용 가능한 디자인 시스템에서 가져옴',
        without: '파일마다 다시 만들거나 손으로 유지',
      },
      {
        capability: '공유 가능한 결과물',
        withOd: '자체 완결형 HTML — 어떤 브라우저에서도 열림, 계정 불필요',
        without: '보는 사람에게 벤더 도구의 좌석이나 공유 링크가 필요',
      },
      {
        capability: '실제 코드로 가는 경로',
        withOd: '산출물이 리포지토리에 있고, 디자인과 코드가 하나의 원천을 공유',
        without: '별도 인계 후 처음부터 다시 제작',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '좌석당 구독, 벤더 호스팅, 내보내기 제한',
      },
    ],
    featuresTitle: '프로토타입으로 만들 수 있는 것',
    features: [
      {
        title: '멀티 스크린 웹 앱',
        body: '공유 내비게이션을 갖춘 완전한 플로우 — 온보딩, 대시보드, 설정 — 단일 페이지가 아니라.',
        thumb: 'example-web-prototype',
      },
      {
        title: '모바일 앱 플로우',
        body: '네이티브 같은 전환과 상태를 갖춘 화면별 모바일 여정.',
        thumb: 'example-mobile-app',
      },
      {
        title: '랜딩 페이지',
        body: '클릭해 보고 바로 출시할 수 있는 마케팅 페이지와 SaaS 랜딩.',
        thumb: 'example-saas-landing',
      },
      {
        title: '어떤 비주얼 취향이든',
        body: '에디토리얼, 소프트, 브루탈리스트 — 프로토타입이 처음부터 끝까지 일관된 스타일을 담습니다.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: '대기자 명단과 요금',
        body: '전환 화면 — 대기자 명단, 요금표 — 가 연결되고 브랜드에 맞게.',
        thumb: 'example-waitlist-page',
      },
      {
        title: '게임화되고 장난스러운',
        body: '모션과 상태가 피치의 일부가 되는, 인터랙션 중심의 콘셉트.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: '사람들이 Open Design으로 만든 프로토타입',
    galleryLead:
      '이 모두가 프롬프트로 시작해 클릭 가능한 산출물로 렌더링되었습니다. 아이디어에 가까운 템플릿을 고르고 변형을 설명하면 에이전트가 그것을 적응시킵니다.',
    gallery: [
      { thumb: "example-dating-web", caption: "데이팅 웹 앱 — 멀티 스크린 플로우" },
      { thumb: "example-hr-onboarding", caption: "인사 온보딩 플로우" },
      { thumb: "example-kami-landing", caption: "제품 랜딩 페이지" },
      { thumb: "example-web-prototype-taste-soft", caption: "소프트 스타일 웹 프로토타입" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '프로토타입 템플릿 둘러보기',
    faqTitle: '프로토타이핑 FAQ',
    faq: [
      {
        q: 'Open Design으로 프로토타이핑하려면 Figma 같은 디자인 도구가 필요한가요?',
        a: '아니요. Open Design은 코딩 에이전트 안에서 실행되며 프로토타입을 HTML로 렌더링합니다. 플로우를 언어로 설명하면 에이전트가 화면을 만들어 냅니다. 따로 배우거나 비용을 낼 캔버스 도구가 없습니다.',
      },
      {
        q: '프로토타입은 인터랙티브한가요, 아니면 그냥 정적 목업인가요?',
        a: '인터랙티브합니다. 출력이 진짜 HTML과 CSS이기 때문에 내비게이션, 탭, 모달이 작동합니다. 사용자와 똑같이 어떤 브라우저에서든 클릭해 볼 수 있습니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Open Design은 Claude Code, Codex, Cursor Agent, Gemini CLI 및 12종 이상의 퍼스트파티 어댑터와 함께 작동합니다. 자신의 프로바이더 키를 가져오며, 무엇도 대신 호스팅되지 않습니다.',
      },
      {
        q: '프로토타입이 실제 제품이 될 수 있나요?',
        a: '바로 그게 핵심입니다. 산출물이 프로젝트 안에 있으므로 같은 디자인 시스템과 컴포넌트가 인계 후 버려지는 대신 프로덕션 코드로 이어집니다.',
      },
    ],
    ctaTitle: '다음 아이디어를 오늘 밤 프로토타입으로',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 다음 "만약에"를, 이미 사용 중인 에이전트 안에서 클릭할 수 있는 무언가로 바꿔 보세요.',
  },
  dashboard: {
    title: 'Open Design + Claude Code로 데이터 대시보드 생성하기',
    description:
      '추적하는 지표를 설명하기만 하면 코딩 에이전트가 스타일이 잡힌 반응형 대시보드를 만듭니다 — 차트, KPI 카드, 테이블이 어디에나 호스팅할 수 있는 HTML로 렌더링됩니다. BI 도구 좌석도, 드래그 앤 드롭 빌더도 없이.',
    breadcrumb: '대시보드',
    label: '활용 사례 · 대시보드',
    heading: '드래그 앤 드롭 빌더가 아니라, 설명에서 나오는 대시보드',
    lead: '무엇을 보여줄지, 어떤 느낌이어야 할지 에이전트에게 말하세요. Open Design이 차트 패턴, 레이아웃 시스템, 비주얼 언어를 제공하므로 기본 스타일 위젯의 벽이 아니라 일관되고 보여줄 만한 대시보드를 얻습니다.',
    heroImageAlt:
      '왼쪽의 원시 숫자가 오른쪽의 차트와 KPI 카드로 이루어진 깔끔한 대시보드로 흘러 들어가는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 지표를 평범한 언어로 적은 명세를, 에이전트가 HTML로 렌더링하는 스타일이 잡힌 대시보드로 바꿉니다 — 리포지토리에서 버전 관리되고, 어디에나 호스팅 가능하며, 좌석당 BI 구독이 없습니다.',
    stepsTitle: 'Open Design에서 대시보드가 작동하는 방식',
    steps: [
      {
        title: '지표를 설명한다',
        body: '중요한 것을 나열합니다 — "주간 활성 사용자, 요금제별 매출, 이탈률, 30일 추세"처럼. 에이전트가 대시보드 기술을 불러와 한 덩어리의 텍스트가 아니라 KPI 카드, 차트, 테이블을 배치해야 한다는 것을 압니다.',
        imageAlt: '자신이 중요하게 여기는 지표를 나열하는 사람의 일러스트',
      },
      {
        title: '차트 패턴을 고른다',
        body: 'Open Design은 차트와 레이아웃 템플릿을 제공하므로 추세는 선 차트로, 분해는 막대로, 비율은 알맞은 비주얼로 바뀝니다 — 어긋나는 기본값 대신 일관된 타이포그래피와 여백이 전체를 관통합니다.',
        imageAlt: '여러 차트 유형이 일관된 그리드로 배열된 일러스트',
      },
      {
        title: '데이터를 연결한다',
        body: '대시보드를 CSV나 JSON 엔드포인트로 향하게 하거나 샘플 행을 붙여넣습니다. 데이터가 바뀌면 갱신되는 자체 완결형 HTML로 렌더링되어 어떤 브라우저에서도 열리고 어떤 정적 호스트에도 올릴 수 있습니다.',
        imageAlt: '데이터 파일이 실시간 갱신 대시보드로 연결되는 일러스트',
      },
      {
        title: '다듬고 출시한다',
        body: '에이전트와 대화하며 조정합니다 — "매출을 지역별로 묶고 KPI 행을 맨 위로 옮겨"처럼. 산출물이 프로젝트 안에 있으므로 대시보드는 다른 코드처럼 검토되고 버전 관리됩니다.',
        imageAlt: '대시보드가 다듬어진 뒤 배포되는 일러스트',
      },
    ],
    tableTitle: 'Open Design 대시보드 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: 'BI 도구 / 직접 코딩',
    tableRows: [
      {
        capability: '지표 목록에서 레이아웃으로',
        withOd: '프롬프트 하나로 에이전트가 카드, 차트, 테이블을 배치',
        without: '위젯을 하나씩 드래그하거나 차트 코드를 처음부터 작성',
      },
      {
        capability: '일관된 비주얼 시스템',
        withOd: '재사용 가능한 디자인 시스템에서 나온 차트 패턴과 여백',
        without: '기본 위젯 스타일이거나 차트마다 손으로 스타일링',
      },
      {
        capability: '데이터 연결',
        withOd: 'CSV / JSON / 붙여넣은 행을 실시간 HTML로 렌더링',
        without: '벤더 커넥터나 맞춤형 데이터 배관',
      },
      {
        capability: '호스팅과 공유',
        withOd: '어떤 정적 호스트에서도 동작하는 자체 완결형 HTML, 계정 불필요',
        without: '보는 사람에게 BI 벤더의 좌석이 필요',
      },
      {
        capability: '검토와 버전 관리',
        withOd: '리포지토리에 있어 코드처럼 diff 가능',
        without: '벤더 안에 갇혀 진짜 diff가 안 됨',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '좌석당 구독, 벤더 호스팅',
      },
    ],
    featuresTitle: '만들 수 있는 것',
    features: [
      { title: "제품 분석", body: "활성 사용자, 퍼널, 리텐션 — 제품 팀이 늘 들여다보는 지표.", thumb: "example-dashboard" },
      { title: "리포지토리와 개발 지표", body: "스타, PR, CI 상태 — 자신의 데이터로 만든 엔지니어링 대시보드.", thumb: "example-github-dashboard" },
      { title: "재무 리포트", body: "매출, 번, 런웨이를 공유 가능한 리포트로 배치.", thumb: "example-finance-report" },
      { title: "실시간 운영", body: "기반 데이터가 움직이는 대로 새로고침되는 실시간 지표.", thumb: "example-live-dashboard" },
      { title: "소셜과 마케팅", body: "채널 성과와 캠페인 추적을 한 화면에.", thumb: "example-social-media-dashboard" },
      { title: "도메인 리포트", body: "어떤 분야든 구조화된 리포트 — 임상부터 트레이딩까지.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: '사람들이 Open Design으로 만든 대시보드',
    galleryLead:
      '프롬프트와 데이터 소스로 렌더링된 진짜 대시보드. 자신에게 가까운 것에서 시작해 추적하는 지표를 설명하세요.',
    gallery: [
      { thumb: "example-data-report", caption: "데이터 리포트" },
      { thumb: "example-flowai-live-dashboard-template", caption: "실시간 운영 대시보드" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "트레이딩 분석 대시보드" },
      { thumb: "example-frame-data-chart-nyt", caption: "에디토리얼 데이터 차트" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '대시보드 템플릿 둘러보기',
    faqTitle: '대시보드 FAQ',
    faq: [
      {
        q: 'Tableau나 Looker 같은 BI 도구가 필요한가요?',
        a: '아니요. Open Design은 코딩 에이전트 안에서 대시보드를 HTML로 렌더링합니다. 지표를 설명하고 데이터로 향하게 하기만 하면 되고, 라이선스를 사거나 배워야 할 별도 BI 플랫폼이 없습니다.',
      },
      {
        q: '데이터는 어디서 오나요?',
        a: 'CSV, JSON 엔드포인트, 또는 붙여넣은 행에서. 대시보드는 평범한 HTML과 JavaScript이므로 어디서 읽어올지를 정확히 직접 제어합니다 — 호스팅된 서비스를 거치는 것은 없습니다.',
      },
      {
        q: '비기술 동료도 볼 수 있나요?',
        a: '네. 출력은 자체 완결형 웹 페이지입니다. 링크나 파일이 있는 누구나 브라우저에서 열 수 있습니다 — 계정도, 좌석도 필요 없습니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 및 12종 이상의 퍼스트파티 어댑터. 자신의 프로바이더 키를 가져옵니다.',
      },
    ],
    ctaTitle: '오늘 밤 당신의 대시보드를 만드세요',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 당신의 지표를, 이미 사용 중인 에이전트 안에서 어디에나 호스팅할 수 있는 대시보드로 바꿔 보세요.',
  },
  slides: {
    title: 'Open Design + Claude Code로 프레젠테이션 덱 생성하기',
    description:
      '아웃라인을, 프레젠테이션 앱을 열지 않고 디자인되고 브랜드에 맞는 슬라이드 덱으로 바꿉니다. Open Design은 코딩 에이전트에게 덱 템플릿과 비주얼 시스템을 주어, 발표하고 내보내고 공유할 수 있는 HTML로 슬라이드를 렌더링합니다.',
    breadcrumb: '슬라이드',
    label: '활용 사례 · 슬라이드',
    heading: '디자인된 듯 보이는 덱을, 프롬프트로 쓴다',
    lead: '에이전트에게 아웃라인과 톤을 건네세요. Open Design이 덱 템플릿과 비주얼 시스템을 적용하므로 모든 슬라이드가 레이아웃되고, 조판되고, 브랜드에 맞습니다 — 빈 배경 위의 글머리 기호 목록이 아니라.',
    heroImageAlt:
      '왼쪽의 아웃라인이 오른쪽의 디자인된 프레젠테이션 슬라이드 연속으로 바뀌는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 아웃라인을, 에이전트가 한 번의 세션으로 렌더링하는 디자인된 HTML 덱으로 바꿉니다 — 브라우저에서 발표하고, PDF나 PPTX로 내보내며, 소스는 리포지토리에 보관합니다.',
    stepsTitle: 'Open Design에서 덱이 작동하는 방식',
    steps: [
      {
        title: '아웃라인을 준다',
        body: '말할 요점이나 대략의 구조를 붙여넣습니다. 에이전트가 덱 기술을 불러와 한 편의 긴 문서가 아니라 레이아웃된 슬라이드의 연속을 만들어 냅니다.',
        imageAlt: '텍스트 아웃라인이 에이전트에게 건네지는 일러스트',
      },
      {
        title: '덱 스타일을 고른다',
        body: 'Open Design은 덱 템플릿을 제공합니다 — 에디토리얼, 스위스 인터내셔널, 다크 테크니컬 등. 에이전트가 하나를 적용해 타이포그래피, 그리드, 강조가 모든 슬라이드에서 일관되게 유지됩니다.',
        imageAlt: '여러 덱 스타일 선택지가 나란히 놓인 일러스트',
      },
      {
        title: '슬라이드를 생성한다',
        body: '각 요점이 알맞은 위계를 갖춘 디자인된 슬라이드가 됩니다 — 제목, 보조 비주얼, 데이터 강조. HTML로 렌더링되므로 어떤 브라우저에서도 전체 화면으로 발표됩니다.',
        imageAlt: '일관된 스타일링으로 완성된 슬라이드 연속의 일러스트',
      },
      {
        title: '발표하고, 내보내고, 반복한다',
        body: '브라우저에서 발표하거나 공유를 위해 PDF / PPTX로 내보냅니다. 에이전트와 대화하며 다듬습니다 — "데이터 슬라이드를 조이고 마무리 행동 유도를 추가해"처럼. 덱 소스는 프로젝트 안에 남습니다.',
        imageAlt: '덱이 발표되고 여러 형식으로 내보내지는 일러스트',
      },
    ],
    tableTitle: 'Open Design 덱 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: 'PowerPoint / Keynote / AI 슬라이드 도구',
    tableRows: [
      {
        capability: '아웃라인에서 슬라이드로',
        withOd: '프롬프트 하나로 에이전트가 모든 슬라이드를 배치',
        without: '슬라이드를 일일이 손으로 만들거나 템플릿과 씨름',
      },
      {
        capability: '일관된 디자인',
        withOd: '진짜 그리드와 타입 시스템을 갖춘 덱 템플릿',
        without: '테마 흐트러짐, 수동 정렬, 브랜드 밖 기본값',
      },
      {
        capability: '데이터와 다이어그램',
        withOd: '슬라이드의 일부로 렌더링되는 차트와 강조',
        without: '정적 이미지를 붙이거나 매번 차트를 다시 제작',
      },
      {
        capability: '내보내기 형식',
        withOd: '발표용 HTML과 함께 PDF / PPTX 내보내기',
        without: '하나의 앱 형식에 묶임',
      },
      {
        capability: '검토와 버전 관리',
        withOd: '소스가 리포지토리에 있어 diff 가능',
        without: '바이너리 파일, 의미 있는 diff 불가',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '앱 라이선스나 좌석당 AI 추가 기능',
      },
    ],
    featuresTitle: '발표할 수 있는 것',
    features: [
      { title: "피치 덱", body: "강한 서사와 깔끔한 데이터 슬라이드를 갖춘 투자자·영업 덱.", thumb: "example-html-ppt-pitch-deck" },
      { title: "스위스 / 에디토리얼", body: "아트 디렉션된 듯 보이는, 그리드 주도의 타이포그래피 덱.", thumb: "example-deck-swiss-international" },
      { title: "코스 모듈", body: "명확한 단계, 강조, 호흡을 갖춘 교육 덱.", thumb: "example-html-ppt-course-module" },
      { title: "데이터 그래프 덱", body: "분석과 리뷰를 위한 다크하고 차트 중심의 덱.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "발표자 모드", body: "브라우저에서 실시간 발표하도록 만든 Reveal 스타일 덱.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "기술 블루프린트", body: "복잡한 시스템을 그려내는 아키텍처와 지식 덱.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: '사람들이 Open Design으로 만든 덱',
    galleryLead:
      '아웃라인으로 렌더링된 진짜 덱. 당신의 발표에 가까운 스타일을 고르고 내용을 설명하세요.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "에디토리얼 매거진 덱" },
      { thumb: "example-guizang-ppt", caption: "일러스트 키노트" },
      { thumb: "example-deck-open-slide-canvas", caption: "오픈 슬라이드 캔버스 덱" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "그라데이션 테마 덱" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '덱 템플릿 둘러보기',
    faqTitle: '슬라이드 FAQ',
    faq: [
      {
        q: 'PowerPoint나 Keynote가 필요한가요?',
        a: '아니요. Open Design은 코딩 에이전트 안에서 덱을 HTML로 렌더링하며 PDF나 PPTX로 내보낼 수 있습니다. 브라우저에서 발표하거나 파일을 넘기면 되고, 만들기 위해 프레젠테이션 앱이 필요 없습니다.',
      },
      {
        q: '이건 그냥 AI가 만든 글머리 기호 아닌가요?',
        a: '아니요. 에이전트는 그리드, 타입 스케일, 비주얼 위계를 갖춘 진짜 덱 템플릿을 적용하므로 슬라이드가 자동 채워진 것이 아니라 디자인된 듯 보입니다.',
      },
      {
        q: '클라이언트를 위해 PowerPoint로 내보낼 수 있나요?',
        a: '네. 덱은 발표하는 HTML 외에 PPTX와 PDF로도 내보내지므로 청중이 기대하는 어떤 형식에도 맞출 수 있습니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 및 그 밖의 퍼스트파티 어댑터. 자신의 프로바이더 키와 함께.',
      },
    ],
    ctaTitle: '다음 덱을 오늘 밤 만드세요',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 당신의 아웃라인을, 이미 사용 중인 에이전트 안에서 디자인된 덱으로 바꿔 보세요.',
  },
  image: {
    title: 'Open Design + Claude Code로 브랜드에 맞는 그래픽 생성하기',
    description:
      '소셜 카드, 아티클 커버, 마케팅 그래픽을 프롬프트에서 만들어 냅니다 — 진짜 타이포그래피와 브랜드 시스템으로 레이아웃되고, PNG로 내보낼 수 있는 선명한 HTML로 렌더링됩니다. 디자인 앱도, 템플릿 구독도 없이.',
    breadcrumb: '이미지',
    label: '활용 사례 · 이미지',
    heading: '브랜드에 맞는 그래픽을, 생성하고 레이아웃까지',
    lead: '필요한 카드나 커버를 설명하세요. Open Design이 진짜 타입, 그리드, 브랜드 컬러로 구성한 뒤 이미지로 내보낼 수 있는 HTML로 렌더링합니다 — 디자인 앱과 씨름하거나 평범한 템플릿을 쓰는 대신.',
    heroImageAlt:
      '프롬프트가 레이아웃된 소셜 카드와 아티클 커버 한 세트로 바뀌는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 프롬프트를, 에이전트가 HTML로 렌더링해 PNG로 내보내는 조판되고 브랜드에 맞는 그래픽으로 바꿉니다 — 반복 가능하고, 버전 관리되며, 좌석당 디자인 도구에서 자유롭습니다.',
    stepsTitle: 'Open Design에서 그래픽이 작동하는 방식',
    steps: [
      {
        title: '그래픽을 설명한다',
        body: '무엇인지 말합니다 — "헤드라인과 인용이 들어간 우리 런칭용 트위터 카드"처럼. 에이전트가 알맞은 기술을 불러와 평범한 텍스트 블록이 아니라 레이아웃된 그래픽을 구성합니다.',
        imageAlt: '필요한 소셜 카드를 설명하는 사람의 일러스트',
      },
      {
        title: '브랜드 시스템을 적용한다',
        body: 'Open Design이 재사용 가능한 디자인 시스템에서 당신의 컬러, 타입, 여백을 가져오므로 모든 카드가 일회성처럼 보이는 대신 브랜드의 나머지와 어울립니다.',
        imageAlt: '브랜드 컬러와 타입이 카드 레이아웃에 적용되는 일러스트',
      },
      {
        title: '렌더링하고 내보낸다',
        body: '그래픽은 필요한 정확한 치수로 HTML에 렌더링됩니다 — 소셜 카드, 커버, 배너 — 그리고 PNG로 내보냅니다. 선명한 텍스트, 진짜 레이아웃, 수동 미세 조정 없음.',
        imageAlt: '그래픽이 렌더링되어 이미지 파일로 내보내지는 일러스트',
      },
      {
        title: '레시피를 재사용한다',
        body: '템플릿이기 때문에 다음 그래픽은 프롬프트 하나 거리입니다 — 헤드라인만 바꾸고 레이아웃은 그대로. 카드 시리즈가 완벽하게 일관됩니다.',
        imageAlt: '하나의 카드 템플릿이 일관된 그래픽 시리즈를 만들어 내는 일러스트',
      },
    ],
    tableTitle: 'Open Design 그래픽 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '디자인 앱 / 평범한 템플릿',
    tableRows: [
      {
        capability: '아이디어에서 레이아웃된 그래픽으로',
        withOd: '프롬프트 하나로 에이전트가 타입과 레이아웃을 구성',
        without: '앱을 열고 모든 요소를 손으로 배치',
      },
      {
        capability: '브랜드를 유지',
        withOd: '재사용 가능한 디자인 시스템에서 나온 컬러와 타입',
        without: '파일마다 브랜드 스타일을 다시 고르거나 브랜드에서 벗어남',
      },
      {
        capability: '일관된 시리즈',
        withOd: '같은 템플릿, 새 카피 — 완벽하게 정렬된 세트',
        without: '각 변형을 손으로 다시 정렬',
      },
      {
        capability: '내보내기',
        withOd: '정확한 치수의 HTML을 PNG로 내보냄',
        without: '수동 캔버스 크기 조정과 내보내기 설정',
      },
      {
        capability: '반복 가능',
        withOd: '리포지토리 안의 프롬프트 주도 레시피',
        without: '매번 다시 만드는 일회성 파일',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '좌석당 디자인 도구나 템플릿 마켓플레이스',
      },
    ],
    featuresTitle: '만들 수 있는 것',
    features: [
      { title: "소셜 카드", body: "당신의 헤드라인과 브랜드로 구성된 X / Twitter 카드.", thumb: "example-card-twitter" },
      { title: "아티클 커버", body: "글과 뉴스레터를 위한 에디토리얼 매거진 스타일 커버.", thumb: "example-article-magazine" },
      { title: "Xiaohongshu 카드", body: "그 피드에 맞춰 조정된 RedNote 스타일 카드.", thumb: "example-card-xiaohongshu" },
      { title: "히어로 그래픽", body: "사이트와 런칭을 위한 리퀴드, 그라데이션 히어로 비주얼.", thumb: "example-frame-liquid-bg-hero" },
      { title: "캐러셀", body: "프레임 간 일관성을 유지하는 다중 슬라이드 소셜 캐러셀.", thumb: "example-social-carousel" },
      { title: "UI 목 프레임", body: "제품 스토리텔링을 위한 알림과 기기 프레임.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: '사람들이 Open Design으로 만든 그래픽',
    galleryLead:
      '프롬프트로 렌더링된 진짜 카드와 커버. 필요한 것에 가까운 하나를 골라 당신의 카피로 바꿔 넣으세요.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "파스텔 소셜 카드" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "에디토리얼 삼색 포스터" },
      { thumb: "example-magazine-poster", caption: "매거진 스타일 포스터" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "대담한 에디토리얼 커버" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '그래픽 템플릿 둘러보기',
    faqTitle: '이미지 FAQ',
    faq: [
      {
        q: '이건 Midjourney 같은 AI 이미지 생성기인가요?',
        a: '아니요. Open Design은 진짜 레이아웃과 타이포그래피로 그래픽을 구성합니다 — 당신의 헤드라인, 당신의 브랜드, 정확한 치수로 — 그리고 PNG로 내보내는 HTML로 렌더링합니다. 픽셀 생성이 아니라 디자인 구성입니다.',
      },
      {
        q: '일관된 카드 시리즈를 만들 수 있나요?',
        a: '네. 각 그래픽이 템플릿이기 때문에 레이아웃을 유지하고 카피를 바꾸면 시리즈 전체가 완벽하게 정렬되고 브랜드에 맞게 유지됩니다.',
      },
      {
        q: '어떤 크기를 만들 수 있나요?',
        a: '어떤 크기든. 그래픽은 지정한 정확한 치수로 렌더링되며, 정사각형 소셜 카드부터 넓은 배너까지 대응한 뒤 PNG로 내보냅니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 및 그 밖의 퍼스트파티 어댑터. 자신의 프로바이더 키와 함께.',
      },
    ],
    ctaTitle: '다음 그래픽을 오늘 밤 만드세요',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 프롬프트를, 이미 사용 중인 에이전트 안에서 브랜드에 맞는 그래픽으로 바꿔 보세요.',
  },
  video: {
    title: 'Open Design + Claude Code로 모션 그래픽과 숏폼 영상 생성하기',
    description:
      '스크립트를, 애니메이션 프레임과 숏폼 영상으로 바꿉니다 — 타이틀 카드, 모션 배경, 아웃트로가 당신의 브랜드 시스템으로 구성되고 HTML에서 렌더링됩니다. 모션 그래픽 스위트도, 타임라인 스크러빙도 없이.',
    breadcrumb: '영상',
    label: '활용 사례 · 영상',
    heading: '타임라인이 아니라, 스크립트에서 나오는 모션 그래픽',
    lead: '원하는 순간을 설명하세요 — 타이틀 등장, 데이터 애니메이션, 로고 아웃트로. Open Design이 당신의 브랜드 시스템으로 애니메이션 프레임을 구성해 영상으로 렌더링합니다 — 모션 그래픽 스위트가 필요 없습니다.',
    heroImageAlt:
      '스크립트가 애니메이션되는 영상 프레임의 연속으로 바뀌는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 스크립트를, 에이전트가 숏폼 영상으로 렌더링하는 애니메이션되고 브랜드에 맞는 프레임으로 바꿉니다 — HTML로 구성되고, 리포지토리에서 버전 관리되며, 배워야 할 타임라인 에디터가 없습니다.',
    stepsTitle: 'Open Design에서 모션이 작동하는 방식',
    steps: [
      {
        title: '순간을 설명한다',
        body: '무엇이 일어나야 하는지 말합니다 — "글리치 타이틀이 우리 로고로 해소된 뒤 마무리 카드"처럼. 에이전트가 모션 기술을 불러와 정적 이미지가 아니라 애니메이션 프레임을 만들어 냅니다.',
        imageAlt: '모션 시퀀스를 설명하는 사람의 일러스트',
      },
      {
        title: '브랜드와 모션 스타일을 적용한다',
        body: 'Open Design이 프레임 템플릿을 제공합니다 — 시네마틱 라이트 릭, 글리치 타이틀, 로고 아웃트로 — 그리고 당신의 컬러와 타입을 적용하므로 모션이 의도적이고 브랜드에 맞게 보입니다.',
        imageAlt: '브랜드 스타일링이 애니메이션 프레임에 적용되는 일러스트',
      },
      {
        title: '프레임을 영상으로 렌더링한다',
        body: '프레임은 HTML로 구성되어 영상으로 렌더링되므로 타이밍과 레이아웃이 정밀하고 반복 가능합니다 — 타임라인에서의 수동 키프레이밍이 없습니다.',
        imageAlt: 'HTML 프레임이 영상 클립으로 렌더링되는 일러스트',
      },
      {
        title: '반복하고 내보낸다',
        body: '에이전트와 대화하며 다듬습니다 — "타이틀 등장을 늦추고 자막을 추가해"처럼. 소셜이나 제품용 숏폼 클립을 내보냅니다. 소스는 프로젝트 안에 남습니다.',
        imageAlt: '영상 클립이 다듬어지고 소셜용으로 내보내지는 일러스트',
      },
    ],
    tableTitle: 'Open Design 모션 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: 'After Effects / 모션 스위트',
    tableRows: [
      {
        capability: '스크립트에서 애니메이션 프레임으로',
        withOd: '프롬프트 하나로 에이전트가 시퀀스를 구성',
        without: '각 요소를 타임라인에서 손으로 키프레임',
      },
      {
        capability: '브랜드를 유지',
        withOd: '프레임 템플릿 + 당신의 컬러와 타입',
        without: '프로젝트마다 브랜드 스타일링을 다시 제작',
      },
      {
        capability: '정밀하고 반복 가능한 타이밍',
        withOd: 'HTML로 구성되어 결정론적으로 렌더링',
        without: '수동 스크러빙, 재현이 어려움',
      },
      {
        capability: '소셜용 내보내기',
        withOd: '영상으로 렌더링된 숏폼 클립',
        without: '내보내기 프리셋과 코덱 씨름',
      },
      {
        capability: '검토와 버전 관리',
        withOd: '프레임 소스가 리포지토리에 있어 diff 가능',
        without: '바이너리 프로젝트 파일, 진짜 diff 불가',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 자신의 키를 가져와 로컬에서 실행',
        without: '비싼 스위트, 가파른 학습 곡선',
      },
    ],
    featuresTitle: '애니메이션할 수 있는 것',
    features: [
      { title: "Hyperframes", body: "HTML로 구성된 프레임별 모션 시퀀스.", thumb: "example-video-hyperframes" },
      { title: "숏폼 소셜", body: "소셜 피드를 위해 만든 세로형 클립.", thumb: "example-video-shortform" },
      { title: "모션 프레임 세트", body: "클립으로 구성하는 재사용 가능한 애니메이션 프레임.", thumb: "example-motion-frames" },
      { title: "시네마틱 라이트 릭", body: "필름 같은 전환과 분위기 있는 배경.", thumb: "example-frame-light-leak-cinema" },
      { title: "글리치 타이틀", body: "모션과 텍스처가 있는 타이틀 등장.", thumb: "example-frame-glitch-title" },
      { title: "로고 아웃트로", body: "어떤 클립에도 어울리는 브랜드 마무리 애니메이션.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: '사람들이 Open Design으로 만든 모션',
    galleryLead:
      '프롬프트로 렌더링된 진짜 애니메이션 프레임과 클립. 아이디어에 가까운 하나를 골라 모션을 설명하세요.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Hyperframes 시퀀스" },
      { thumb: "example-frame-liquid-bg-hero", caption: "리퀴드 모션 배경" },
      { thumb: "example-frame-macos-notification", caption: "애니메이션 UI 프레임" },
      { thumb: "example-frame-data-chart-nyt", caption: "애니메이션 데이터 차트" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '모션 템플릿 둘러보기',
    faqTitle: '영상 FAQ',
    faq: [
      {
        q: 'After Effects나 모션 그래픽 스위트가 필요한가요?',
        a: '아니요. Open Design은 코딩 에이전트 안에서 애니메이션 프레임을 HTML로 구성하고 영상으로 렌더링합니다. 배우거나 라이선스를 살 타임라인 에디터가 없습니다.',
      },
      {
        q: '이건 어떤 종류의 영상에 적합한가요?',
        a: '숏폼 모션 — 타이틀 카드, 데이터 애니메이션, 로고 아웃트로, 소셜 클립. 장편 편집이 아니라 브랜드와 제품 모션을 위해 만들어졌습니다.',
      },
      {
        q: '타이밍은 재현 가능한가요?',
        a: '네. 프레임이 코드로 구성되어 결정론적으로 렌더링되므로 매번 같은 결과를 얻고 프롬프트로 정밀하게 조정할 수 있습니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 및 그 밖의 퍼스트파티 어댑터. 자신의 프로바이더 키와 함께.',
      },
    ],
    ctaTitle: '다음 아이디어를 오늘 밤 모션으로',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 스크립트를, 이미 사용 중인 에이전트 안에서 모션으로 바꿔 보세요.',
  },
  designSystem: {
    title: 'Open Design + Claude Code로 디자인 시스템 구축하고 적용하기',
    description:
      '브랜드를, 코딩 에이전트가 모든 산출물에 적용하는 재사용 가능한 디자인 시스템으로 담아냅니다 — 컬러, 타입, 컴포넌트, 톤을 하나의 DESIGN.md에. 한 번 정의하면 모든 프로토타입, 덱, 대시보드가 브랜드에 맞게 유지됩니다.',
    breadcrumb: '디자인 시스템',
    label: '활용 사례 · 디자인 시스템',
    heading: '하나의 디자인 시스템을, 에이전트가 만드는 모든 것에 적용',
    lead: '브랜드를 한 번 정의하면 Open Design이 그것을 모든 출력으로 가져갑니다 — 프로토타입, 덱, 대시보드, 그래픽. 시스템은 에이전트가 읽는 DESIGN.md로 리포지토리에 있으므로 일관성은 수동이 아니라 자동입니다.',
    heroImageAlt:
      '하나의 디자인 시스템이 브랜드에 맞는 여러 산출물로 방사형으로 퍼져 나가는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 브랜드를, 에이전트가 모든 산출물에 적용하는 이식 가능한 디자인 시스템으로 담아냅니다 — 리포지토리에서 한 번 정의하고, 어디서나 강제되며, 그것을 통제하는 중앙 디자인 도구가 없습니다.',
    stepsTitle: 'Open Design에서 디자인 시스템이 작동하는 방식',
    steps: [
      {
        title: '시스템을 담아낸다',
        body: '브랜드를 설명합니다 — 컬러, 타입, 여백, 보이스 — 또는 기존 사이트를 에이전트에게 가리켜 추출하게 합니다. Open Design이 그것을 프로젝트 안에 있는 DESIGN.md에 적습니다.',
        imageAlt: '브랜드가 하나의 디자인 시스템 파일로 담기는 일러스트',
      },
      {
        title: '검증된 기반에서 시작한다',
        body: 'Open Design은 140개 이상의 참조 디자인 시스템을 제공합니다 — Apple과 Linear부터 에디토리얼, 브루탈리스트까지. 빈 페이지에서 시작하는 대신 당신의 브랜드에 가까운 것을 포크하세요.',
        imageAlt: '참조 디자인 시스템 갤러리를 둘러보는 일러스트',
      },
      {
        title: '어디에나 적용한다',
        body: '다른 모든 기술이 같은 시스템을 읽으므로 프로토타입, 덱, 대시보드가 모두 하나의 비주얼 언어를 공유합니다 — 매번 다시 지정하지 않고도.',
        imageAlt: '하나의 시스템이 여러 산출물 유형에 일관되게 적용되는 일러스트',
      },
      {
        title: '한곳에서 진화시킨다',
        body: '시스템을 바꾸면 다음 렌더링이 그것을 어디서나 반영합니다. 리포지토리 안의 파일이기 때문에 디자인 결정이 코드처럼 검토되고 버전 관리됩니다.',
        imageAlt: '디자인 시스템이 갱신되어 모든 출력으로 전파되는 일러스트',
      },
    ],
    tableTitle: 'Open Design 디자인 시스템 vs 기존 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '디자인 도구 라이브러리 / 스타일 가이드',
    tableRows: [
      {
        capability: '시스템을 정의',
        withOd: '에이전트가 읽는 DESIGN.md, 140개 이상의 참조에서 포크',
        without: '정적 스타일 가이드나 도구에 묶인 라이브러리',
      },
      {
        capability: '산출물 유형을 넘나들며 적용',
        withOd: '같은 시스템이 프로토타입, 덱, 대시보드, 그래픽에 공급',
        without: '도구마다, 파일마다 다시 구현',
      },
      {
        capability: '모든 것을 일관되게 유지',
        withOd: '자동 — 모든 기술이 하나의 원천을 읽음',
        without: '수동 규율; 시간이 지나며 흐트러짐',
      },
      {
        capability: '브랜드를 진화',
        withOd: '한 번 편집하면 다음 렌더링이 어디서나 갱신',
        without: '파일과 도구를 넘나들며 찾아 바꾸기',
      },
      {
        capability: '검토와 버전 관리',
        withOd: '리포지토리에 있어 코드처럼 diff 가능',
        without: '디자인 도구에 묻혀 감사가 어려움',
      },
      {
        capability: '비용과 종속',
        withOd: '오픈소스, 이식 가능, 로컬에서 실행',
        without: '디자인 도구 구독에 묶임',
      },
    ],
    featuresTitle: '시작할 수 있는 시스템',
    features: [
      { title: "Apple", body: "깔끔하고 절제된 시스템 폰트 미학.", thumb: "design-system-apple" },
      { title: "Linear", body: "여백을 좁힌 선명한 제품 도구 룩.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "부드럽고 문서 중심이며 다가가기 쉬운.", thumb: "design-system-notion" },
      { title: "Figma", body: "장난스럽고 컬러풀하며 창작 도구의 에너지.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "미니멀하고 중립적이며 연구급.", thumb: "design-system-openai" },
      { title: "GitHub", body: "밀도 높고 기술적이며 개발자 네이티브.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Open Design의 디자인 시스템',
    galleryLead:
      '출발점으로 포크할 수 있는 140개 이상의 참조 시스템 중 일부. 당신의 브랜드에 가까운 하나를 골라 적응시키세요.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Airbnb 스타일 시스템" },
      { thumb: "design-system-vercel", caption: "Vercel 스타일 시스템" },
      { thumb: "design-system-stripe", caption: "Stripe 스타일 시스템" },
      { thumb: "design-system-spotify", caption: "Spotify 스타일 시스템" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: '디자인 시스템 둘러보기',
    faqTitle: '디자인 시스템 FAQ',
    faq: [
      {
        q: '여기서 말하는 디자인 시스템이 정확히 무엇인가요?',
        a: '컬러, 타입, 여백, 컴포넌트, 보이스를 담은 리포지토리 안의 DESIGN.md 파일입니다. 모든 Open Design 기술이 그것을 읽으므로 당신의 브랜드가 에이전트가 만들어 내는 무엇에든 자동으로 적용됩니다.',
      },
      {
        q: '처음부터 시작해야 하나요?',
        a: '아니요. Open Design은 포크할 수 있는 140개 이상의 참조 디자인 시스템을 제공합니다 — Apple과 Linear부터 에디토리얼, 브루탈리스트까지 — 그런 다음 당신의 브랜드에 맞게 적응시킵니다.',
      },
      {
        q: '덱, 대시보드, 프로토타입을 넘나들며 어떻게 일관성을 유지하나요?',
        a: '그 모든 기술이 같은 DESIGN.md를 읽기 때문입니다. 시스템을 한 번 정의하면 손으로 단속하는 것이 아니라 일관성이 자동이 됩니다.',
      },
      {
        q: '어떤 에이전트를 쓸 수 있나요?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 및 그 밖의 퍼스트파티 어댑터. 자신의 프로바이더 키와 함께.',
      },
    ],
    ctaTitle: '오늘 밤 당신의 디자인 시스템을 정의하세요',
    ctaBody:
      '리포지토리에 스타를 누르고 Open Design을 설치한 뒤, 이미 사용 중인 에이전트에게 어디에나 적용할 하나의 브랜드를 주세요.',
  },
  roleSoloBuilder: {
    title: '솔로 빌더와 인디 해커를 위한 Open Design',
    description:
      '혼자서도 한 팀처럼 출시하세요. Open Design은 당신의 코딩 에이전트를 스타트업의 디자인 절반으로 바꿔줍니다. 프로토타입, 랜딩 페이지, 대시보드, 브랜드 비주얼까지, 모두 프롬프트 한 줄로, 모두 브랜드에 맞게, 모두 당신의 저장소 안에서.',
    breadcrumb: '솔로 빌더',
    label: '대상 · 솔로 빌더',
    heading: '당신의 디자인 팀은 이미 돌리고 있는 그 에이전트입니다',
    lead: '디자이너도, 예산도, 인수인계도 필요 없습니다. 필요한 것을 설명하면 에이전트가 그려냅니다. 오늘 아침엔 랜딩 페이지, 오후엔 대시보드, 출시 전엔 소셜 카드까지. 모두 한 번 정의한 하나의 디자인 시스템을 공유합니다.',
    heroImageAlt:
      '일관된 스타일의 랜딩 페이지, 앱, 대시보드, 소셜 카드에 둘러싸여 책상에 앉아 있는 한 사람을 그린 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 솔로 창업자가 가져본 적 없던 디자인 부서입니다. 제품에 필요한 모든 영역에서 프롬프트가 곧 결과물로. 하나의 브랜드로, 인수인계 없이, 추가 도구 없이.',
    stepsTitle: '솔로 빌더는 Open Design을 이렇게 씁니다',
    steps: [
      {
        title: '브랜드를 한 번만 정의하세요',
        body: '색상, 타이포그래피, 보이스를 DESIGN.md에 담으세요(또는 140개가 넘는 레퍼런스 시스템 중 하나를 fork하세요). 그 이후 생성하는 모든 결과물은 자동으로 브랜드에 맞춰집니다.',
        imageAlt: '하나의 브랜드 정의 파일 일러스트',
      },
      {
        title: '다음에 필요한 것을 무엇이든 생성하세요',
        body: '프로토타입, 랜딩 페이지, 대시보드, 피치 덱, 소셜 카드까지. 같은 에이전트, 같은 브랜드, 각각 프롬프트 한 줄로. 도구를 갈아타거나 시트를 새로 살 필요가 없습니다.',
        imageAlt: '하나의 프롬프트에서 다양한 결과물이 나오는 일러스트',
      },
      {
        title: '그대로 출시하세요 — 이미 진짜이니까요',
        body: '모든 것이 당신의 저장소 안에서 HTML / 코드로 렌더링됩니다. 그래서 프로토타입이 곧 제품이 되고 랜딩 페이지가 실제로 공개됩니다. 버려지는 목업은 없습니다.',
        imageAlt: '결과물이 프롬프트에서 라이브까지 곧장 가는 일러스트',
      },
    ],
    tableTitle: 'Open Design으로 혼자 만들기 vs. 힘들게 직접 하기',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '지금 혼자 한다면',
    tableRows: [
      { capability: '모든 디자인 영역 커버', withOd: '하나의 에이전트가 프로토타입, 랜딩, 대시보드, 브랜드를 담당', without: '다섯 개의 SaaS 도구와 튜토리얼을 이어 붙이기' },
      { capability: '브랜드 유지', withOd: '하나의 DESIGN.md가 어디에나 자동 적용', without: '도구마다 룩을 다시 만들고 시간이 지나며 어긋남' },
      { capability: '솔로의 속도로 움직이기', withOd: '아이디어에서 결과물까지 프롬프트 한 줄', without: '시간도 없는데 디자인 도구를 익히기' },
      { capability: '목업이 아니라 출시', withOd: '저장소 안의 HTML / 코드, 배포 준비 완료', without: '누군가 결국 만들어야 하는 목업' },
      { capability: '비용', withOd: '오픈 소스, 자신의 키 사용, 로컬에서 동작', without: '시트당 과금되는 구독의 더미' },
    ],
    featuresTitle: '솔로 빌더가 출시할 수 있는 것',
    features: [
      { title: '랜딩 페이지', body: '마케팅과 SaaS 랜딩, 클릭 가능하고 라이브.', thumb: 'example-saas-landing' },
      { title: '제품 프로토타입', body: '아이디어를 검증하는 멀티 스크린 웹 앱.', thumb: 'example-web-prototype' },
      { title: '대시보드', body: '당신 제품의 지표와 관리 뷰.', thumb: 'example-dashboard' },
      { title: '브랜드 그래픽', body: '브랜드에 맞는 커버와 포스터.', thumb: 'example-magazine-poster' },
      { title: '모바일 플로우', body: '웹을 넘어설 때의 앱 화면.', thumb: 'example-mobile-app' },
      { title: '소셜 카드', body: '모든 채널을 위한 출시·업데이트 카드.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Open Design으로 혼자 만든 것',
    galleryLead:
      '1인 스타트업에 필요한 모든 영역을, 프롬프트 한 줄로. 다음 행보에 가까운 것을 골라 설명해 보세요.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'SaaS 랜딩 페이지' },
      { thumb: 'example-web-prototype', caption: '제품 프로토타입' },
      { thumb: 'example-dashboard', caption: '제품 대시보드' },
      { thumb: 'example-card-twitter', caption: '출시용 소셜 카드' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '템플릿 둘러보기',
    faqTitle: '솔로 빌더 FAQ',
    faq: [
      { q: '저는 디자이너가 아닌데, 정말 쓸 수 있나요?', a: '네. 원하는 것을 평범한 말로 설명하면 에이전트가 디자인 시스템을 적용해 렌더링합니다. 기술은 프롬프트를 쓰는 것이지 픽셀을 옮기는 것이 아닙니다.' },
      { q: '모든 것을 커버하나요, 아니면 하나만 하나요?', a: '작은 제품에 필요한 모든 것을요. 프로토타입, 랜딩 페이지, 대시보드, 덱, 그래픽을 같은 에이전트와 같은 브랜드로.' },
      { q: '결과물은 무엇이 되나요?', a: '당신의 저장소 안의 진짜 HTML / 코드입니다. 그래서 프로토타입이 제품이 되고 랜딩 페이지가 공개될 수 있습니다. 버리는 목업이 아닙니다.' },
      { q: '어떤 에이전트를 쓸 수 있나요?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 등 다양한 퍼스트파티 어댑터를, 자신의 프로바이더 키로.' },
    ],
    ctaTitle: '오늘 밤, 당신의 모든 것을 만드세요',
    ctaBody:
      '저장소에 스타를 누르고, Open Design을 설치하고, 하나의 에이전트를 당신의 디자인 팀으로 만드세요. 이미 쓰고 있는 그 에이전트 안에서.',
  },
  roleDesigner: {
    title: '디자이너를 위한 Open Design',
    description:
      '시간을 안목에 쓰고, 잡일에는 쓰지 마세요. Open Design은 반복적인 제작 작업(변형, 상태, 디자인 시스템 전체)을 에이전트가 맡게 하고, 당신은 룩을 디렉팅하며 최종 결정권을 쥡니다.',
    breadcrumb: '디자이너',
    label: '대상 · 디자이너',
    heading: '디자인을 디렉팅하고, 제작은 에이전트에게',
    lead: '시스템과 기준은 당신이 정하고, 화면, 상태, 변형, 고충실도 시안은 에이전트가 렌더링합니다. 사각형을 밀어내는 시간은 줄이고, 무엇이 좋은지 결정하는 시간은 늘리세요.',
    heroImageAlt:
      '디자이너가 디렉팅하는 동안 에이전트가 화면, 변형, 디자인 시스템을 채워 넣는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 결코 지치지 않는 제작 어시스턴트입니다. 당신이 디자인 시스템을 정의하고 안목으로 판단하면, 에이전트가 나머지를 시스템에 맞게, 당신의 저장소 안에서 생성합니다.',
    stepsTitle: '디자이너는 Open Design을 이렇게 씁니다',
    steps: [
      {
        title: '시스템을 코드화하세요',
        body: '브랜드를 DESIGN.md로 옮기세요. 타입 스케일, 색상, 간격, 컴포넌트, 보이스까지. 이것이 에이전트가 따르는 진실의 원천입니다.',
        imageAlt: '파일로 담긴 디자인 시스템 일러스트',
      },
      {
        title: '롱테일을 생성하세요',
        body: '원래라면 손으로 짜 올렸을 모든 화면, 상태, 변형을 에이전트가 시스템에 맞게 렌더링합니다. 그래서 지루한 80%가 몇 분 만에 끝납니다.',
        imageAlt: '시스템에 맞는 여러 화면이 한 번에 생성되는 일러스트',
      },
      {
        title: '디렉팅하고 다듬으세요',
        body: '말로 비평하세요. "간격을 좁히고, 빈 상태를 더 따뜻하게." 최종 결정권은 당신이 쥐고, 반복은 에이전트가 합니다.',
        imageAlt: '디자이너가 지시를 내리고 디자인이 갱신되는 일러스트',
      },
    ],
    tableTitle: 'Open Design으로 디자인하기 vs. 수작업 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '수작업 디자인 도구',
    tableRows: [
      { capability: '디자인 시스템 구축', withOd: '에이전트가 어디에나 적용하는 DESIGN.md', without: '도구마다 손으로 유지하는 라이브러리' },
      { capability: '변형과 상태 제작', withOd: '프롬프트에서 시스템에 맞게 생성', without: '프레임을 복제하고 하나하나 조정' },
      { capability: '고충실도 시안', withOd: '평면 목업이 아니라 진짜 HTML로 렌더링', without: '결국 엔지니어가 다시 만드는 픽셀 작업' },
      { capability: '일관성 유지', withOd: '하나의 시스템이 자동으로 강제됨', without: '수작업 규율, 시간이 지나며 어긋남' },
      { capability: '인수인계', withOd: '결과물이 곧 코드, 번역의 간극 없음', without: '스펙 문서와 레드라인' },
    ],
    featuresTitle: '디자이너가 디렉팅할 수 있는 것',
    features: [
      { title: '에디토리얼 레이아웃', body: '아트 디렉팅된 그리드 기반 구성.', thumb: 'example-web-prototype-taste-editorial' },
      { title: '아티클 커버', body: '매거진 스타일의 커버와 피처.', thumb: 'example-article-magazine' },
      { title: '포스터', body: '브랜드에 맞는 과감한 타이포그래피 포스터.', thumb: 'example-magazine-poster' },
      { title: '소셜 세트', body: '일관된 멀티 프레임 캐러셀.', thumb: 'example-social-carousel' },
      { title: '앱 화면', body: '고충실도 모바일·웹 화면.', thumb: 'example-mobile-app' },
      { title: '대시보드', body: '당신의 시스템을 존중하는 데이터 UI.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Open Design으로 디렉팅한 것',
    galleryLead:
      '디렉팅으로부터 에이전트가 만들어낸, 시스템에 맞는 고충실도 작업. 당신의 스타일에 가까운 것을 골라 다듬어 보세요.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: '에디토리얼 레이아웃' },
      { thumb: 'example-article-magazine', caption: '매거진 커버' },
      { thumb: 'example-social-carousel', caption: '소셜 캐러셀' },
      { thumb: 'example-magazine-poster', caption: '타이포그래피 포스터' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '템플릿 둘러보기',
    faqTitle: '디자이너 FAQ',
    faq: [
      { q: '이게 저를 대체하나요?', a: '아니요. 대체하는 것은 잡일입니다. 시스템과 안목은 당신이 정하고, 반복적인 제작은 에이전트가 합니다. 그래서 당신만이 할 수 있는 결정에 시간을 쓸 수 있습니다.' },
      { q: '룩에 대한 통제권은 어떻게 유지하나요?', a: '당신의 DESIGN.md가 계약입니다. 에이전트는 그 안에서 렌더링하고, 당신은 맞을 때까지 말로 비평합니다.' },
      { q: '결과물은 편집 가능 / 진짜인가요?', a: '평면 내보내기가 아니라 진짜 HTML/CSS입니다. 그래서 다시 만들어지지 않고 그대로 프로덕션으로 넘어갑니다.' },
      { q: '어떤 에이전트를 쓸 수 있나요?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 등 다양한 퍼스트파티 어댑터를, 자신의 프로바이더 키로.' },
    ],
    ctaTitle: '오늘 밤, 다음 디자인을 디렉팅하세요',
    ctaBody:
      '저장소에 스타를 누르고, Open Design을 설치하고, 제작은 에이전트에게 맡기고 안목은 당신이 판단하세요. 이미 쓰고 있는 그 에이전트 안에서.',
  },
  roleEngineering: {
    title: '엔지니어를 위한 Open Design',
    description:
      '디자인 인수인계를 건너뛰세요. Open Design은 DESIGN.md를, 당신의 코딩 에이전트가 직접 작성하는 진짜 프론트엔드로 바꿉니다. 시스템에 맞는 UI, 프로토타입, 대시보드를 저장소 안에서, Figma 왕복 없이.',
    breadcrumb: '엔지니어링',
    label: '대상 · 엔지니어링',
    heading: '스펙에서 프론트엔드까지, 그 사이에 인수인계 없이',
    lead: '에이전트에게 DESIGN.md와 설명을 가리키면, 시스템에 맞는 진짜 프론트엔드 코드(컴포넌트, 화면, 대시보드)를 당신의 프로젝트에 직접 작성합니다. 레드라인도, "디자인 대기"도 없습니다.',
    heroImageAlt:
      'DESIGN.md가 인수인계 단계를 건너뛰고 곧장 프론트엔드 코드와 렌더링된 UI로 흘러가는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 디자인 시스템을 기계가 읽을 수 있게 만들어 디자이너에서 엔지니어로 가는 간극을 메웁니다. 당신의 코드를 쓰는 같은 에이전트가 시스템을 적용하고 진짜 UI를 렌더링합니다.',
    stepsTitle: '엔지니어는 Open Design을 이렇게 씁니다',
    steps: [
      {
        title: '레드라인이 아니라 시스템을 읽으세요',
        body: 'DESIGN.md는 저장소 안에 있습니다. 에이전트는 그것을 코드베이스의 나머지를 읽듯이 읽습니다. 해석할 내보내진 스펙이 없습니다.',
        imageAlt: '에이전트가 코드와 나란히 DESIGN.md를 읽는 일러스트',
      },
      {
        title: '시스템에 맞는 UI를 생성하세요',
        body: '화면이나 컴포넌트를 설명하면, 에이전트가 이미 시스템에 맞는 프론트엔드를 작성합니다. 프로토타입, 관리 대시보드, 내부 도구를 몇 분 만에.',
        imageAlt: '디자인 시스템에 맞게 생성된 UI 코드 일러스트',
      },
      {
        title: '그것은 이미 당신의 코드',
        body: '출력은 당신의 저장소 안의 HTML / 프레임워크 코드이며, PR에서 리뷰할 수 있습니다. "디자인"과 "빌드" 사이에 번역 단계가 없습니다.',
        imageAlt: '생성된 UI가 리뷰 가능한 PR로 안착하는 일러스트',
      },
    ],
    tableTitle: 'Open Design으로 프론트엔드 vs. 인수인계 방식',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '디자인-개발 인수인계',
    tableRows: [
      { capability: '만들 기준이 될 디자인 확보', withOd: '에이전트가 직접 읽는 DESIGN.md', without: '손으로 다시 해석하는 Figma 파일' },
      { capability: '시스템에 맞추기', withOd: '생성 시점에 자동으로 강제됨', without: '스펙과 눈대중으로 비교, 어긋남이 스며듦' },
      { capability: '내부 도구 / 대시보드 구축', withOd: '프롬프트 → 저장소 안의 시스템에 맞는 프론트엔드', without: '디자이너를 기다린 뒤 두 번 만들기' },
      { capability: '리뷰', withOd: '코드이니 PR에서 diff', without: '목업과 픽셀 비교' },
      { capability: '비용과 락인', withOd: '오픈 소스, 저장소 안, 로컬에서 동작', without: '팀 전체가 라이선스해야 하는 디자인 도구' },
    ],
    featuresTitle: '엔지니어가 생성할 수 있는 것',
    features: [
      { title: '웹 앱 UI', body: '설명으로부터의 멀티 스크린 프론트엔드.', thumb: 'example-web-prototype' },
      { title: '개발 대시보드', body: '저장소, CI, 지표 대시보드.', thumb: 'example-github-dashboard' },
      { title: '데이터 리포트', body: '당신의 데이터로부터의 구조화된 리포트.', thumb: 'example-data-report' },
      { title: '관리 대시보드', body: '내부 도구와 관리 뷰.', thumb: 'example-dashboard' },
      { title: '랜딩 페이지', body: '디자인을 기다리지 않는 마케팅 페이지.', thumb: 'example-saas-landing' },
      { title: 'Kanban / 보드', body: '내부 워크플로우 UI.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: '엔지니어가 Open Design으로 만든 것',
    galleryLead:
      '저장소 안에서 곧장 생성된, 시스템에 맞는 진짜 프론트엔드. 만들고 있는 것에 가까운 것을 골라 설명해 보세요.',
    gallery: [
      { thumb: 'example-web-prototype', caption: '웹 앱 UI' },
      { thumb: 'example-github-dashboard', caption: '개발 대시보드' },
      { thumb: 'example-data-report', caption: '데이터 리포트' },
      { thumb: 'example-kanban-board', caption: '내부 보드 UI' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '템플릿 둘러보기',
    faqTitle: '엔지니어링 FAQ',
    faq: [
      { q: '그래도 디자이너가 필요한가요?', a: '브랜드와 디렉션에는 네. 하지만 시스템에 맞는 UI와 내부 도구를 만드는 데는, 에이전트가 DESIGN.md를 읽고 프론트엔드를 작성합니다. 인수인계 왕복이 없습니다.' },
      { q: '무엇을 출력하나요?', a: '당신의 저장소 안의 진짜 HTML / 프레임워크 코드이며, PR에서 리뷰 가능합니다. 다시 구현할 목업이 아닙니다.' },
      { q: '어떻게 시스템에 계속 맞나요?', a: 'DESIGN.md가 진실의 원천입니다. 에이전트가 생성 시점에 그것을 적용하므로, 수작업 픽셀 확인 없이 출력이 맞습니다.' },
      { q: '어떤 에이전트를 쓸 수 있나요?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 등 다양한 퍼스트파티 어댑터를, 자신의 프로바이더 키로.' },
    ],
    ctaTitle: '오늘 밤, 다음 UI를 생성하세요',
    ctaBody:
      '저장소에 스타를 누르고, Open Design을 설치하고, DESIGN.md를 프론트엔드로 바꾸세요. 이미 쓰고 있는 그 에이전트 안에서.',
  },
  roleProductManagers: {
    title: '프로덕트 매니저를 위한 Open Design',
    description:
      '아이디어를 전달하려고 디자인 여력을 더는 기다리지 마세요. Open Design은 PM이 프롬프트를 클릭 가능한 프로토타입이나 와이어프레임으로 바꿀 수 있게 합니다. 이해관계자의 합의를 이루고 팀에 브리핑하기 위해, 디자인 티켓 없이.',
    breadcrumb: '프로덕트 매니저',
    label: '대상 · 프로덕트 매니저',
    heading: '킥오프 전에 아이디어를 클릭 가능하게',
    lead: '플로우를 설명하면 에이전트가 오늘 당장 이해관계자 앞에 내놓을 수 있는 진짜 클릭 가능한 프로토타입을 렌더링합니다. 그래서 리뷰에서는 문서 속 한 문단이 아니라 실물을 두고 논의합니다.',
    heroImageAlt:
      'PM이 글로 쓴 아이디어를 이해관계자에게 보여주는 클릭 가능한 프로토타입으로 바꾸는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 PM에게 디자인 없이 아이디어를 실체화하는 방법을 줍니다. 합의와 브리핑을 위한 프롬프트에서 프로토타입으로. 팀의 디자인 예산을 쓰지 않고.',
    stepsTitle: 'PM은 Open Design을 이렇게 씁니다',
    steps: [
      {
        title: '플로우를 설명하세요',
        body: '사용자 여정을 평범한 말로 쓰세요. 화면, 상태, 해피 패스까지. 와이어프레임 도구가 필요 없습니다.',
        imageAlt: 'PM이 사용자 플로우를 설명하는 일러스트',
      },
      {
        title: '클릭 가능한 프로토타입을 받으세요',
        body: '에이전트가 실제로 클릭해 넘길 수 있는 화면을 렌더링합니다. 이해관계자 리뷰에는 슬라이드나 문서보다 훨씬 명확합니다.',
        imageAlt: '설명으로부터 만들어진 클릭 가능한 프로토타입 일러스트',
      },
      {
        title: '합의하고 넘기세요',
        body: '링크를 공유하고 실물에 대한 피드백을 모은 뒤, 프로토타입을 정확하고 공유된 출발점으로 디자인/엔지니어에 넘기세요.',
        imageAlt: '프로토타입이 합의를 위해 공유된 뒤 팀에 넘겨지는 일러스트',
      },
    ],
    tableTitle: 'Open Design으로 하는 PM 업무 vs. 디자인 대기',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '지금 그것 없이',
    tableRows: [
      { capability: '아이디어를 실체화', withOd: '프롬프트 → 직접 만드는 클릭 가능한 프로토타입', without: '디자인 티켓을 올리고 여력을 기다리기' },
      { capability: '이해관계자 합의', withOd: '그들이 진짜 플로우를 클릭', without: '문서를 읽고 각자 다르게 상상' },
      { capability: '팀에 브리핑', withOd: '스펙으로서의 구체적인 프로토타입', without: '한 무더기의 글과 오가는 논의' },
      { capability: '빌드 전 반복', withOd: '프롬프트로 바꿔 다시 공유', without: '디자인 대기열에서 또 한 바퀴' },
      { capability: '비용', withOd: '오픈 소스, 이미 쓰고 있는 에이전트 안에서', without: '버려질 콘셉트에 들어가는 디자인 시간' },
    ],
    featuresTitle: 'PM이 사람들 앞에 내놓을 수 있는 것',
    features: [
      { title: '모바일 플로우', body: '엔드 투 엔드 앱 여정, 클릭 가능.', thumb: 'example-mobile-app' },
      { title: '온보딩 플로우', body: '환영 → 설정 → 첫 실행.', thumb: 'example-mobile-onboarding' },
      { title: '보드와 워크플로우', body: '스펙을 위한 Kanban과 프로세스 UI.', thumb: 'example-kanban-board' },
      { title: '대시보드', body: '문제를 틀 짓는 지표 뷰.', thumb: 'example-dashboard' },
      { title: '웹 프로토타입', body: '리뷰용 멀티 스크린 웹 플로우.', thumb: 'example-web-prototype' },
      { title: '트렌드 뷰', body: '맥락을 위한 30일·트렌드 스냅샷.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'PM이 Open Design으로 프로토타이핑한 것',
    galleryLead:
      '설명으로부터 렌더링된, 이해관계자 리뷰에 바로 쓸 수 있는 클릭 가능한 플로우. 당신의 아이디어에 가까운 것을 골라 설명해 보세요.',
    gallery: [
      { thumb: 'example-mobile-app', caption: '모바일 플로우' },
      { thumb: 'example-mobile-onboarding', caption: '온보딩 플로우' },
      { thumb: 'example-kanban-board', caption: '워크플로우 보드' },
      { thumb: 'example-web-prototype', caption: '웹 프로토타입' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '템플릿 둘러보기',
    faqTitle: '프로덕트 매니저 FAQ',
    faq: [
      { q: '저는 디자인을 못 하는데, 이게 저를 위한 건가요?', a: '네. 플로우를 말로 설명하면 에이전트가 그것을 클릭 가능하게 만듭니다. 전달하고 합의하기 위한 것이며, 디자인 도구가 필요 없습니다.' },
      { q: '진짜 프로토타입인가요, 목업인가요?', a: '진짜이고 클릭 가능합니다. 내비게이션과 상태가 작동하므로 이해관계자가 실제 경험에 반응합니다.' },
      { q: '디자인을 대체하나요?', a: '아니요. 텍스트 스펙 대신 디자인과 엔지니어에 정확하고 공유된 출발점을 주고, 정말 필요한 작업을 위해 디자인 여력을 아낍니다.' },
      { q: '어떤 에이전트를 쓸 수 있나요?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 등 다양한 퍼스트파티 어댑터를, 자신의 프로바이더 키로.' },
    ],
    ctaTitle: '오늘 밤, 당신의 아이디어를 클릭 가능하게',
    ctaBody:
      '저장소에 스타를 누르고, Open Design을 설치하고, 다음 스펙을 사람들이 클릭할 수 있는 것으로 바꾸세요. 이미 쓰고 있는 그 에이전트 안에서.',
  },
  roleMarketing: {
    title: '마케팅 팀을 위한 Open Design',
    description:
      '콘텐츠의 속도로 캠페인을 출시하세요. Open Design은 당신의 에이전트가 랜딩 페이지, 소셜 카드, 캠페인 비주얼을 프롬프트로 만들어내게 합니다. 브랜드에 맞게, 온디맨드로, 디자인 줄 서기 없이.',
    breadcrumb: '마케팅',
    label: '대상 · 마케팅',
    heading: '프롬프트의 속도로 만드는 캠페인 비주얼',
    lead: '랜딩 페이지, 소셜 카드, 커버, 공지 그래픽까지. 말로 설명하고, 브랜드에 맞게 렌더링하고, 당일에 출시. 디자인 티켓도, 템플릿과의 씨름도 없습니다.',
    heroImageAlt:
      '마케터가 브리프를 랜딩 페이지와 브랜드에 맞는 소셜 카드 세트로 바꾸는 에디토리얼 일러스트',
    tldrTitle: '한 줄로 말하면',
    tldrBody:
      'Open Design은 마케팅을 위한 상시 가동 디자인 리소스입니다. 랜딩 페이지와 소셜을 위한 프롬프트에서 에셋으로. 브랜드에 맞게. 그래서 캠페인이 카피를 쓰는 속도로 출시됩니다.',
    stepsTitle: '마케팅 팀은 Open Design을 이렇게 씁니다',
    steps: [
      {
        title: '브랜드를 고정하세요',
        body: '당신의 DESIGN.md가 색상, 타이포그래피, 보이스를 담습니다. 에이전트가 만드는 모든 에셋은 자동으로 브랜드에 맞습니다. 에셋마다 다시 스타일링할 필요가 없습니다.',
        imageAlt: '마케팅 에셋에 적용된 브랜드 시스템 일러스트',
      },
      {
        title: '캠페인을 생성하세요',
        body: '랜딩 페이지, 소셜 카드, 커버, 공지 그래픽까지. 각각 프롬프트 한 줄로, 모든 채널에 걸쳐 일관된 세트를.',
        imageAlt: '프롬프트로부터 생성된 완전한 캠페인 세트 일러스트',
      },
      {
        title: '출시하고 반복하세요',
        body: '랜딩 페이지는 배포할 수 있는 HTML로 렌더링되고, 그래픽은 PNG로 내보내집니다. 헤드라인을 바꾸고 세트를 다시 렌더링하세요. 줄 서기는 없습니다.',
        imageAlt: '캠페인 에셋이 빠르게 출시되고 반복되는 일러스트',
      },
    ],
    tableTitle: 'Open Design으로 하는 마케팅 vs. 늘 있는 허둥지둥',
    tableColCapability: '필요한 것',
    tableColWithOd: 'Open Design이라면',
    tableColWithout: '지금 그것 없이',
    tableRows: [
      { capability: '랜딩 페이지 공개', withOd: '프롬프트 → 브랜드에 맞는 페이지, 배포 가능', without: '디자인에 의뢰하거나 사이트 빌더와 씨름' },
      { capability: '일관된 소셜 세트', withOd: '같은 템플릿, 새 카피, 완벽하게 정렬', without: '카드마다 손으로 다시 정렬' },
      { capability: '브랜드 유지', withOd: '하나의 DESIGN.md가 모든 에셋에 적용', without: '각 에셋이 가이드라인에 맞기를 바라기' },
      { capability: '캠페인 속도로 움직이기', withOd: '프롬프트로 에셋을, 당일에', without: '디자인 백로그 뒤에서 줄 서기' },
      { capability: '비용', withOd: '오픈 소스, 시트당 과금 디자인 도구 없음', without: '구독에 더해 디자인 시간' },
    ],
    featuresTitle: '마케팅 팀이 출시할 수 있는 것',
    features: [
      { title: '랜딩 페이지', body: '캠페인과 제품 랜딩, 배포 가능.', thumb: 'example-saas-landing' },
      { title: '소셜 카드', body: '브랜드에 맞는 X / Twitter 카드.', thumb: 'example-card-twitter' },
      { title: '캐러셀', body: '일관된 멀티 슬라이드 소셜 세트.', thumb: 'example-social-carousel' },
      { title: '포스터', body: '공지와 이벤트 포스터.', thumb: 'example-magazine-poster' },
      { title: '아티클 커버', body: '블로그와 뉴스레터 커버.', thumb: 'example-article-magazine' },
      { title: '웹 페이지', body: '마이크로사이트와 캠페인 페이지.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: '마케팅이 Open Design으로 출시한 것',
    galleryLead:
      '프롬프트로부터 렌더링된, 브랜드에 맞는 캠페인 에셋. 당신의 캠페인에 가까운 것을 골라 카피를 바꿔 넣으세요.',
    gallery: [
      { thumb: 'example-saas-landing', caption: '캠페인 랜딩 페이지' },
      { thumb: 'example-card-twitter', caption: '소셜 카드' },
      { thumb: 'example-social-carousel', caption: '소셜 캐러셀' },
      { thumb: 'example-magazine-poster', caption: '공지 포스터' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: '템플릿 둘러보기',
    faqTitle: '마케팅 FAQ',
    faq: [
      { q: '모든 에셋마다 디자이너가 필요한가요?', a: '아니요. 에이전트가 브랜드에 맞는 랜딩 페이지와 소셜 에셋을 프롬프트로 렌더링합니다. 그래서 팀은 일상적인 캠페인 작업을 디자인 줄 서기 없이 출시합니다.' },
      { q: '에셋은 어떻게 브랜드에 계속 맞나요?', a: '당신의 DESIGN.md가 모든 것에 자동 적용됩니다. 색상, 타이포그래피, 보이스가 모든 에셋에 걸쳐 이어집니다.' },
      { q: '랜딩 페이지가 실제로 공개될 수 있나요?', a: '네. 배포할 수 있는 HTML로 렌더링되고, 그래픽은 PNG로 내보내집니다. 이것들은 출시 가능한 에셋이지 목업이 아닙니다.' },
      { q: '어떤 에이전트를 쓸 수 있나요?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI 등 다양한 퍼스트파티 어댑터를, 자신의 프로바이더 키로.' },
    ],
    ctaTitle: '오늘 밤, 다음 캠페인을 출시하세요',
    ctaBody:
      '저장소에 스타를 누르고, Open Design을 설치하고, 브리프를 브랜드에 맞는 에셋으로 바꾸세요. 이미 쓰고 있는 그 에이전트 안에서.',
  },
};
