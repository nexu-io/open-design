#!/usr/bin/env python3
# Role: 인스타 카드뉴스 합성 CLI — cards.json + bg-NN.png → <slug>-NN.png (1080×1350)
# Key Features: 4:5 중앙 크롭·LANCZOS 리사이즈, 역할별(cover/body/cta) 텍스트 오버레이, body 자동 줄바꿈+양쪽맞춤(5~7줄 계약), 로고 합성(폭 99px 고정), --self-test 지오메트리 회귀 모드
# Dependencies: Pillow만 (시스템 python3 3.9+). 폰트는 Pretendard variable 우선 자동 탐색, 나눔 폴백.
# Notes: body 카드는 박스·스크림 밴드·전면 균일 다크닝 금지 — 하단 페더 그라디언트만(v2 레퍼런스 실측).
#        결정성 계약: 같은 cards.json + 같은 배경 → 같은 출력 (텍스트 수정 시 배경 재생성 불필요).

import argparse
import json
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow가 필요합니다. 설치: python3 -m pip install --user pillow")

W, H = 1080, 1350            # 최종 규격 4:5 (craft 룰 1)
LEFT = 84                    # 좌측 텍스트 여백 (craft 룰 6: 가장자리 ≥72px)
BOTTOM = 96                  # 하단 텍스트 여백 (cover)
LOGO_W = 99                  # 로고 폭 고정 — 2026-07-06 사용자 확정
LOGO_Y = 72                  # 로고 상단 y
CTA_DIM_ALPHA = 115          # cta 전면 균일 딤 ~45% 고정 — 그라디언트 금지 (2026-07-06 재확인)
COVER_GRAD_START, COVER_GRAD_PEAK = 0.45, 200  # cover 하단 그라디언트 (기존 유지)
BODY_GRAD_START, BODY_GRAD_PEAK = 0.40, 230    # body 하단 그라디언트 (레퍼런스 실측 근사)
BODY_TITLE_SIZE = 58         # body 타이틀 (레퍼런스 잉크 44~49px 실측)
BODY_TITLE_WEIGHT = 800      # body 타이틀 weight — 가드·렌더 동일값 강제 (리터럴 중복 제거)
BODY_TEXT_SIZE = 43          # body 본문 (레퍼런스 잉크 34px 실측)
BODY_TEXT_WEIGHT = 500       # body 본문 weight — 가드·렌더·self-test 동일값 강제
BODY_PITCH = 62              # body 타이틀·본문 공통 줄 피치 (실측 균일)
BODY_TITLE_INK_TOP = 648     # 타이틀 첫 줄 잉크 상단 (실측 646~650)
BODY_TITLE_BODY_GAP = 37     # 타이틀 마지막 줄 잉크하단 → 본문 첫 줄 잉크상단 갭 (2026-07-07 사용자 지정 — 고정 앵커 794 폐기, 타이틀 줄수 무관 균일 갭)
BODY_MAX_INK = W - 2 * LEFT  # 912 — 텍스트 잉크 폭 한계 (좌우 대칭 84px, 우측 한계 x=996) — cover·body 공통
BODY_MIN_LINES = 5           # body 본문 렌더 최소 줄수 (2026-07-07 사용자 지정 — 하단 여백 과다 방지)
BODY_MAX_LINES = 7           # body 본문 렌더 최대 줄수 (v2 계약 유지)

# 폰트 자동 탐색 후보 — Pretendard variable 우선, 나눔 폴백 (craft 룰 4: 텍스트 = 100% Pillow)
VARIABLE_CANDIDATES = [
    "~/Library/Fonts/PretendardVariable.ttf",
    "/Library/Fonts/PretendardVariable.ttf",
    "/usr/share/fonts/truetype/pretendard/PretendardVariable.ttf",
]
NANUM_REGULAR = [
    "~/Library/Fonts/NanumGothic.ttf",
    "/Library/Fonts/NanumGothic.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
]
NANUM_BOLD = [
    "~/Library/Fonts/NanumGothicBold.ttf",
    "/Library/Fonts/NanumGothicBold.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
]


