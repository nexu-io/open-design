/*
 * 엄선한 DeepSeek Harness 디자인 컬렉션의 한국어 카피.
 * 영어 원본을 번역한 것입니다.
 */
import type { DeepseekCopyOverride } from './index';

export const ko: DeepseekCopyOverride = {
  collectionEyebrow: '엄선한 컬렉션',
  collectionHeading: '디자인을 위한 DeepSeek Harness 플러그인',
  collectionLede:
    '디자인 작업을 위한 dsh 플러그인 큐레이션. 스크린샷을 읽는 비전 브리지, 에이전트가 그릴 수 있는 캔버스와 생성형 UI, 디자인 리뷰 도구, 그리고 그 모든 것을 미리 보여 주는 워크벤치까지. DeepSeek Harness는 Claude Code·Codex와 같은 SKILL.md 형식을 읽으므로 기존 디자인 스킬 라이브러리를 그대로 가져올 수 있습니다.',
  collectionStats: [
    { value: '13', label: '엄선한 dsh 플러그인' },
    { value: '13', label: '출처 저장소' },
    { value: 'SKILL.md', label: 'Claude Code & Codex와 공유' },
  ],
  collectionIntro:
    '아래 dsh 플러그인은 모두 실재하고, DeepSeek Harness 네이티브이며, GitHub의 dsh-plugin 토픽으로 찾을 수 있고, 각각 출처로 연결됩니다. 하는 일은 크게 넷입니다. 텍스트뿐인 하네스에 시각을 주고, 그릴 수 있는 디자인 표면을 주고, 디자인 리뷰를 루프에 연결하고, 웹 UI를 디자인 워크스페이스로 바꿉니다.',
  collectionCategoryBlurbs: [
    '스크린샷, 목업, 차트를 텍스트 전용 모델이 다룰 수 있는 구조화된 근거로 바꿉니다.',
    '에이전트에게 그릴 표면을 줍니다. 편집 가능한 벡터 캔버스, 라이브 UI 카드, 슬라이드까지.',
    '루프를 닫습니다. 실제 페이지에 주석을 달고, 모션 애셋을 컴파일하고, 스킬 라이브러리를 옮겨 옵니다.',
    '하네스 자체를 디자인 워크스페이스로 만듭니다. 채팅 옆의 프리뷰 패널, 워크벤치, 보드까지.',
  ],
  collectionCloserHeading: '세팅은 건너뛰세요. Open Design 안에서 DeepSeek Harness와 디자인하기',
  filterAll: '전체',
  collectionCloserBody:
    'Open Design은 DeepSeek Harness를 감싸고 도는 오픈소스 에이전트 네이티브 디자인 워크스페이스입니다. 시스템과 스킬, 템플릿을 일관되게 지켜 주므로 에이전트가 내놓는 결과물은 온전히 여러분의 것입니다.',

  categoryVision: '비전 & 입력',
  categoryCanvas: '캔버스 & 생성형 UI',
  categoryWorkflow: '디자인 워크플로',
  categoryWorkspace: '워크스페이스 & 프리뷰',

  ctaDownload: 'Open Design 다운로드',
  ctaStarList: 'DeepSeek Harness에 Star 남기기',
  ctaGuide: 'DeepSeek Harness로 디자인하는 방법 보기',
  ctaBrowseAll: '전체 플러그인 둘러보기',
  ctaViewSource: '소스 보기',
  ctaOurRepo: 'GitHub의 deepseek-harness',
  cardKind: '플러그인',
  cardWhatItDoes: '무엇을 하나',
  cardCta: '플러그인 보기',

  detailWhatIsIt: '무엇인가',
  detailWhyForDesign: '디자인에 왜 중요한가',
  detailHowWithAgent: 'DeepSeek Harness로 실행하는 법',
  detailExampleTag: '언제 꺼내 쓰나',
  detailSource: '출처',
  detailCategory: '카테고리',
  detailMaintainer: '작성자',
  detailTags: '태그',
  detailLicense: '라이선스',
  detailCovers: '다루는 내용',
  detailUpstream: '업스트림 README에서',
  detailAgentNote: 'DeepSeek Harness 지원',
  detailTraction: '인기도',
  detailRepo: '소스 저장소',
  detailStars: '스타',

  installHeading: '설치 방법',
  installRunInAgent: '터미널에서 실행하세요.',
  installRestart: '플러그인을 인식하도록 dsh web을 다시 시작하세요.',
  installClone: '저장소를 클론하세요.',
  installPoint: 'DeepSeek Harness에 스킬 파일 경로를 지정하세요.',
  installThenUse: '그다음 원하는 디자인을 설명하세요. 하네스가 플러그인의 도구를 알아서 집어 듭니다.',

  installNote:
    '여기 모인 플러그인은 모두 무료로 설치할 수 있으며, 실제 업스트림 출처로 연결됩니다.',
  installNoteCta: '컬렉션 전체 보기',
  detailMoreOnList: 'DeepSeek Harness 저장소에서 더 보기',
  detailRelated: '다른 DeepSeek Harness 디자인 플러그인',
  finalEyebrow: '다음 단계',
  detailCloserHeading: '세팅 없이, Open Design으로 디자인하기',
  detailCloserBody:
    '이 플러그인을 직접 설치해도 되고, Open Design으로 DeepSeek Harness 주위에 잘 정돈된 디자인 레이어를 통째로 두를 수도 있습니다. 키는 직접 가져오고, 산출물도 직접 소유하세요.',

  skills: {
    modlens: {
      tagline: '텍스트 전용 DeepSeek 모델에 플러그인 비전을 답니다. 스크린샷을 붙여 넣으면 구조화된 근거가 나옵니다.',
      whatIsIt:
        '텍스트 전용 코딩 에이전트를 위한 비전 브리지. 채팅에 이미지를 붙여 넣으면 modlens가 모델의 짐작 대신 구조화된 JSON 근거로 바꿔 줍니다. 전체 전사, 읽기 순서대로 정리된 레이아웃 영역, 엔티티와 관계까지.',
      whyForDesign: [
        'UI 스크린샷이 에이전트가 곧바로 다룰 수 있는 요소별 워크스루가 됩니다.',
        '빽빽한 차트와 데이터 시각화도 빠짐없이 읽어 냅니다. 축, 스케일, 팔레트, 강조 영역까지.',
        '레퍼런스 여러 장을 한 번에 붙여 넣으면 각각을 설명하기 전에 공통된 시각적 계열부터 짚어 냅니다.',
      ],
      howWithAgent: [
        '플러그인을 설치하면 모델 선택기에 modlens 비전이 붙은 DeepSeek-V4 변형이 추가됩니다.',
        '스크린샷, 목업, 차트를 대화에 바로 붙여 넣으세요.',
        '이미지를 다시 설명하는 대신 구조화된 근거를 상대로 디자인 질문을 던지세요.',
      ],
    },
    'dsh-vision-toolkit': {
      tagline: 'UI 복원, 그라운딩, 픽셀 비교 검증을 위한 열 가지 비전 도구.',
      whatIsIt:
        'DeepSeek Harness 네이티브로 묶인 열 가지 비전 도구. 이미지 Q&A, 픽셀 좌표를 돌려주는 그라운딩과 검출, 긴 스크린샷 OCR, 크롭, 컬러 추출, HTML 스크린샷, 픽셀 비교까지. 도구는 vision-tools 스킬을 통해 점진적으로 마운트됩니다.',
      whyForDesign: [
        'UI 복원 루프를 숫자로 닫습니다. 저장소에 포함된 워크플로가 재구현을 픽셀 차이 6.04%에서 0%까지 반복해 줄입니다.',
        '그라운딩과 검출이 원본 이미지 기준 픽셀 박스를 돌려주므로, 에이전트가 산문을 해석하는 대신 좌표로 움직입니다.',
        '인포그래픽과 손그림 스케치가 편집 가능한 HTML/CSS 인터페이스가 됩니다.',
      ],
      howWithAgent: [
        '웹 또는 헤드리스 프로필에 플러그인을 추가하고, 원격 도구용 비전 자격 증명을 설정하세요.',
        '툴킷을 활성화하면 vision-tools 스킬이 열 가지 도구 스키마를 모두 마운트합니다.',
        '레퍼런스를 재구현한 뒤 vision_html_screenshot과 vision_pixel_diff로 검증하세요.',
      ],
    },
    'dsh-ui-spec': {
      tagline: 'UI 스크린샷을 구현 가능한 수준의 스펙으로 바꿉니다. 토큰, 여백 스케일, 레이아웃 그리드까지.',
      whatIsIt:
        '스크린샷이나 목업을 구조화된 프런트엔드 스펙으로 바꾸는 단일 analyze_ui_image 도구. 결정론적 지오메트리 레이어가 정확한 치수, 팔레트, 제안 디자인 토큰, 레이아웃 그리드, 여백 스케일을 측정하고, 선택 사항인 비전 모델이 그 위에 의미론을 얹습니다.',
      whyForDesign: [
        '픽셀 좌표, 여백 스케일, 토큰 팔레트가 비전 모델의 짐작이 아니라 결정론적으로 계산됩니다.',
        '스펙 필드가 구현에 곧바로 대응됩니다. 제안 토큰은 디자인 토큰으로, 여백 스케일은 CSS로.',
        '의미론 역할이 의도를, 지오메트리가 배치를 맡아 하나의 JSON + Markdown 스펙으로 합쳐집니다.',
      ],
      howWithAgent: [
        '플러그인을 추가하세요. 지오메트리 레이어는 설정 없이 오프라인으로 동작합니다.',
        '원한다면 의미론 레이어를 아무 OpenAI 호환 비전 엔드포인트에나 연결하세요.',
        '에이전트에게 스크린샷을 건네고, 이미지 대신 돌려받은 스펙을 기준으로 만드세요.',
      ],
    },
    'dsh-media-skills': {
      tagline: '공짜 눈과 공짜 붓. 붙여 넣은 이미지 읽기에 워터마크 없는 이미지 생성까지.',
      whatIsIt:
        '하네스를 위한 두 개의 SKILL.md 스킬과 무료 비전 모델 경로. vision-review는 스크린샷을 읽어 시각적 버그를 잡아내고, media-tools는 일러스트, 아바타, 배경, 배너를 생성합니다. 둘 다 무료 티어 모델로 돌아갑니다.',
      whyForDesign: [
        '텍스트 에이전트가 볼 수 없는 UI 시각 버그를 잡아냅니다. 겹침, 넘침, 어긋난 정렬까지.',
        '무료 티어에서 워터마크 없이 디자인 애셋을 생성하므로 탐색에 비용이 들지 않습니다.',
        '텍스트 전용 세션에 \'Add image\' 버튼을 더해, 붙여 넣은 이미지를 현재 모델에게 설명해 줍니다.',
      ],
      howWithAgent: [
        '플러그인을 추가하고 무료 API 키를 하네스 자격 증명 저장소에 넣으세요.',
        'dsh web을 다시 시작하면 모델 선택기에 무료 비전 경로가 추가됩니다.',
        '스크린샷 리뷰든 새 애셋이든, 평범한 말로 요청하세요.',
      ],
    },
    'dsh-openpencil': {
      tagline: '에이전트가 정적 이미지를 돌려주는 대신 진짜 편집 가능한 벡터 캔버스 위에서 디자인합니다.',
      whatIsIt:
        '하네스를 오픈소스 AI 네이티브 벡터 디자인 도구인 OpenPencil에 연결합니다. 다섯 가지 도구로 에이전트가 design-as-code .op 문서를 트랜잭션 배치로 생성, 편집, 렌더링, 검사하며, 멀티 프레임 프리뷰와 사람이 이어받을 수 있는 관리형 에디터가 딸려 있습니다.',
      whyForDesign: [
        '요구사항에서 캔버스까지 루프 하나. 에이전트가 실제 문서를 편집하고 프리뷰가 디자인에 충실한 프레임을 렌더링합니다.',
        '트랜잭션 배치는 성공할 때만 게시되고 외부 편집을 절대 덮어쓰지 않습니다. 충돌은 숨겨지는 대신 드러납니다.',
        '선택, 레이어, 속성, 실행 취소를 갖춘 관리형 에디터로 사람이 언제든 에이전트의 결과물을 이어받을 수 있습니다.',
      ],
      howWithAgent: [
        'OpenPencil을 설치한 뒤 웹 프로필에 플러그인을 추가하세요.',
        '디자인을 설명하면 에이전트가 openpencil_create와 openpencil_edit을 배치로 몰아갑니다.',
        '렌더링된 프리뷰나 관리형 에디터를 열어 그 자리에서 계속 다듬으세요.',
      ],
    },
    'dsh-visualize': {
      tagline: '모델이 인터랙티브 HTML 카드를 대화 스트림 안에 바로 그려 넣습니다.',
      whatIsIt:
        'visualize 도구와 동반 스킬. 모델이 HTML 프래그먼트를 작성하면 채팅 안에 샌드박스된 인터랙티브 카드로 마운트됩니다. 시뮬레이터, 차트, 비교 패널, UI 목업을 스트리밍 프리뷰와 테마에 맞춘 스타일로 보여 줍니다.',
      whyForDesign: [
        'UI 목업이 대화 안에 살아 있어, 설명으로 그치지 않고 클릭할 수 있습니다.',
        '카드가 호스트의 라이트/다크 테마와 팔레트를 따르므로 프리뷰가 네이티브처럼 보입니다.',
        '모든 카드는 엄격한 CSP를 갖춘 샌드박스 iframe에서 돌아, 깨진 프래그먼트가 세션을 망가뜨릴 수 없습니다.',
      ],
      howWithAgent: [
        '플러그인을 추가하고 dsh web을 다시 시작하세요.',
        '목업이나 비교를 요청하면 모델이 자신의 HTML로 visualize를 호출합니다.',
        '나중에 세션을 다시 재생해도 카드는 저장된 도구 결과에서 복원됩니다.',
      ],
    },
    'dsh-genui': {
      tagline: '서른 개가 넘는 인터랙티브 컴포넌트를 답변 안에 인라인으로 렌더링하고, 액션은 모델로 되돌아갑니다.',
      whatIsIt:
        '모델이 dsh-ui fence 안에 인터페이스를 JSON으로 서술하면, 브라우저 쪽 렌더러가 답변 안의 살아 있는 컴포넌트로 바꿉니다. 카드, 표, 차트, 폼, 탭, 타임라인, diff, mermaid, 3D 장면까지, 답이 스트리밍되는 동안 나타납니다.',
      whyForDesign: [
        '답변이 인터페이스가 됩니다. 데이터 패널, 차트, 폼이 설명이 이루어지는 바로 그 자리에서 렌더링됩니다.',
        '인터랙티브 컴포넌트가 액션을 모델로 돌려보내고, 모델이 다시 UI를 갱신합니다.',
        '컴포넌트 화이트리스트와 스펙 가드 덕분에 깨진 차트가 화면에 닿는 일이 없습니다.',
      ],
      howWithAgent: [
        'GitHub에서 플러그인을 추가하고 dsh web을 다시 시작하세요.',
        '대시보드, 퀴즈, 폼을 요청하면 모델이 dsh-ui fence를 직접 작성합니다.',
        '결과물과 상호작용하세요. 로컬 액션은 즉시 반응하고, 모델 액션은 루프로 되돌아갑니다.',
      ],
    },
    'dsh-openmaic': {
      tagline: '에이전트가 작성한 JSON에서 슬라이드, 인터랙티브 위젯, 통째로 재생 가능한 수업까지 렌더링합니다.',
      whatIsIt:
        'THU-MAIC 그룹이 만든 네 가지 도구와 소크라테스식 티칭 스킬. 에이전트가 PPTist 스타일 슬라이드 JSON을 작성하면 공식 OpenMAIC 렌더러가 렌더링하고, 인터랙티브 위젯을 샌드박스 카드로 스트리밍하며, 한 줄짜리 요청을 보내면 재생 가능한 교실이 되어 돌아옵니다.',
      whyForDesign: [
        '텍스트, 도형, 이미지, 표, 차트, 수식, 코드가 담긴 슬라이드 덱을 대화 안에서 JSON으로 작성합니다.',
        '인터랙티브 시뮬레이션과 게임이 샌드박스 카드로 그 자리에서 렌더링됩니다.',
        '시각 콘텐츠가 갖춰진 수업 전체가 요청 한 번 거리이며, 재생 가능한 링크로 돌아옵니다.',
      ],
      howWithAgent: [
        'GitHub에서 플러그인을 추가하세요. 컴파일된 상태로 배포되어 빌드 단계가 없습니다.',
        'dsh web을 다시 시작하고 덱이나 위젯을 요청하세요.',
        '수업 전체가 필요하면 openmaic_generate가 OpenMAIC 서비스를 폴링해 교실 링크를 돌려줍니다.',
      ],
    },
    'dsh-web-review': {
      tagline: '살아 있는 페이지의 요소를 짚고 시각적으로 주석을 달면, 에이전트가 소스를 고칩니다.',
      whatIsIt:
        '하네스 웹 UI에 내장된 브라우저. 디자인 도구에서 하듯 요소를 호버로 강조하고 선택해 메모를 붙이고, 텍스트, 컬러, 타이포그래피, 크기, 여백, 테두리, 효과를 라이브로 조정해 볼 수 있습니다. 주석에는 셀렉터와 소스 단서가 실려 있어 에이전트가 코드를 찾아 고칠 수 있습니다.',
      whyForDesign: [
        'UI 문제를 말로 설명하는 대신 시각적으로 짚고 주석을 답니다.',
        '코드에 손대기 전에 라이브 조정으로 변경을 페이지에서 미리 봅니다.',
        'better-typography부터 interface-review까지 여덟 가지 디자인 스킬이 번들로 실려, 주석 에디터에서 바로 쓸 수 있습니다.',
      ],
      howWithAgent: [
        '플러그인을 추가하고 dsh web을 시작하세요.',
        'Web Preview 탭에서 실행 중인 앱을 열고 바꾸고 싶은 곳에 주석을 다세요.',
        '전송하면 에이전트가 셀렉터, 메모, 시험해 본 값을 받아 워크스페이스 소스를 고칩니다.',
      ],
    },
    'dsh-figma-to-lottie': {
      tagline: '대화 안에서 SVG 패스와 키프레임을 자립형 Lottie 애니메이션으로 컴파일합니다.',
      whatIsIt:
        '디자인 데이터를 모션 애셋으로 바꾸는 두 가지 도구. lottie_compile_shape는 SVG 패스를 Lottie 도형 값으로 변환하고, lottie_compile은 간결한 레이어 스펙에서 완결된 Lottie JSON을 조립합니다. 사각형, 그러데이션, 패스, 임베드 이미지와 텍스트에 레이어별 키프레임 애니메이션까지.',
      whyForDesign: [
        '로딩 애니메이션을 평범한 말로 설명하면 iOS, Android, 웹에서 도는 .lottie.json을 받습니다.',
        '베지어 in/out 탄젠트와 키프레임 이징이 손으로 쓰는 대신 컴파일됩니다.',
        '빌드 단계가 없는 순수 ESM. 게시된 그대로가 실행되는 그대로입니다.',
      ],
      howWithAgent: [
        'npm에서 플러그인을 추가하거나, GitHub에서 커밋을 고정하세요.',
        '모션을 설명하세요. 레이어, 타이밍, 이징, 시차까지.',
        '컴파일된 .lottie.json을 LottieWeb, lottie-ios, lottie-android에 넣으세요.',
      ],
    },
    'dsh-plugin-claude-bridge': {
      tagline: '여러분의 Claude Code 스킬, 메모리, 전역 지침을 마이그레이션 없이 하네스에서 그대로 씁니다.',
      whatIsIt:
        'Claude Code의 표준 파일 위치를 직접 읽습니다. 마이그레이션 스크립트도, 복사도, 심링크도 없습니다. ~/.claude/skills의 스킬이 하네스 스킬 카탈로그에 합류하고, 프로젝트 메모리가 매 요청마다 컨텍스트로 주입되며, CLAUDE.md 전역 지침도 그대로 넘어옵니다.',
      whyForDesign: [
        'Claude Code에서 이미 쓰던 디자인 스킬이 파일 하나 옮기지 않고 여기서 동작합니다.',
        '프로젝트 메모리를 요청마다 다시 읽으므로 새 메모가 즉시 반영됩니다.',
        '전역 지침과 협업 선호가 에이전트를 넘나들며 보존됩니다.',
      ],
      howWithAgent: [
        '프로필에 플러그인을 추가하세요. 설정 없이 동작합니다.',
        '원한다면 ~/.agents/skills 같은 추가 스킬 디렉터리를 지정하세요.',
        'Claude Code에서 하던 대로 기존 스킬을 이름으로 호출하세요.',
      ],
    },
    'dsh-web-ui': {
      tagline: '생태계 최대의 UI 키트. 태스크 보드, 프리뷰 패널, Git 그래프에 스킨 센터까지.',
      whatIsIt:
        '하네스 웹 UI를 위한 플러그인과 스킨 모음. 카드가 실제 에이전트 세션을 실행하는 5열 태스크 보드, 파일 트리와 멀티 탭 프리뷰를 갖춘 우측 패널, Git 그래프, 모바일 원격 제어, 적용 전에 입어 볼 수 있는 스킨 센터까지 담겨 있습니다.',
      whyForDesign: [
        '우측 패널이 Markdown, HTML, diff, CSV, PDF, Office 파일, 이미지를 대화 옆에서 미리 보여 줍니다.',
        '태스크 보드가 디자인 할 일을 카드로 바꾸고, 실제 dsh 에이전트 세션이 실행해 결과를 보고합니다.',
        '패널 너비는 드래그로 조절되고 프로젝트별로 저장되므로 워크스페이스가 정리해 둔 그대로 유지됩니다.',
      ],
      howWithAgent: [
        '웹 프로필에 애그리게이트 패키지를 추가하면 한 번에 전부 설치됩니다.',
        '우측 패널을 열고 작업 중인 파일과 프리뷰를 고정하세요.',
        '보드에 디자인 태스크를 올려 두면 카드가 실제 에이전트 세션에서 실행됩니다.',
      ],
    },
    'dsh-better-sidebar': {
      tagline: '사이드바 안의 완전한 워크벤치. 파일 탐색기, 풍부한 프리뷰, 터미널, Git, 브라우저까지.',
      whatIsIt:
        '하네스 웹 UI를 위한 듀얼 패널 워크벤치. CodeMirror 편집을 갖춘 지연 로딩 파일 탐색기, 이미지·Markdown·HTML·PDF·Office 파일 인라인 프리뷰, 진짜 터미널, VS Code 스타일 diff를 보여 주는 Git 패널, 임베드된 샌드박스 브라우저, 드래그 가능한 분할 창 탭까지 갖췄습니다.',
      whyForDesign: [
        '에이전트가 만들어 내는 HTML, 이미지, 문서를 대화를 떠나지 않고 미리 봅니다.',
        '임베드된 샌드박스 브라우저가 실행 중인 프로토타입을 채팅 옆 탭으로 엽니다.',
        '서드파티 플러그인이 서비스 API를 통해 자체 탭과 파일 프리뷰어를 등록할 수 있습니다.',
      ],
      howWithAgent: [
        '한 줄 스크립트로 설치하거나, 웹 프로필에 npm 패키지를 추가하세요.',
        '워크벤치를 열고 우측 사이드바와 하단 패널에 탭을 배치하세요.',
        '에이전트가 만든 결과를 그 자리에서 검토하세요. 프리뷰, diff, 터미널, 브라우저 탭으로.',
      ],
    },
  },
};
