"""SVG path parsing, normalization, and DrawingML path command generation."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from .drawingml_utils import px_to_emu


@dataclass
class PathCommand:
    """A single SVG path command with its arguments."""
    cmd: str  # M, L, C, Z, etc. (uppercase = absolute)
    args: list[float] = field(default_factory=list)


# Argument counts per SVG path command
_ARG_COUNTS = {
    'M': 2, 'm': 2, 'L': 2, 'l': 2,
    'H': 1, 'h': 1, 'V': 1, 'v': 1,
    'C': 6, 'c': 6, 'S': 4, 's': 4,
    'Q': 4, 'q': 4, 'T': 2, 't': 2,
    'A': 7, 'a': 7, 'Z': 0, 'z': 0,
}


def parse_svg_path(d: str) -> list[PathCommand]:
    """Parse SVG path d attribute into a list of PathCommands."""
    if not d:
        return []

    commands: list[PathCommand] = []
    tokens = re.findall(
        r'[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?', d
    )

    current_cmd: str | None = None
    current_args: list[float] = []

    def flush() -> None:
        nonlocal current_cmd, current_args
        if current_cmd is None:
            return

        n = _ARG_COUNTS.get(current_cmd, 0)
        if n == 0:
            commands.append(PathCommand(current_cmd, []))
        elif n > 0 and len(current_args) >= n:
            i = 0
            while i + n <= len(current_args):
                commands.append(PathCommand(current_cmd, current_args[i:i + n]))
                # After first M, implicit commands become L
                if current_cmd == 'M':
                    current_cmd = 'L'
                elif current_cmd == 'm':
                    current_cmd = 'l'
                i += n
        current_args = []

    for token in tokens:
        if token in 'MmLlHhVvCcSsQqTtAaZz':
            flush()
            current_cmd = token
            current_args = []
        else:
            try:
                current_args.append(float(token))
            except ValueError:
                pass

    flush()
    return commands


def svg_path_to_absolute(commands: list[PathCommand]) -> list[PathCommand]:
    """Convert all relative path commands to absolute."""
    result: list[PathCommand] = []
    cx, cy = 0.0, 0.0  # current point
    sx, sy = 0.0, 0.0  # subpath start

    for cmd in commands:
        a = cmd.args
        if cmd.cmd == 'M':
            cx, cy = a[0], a[1]
            sx, sy = cx, cy
            result.append(PathCommand('M', [cx, cy]))
        elif cmd.cmd == 'm':
            cx += a[0]; cy += a[1]
            sx, sy = cx, cy
            result.append(PathCommand('M', [cx, cy]))
        elif cmd.cmd == 'L':
            cx, cy = a[0], a[1]
            result.append(PathCommand('L', [cx, cy]))
        elif cmd.cmd == 'l':
            cx += a[0]; cy += a[1]
            result.append(PathCommand('L', [cx, cy]))
        elif cmd.cmd == 'H':
            cx = a[0]
            result.append(PathCommand('L', [cx, cy]))
        elif cmd.cmd == 'h':
            cx += a[0]
            result.append(PathCommand('L', [cx, cy]))
        elif cmd.cmd == 'V':
            cy = a[0]
            result.append(PathCommand('L', [cx, cy]))
        elif cmd.cmd == 'v':
            cy += a[0]
            result.append(PathCommand('L', [cx, cy]))
        elif cmd.cmd == 'C':
            result.append(PathCommand('C', list(a)))
            cx, cy = a[4], a[5]
        elif cmd.cmd == 'c':
            abs_args = [
                cx + a[0], cy + a[1],
                cx + a[2], cy + a[3],
                cx + a[4], cy + a[5],
            ]
            result.append(PathCommand('C', abs_args))
            cx, cy = abs_args[4], abs_args[5]
        elif cmd.cmd == 'S':
            result.append(PathCommand('S', list(a)))
            cx, cy = a[2], a[3]
        elif cmd.cmd == 's':
            abs_args = [cx + a[0], cy + a[1], cx + a[2], cy + a[3]]
            result.append(PathCommand('S', abs_args))
            cx, cy = abs_args[2], abs_args[3]
        elif cmd.cmd == 'Q':
            result.append(PathCommand('Q', list(a)))
            cx, cy = a[2], a[3]
        elif cmd.cmd == 'q':
            abs_args = [cx + a[0], cy + a[1], cx + a[2], cy + a[3]]
            result.append(PathCommand('Q', abs_args))
            cx, cy = abs_args[2], abs_args[3]
        elif cmd.cmd == 'T':
            result.append(PathCommand('T', list(a)))
            cx, cy = a[0], a[1]
        elif cmd.cmd == 't':
            abs_args = [cx + a[0], cy + a[1]]
            result.append(PathCommand('T', abs_args))
            cx, cy = abs_args[0], abs_args[1]
        elif cmd.cmd == 'A':
            result.append(PathCommand('A', list(a)))
            cx, cy = a[5], a[6]
        elif cmd.cmd == 'a':
            abs_args = [a[0], a[1], a[2], a[3], a[4], cx + a[5], cy + a[6]]
            result.append(PathCommand('A', abs_args))
            cx, cy = abs_args[5], abs_args[6]
        elif cmd.cmd in ('Z', 'z'):
            result.append(PathCommand('Z', []))
            cx, cy = sx, sy

    return result


def _reflect_control_point(
    cp_x: float, cp_y: float,
    cx: float, cy: float,
) -> tuple[float, float]:
    """Reflect a control point through the current point."""
    return 2 * cx - cp_x, 2 * cy - cp_y


def _quad_to_cubic(
    qp_x: float, qp_y: float,
    p0_x: float, p0_y: float,
    p3_x: float, p3_y: float,
) -> list[float]:
    """Convert quadratic bezier control point to cubic bezier control points."""
    cp1_x = p0_x + 2.0 / 3.0 * (qp_x - p0_x)
    cp1_y = p0_y + 2.0 / 3.0 * (qp_y - p0_y)
    cp2_x = p3_x + 2.0 / 3.0 * (qp_x - p3_x)
    cp2_y = p3_y + 2.0 / 3.0 * (qp_y - p3_y)
    return [cp1_x, cp1_y, cp2_x, cp2_y, p3_x, p3_y]


def _arc_to_cubic_beziers(
    cx_: float, cy_: float,
    rx: float, ry: float,
    phi: float,
    large_arc: int, sweep: int,
    x2: float, y2: float,
) -> list[PathCommand]:
    """Convert SVG arc (endpoint parameterization) to cubic bezier curves.

    Uses the algorithm from the SVG spec (F.6.5) to convert endpoint to center
    parameterization, then approximates each arc segment with cubic beziers.
    """
    x1, y1 = cx_, cy_

    if abs(x1 - x2) < 1e-10 and abs(y1 - y2) < 1e-10:
        return []

    rx = abs(rx)
    ry = abs(ry)
    if rx < 1e-10 or ry < 1e-10:
        return [PathCommand('L', [x2, y2])]

    phi_rad = math.radians(phi)
    cos_phi = math.cos(phi_rad)
    sin_phi = math.sin(phi_rad)

    # Step 1: Compute (x1', y1')
    dx = (x1 - x2) / 2.0
    dy = (y1 - y2) / 2.0
    x1p = cos_phi * dx + sin_phi * dy
    y1p = -sin_phi * dx + cos_phi * dy

    # Step 2: Compute (cx', cy')
    x1p2 = x1p * x1p
    y1p2 = y1p * y1p
    rx2 = rx * rx
    ry2 = ry * ry

    # Ensure radii are large enough
    lam = x1p2 / rx2 + y1p2 / ry2
    if lam > 1:
        lam_sqrt = math.sqrt(lam)
        rx *= lam_sqrt
        ry *= lam_sqrt
        rx2 = rx * rx
        ry2 = ry * ry

    num = max(rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2, 0)
    den = rx2 * y1p2 + ry2 * x1p2
    sq = math.sqrt(num / den) if den > 1e-10 else 0.0

    if large_arc == sweep:
        sq = -sq

    cxp = sq * rx * y1p / ry
    cyp = -sq * ry * x1p / rx

    # Step 3: Compute (cx, cy)
    arc_cx = cos_phi * cxp - sin_phi * cyp + (x1 + x2) / 2.0
    arc_cy = sin_phi * cxp + cos_phi * cyp + (y1 + y2) / 2.0

    # Step 4: Compute theta1 and dtheta
    def angle_between(ux: float, uy: float, vx: float, vy: float) -> float:
        n = math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy))
        if n < 1e-10:
            return 0
        c = max(-1, min(1, (ux * vx + uy * vy) / n))
        a = math.acos(c)
        if ux * vy - uy * vx < 0:
            a = -a
        return a

    theta1 = angle_between(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dtheta = angle_between(
        (x1p - cxp) / rx, (y1p - cyp) / ry,
        (-x1p - cxp) / rx, (-y1p - cyp) / ry,
    )

    if sweep == 0 and dtheta > 0:
        dtheta -= 2 * math.pi
    elif sweep == 1 and dtheta < 0:
        dtheta += 2 * math.pi

    # Split arc into segments of at most 90 degrees
    n_segs = max(1, int(math.ceil(abs(dtheta) / (math.pi / 2))))
    d_per_seg = dtheta / n_segs

    result: list[PathCommand] = []
    alpha = 4.0 / 3.0 * math.tan(d_per_seg / 4.0)

    for i in range(n_segs):
        t1 = theta1 + i * d_per_seg
        t2 = theta1 + (i + 1) * d_per_seg

        cos_t1 = math.cos(t1)
        sin_t1 = math.sin(t1)
        cos_t2 = math.cos(t2)
        sin_t2 = math.sin(t2)

        ep1_x = cos_t1 - alpha * sin_t1
        ep1_y = sin_t1 + alpha * cos_t1
        ep2_x = cos_t2 + alpha * sin_t2
        ep2_y = sin_t2 - alpha * cos_t2
        ep_x = cos_t2
        ep_y = sin_t2

        def transform_pt(px: float, py: float) -> tuple[float, float]:
            x = rx * px
            y = ry * py
            xr = cos_phi * x - sin_phi * y + arc_cx
            yr = sin_phi * x + cos_phi * y + arc_cy
            return xr, yr

        cp1 = transform_pt(ep1_x, ep1_y)
        cp2 = transform_pt(ep2_x, ep2_y)
        ep = transform_pt(ep_x, ep_y)

        result.append(PathCommand('C', [cp1[0], cp1[1], cp2[0], cp2[1], ep[0], ep[1]]))

    return result


def normalize_path_commands(commands: list[PathCommand]) -> list[PathCommand]:
    """Normalize path commands to M/L/C/Z only.

    Converts S -> C, Q -> C, T -> C, A -> C sequences.
    """
    result: list[PathCommand] = []
    cx, cy = 0.0, 0.0
    last_cp_x, last_cp_y = 0.0, 0.0
    last_cmd = ''

    for cmd in commands:
        a = cmd.args

        if cmd.cmd == 'M':
            cx, cy = a[0], a[1]
            last_cp_x, last_cp_y = cx, cy
            result.append(cmd)
        elif cmd.cmd == 'L':
            cx, cy = a[0], a[1]
            last_cp_x, last_cp_y = cx, cy
            result.append(cmd)
        elif cmd.cmd == 'C':
            last_cp_x, last_cp_y = a[2], a[3]
            cx, cy = a[4], a[5]
            result.append(cmd)
        elif cmd.cmd == 'S':
            if last_cmd in ('C', 'S'):
                rcp_x, rcp_y = _reflect_control_point(last_cp_x, last_cp_y, cx, cy)
            else:
                rcp_x, rcp_y = cx, cy
            last_cp_x, last_cp_y = a[0], a[1]
            new_cx, new_cy = a[2], a[3]
            result.append(PathCommand('C', [rcp_x, rcp_y, a[0], a[1], new_cx, new_cy]))
            cx, cy = new_cx, new_cy
        elif cmd.cmd == 'Q':
            cubic = _quad_to_cubic(a[0], a[1], cx, cy, a[2], a[3])
            last_cp_x, last_cp_y = a[0], a[1]
            result.append(PathCommand('C', cubic))
            cx, cy = a[2], a[3]
        elif cmd.cmd == 'T':
            if last_cmd in ('Q', 'T'):
                qp_x, qp_y = _reflect_control_point(last_cp_x, last_cp_y, cx, cy)
            else:
                qp_x, qp_y = cx, cy
            last_cp_x, last_cp_y = qp_x, qp_y
            cubic = _quad_to_cubic(qp_x, qp_y, cx, cy, a[0], a[1])
            result.append(PathCommand('C', cubic))
            cx, cy = a[0], a[1]
        elif cmd.cmd == 'A':
            arc_beziers = _arc_to_cubic_beziers(
                cx, cy, a[0], a[1], a[2], int(a[3]), int(a[4]), a[5], a[6],
            )
            for bc in arc_beziers:
                result.append(bc)
            cx, cy = a[5], a[6]
            last_cp_x, last_cp_y = cx, cy
        elif cmd.cmd == 'Z':
            result.append(cmd)
        else:
            result.append(cmd)

        last_cmd = cmd.cmd

    return result


def path_commands_to_drawingml(
    commands: list[PathCommand],
    offset_x: float = 0,
    offset_y: float = 0,
    scale_x: float = 1.0,
    scale_y: float = 1.0,
) -> tuple[str, float, float, float, float]:
    """Convert normalized path commands to DrawingML <a:path> inner XML.

    Returns:
        (path_xml, min_x, min_y, width, height) in scaled+offset coordinates.
    """
    if not commands:
        return '', 0, 0, 0, 0

    # First pass: calculate bounding box
    points: list[tuple[float, float]] = []
    for cmd in commands:
        if cmd.cmd in ('M', 'L'):
            points.append((
                cmd.args[0] * scale_x + offset_x,
                cmd.args[1] * scale_y + offset_y,
            ))
        elif cmd.cmd == 'C':
            for i in range(0, 6, 2):
                points.append((
                    cmd.args[i] * scale_x + offset_x,
                    cmd.args[i + 1] * scale_y + offset_y,
                ))

    if not points:
        return '', 0, 0, 0, 0

    min_x = min(p[0] for p in points)
    min_y = min(p[1] for p in points)
    max_x = max(p[0] for p in points)
    max_y = max(p[1] for p in points)

    width = max(max_x - min_x, 1)
    height = max(max_y - min_y, 1)

    # Second pass: generate DrawingML path commands (EMU, relative to shape)
    parts: list[str] = []
    for cmd in commands:
        if cmd.cmd == 'M':
            x_emu = px_to_emu(cmd.args[0] * scale_x + offset_x - min_x)
            y_emu = px_to_emu(cmd.args[1] * scale_y + offset_y - min_y)
            parts.append(f'<a:moveTo><a:pt x="{x_emu}" y="{y_emu}"/></a:moveTo>')
        elif cmd.cmd == 'L':
            x_emu = px_to_emu(cmd.args[0] * scale_x + offset_x - min_x)
            y_emu = px_to_emu(cmd.args[1] * scale_y + offset_y - min_y)
            parts.append(f'<a:lnTo><a:pt x="{x_emu}" y="{y_emu}"/></a:lnTo>')
        elif cmd.cmd == 'C':
            pts = []
            for i in range(0, 6, 2):
                x_emu = px_to_emu(cmd.args[i] * scale_x + offset_x - min_x)
                y_emu = px_to_emu(cmd.args[i + 1] * scale_y + offset_y - min_y)
                pts.append(f'<a:pt x="{x_emu}" y="{y_emu}"/>')
            parts.append(f'<a:cubicBezTo>{"".join(pts)}</a:cubicBezTo>')
        elif cmd.cmd == 'Z':
            parts.append('<a:close/>')

    path_inner = '\n'.join(parts)
    return path_inner, min_x, min_y, width, height