class FontProvider:
    """weight 축 폰트 로더 — variable이면 set_variation_by_axes, 아니면 Bold/Regular 2파일 매핑."""

    def __init__(self, regular, bold, variable):
        self.regular, self.bold, self.variable = regular, bold, variable

    def get(self, size, weight):
        path = self.regular if (self.variable or weight < 700) else self.bold
        font = ImageFont.truetype(path, size)
        if self.variable:
            font.set_variation_by_axes([weight])
        return font


def _first_existing(candidates):
    # 후보 경로 순회 — 먼저 발견된 것 사용 (사용자 폰트 > 시스템 폰트 순)
    for c in candidates:
        p = Path(c).expanduser()
        if p.exists():
            return str(p)
    return None


def find_fonts(explicit):
    if explicit:
        p = Path(explicit).expanduser()
        if not p.exists():
            sys.exit(f"--font 경로가 없습니다: {p}")
        return FontProvider(str(p), str(p), variable=True)
    v = _first_existing(VARIABLE_CANDIDATES)
    if v:
        return FontProvider(v, v, variable=True)
    r = _first_existing(NANUM_REGULAR)
    if r:
        return FontProvider(r, _first_existing(NANUM_BOLD) or r, variable=False)
    sys.exit(
        "한글 폰트를 찾지 못했습니다. Pretendard 설치 권장: "
        "https://github.com/orioncactus/pretendard 의 PretendardVariable.ttf를 "
        "~/Library/Fonts 에 넣으세요 (나눔고딕도 폴백으로 지원)."
    )


def crop_resize(bg):
    """중앙 4:5 크롭 → 1080×1350 LANCZOS (craft 룰 1 — 규격은 여기서 보장)."""
    w, h = bg.size
    target = W / H
    if w / h > target:
        new_w = int(h * target)
        x0 = (w - new_w) // 2
        box = (x0, 0, x0 + new_w, h)
    else:
        new_h = int(w / target)
        y0 = (h - new_h) // 2
        box = (0, y0, w, y0 + new_h)
    return bg.crop(box).resize((W, H), Image.LANCZOS)


def draw_logo(img, logo):
    # 로고 = 이미지 에셋 합성(폭 99px 고정), 폰트 렌더 금지 — 없으면 스킵 (브랜드-범용)
    if logo is None:
        return
    resized = logo.resize((LOGO_W, max(1, round(logo.height * LOGO_W / logo.width))), Image.LANCZOS)
    img.paste(resized, ((W - LOGO_W) // 2, LOGO_Y), resized)


def apply_bottom_gradient(img, start_ratio=COVER_GRAD_START, peak_alpha=COVER_GRAD_PEAK):
    """하단 가독 페더 그라디언트 — 경계선 금지 (스크림 밴드 사용자 반려 이력).
    cover(0.45H/α200)·body(0.40H/α230)가 파라미터만 달리해 공용."""
    start = int(H * start_ratio)
    mask = Image.new("L", (1, H), 0)
    for y in range(start, H):
        mask.putpixel((0, y), int(peak_alpha * (y - start) / (H - start)))
    img.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), mask.resize((W, H)))


def compose_cover(img, card, fonts):
    apply_bottom_gradient(img)
    draw = ImageDraw.Draw(img)
    hook_lines = card["hook_lines"]
    hook_lh = round(92 * 1.18)
    # 좌하단 블록: 서브타이틀(44 w600) 위 + 훅(92 w800) 아래 — 하단 여백 96 기준 상향 적층
    y = H - BOTTOM - (44 + 20 + hook_lh * len(hook_lines))
    draw.text((LEFT, y), card["sub"], font=fonts.get(44, 600), fill=(255, 255, 255))
    y += 44 + 20
    hook_font = fonts.get(92, 800)
    for line in hook_lines:
        draw.text((LEFT, y), line, font=hook_font, fill=(255, 255, 255))
        y += hook_lh


LINE_HEAD_FORBIDDEN = ".,!?%·)」’”"  # 줄머리 금칙 구두점 — 줄 시작에 오면 앞 글자를 당겨서 함께 꺾는다
NO_BREAK_RUN = set("0123456789%ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")  # 숫자·영문 런은 중간 개행 금지 ("30%" → "3/0%" 방지)


