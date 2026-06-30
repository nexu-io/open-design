#!/bin/bash
# SVG Validation Script
# Checks SVG syntax and reports detailed errors

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ $# -eq 0 ]; then
    echo "Usage: $0 <svg-file>"
    exit 1
fi

SVG_FILE="$1"

if [ ! -f "$SVG_FILE" ]; then
    echo -e "${RED}Error: File not found: $SVG_FILE${NC}"
    exit 1
fi

echo "Validating SVG: $SVG_FILE"
echo "----------------------------------------"

FAILURES=0

# Check 0: XML syntax
echo -n "Checking XML syntax... "
if command -v xmllint &> /dev/null; then
    if xmllint --noout "$SVG_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓ Pass${NC}"
    else
        echo -e "${RED}✗ Fail${NC}"
        xmllint --noout "$SVG_FILE" 2>&1 || true
        FAILURES=$((FAILURES + 1))
    fi
else
    echo -e "${YELLOW}⚠ Skipped${NC} (xmllint not found)"
fi

# Check 1: Tag balance
echo -n "Checking tag balance... "
OPEN_TAGS=$( { grep -o '<[A-Za-z][A-Za-z0-9:-]*' "$SVG_FILE" || true; } | { grep -v '</' || true; } | wc -l | tr -d ' ' )
SELF_CLOSING=$( { grep -o '/>' "$SVG_FILE" || true; } | wc -l | tr -d ' ' )
CLOSE_TAGS=$( { grep -o '</[A-Za-z][A-Za-z0-9:-]*>' "$SVG_FILE" || true; } | wc -l | tr -d ' ' )
TOTAL_CLOSE=$((SELF_CLOSING + CLOSE_TAGS))

if [ "$OPEN_TAGS" -eq "$TOTAL_CLOSE" ]; then
    echo -e "${GREEN}✓ Pass${NC} (${OPEN_TAGS} tags)"
else
    echo -e "${RED}✗ Fail${NC} (${OPEN_TAGS} open, ${TOTAL_CLOSE} close)"
    FAILURES=$((FAILURES + 1))
fi

# Check 2: Quote check
echo -n "Checking attribute quotes... "
UNQUOTED=$( { grep -oE '[a-z-]+=[^"'\''> ]' "$SVG_FILE" || true; } | wc -l | tr -d ' ' )
if [ "$UNQUOTED" -eq 0 ]; then
    echo -e "${GREEN}✓ Pass${NC}"
else
    echo -e "${RED}✗ Fail${NC} (${UNQUOTED} unquoted attributes)"
    grep -n -oE '[a-z-]+=[^"'\''> ]' "$SVG_FILE" | head -5 || true
    FAILURES=$((FAILURES + 1))
fi

# Check 3: Unescaped entities in text
echo -n "Checking text entities... "
SPECIAL=$(python3 - "$SVG_FILE" <<'PY'
from pathlib import Path
import re
import sys

text = Path(sys.argv[1]).read_text(encoding='utf-8')
issues = 0
for chunk in re.findall(r'>([^<]*)<', text, flags=re.S):
    cleaned = re.sub(r'&(amp|lt|gt|quot|apos);', '', chunk)
    if '&' in cleaned:
        issues += 1
print(issues)
PY
)
if [ "$SPECIAL" -eq 0 ]; then
    echo -e "${GREEN}✓ Pass${NC}"
else
    echo -e "${YELLOW}⚠ Warning${NC} (${SPECIAL} potential unescaped entities)"
fi

# Check 4: Marker references
echo -n "Checking marker references... "
MARKER_REFS=$( { grep -oE 'marker-end="url\(#[^)]+\)"' "$SVG_FILE" || true; } | { grep -oE '#[^)]+' || true; } | tr -d '#' | sort -u )
MARKER_DEFS=$( { grep -oE '<marker id="[^"]+"' "$SVG_FILE" || true; } | { grep -oE 'id="[^"]+"' || true; } | tr -d 'id="' | sort -u )

MISSING=0
for ref in $MARKER_REFS; do
    if ! echo "$MARKER_DEFS" | grep -q "^${ref}$"; then
        echo -e "${RED}✗ Missing marker: $ref${NC}"
        MISSING=$((MISSING + 1))
    fi
done

if [ "$MISSING" -eq 0 ]; then
    echo -e "${GREEN}✓ Pass${NC}"
else
    echo -e "${RED}✗ Fail${NC} (${MISSING} missing markers)"
    FAILURES=$((FAILURES + 1))
fi

