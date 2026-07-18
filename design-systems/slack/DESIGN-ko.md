# Slack에서 영감받은 디자인 시스템

> Category: 생산성 및 SaaS
> 직장 커뮤니케이션 플랫폼. 오베르진을 주색으로, 다중 액센트 로고 팔레트, 다크 사이드바와 결합된 밝은 서피스. 따뜻하고 친근한 느낌.

## 1. 비주얼 테마와 분위기

Slack의 정체성은 '업무는 인간적이고 약간 재미있어야 한다'는 아이디어를 중심으로 구축되어 있습니다. 기본 서피스는 **밝은** 형태입니다——흰색 콘텐츠 영역과 깊은 오베르진(`#4A154B`) 사이드바——어두운 색 우선 도구와 정반대입니다. 이 대비는 의도적입니다: 사이드바는 차분하고 항상 존재하는 내비게이션 앵커이며, 콘텐츠 영역은 밝고 열려 있습니다.

로고 팔레트——파란색, 초록색, 노란색, 빨간색——는 주로 해시태그 아이콘과 마케팅 맥락에서 사용되며, UI 전체에 흩어져 있지 않습니다. 제품 자체에서 Slack은 오베르진을 유일한 브랜드 앵커로 사용하는 절제되고 전문적인 색상 시스템을 사용합니다.

**주요 특징:**
- 밝은 콘텐츠 서피스 우선: 흰색 `#FFFFFF`와 거의 흰색 `#F8F8F8`
- 깊은 오베르진 `#4A154B` 사이드바——브랜드에서 가장 인식하기 쉬운 UI 요소
- 4가지 로고 액센트 컬러(파란색, 초록색, 노란색, 빨간색)는 하이라이트로만 아껴 사용
- 제목에 Larsseit(마케팅), UI에는 시스템 산세리프
- 둥글지만 만화 같지 않음: 대부분의 컴포넌트에 4–8px 반경
- 촘촘하지만 숨 쉬는 느낌: 컴팩트한 메시지 행과 명확한 스레드 계층 구조
- 따뜻하고 대화적인 톤——이모지, 반응, 일러스트가 일급 시민

---

## 2. 색상 팔레트와 역할

### 브랜드 프라이머리
| 토큰 | Hex | 역할 |
|---|---|---|
| `--color-aubergine` | `#4A154B` | 사이드바 배경, 브랜드 주색 |
| `--color-aubergine-dark` | `#350d36` | 오베르진 서피스의 호버 상태 |
| `--color-aubergine-light` | `#611f69` | 사이드바 활성 항목 하이라이트 |

### 로고 액센트 컬러(아껴 사용——하이라이트, 아이콘, 마케팅에만)
| 토큰 | Hex | 이름 | 역할 |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | 스카이 블루 | 채널 아이콘, 링크, 정보 상태 |
| `--color-green` | `#2EB67D` | 틸 그린 | 온라인 상태, 성공 상태 |
| `--color-yellow` | `#ECB22E` | 골드 | 자리 비움 상태, 경고, 하이라이트 |
| `--color-red` | `#E01E5A` | 루비 | 알림, 오류, 멘션 뱃지 |

### 서피스 및 배경
| 토큰 | Hex | 역할 |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | 메인 메시지 영역, 모달 |
| `--bg-secondary` | `#F8F8F8` | 스레드 패널, 보조 서피스 |
| `--bg-tertiary` | `#F1F1F1` | 입력 배경, 호버 상태 |
| `--bg-sidebar` | `#4A154B` | 왼쪽 사이드바(오베르진) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | 사이드바 항목 호버 |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | 활성 사이드바 항목 |
| `--bg-message-hover` | `#F8F8F8` | 메시지 행 호버 |

### 텍스트 컬러
| 토큰 | Hex | 역할 |
|---|---|---|
| `--text-primary` | `#1D1C1D` | 주요 본문 텍스트(거의 검정) |
| `--text-secondary` | `#616061` | 타임스탬프, 음소거 레이블 |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | 사이드바 채널 이름 |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | 사이드바 비활성 항목 |
| `--text-link` | `#1264A3` | 메시지 내 인라인 링크 |
| `--text-mention` | `#1264A3` | @멘션 텍스트 컬러 |

### 시맨틱 컬러
| 토큰 | Hex | 역할 |
|---|---|---|
| `--color-success` | `#2EB67D` | 성공 토스트, 긍정적 상태 |
| `--color-warning` | `#ECB22E` | 경고 상태 |
| `--color-danger` | `#E01E5A` | 오류 상태, 파괴적 동작 |
| `--color-info` | `#36C5F0` | 정보 하이라이트 |