def wrap_paragraph(draw, text, font, max_w=BODY_MAX_INK):
    """폭 기준 글자 단위 줄바꿈 — 어절 중간 개행 허용(레퍼런스 풀폭 스타일 "과육이 푸/석해져요").
    매 줄이 자연폭 ~100% 차서 양쪽맞춤 간격 벌어짐이 없다. 같은 텍스트+같은 폰트 → 같은 분할.
    금칙 2종: 줄머리 구두점(앞 글자 동반 개행), 숫자·영문 런 중간 개행(런 통째로 다음 줄)."""
    text = " ".join(text.split())
    lines, cur = [], ""
    for ch in text:
        if cur and draw.textlength(cur + ch, font=font) > max_w:
            if ch == " ":  # 줄 경계의 공백은 버린다 (줄머리 공백 금지)
                lines.append(cur.rstrip())
                cur = ""
                continue
            kept, carry = cur.rstrip(), ""
            if ch in LINE_HEAD_FORBIDDEN and len(kept) > 1:
                kept, carry = kept[:-1], kept[-1]
            elif ch in NO_BREAK_RUN and kept and kept[-1] in NO_BREAK_RUN:
                while kept and kept[-1] in NO_BREAK_RUN:
                    carry = kept[-1] + carry
                    kept = kept[:-1]
                kept = kept.rstrip()
                if not kept:  # 줄 전체가 한 런 — 이때만 강제 분할 허용
                    kept, carry = cur.rstrip(), ""
            lines.append(kept)
            cur = carry + ch
        else:
            cur += ch
    if cur.strip():
        lines.append(cur.rstrip())
    return lines