# Check 5: Arrow-component collision
echo -n "Checking arrow collisions... "
set +e
COLLISIONS=$(python3 - "$SVG_FILE" <<'PY'
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

SVG_NS = {'svg': 'http://www.w3.org/2000/svg'}

def strip(tag):
    return tag.split('}', 1)[-1]

def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def is_container_rect(el):
    if el.get('stroke-dasharray'):
        return True
    width = to_float(el.get('width'))
    height = to_float(el.get('height'))
    if width > 700 or height > 500:
        return True
    if width < 70 or height < 30:
        return True
    return False

def shape_bounds(el):
    tag = strip(el.tag)
    if tag == 'rect':
        if is_container_rect(el):
            return None
        x = to_float(el.get('x'))
        y = to_float(el.get('y'))
        w = to_float(el.get('width'))
        h = to_float(el.get('height'))
        return (x, y, x + w, y + h)
    if tag == 'circle':
        r = to_float(el.get('r'))
        if r < 20:
            return None
        cx = to_float(el.get('cx'))
        cy = to_float(el.get('cy'))
        return (cx - r, cy - r, cx + r, cy + r)
    if tag == 'ellipse':
        rx = to_float(el.get('rx'))
        ry = to_float(el.get('ry'))
        if rx < 20 or ry < 20:
            return None
        cx = to_float(el.get('cx'))
        cy = to_float(el.get('cy'))
        return (cx - rx, cy - ry, cx + rx, cy + ry)
    return None

def parse_path_points(d):
    tokens = re.findall(r'[ML]|-?\d+(?:\.\d+)?', d or '')
    if not tokens:
        return []
    points = []
    command = None
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token in {'M', 'L'}:
            command = token
            index += 1
            continue
        if command not in {'M', 'L'} or index + 1 >= len(tokens):
            return []
        x = float(tokens[index])
        y = float(tokens[index + 1])
        points.append((x, y))
        index += 2
    return points

def segment_hits_bounds(p1, p2, bounds):
    x1, y1 = p1
    x2, y2 = p2
    left, top, right, bottom = bounds
    eps = 1e-6

    if abs(y1 - y2) < eps:
        y = y1
        if not (top + eps < y < bottom - eps):
            return False
        seg_left = min(x1, x2)
        seg_right = max(x1, x2)
        overlap_left = max(seg_left, left)
        overlap_right = min(seg_right, right)
        if overlap_right - overlap_left <= eps:
            return False
        if abs(overlap_left - x1) < eps or abs(overlap_right - x2) < eps:
            return False
        if abs(overlap_left - x2) < eps or abs(overlap_right - x1) < eps:
            return False
        return True

    if abs(x1 - x2) < eps:
        x = x1
        if not (left + eps < x < right - eps):
            return False
        seg_top = min(y1, y2)
        seg_bottom = max(y1, y2)
        overlap_top = max(seg_top, top)
        overlap_bottom = min(seg_bottom, bottom)
        if overlap_bottom - overlap_top <= eps:
            return False
        if abs(overlap_top - y1) < eps or abs(overlap_bottom - y2) < eps:
            return False
        if abs(overlap_top - y2) < eps or abs(overlap_bottom - y1) < eps:
            return False
        return True

    return False

root = ET.fromstring(Path(sys.argv[1]).read_text(encoding='utf-8'))
obstacles = [bounds for element in root.iter() if (bounds := shape_bounds(element)) is not None]

collisions = 0
for element in root.iter():
    tag = strip(element.tag)
    if tag == 'line' and element.get('marker-end'):
        points = [
            (to_float(element.get('x1')), to_float(element.get('y1'))),
            (to_float(element.get('x2')), to_float(element.get('y2'))),
        ]
    elif tag == 'path' and element.get('marker-end'):
        points = parse_path_points(element.get('d'))
    else:
        continue

    for p1, p2 in zip(points, points[1:]):
        if any(segment_hits_bounds(p1, p2, bounds) for bounds in obstacles):
            collisions += 1
            break

print(collisions)
PY
)
COLLISION_EXIT=$?
set -e

if [ "$COLLISION_EXIT" -ne 0 ]; then
    echo -e "${YELLOW}⚠ Skipped${NC} (XML parse error)"
    FAILURES=$((FAILURES + 1))
elif [ "$COLLISIONS" -eq 0 ]; then
    echo -e "${GREEN}✓ Pass${NC}"
else
    echo -e "${RED}✗ Fail${NC} (${COLLISIONS} arrow path collision(s))"
    FAILURES=$((FAILURES + 1))
fi

# Check 6: Closing </svg> tag
echo -n "Checking closing tag... "
if grep -q '</svg>' "$SVG_FILE"; then
    echo -e "${GREEN}✓ Pass${NC}"
else
    echo -e "${RED}✗ Fail${NC} (missing </svg>)"
    FAILURES=$((FAILURES + 1))
fi

# Check 7: render validation (cairosvg preferred, rsvg-convert fallback)
echo -n "Running render validation... "
RENDER_OK=false
RENDER_TOOL=""
RENDER_ERR=""

if python3 -c "import cairosvg" 2>/dev/null; then
    RENDER_TOOL="cairosvg"
    if RENDER_ERR=$(python3 -c "import sys, cairosvg; cairosvg.svg2png(url=sys.argv[1], write_to=sys.argv[2])" "$SVG_FILE" "/tmp/test-output.png" 2>&1); then
        RENDER_OK=true
    fi
elif command -v rsvg-convert &> /dev/null; then
    RENDER_TOOL="rsvg-convert"
    if RENDER_ERR=$(rsvg-convert "$SVG_FILE" -o /tmp/test-output.png 2>&1); then
        RENDER_OK=true
    fi
fi

if [ "$RENDER_OK" = true ]; then
    echo -e "${GREEN}✓ Pass${NC} (via ${RENDER_TOOL})"
    rm -f /tmp/test-output.png
elif [ -n "$RENDER_TOOL" ]; then
    echo -e "${RED}✗ Fail${NC} (via ${RENDER_TOOL})"
    echo "${RENDER_TOOL} error:"
    echo "$RENDER_ERR"
    FAILURES=$((FAILURES + 1))
else
    echo -e "${YELLOW}⚠ Skipped${NC} (no renderer found — install cairosvg: pip install cairosvg)"
fi

echo "----------------------------------------"
if [ "$FAILURES" -eq 0 ]; then
    echo "Validation complete"
    exit 0
fi

echo -e "${RED}Validation failed (${FAILURES} error(s))${NC}"
exit 1