### 테두리 및 구분선
| 토큰 | Hex | 역할 |
|---|---|---|
| `--border-default` | `#DDDDDD` | 표준 구분선, 카드 테두리 |
| `--border-subtle` | `#F1F1F1` | 행 사이의 미묘한 구분선 |
| `--border-focus` | `#1264A3` | 포커스 링 컬러 |

---

## 3. 타이포그래피 규칙

### 서체
| 역할 | 공식 | 웹 폴백 |
|---|---|---|
| 디스플레이 / 마케팅 제목 | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| UI / 본문 / 크롬 | Slack Lato(커스텀) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| 코드 / 모노스페이스 | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack은 마케팅 헤드라인에 **Larsseit**를, 제품 내 UI에는 커스텀 Lato 변형을 사용합니다. 웹 사용에는 `system-ui`가 가장 안전한 폴백입니다.

### 타입 스케일

| 레벨 | 크기 | 두께 | 행간 | 자간 | 용도 |
|---|---|---|---|---|---|
| Display XL | 48px | 800 | 1.1 | -1px | 마케팅 히어로 헤드라인 |
| Display L | 36px | 700 | 1.15 | -0.5px | 섹션 히어로 |
| Heading 1 | 28px | 700 | 1.25 | normal | 모달 제목, 페이지 헤더 |
| Heading 2 | 22px | 700 | 1.3 | normal | 카드 제목, 설정 섹션 |
| Heading 3 | 18px | 700 | 1.35 | normal | 서브섹션 헤더 |
| Body L | 16px | 400 | 1.5 | normal | 메시지 텍스트, 설명 |
| Body | 15px | 400 | 1.46667 | normal | 기본 UI 텍스트(Slack의 기본 크기) |
| Body SM | 13px | 400 | 1.38462 | normal | 보조 메타데이터 |
| Caption | 12px | 400 | 1.33 | normal | 타임스탬프, 힌트 |
| Code | 12px | 400 | 1.5 | normal | 인라인 코드, 코드 블록 |

### 타이포그래피 규칙
- Slack의 기본 본문 크기는 **15px**——밀도를 위해 16px보다 약간 작음
- 읽지 않은 채널: 두께 700——볼드체가 주요 읽지 않음 표시기
- 타임스탬프: 12px `--text-secondary`, 호버 시에만 표시
- 코드 블록: 배경 `#F8F8F8`, 테두리 `1px solid #DDDDDD`, 반경 4px
- 폰트 크기 12px 미만 사용 금지
- 마케팅 제목: 큰 디스플레이 크기에 자간 `-1px`

---

## 4. 컴포넌트 스타일

### 버튼

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### 입력 필드
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### 사이드바 채널 항목
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### 읽지 않음 뱃지
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### 메시지 첨부 파일 / 카드
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### 반응
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. 레이아웃 원칙

### 3단 레이아웃
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Sidebar    │        Message Area          │   Thread    │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  optional   │
└──────────────┴──────────────────────────────┴─────────────┘
```

### 간격 시스템(4px 기준)
| 토큰 | 값 | 용도 |
|---|---|---|
| `--space-1` | 4px | 좁은 간격 |
| `--space-2` | 8px | 컴포넌트 패딩 |
| `--space-3` | 12px | 입력 패딩 |
| `--space-4` | 16px | 표준 패딩 |
| `--space-6` | 24px | 카드 패딩 |
| `--space-8` | 32px | 섹션 간격 |

### 사이드바 구조
```
[워크스페이스 이름 ▼]
────────────────────
Threads
All DMs
Drafts & Sent
────────────────────
▼ Channels
  # general
  # random
  # design  ● (unread)
────────────────────
▼ Direct Messages
  John Doe
  Jane Smith