def draw_justified(draw, line, font, y, fill):
    """양쪽맞춤 1줄 — 잔여 폭을 글자 사이에 미세 균등 분배(신문식)해 우측 잉크를 x=996(LEFT+912)에 맞춘다.
    글자 단위 채움이라 잔여분은 글자 1자 폭 미만 → 글자당 1px 안팎, 눈에 안 띈다."""
    widths = [draw.textlength(c, font=font) for c in line]
    gaps = len(line) - 1
    if gaps < 1 or sum(widths) >= BODY_MAX_INK:
        draw.text((LEFT, y), line, font=font, fill=fill)
        return
    extra = (BODY_MAX_INK - sum(widths)) / gaps
    x = float(LEFT)
    for ch, wd in zip(line, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += wd + extra


def body_copy_report(card, fonts):
    """body 카드 카피 가드 — 에러 목록 반환. 타이틀 잉크 912px 초과 = 프레임 침범이라 에러,
    타이틀 1~2줄 밖 = 계약 위반 에러(구 [:2] 무언 절단 폐기 — 잘려도 조용히 통과하던 갭),
    본문 렌더 줄수 5~7 밖 = 카피 계약 위반 에러(줄바꿈·양쪽맞춤은 compose 소유라 줄수가 유일한 카피 축)."""
    draw = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    title_font = fonts.get(BODY_TITLE_SIZE, BODY_TITLE_WEIGHT)
    errors = []
    if not 1 <= len(card["title_lines"]) <= 2:
        errors.append(
            f"index {card['index']} title_lines {len(card['title_lines'])}줄 — 계약은 1~2줄, 줄을 합치거나 내용을 나누세요")
    for line in card["title_lines"]:
        ink = draw.textlength(line, font=title_font)
        if ink > BODY_MAX_INK:
            errors.append(
                f"index {card['index']} title 줄 잉크 {ink:.0f}px > 한계 {BODY_MAX_INK}px — 글자수를 줄이세요: {line!r}")
    body_font = fonts.get(BODY_TEXT_SIZE, BODY_TEXT_WEIGHT)
    n = len(wrap_paragraph(draw, " ".join(card["body_lines"]), body_font))
    if n < BODY_MIN_LINES:
        errors.append(
            f"index {card['index']} 본문 렌더 {n}줄 < 최소 {BODY_MIN_LINES}줄 — 내용을 보강하세요"
            f"(공백 포함 ~{BODY_MIN_LINES * 28}자 이상 권장)")
    elif n > BODY_MAX_LINES:
        errors.append(
            f"index {card['index']} 본문 렌더 {n}줄 > 최대 {BODY_MAX_LINES}줄 — 내용을 축약하세요")
    return errors


def cover_copy_report(card, fonts):
    """cover 카드 카피 가드 — 서브·훅 잉크 912px(우측 마진 84 대칭) 초과 = 에러(글자수 축소 유도),
    훅 1~2줄 밖 = 계약 위반 에러(card-structure.md 계약 — 3줄+는 하단 블록이 위로 밀림).
    2026-07-07: 커버가 우측 프레임에 붙는 도그푸딩-4 실측 재발 차단."""
    draw = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    errors = []
    if not 1 <= len(card["hook_lines"]) <= 2:
        errors.append(
            f"index {card['index']} hook_lines {len(card['hook_lines'])}줄 — 계약은 1~2줄")
    for label, lines, font in (("sub", [card["sub"]], fonts.get(44, 600)),
                               ("hook", card["hook_lines"], fonts.get(92, 800))):
        for line in lines:
            ink = draw.textlength(line, font=font)
            if ink > BODY_MAX_INK:
                errors.append(
                    f"index {card['index']} {label} 줄 잉크 {ink:.0f}px > 한계 {BODY_MAX_INK}px — 글자수를 줄이세요: {line!r}")
    return errors


def compose_body(img, card, fonts):
    # 박스·스크림 밴드 절대 금지 — v2: 하단 페더 그라디언트만 (전면 균일 다크닝 폐기,
    # 레퍼런스 실측 2026-07-06). 가독 1차 책임은 여전히 배경 프롬프트(하반부 단순화).
    apply_bottom_gradient(img, BODY_GRAD_START, BODY_GRAD_PEAK)
    draw = ImageDraw.Draw(img)
    title_font = fonts.get(BODY_TITLE_SIZE, BODY_TITLE_WEIGHT)
    # 잉크 상단 고정 앵커 — draw.text의 y는 라인박스 상단이라 대표 글리프("한")의
    # 잉크 오프셋만큼 보정 (폰트 폴백이 바뀌어도 앵커 유지)
    tb = title_font.getbbox("한")
    y = BODY_TITLE_INK_TOP - tb[1]
    # 1~2줄은 body_copy_report가 compose() 진입 시 이미 강제 — 무언 절단 없음
    title_lines = card["title_lines"]
    for line in title_lines:
        draw.text((LEFT, y), line, font=title_font, fill=(255, 255, 255))
        y += BODY_PITCH
    # 본문 앵커 = 타이틀 잉크하단 + 고정 갭 — 대표 글리프 기준이라 결정성 유지
    title_ink_bottom = BODY_TITLE_INK_TOP + BODY_PITCH * (len(title_lines) - 1) + (tb[3] - tb[1])
    body_font = fonts.get(BODY_TEXT_SIZE, BODY_TEXT_WEIGHT)
    # 본문 = 문단 자동 줄바꿈 + 양쪽맞춤(마지막 줄은 자연폭) — 2026-07-07 계약 개정:
    # body_lines는 문장 소스일 뿐, 줄 분할·정렬은 compose가 소유한다
    lines = wrap_paragraph(draw, " ".join(card["body_lines"]), body_font)
    y = title_ink_bottom + BODY_TITLE_BODY_GAP - body_font.getbbox("한")[1]
    for i, line in enumerate(lines):
        if i == len(lines) - 1:
            draw.text((LEFT, y), line, font=body_font, fill=(240, 240, 240))
        else:
            draw_justified(draw, line, body_font, y, (240, 240, 240))
        y += BODY_PITCH


def compose_cta(img, card, fonts):
    # 표지 배경 재사용 전제(호출측 계약) + 전면 딤 ~45% + 중앙 정렬 핸들·서브
    img.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), Image.new("L", (W, H), CTA_DIM_ALPHA))
    draw = ImageDraw.Draw(img)
    handle_font = fonts.get(112, 800)
    hw = draw.textlength(card["handle"], font=handle_font)
    draw.text(((W - hw) / 2, H / 2 - 130), card["handle"], font=handle_font, fill=(255, 255, 255))
    sub_font = fonts.get(42, 500)
    sw = draw.textlength(card["sub"], font=sub_font)
    draw.text(((W - sw) / 2, H / 2 + 24), card["sub"], font=sub_font, fill=(235, 235, 235))


