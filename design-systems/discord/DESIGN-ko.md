# Discord에서 영감받은 디자인 시스템

> Category: 생산성 및 SaaS
> 음성/채팅 플랫폼. 짙은 블러플, 다크 우선 서피스, 포인트 액센트.

## 1. 비주얼 테마 & 분위기

Discord의 제품은 야간 플레이, 레이드, 그룹 음성 통화를 위해 설계되었으므로 전체 서피스는 다크 우선입니다. 기본 캔버스는 짙은 `Background Primary`(`#313338` 라이트 테마, `#1e1f22` 다크 테마)이며, 채널·스레드·사이드 패널을 구분하기 위해 채팅 컬럼은 약간 밝거나 어두운 음영으로 겹겹이 쌓여 있습니다. 시그니처 **블러플**(`#5865f2`)은 브랜드 마크, 주요 CTA, 멘션, "나" 어포던스에만 사용되며, 절제된 뉴트럴 톤 위에서 도드라지도록 아낌없이 아껴 씁니다.

타이포그래피는 산문과 크롬 UI에 **gg sans**(Discord의 커스텀 Whitney 대체 서체)를 사용하며, 채팅 클라이언트에서 요구하는 작은 크기에서도 친근하면서 가독성이 유지되는 둥근 기하학적 형태를 갖습니다. 헤딩은 단계별로 점진적으로 커지고, 채팅 행 간격은 촘촘하게(메시지 그룹 사이 4–8px) 유지되어 몇 시간치 스크롤백도 빠르게 훑어볼 수 있습니다.

형태 언어는 둥글지만 풍선처럼 부드럽지는 않습니다. 카드에는 8px 반경, 입력 필드에는 4px 반경, 상태 배지와 태그에는 완전한 필 모양을 사용합니다. 서버 아이콘은 48px 크기의 둥근 사각형 아바타이며 호버 시 원으로 변형되는데, 이 작은 모션이 브랜드 아이덴티티의 일부가 되었습니다.

**주요 특성:**
- 다크 우선 서피스: `#1e1f22` / `#2b2d31` / `#313338` (3단계 깊이)
- 채팅 서피스의 유일한 채도 높은 액센트인 블러플 `#5865f2`
- 모든 텍스트에 gg sans (Whitney 스타일) — 친근하고 기하학적이며 중립적
- 호버 시 원으로 전환되는 둥근 사각형 서버 아바타 (16px 반경)
- 촘촘한 채팅 행 간격, 여유로운 사이드 패널 패딩
- 상태 점: 초록색 온라인, 노란색 자리 비움, 빨간색 방해 금지, 회색 오프라인
- 낮은 알파값의 은은한 오프화이트 1px 픽셀 스냅 구분선

## 2. 색상 팔레트 & 역할

### 프라이머리
- **블러플** (`#5865f2`): 브랜드 프라이머리, 주요 CTA, 멘션 하이라이트.
- **블러플 호버** (`#4752c4`): 블러플의 호버/활성 상태.
- **블러플 소프트** (`#7289da`): 레거시 블러플, 마케팅 보조 액센트.

### 서피스 (다크 테마 — 기본)
- **Background Tertiary** (`#1e1f22`): 서버 목록 레일, 가장 깊은 배경.
- **Background Secondary** (`#2b2d31`): 채널 사이드바, 설정 사이드바.
- **Background Primary** (`#313338`): 채팅 서피스, 메시지 컬럼.
- **Background Floating** (`#111214`): 플로팅 팝오버, 툴팁, 자동완성.
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): 행 위의 호버 오버레이.
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): 활성 행.

### 서피스 (라이트 테마)
- **Light Bg Primary** (`#ffffff`): 라이트 테마의 채팅 서피스.
- **Light Bg Secondary** (`#f2f3f5`): 라이트 테마의 사이드바.
- **Light Bg Tertiary** (`#e3e5e8`): 가장 깊은 라이트 서피스.

### 텍스트
- **Header Primary** (`#f2f3f5`): 다크 테마의 채널 헤더, 모달 제목.
- **Header Secondary** (`#b5bac1`): 음소거된 헤더.
- **Text Normal** (`#dbdee1`): 다크 테마 본문 텍스트 — 순수 흰색보다 약간 차갑습니다.
- **Text Muted** (`#949ba4`): 타임스탬프, 서버 이름, 보조 메타데이터.
- **Text Link** (`#00a8fc`): 메시지 내 하이퍼링크 — 블러플과 구별되는 하늘색.
- **Channels Default** (`#80848e`): 사이드바의 비활성 채널 이름.

### 상태 & 시맨틱
- **Status Online** (`#23a55a`): 온라인 점, 성공 상태.
- **Status Idle** (`#f0b232`): 자리 비움 점, 부재 중.
- **Status DND** (`#f23f43`): 방해 금지, 파괴적 동작의 빨간색으로도 사용.
- **Status Streaming** (`#593695`): "스트리밍" 보라색.
- **Status Offline** (`#80848e`): 오프라인 회색.
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): @멘션 행의 은은한 블러플 워시.