```

### 메시지 컴포저
- 메시지 영역 하단에 고정
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- 툴바: 이모지, 첨부, 서식, 전송 버튼

---

## 6. 깊이와 엘리베이션

Slack은 밝은 서피스에 가벼운 그림자를 사용합니다:

| 레벨 | 용도 | 그림자 |
|---|---|---|
| 플랫 | 메시지 행, 사이드바 항목 | none |
| 낮음 | 카드, 입력 | `0 1px 3px rgba(0,0,0,0.08)` |
| 중간 | 드롭다운, 팝오버 | `0 4px 12px rgba(0,0,0,0.12)` |
| 높음 | 모달, 다이얼로그 | `0 8px 24px rgba(0,0,0,0.15)` |
| 오버레이 | 모달 백드롭 | `rgba(0,0,0,0.5)` |

---

## 7. 해야 할 것과 하지 말아야 할 것

### ✅ 해야 할 것
- 사이드바에 오베르진 `#4A154B` 사용——Slack의 가장 상징적인 UI 요소
- 메인 콘텐츠 영역을 흰색으로 밝게 유지
- 모든 본문 텍스트에 `#1D1C1D`(거의 검정) 사용, 순수 검정 사용 금지
- 채널 이름을 볼드체로 표시하여 읽지 않음 상태 표시——두께가 표시기
- 4가지 액센트 컬러는 시맨틱 역할(성공, 경고, 위험, 정보)에만 사용
- 메시지 첨부 파일과 임베드에 `border-left: 4px` 적용
- 타임스탬프는 호버 시에만 표시
- 링크와 포커스 상태에 `#1264A3` 사용
- 사이드바 항목을 컴팩트하게 유지: 높이 28px, 반경 6px

### ❌ 하지 말아야 할 것
- 메인 콘텐츠 영역을 어둡게 하지 않기——Slack은 밝은 색 우선
- 파란색/초록색/노란색/빨간색을 장식적 액센트로 흩뿌리지 않기
- 텍스트에 순수 검정 `#000000` 사용 금지
- 말풍선 사용 금지——메시지는 플랫한 행
- 버튼에 큰 반경 사용 금지——4px가 표준
- 타임스탬프를 영구적으로 표시하지 않기
- 채널 이름을 전부 대문자로 쓰지 않기
- 폰트 크기 12px 미만 사용 금지

---

## 8. 반응형 동작

### 브레이크포인트
| 브레이크포인트 | 너비 | 레이아웃 |
|---|---|---|
| 모바일 | < 768px | 단일 패널, 사이드바는 왼쪽 드로어 |
| 태블릿 | 768–1024px | 사이드바 + 메시지 영역만 |
| 데스크톱 | > 1024px | 전체 3단 레이아웃 |

### 모바일 적응
- 사이드바: 왼쪽 드로어, 오른쪽으로 스와이프하여 열기
- 하단 탭 바: 홈, DM, 활동, 나
- 스레드 패널: 전체 화면 오버레이
- 컴포저: 키보드 위에 고정
- 채널 목록 항목: 44px 터치 타겟 높이
- 모바일에서도 오베르진 상단 헤더 바 유지

---

## 9. Agent 프롬프트 가이드

Slack 스타일 디자인을 생성할 때 다음 접근 방식을 따르세요:

**색상 적용:**
> 메인 캔버스로 `background: #FFFFFF`를 설정합니다. 사이드바에는 `#4A154B`(오베르진)를 사용합니다. 모든 주요 텍스트는 `#1D1C1D`입니다. 링크와 포커스 링은 `#1264A3`을 사용합니다. 4가지 로고 컬러——`#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A`——는 시맨틱 전용: 정보, 성공, 경고, 위험.

**타이포그래피:**
> 모든 UI에 `system-ui, -apple-system, sans-serif`를 사용합니다. 기본 크기는 15px입니다. 읽지 않은 채널: 두께 700. 본문 텍스트: 두께 400. 타임스탬프: 12px `#616061`, 호버 시에만. 코드: `Monaco, Menlo, monospace`, 12px, 배경 `#F8F8F8`.

**레이아웃:**
> 3단: 240px 오베르진 사이드바 + 플렉시블 흰색 메시지 영역 + 선택적 400px 스레드 패널. 사이드바 항목: 높이 28px, 반경 6px, 읽지 않았을 때 볼드. 컴포저: 하단 고정, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**컴포넌트:**
> 버튼: 반경 4px, 높이 36px, 오베르진 프라이머리. 입력: `1px solid #DDDDDD` 테두리, `#1264A3` 포커스 링. 메시지 행: 플랫, 말풍선 없음, 36px 원형 아바타. 반응: 필 형태 `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**톤:**
> Slack은 따뜻하고 전문적이며 인간적입니다. 빈 상태에는 친근한 일러스트를 사용합니다. CTA는 직접적입니다: "Send message", "Get started". 오류 메시지는 명확하고 도움이 됩니다. 절대 불안을 조성하지 않습니다.

**피해야 할 안티패턴:**
> 어두운 콘텐츠 영역 금지. 말풍선 금지. 순수 검정 텍스트 금지. 여러 색상 액센트 흩뿌리기 금지. 채널 이름 전부 대문자 금지. 12px 미만 폰트 금지. 큰 버튼 반경 금지.