COMPOSERS = {"cover": compose_cover, "body": compose_body, "cta": compose_cta}


def compose(spec, out_dir, bg_dir, fonts, logo):
    # 본문 레이아웃 분기 예약 — 현재 basic만 구현 (free = 자유형 후속 트랙)
    layout = spec.get("body_layout", "basic")
    if layout != "basic":
        sys.exit(f"body_layout '{layout}'은 미구현 — 현재 basic만 지원 (free는 후속 트랙)")
    slug, cards = spec["slug"], spec["cards"]
    produced = []
    for card in cards:
        idx, role = card["index"], card["role"]
        if role not in COMPOSERS:
            sys.exit(f"알 수 없는 role: {role} (index {idx}) — cover|body|cta 만 허용")
        if role == "body":
            errors = body_copy_report(card, fonts)
            if errors:
                sys.exit("본문 카피 계약 위반 — " + " / ".join(errors))
        elif role == "cover":
            errors = cover_copy_report(card, fonts)
            if errors:
                sys.exit("커버 줄폭 한계 초과 — " + " / ".join(errors))
        # CTA는 표지 배경 재사용 — 생성 호출 N-1회 계약 (craft 룰 9)
        bg_path = bg_dir / ("bg-01.png" if role == "cta" else f"bg-{idx:02d}.png")
        if not bg_path.exists():
            sys.exit(f"배경이 없습니다: {bg_path} (index {idx}, role {role})")
        img = crop_resize(Image.open(bg_path).convert("RGB"))
        COMPOSERS[role](img, card, fonts)
        draw_logo(img, logo)
        out = out_dir / f"{slug}-{idx:02d}.png"
        img.save(out)
        produced.append(out)
    return produced


def _ink_edges(im, y0, y1):
    """밴드 구간의 near-white 잉크 좌/우 엣지 x — 양쪽맞춤 회귀 검증용."""
    px = im.convert("L").load()
    left, right = None, None
    for y in range(y0, y1 + 1):
        for x in range(60, 1020):
            if px[x, y] >= 235:
                left = x if left is None else min(left, x)
                break
        for x in range(1019, 59, -1):
            if px[x, y] >= 235:
                right = x if right is None else max(right, x)
                break
    return left, right


def _text_bands(im, y_from=560, y_to=H, x_from=60, x_to=1020):
    """near-white(≥235) 행 밴드 검출 — 레퍼런스 실측과 동일 로직 (지오메트리 회귀 계약)."""
    px = im.convert("L").load()
    bands, cur = [], None
    for y in range(y_from, y_to):
        on = sum(1 for x in range(x_from, x_to, 3) if px[x, y] >= 235) >= 4
        if on and cur is None:
            cur = [y, y]
        elif on:
            cur[1] = y
        elif cur is not None and y - cur[1] > 6:
            bands.append(tuple(cur))
            cur = None
    if cur is not None:
        bands.append(tuple(cur))
    return bands