### 테두리 & 구분선
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): 다크 테마의 표준 구분선.
- **Border Subtle** (`#3f4147`): 카드용 솔리드 구분선.

## 3. 타이포그래피 규칙

### 글꼴 패밀리
- **본문 / UI / 헤딩**: `gg sans`, 폴백: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **디스플레이 (레거시 / Whitney)**: `Whitney`, 폴백: `gg sans`
- **코드 / 모노**: `"gg mono"`, 폴백: `Consolas, Andale Mono, Courier New, Courier, monospace`

### 계층 구조

| 역할 | 글꼴 | 크기 | 굵기 | 줄 높이 | 자간 | 비고 |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | 마케팅 히어로 |
| Page Heading | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | 설정/프로필 제목 |
| Channel Name | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`, 채널 헤더 |
| Message Body | gg sans | 16px (1rem) | 400 | 1.375 | normal | 표준 채팅 텍스트 |
| Username | gg sans | 16px (1rem) | 500 | 1.25 | normal | 메시지 작성자 |
| Timestamp | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | "Today at 4:32 PM" |
| Sidebar Channel | gg sans | 16px (1rem) | 500 | 1.25 | normal | 채널 목록 행 |
| Server Name | gg sans | 16px (1rem) | 600 | 1.25 | normal | 서버 헤더 |
| Caption / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | 상태 텍스트, 수정 태그 |
| Code Inline | gg mono | 0.875em | 400 | inherit | normal | 인라인 `code` |
| Code Block | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | ```삼중 펜스``` 블록 |

### 원칙
- **친근한 기하학**: gg sans는 a/g/s의 둥근 터미널로 Whitney를 대체합니다 — 브랜드는 가독성을 해치지 않으면서 따뜻함을 추구합니다.
- **색상 대비보다 굵기 대비**: 계층 구조는 400→500→600→700→800 굵기 단계로 표현되며 서피스는 뉴트럴을 유지합니다.
- **16px 본문**: 채팅 메시지는 16px 아래로 줄어들지 않습니다. 밀도는 글꼴 크기가 아닌 줄 높이(1.375)로 조절합니다.

## 4. 컴포넌트 스타일링

### 버튼

**프라이머리**
- Background: `#5865f2`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Hover: `#4752c4`
- 사용처: 주요 CTA, "계속하기", "서버 참가"

**세컨더리**
- Background: `#4e5058`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Hover: `#6d6f78`

**터셔리 / 서틀 (링크 스타일)**
- Background: transparent
- Text: `#dbdee1`
- Hover: 텍스트 밑줄 표시, 배경 변화 없음

**위험**
- Background: `#da373c`
- Text: `#ffffff`
- Hover: `#a12d2f`

### 입력 필드
- Background: `#1e1f22`
- Text: `#dbdee1`
- Border: 1px solid `#1e1f22`
- Radius: 4px
- Padding: 10px 12px
- 포커스: border `#5865f2`

### 서버 아바타
- 크기: 48×48px
- 반경: 기본값 16px (둥근 사각형); 호버 및 활성 상태에서 50%로 전환.
- 활성 상태: 아이콘 컬럼 왼쪽 가장자리에 4px 흰색 필 표시.

### 상태 점
- 크기: 10×10px
- 테두리: 3px solid background-tertiary ("노치" 효과 생성)
- 위치: 아바타 우하단.

### 카드 / 임베드
- Background: `#2b2d31` (다크) 또는 `#f2f3f5` (라이트)
- 왼쪽 테두리: 4px solid 임베드 액센트 색상.
- Radius: 4px
- Padding: 8px 16px

### 멘션 필
- Background: `rgba(88, 101, 242, 0.3)`
- Text: `#c9cdfb`
- Padding: 0 2px
- Radius: 3px

## 5. 간격 & 레이아웃

- **기본 단위**: 4px. 스케일: 4, 8, 12, 16, 20, 24, 32, 40.
- **서버 레일**: 너비 72px, 고정.
- **채널 사이드바**: 너비 240px.
- **멤버 목록**: 데스크톱에서 너비 240px.
- **채팅 컬럼**: 유동적, 최소 380px.

## 6. 모션

- **지속 시간**: 호버 200ms; 아바타 원형 변형 350ms; 툴팁 페이드 80ms.
- **이징**: 아바타 변형에 `cubic-bezier(0.215, 0.61, 0.355, 1)` (빠르게 시작 후 안착).
- **알림 펄스**: 읽지 않은 멘션 인디케이터에 1.4s ease-in-out infinite.

## 7. 사용 가이드라인

- 다크 쉘, 촘촘한 밀도, 블러플 액션 계층 구조를 함께 유지하세요. 밝은 마케팅 스타일 레이아웃에 블러플을 사용하면 Discord 제품의 느낌이 무너집니다.
- 내비게이션이 많은 서피스는 독립적인 장식용 카드보다 레일, 사이드바, 채팅 컬럼 중심으로 구성하세요.
- 사람, 서버, 또는 활성 현재 상태를 나타낼 때는 둥근 사각형 아바타와 상태 점 언어를 사용하세요.