def self_test():
    """외부 의존 없는 회귀 확인 — 단색 배경 → 4카드 합성 → 치수·v2 지오메트리·badge 부재 assert."""
    fonts = find_fonts(None)
    with tempfile.TemporaryDirectory() as tmp:
        td = Path(tmp)
        for i, color in enumerate([(28, 52, 84), (36, 76, 60), (70, 44, 88)], start=1):
            Image.new("RGB", (1600, 2000), color).save(td / f"bg-{i:02d}.png")
        spec = {
            "slug": "self-test",
            "cards": [
                {"index": 1, "role": "cover", "sub": "자가 테스트 서브타이틀", "hook_lines": ["첫 줄 훅 문구", "둘째 줄 훅"]},
                {"index": 2, "role": "body", "title_lines": ["본문 카드 타이틀", "둘째 줄 타이틀"],
                 "body_lines": [f"본문 {n}번째 문장을 스무 자 안팎 폭으로 이어 채워요." for n in range(1, 8)]},
                {"index": 3, "role": "body", "title_lines": ["둘째 본문 타이틀"],
                 "body_lines": [f"둘째 카드 {n}번째 문장으로 다섯 줄 이상 분량을 채워 봅니다." for n in range(1, 7)]},
                {"index": 4, "role": "cta", "handle": "@self_test", "sub": "저장하고 팔로우하세요"},
            ],
            "caption": "",
            "hashtags": [],
        }
        probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
        body_font = fonts.get(BODY_TEXT_SIZE, BODY_TEXT_WEIGHT)
        n02 = len(wrap_paragraph(probe, " ".join(spec["cards"][1]["body_lines"]), body_font))
        n03 = len(wrap_paragraph(probe, " ".join(spec["cards"][2]["body_lines"]), body_font))
        assert BODY_MIN_LINES <= n02 <= BODY_MAX_LINES, n02
        assert BODY_MIN_LINES <= n03 <= BODY_MAX_LINES, n03
        produced = compose(spec, td, td, fonts, None)
        assert len(produced) == 4, produced
        for p in produced:
            assert p.exists() and p.name.startswith("self-test-"), p
            with Image.open(p) as im:
                assert im.size == (W, H), (p.name, im.size)
                # badge 부재 — 우상단 영역 near-white 밴드 없음 (v2: badge 전면 제거)
                assert _text_bands(im, y_from=40, y_to=170, x_from=W - 220, x_to=W - 40) == [], p.name

        # v2 지오메트리 회귀 — 타이틀 잉크 상단 648 / 피치 62 / 타이틀→본문 잉크갭 37 (상대 앵커)
        with Image.open(td / "self-test-02.png") as im:
            bands = _text_bands(im)
            assert len(bands) == 2 + n02, bands  # 타이틀 2 + 본문(자동 줄바꿈 결과)
            assert abs(bands[0][0] - BODY_TITLE_INK_TOP) <= 6, bands[0]
            assert abs(bands[1][0] - bands[0][0] - BODY_PITCH) <= 4, bands[:2]
            assert abs(bands[2][0] - bands[1][1] - 1 - BODY_TITLE_BODY_GAP) <= 6, bands[1:3]
            for a, b in zip(bands[2:], bands[3:]):
                assert abs(b[0] - a[0] - BODY_PITCH) <= 4, (a, b)
            assert bands[-1][1] <= H - 72, bands[-1]  # 안전여백 (craft 룰 6)
            # 양쪽맞춤 회귀 — 마지막 제외 본문 줄의 잉크가 좌 84·우 996 양끝에 정렬
            for y0, y1 in bands[2:-1]:
                left, right = _ink_edges(im, y0, y1)
                assert LEFT <= left <= LEFT + 10, (left, y0)
                assert BODY_MAX_INK + LEFT - 14 <= right <= BODY_MAX_INK + LEFT + 2, (right, y0)
            # 하단 그라디언트 실효 — 텍스트 없는 좌하단이 좌상단보다 어두움 (균일 다크닝 폐기 확인)
            g = im.convert("L").load()
            assert g[10, H - 10] < g[10, 10], (g[10, H - 10], g[10, 10])

        # 타이틀 1줄 카드도 동일 갭 — 상대 앵커가 줄수 무관하게 유지되는지 (2026-07-07 갭 계약)
        with Image.open(td / "self-test-03.png") as im:
            bands = _text_bands(im)
            assert len(bands) == 1 + n03, bands  # 타이틀 1 + 본문(자동 줄바꿈 결과)
            assert abs(bands[0][0] - BODY_TITLE_INK_TOP) <= 6, bands[0]
            assert abs(bands[1][0] - bands[0][1] - 1 - BODY_TITLE_BODY_GAP) <= 6, bands[:2]

        # 카피 가드 — 타이틀·커버 잉크 초과 = 에러, 본문 렌더 줄수 5~7 밖 = 에러 (2026-07-07 개정)
        long_title = {"index": 9, "role": "body", "title_lines": ["가" * 20],
                      "body_lines": spec["cards"][1]["body_lines"]}
        assert any("title" in e for e in body_copy_report(long_title, fonts)), "타이틀 912px 초과 미검출"
        short_body = {"index": 9, "role": "body", "title_lines": ["타이틀"],
                      "body_lines": ["짧은 본문 한 줄."]}
        errs = body_copy_report(short_body, fonts)
        assert errs and "최소" in errs[0], errs
        over_body = {"index": 9, "role": "body", "title_lines": ["타이틀"],
                     "body_lines": spec["cards"][1]["body_lines"] * 3}
        errs = body_copy_report(over_body, fonts)
        assert errs and "최대" in errs[0], errs
        wide_cover = {"index": 9, "role": "cover", "sub": "서브", "hook_lines": ["가" * 16]}
        assert any("hook" in e for e in cover_copy_report(wide_cover, fonts)), "커버 훅 912px 초과 미검출"
        # 입력 상한 가드 — 타이틀 3줄·훅 3줄은 무언 절단 없이 명시 에러 (2026-07-07 v1 이월 픽스)
        tall_title = {"index": 9, "role": "body", "title_lines": ["하나", "둘", "셋"],
                      "body_lines": spec["cards"][1]["body_lines"]}
        assert any("title_lines" in e for e in body_copy_report(tall_title, fonts)), "타이틀 3줄 미검출"
        tall_hook = {"index": 9, "role": "cover", "sub": "서브", "hook_lines": ["하나", "둘", "셋"]}
        assert any("hook_lines" in e for e in cover_copy_report(tall_hook, fonts)), "훅 3줄 미검출"
        # compose 경로에서도 커버 초과·본문 줄수 미달이 에러로 끊기는지
        for bad_cards, token in (
            ([dict(spec["cards"][0], hook_lines=["가" * 16])], "한계"),
            ([dict(spec["cards"][1], body_lines=["짧은 본문 한 줄."])], "최소"),
        ):
            bad_spec = dict(spec)
            bad_spec["cards"] = bad_cards
            try:
                compose(bad_spec, td, td, fonts, None)
                raise AssertionError(f"카피 계약 위반({token})이 에러 없이 통과")
            except SystemExit as e:
                assert token in str(e.code), e.code

        # body_layout 분기 예약 — basic 외 값은 명시 에러
        bad = dict(spec)
        bad["body_layout"] = "free"
        try:
            compose(bad, td, td, fonts, None)
            raise AssertionError("body_layout=free가 에러 없이 통과")
        except SystemExit as e:
            assert "미구현" in str(e.code), e.code
    print("SELF-TEST OK")


def main():
    ap = argparse.ArgumentParser(description="인스타 카드뉴스 합성 — cards.json + bg-NN.png → <slug>-NN.png (1080×1350)")
    ap.add_argument("--spec", help="cards.json 경로")
    ap.add_argument("--out-dir", help="산출 디렉토리 (기본: spec과 같은 폴더)")
    ap.add_argument("--bg-dir", help="배경 bg-NN.png 디렉토리 (기본: out-dir)")
    ap.add_argument("--font", help="폰트 파일 경로 (기본: Pretendard 자동 탐색 → 나눔 폴백)")
    ap.add_argument("--logo", help="로고타입 PNG 경로 (흰 글리프·투명배경 — 폭 99px 고정 합성). 생략 시 로고 없음")
    ap.add_argument("--self-test", action="store_true", help="외부 의존 없는 자가 테스트")
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return
    if not args.spec:
        ap.error("--spec 이 필요합니다 (또는 --self-test)")

    spec_path = Path(args.spec).expanduser()
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    out_dir = Path(args.out_dir).expanduser() if args.out_dir else spec_path.parent
    bg_dir = Path(args.bg_dir).expanduser() if args.bg_dir else out_dir
    logo = None
    if args.logo:
        logo_path = Path(args.logo).expanduser()
        if not logo_path.exists():
            sys.exit(f"--logo 경로가 없습니다: {logo_path}")
        logo = Image.open(logo_path).convert("RGBA")
    for p in compose(spec, out_dir, bg_dir, find_fonts(args.font), logo):
        print(p)


if __name__ == "__main__":
    main()
