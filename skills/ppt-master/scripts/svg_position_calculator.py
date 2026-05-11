#!/usr/bin/env python3
"""
PPT Master - SVG Position Calculation and Validation Tool

Provides pre-calculation and post-validation of chart coordinates,
outputting clear coordinate tables.

======================================================================
Common Commands (can be copied and used directly)
======================================================================

1. Analyze all coordinates in an SVG file:
   python scripts/svg_position_calculator.py analyze <svg_file>

2. Interactive calculation mode:
   python scripts/svg_position_calculator.py interactive

3. Calculate from JSON config file:
   python scripts/svg_position_calculator.py from-json <config.json>

4. Quick calculation:
   python scripts/svg_position_calculator.py calc bar --data "East:185,South:142"
   python scripts/svg_position_calculator.py calc pie --data "A:35,B:25,C:20"
   python scripts/svg_position_calculator.py calc line --data "0:50,10:80,20:120"
   python scripts/svg_position_calculator.py calc grid --rows 2 --cols 3

======================================================================
"""

import sys
import re
import math
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass

# Fix garbled Chinese output on Windows
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        # Python < 3.7
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Import canvas format configuration
try:
    from project_utils import CANVAS_FORMATS
except ImportError:
    # Use built-in definitions if import fails
    CANVAS_FORMATS = {
        'ppt169': {'name': 'PPT 16:9', 'dimensions': '1280×720', 'viewbox': '0 0 1280 720'},
        'ppt43': {'name': 'PPT 4:3', 'dimensions': '1024×768', 'viewbox': '0 0 1024 768'},
        'xiaohongshu': {'name': 'Xiaohongshu (RED)', 'dimensions': '1242×1660', 'viewbox': '0 0 1242 1660'},
        'moments': {'name': 'WeChat Moments', 'dimensions': '1080×1080', 'viewbox': '0 0 1080 1080'},
    }


# =============================================================================
# Coordinate System Base Classes
# =============================================================================

@dataclass
class ChartArea:
    """Chart area definition"""
    x_min: float
    y_min: float
    x_max: float
    y_max: float

    @property
    def width(self) -> float:
        return self.x_max - self.x_min

    @property
    def height(self) -> float:
        return self.y_max - self.y_min

    @property
    def center(self) -> Tuple[float, float]:
        return ((self.x_min + self.x_max) / 2, (self.y_min + self.y_max) / 2)


class CoordinateSystem:
    """Coordinate system - maps data domain to SVG canvas coordinates"""

    def __init__(self, canvas_format: str = 'ppt169', chart_area: Optional[ChartArea] = None):
        """
        Initialize the coordinate system

        Args:
            canvas_format: Canvas format (ppt169, ppt43, xiaohongshu, moments, etc.)
            chart_area: Chart area; uses default values if not specified
        """
        self.canvas_format = canvas_format

        # Parse canvas dimensions
        if canvas_format in CANVAS_FORMATS:
            viewbox = CANVAS_FORMATS[canvas_format]['viewbox']
            parts = viewbox.split()
            self.canvas_width = int(parts[2])
            self.canvas_height = int(parts[3])
        else:
            self.canvas_width = 1280
            self.canvas_height = 720

        # Set chart area (default with margins)
        if chart_area:
            self.chart_area = chart_area
        else:
            # Default chart area: left/right margin 140px, top/bottom margin 150px
            self.chart_area = ChartArea(
                x_min=140,
                y_min=150,
                x_max=self.canvas_width - 120,
                y_max=self.canvas_height - 120
            )

    def data_to_svg_x(self, data_x: float, x_range: Tuple[float, float]) -> float:
        """
        Map data X value to SVG X coordinate

        Args:
            data_x: Data X value
            x_range: X axis data range (min, max)
        """
        x_min, x_max = x_range
        if x_max == x_min:
            return self.chart_area.x_min

        ratio = (data_x - x_min) / (x_max - x_min)
        return self.chart_area.x_min + ratio * self.chart_area.width

    def data_to_svg_y(self, data_y: float, y_range: Tuple[float, float]) -> float:
        """
        Map data Y value to SVG Y coordinate (note: SVG Y axis points downward)

        Args:
            data_y: Data Y value
            y_range: Y axis data range (min, max)
        """
        y_min, y_max = y_range
        if y_max == y_min:
            return self.chart_area.y_max

        ratio = (data_y - y_min) / (y_max - y_min)
        # SVG Y axis points downward, so invert
        return self.chart_area.y_max - ratio * self.chart_area.height

    def data_to_svg(self, data_x: float, data_y: float,
                    x_range: Tuple[float, float], y_range: Tuple[float, float]) -> Tuple[float, float]:
        """Map data point to SVG coordinates"""
        return (self.data_to_svg_x(data_x, x_range), self.data_to_svg_y(data_y, y_range))


# =============================================================================
# Bar Chart Calculator
# =============================================================================

@dataclass
class BarPosition:
    """Bar position information"""
    index: int
    label: str
    value: float
    x: float
    y: float
    width: float
    height: float
    label_x: float  # Label X position
    label_y: float  # Label Y position (below bar)
    value_x: float  # Value X position
    value_y: float  # Value Y position (above bar)


class BarChartCalculator:
    """Bar chart coordinate calculator"""

    def __init__(self, coord_system: CoordinateSystem):
        self.coord = coord_system

    def calculate(self, data: Dict[str, float],
                  bar_width: float = 50,
                  gap_ratio: float = 0.3,
                  y_min: float = 0,
                  y_max: Optional[float] = None,
                  horizontal: bool = False) -> List[BarPosition]:
        """
        Calculate bar chart positions

        Args:
            data: Data dictionary {label: value}
            bar_width: Bar width (auto-calculated if None)
            gap_ratio: Gap ratio between bars (relative to bar width)
            y_min: Y axis minimum value
            y_max: Y axis maximum value (uses data maximum if None)
            horizontal: Whether to use horizontal bar chart
        """
        labels = list(data.keys())
        values = list(data.values())
        n = len(labels)

        if n == 0:
            return []

        # Calculate Y axis range
        if y_max is None:
            y_max = max(values) * 1.1  # Leave 10% headroom

        area = self.coord.chart_area

        if horizontal:
            # Horizontal bar chart
            return self._calculate_horizontal(labels, values, bar_width, gap_ratio, y_min, y_max)

        # Calculate bar layout
        total_width = area.width
        if bar_width is None:
            # Auto-calculate bar width: total width / (bar count * (1 + gap ratio))
            bar_width = total_width / (n * (1 + gap_ratio))

        gap = bar_width * gap_ratio
        total_bars_width = n * bar_width + (n - 1) * gap
        start_x = area.x_min + (area.width - total_bars_width) / 2

        results = []
        for i, (label, value) in enumerate(zip(labels, values)):
            # Bar X position
            x = start_x + i * (bar_width + gap)

            # Bar height and Y position
            ratio = (value - y_min) / (y_max - y_min) if y_max > y_min else 0
            height = ratio * area.height
            y = area.y_max - height  # SVG Y axis points downward

            # Label and value positions
            center_x = x + bar_width / 2

            results.append(BarPosition(
                index=i + 1,
                label=label,
                value=value,
                x=round(x, 1),
                y=round(y, 1),
                width=round(bar_width, 1),
                height=round(height, 1),
                label_x=round(center_x, 1),
                label_y=round(area.y_max + 30, 1),
                value_x=round(center_x, 1),
                value_y=round(y - 15, 1)
            ))

        return results

    def _calculate_horizontal(self, labels: List[str], values: List[float],
                              bar_height: float, gap_ratio: float,
                              x_min: float, x_max: float) -> List[BarPosition]:
        """Calculate horizontal bar chart"""
        n = len(labels)
        area = self.coord.chart_area

        if bar_height is None:
            bar_height = area.height / (n * (1 + gap_ratio))

        gap = bar_height * gap_ratio
        total_bars_height = n * bar_height + (n - 1) * gap
        start_y = area.y_min + (area.height - total_bars_height) / 2

        results = []
        for i, (label, value) in enumerate(zip(labels, values)):
            y = start_y + i * (bar_height + gap)

            ratio = (value - x_min) / (x_max - x_min) if x_max > x_min else 0
            width = ratio * area.width
            x = area.x_min

            center_y = y + bar_height / 2

            results.append(BarPosition(
                index=i + 1,
                label=label,
                value=value,
                x=round(x, 1),
                y=round(y, 1),
                width=round(width, 1),
                height=round(bar_height, 1),
                label_x=round(area.x_min - 10, 1),
                label_y=round(center_y, 1),
                value_x=round(x + width + 10, 1),
                value_y=round(center_y, 1)
            ))

        return results

    def format_table(self, positions: List[BarPosition]) -> str:
        """Format as table output"""
        lines = []
        lines.append("Index Label         Value       X        Y       Width    Height")
        lines.append("----  ----------  --------  -------  -------  -------  -------")

        for p in positions:
            lines.append(f"{p.index:4d}  {p.label:<10s}  {p.value:>8.1f}  {p.x:>7.1f}  {p.y:>7.1f}  {p.width:>7.1f}  {p.height:>7.1f}")

        return "\n".join(lines)


# =============================================================================
# Pie / Donut Chart Calculator
# =============================================================================

@dataclass
class PieSlice:
    """Pie chart slice information"""
    index: int
    label: str
    value: float
    percentage: float
    start_angle: float  # Start angle (degrees)
    end_angle: float    # End angle (degrees)
    path_d: str         # SVG path d attribute
    label_x: float      # Label X position
    label_y: float      # Label Y position
    # Arc endpoint coordinates (relative to center)
    start_x: float
    start_y: float
    end_x: float
    end_y: float


class PieChartCalculator:
    """Pie / donut chart calculator"""

    def __init__(self, center: Tuple[float, float] = (420, 400), radius: float = 200):
        self.cx, self.cy = center
        self.radius = radius

    def calculate(self, data: Dict[str, float],
                  start_angle: float = -90,
                  inner_radius: float = 0) -> List[PieSlice]:
        """
        Calculate pie chart slices

        Args:
            data: Data dictionary {label: value}
            start_angle: Start angle (degrees, -90 means starting from 12 o'clock)
            inner_radius: Inner radius (0 for pie chart, > 0 for donut chart)
        """
        labels = list(data.keys())
        values = list(data.values())
        total = sum(values)

        if total == 0:
            return []

        results = []
        current_angle = start_angle

        for i, (label, value) in enumerate(zip(labels, values)):
            percentage = value / total * 100
            angle_span = value / total * 360
            end_angle = current_angle + angle_span

            # Calculate arc endpoints
            start_rad = math.radians(current_angle)
            end_rad = math.radians(end_angle)

            start_x = self.radius * math.cos(start_rad)
            start_y = self.radius * math.sin(start_rad)
            end_x = self.radius * math.cos(end_rad)
            end_y = self.radius * math.sin(end_rad)

            # Generate path
            large_arc = 1 if angle_span > 180 else 0

            if inner_radius > 0:
                # Donut chart
                inner_start_x = inner_radius * math.cos(start_rad)
                inner_start_y = inner_radius * math.sin(start_rad)
                inner_end_x = inner_radius * math.cos(end_rad)
                inner_end_y = inner_radius * math.sin(end_rad)

                path_d = (
                    f"M {inner_start_x:.2f},{inner_start_y:.2f} "
                    f"L {start_x:.2f},{start_y:.2f} "
                    f"A {self.radius},{self.radius} 0 {large_arc},1 {end_x:.2f},{end_y:.2f} "
                    f"L {inner_end_x:.2f},{inner_end_y:.2f} "
                    f"A {inner_radius},{inner_radius} 0 {large_arc},0 {inner_start_x:.2f},{inner_start_y:.2f} Z"
                )
            else:
                # Pie chart
                path_d = (
                    f"M 0,0 "
                    f"L {start_x:.2f},{start_y:.2f} "
                    f"A {self.radius},{self.radius} 0 {large_arc},1 {end_x:.2f},{end_y:.2f} Z"
                )

            # Label position (70% of radius in the direction of slice center)
            mid_angle = (current_angle + end_angle) / 2
            mid_rad = math.radians(mid_angle)
            label_distance = self.radius * 0.7
            label_x = self.cx + label_distance * math.cos(mid_rad)
            label_y = self.cy + label_distance * math.sin(mid_rad)

            results.append(PieSlice(
                index=i + 1,
                label=label,
                value=value,
                percentage=round(percentage, 1),
                start_angle=round(current_angle, 1),
                end_angle=round(end_angle, 1),
                path_d=path_d,
                label_x=round(label_x, 1),
                label_y=round(label_y, 1),
                start_x=round(start_x, 2),
                start_y=round(start_y, 2),
                end_x=round(end_x, 2),
                end_y=round(end_y, 2)
            ))

            current_angle = end_angle

        return results

    def format_table(self, slices: List[PieSlice]) -> str:
        """Format as table output"""
        lines = []
        lines.append(f"Center: ({self.cx}, {self.cy}) | Radius: {self.radius}")
        lines.append("")
        lines.append("Index Label          Pct     Start     End     LabelX   LabelY")
        lines.append("----  ----------  --------  --------  --------  -------  -------")

        for s in slices:
            lines.append(
                f"{s.index:4d}  {s.label:<10s}  {s.percentage:>6.1f}%  {s.start_angle:>8.1f}  "
                f"{s.end_angle:>8.1f}  {s.label_x:>7.1f}  {s.label_y:>7.1f}"
            )

        lines.append("")
        lines.append("=== Arc Endpoint Coordinates (relative to center) ===")
        lines.append("Index StartX     StartY     EndX       EndY")
        lines.append("----  ---------  ---------  ---------  ---------")

        for s in slices:
            lines.append(
                f"{s.index:4d}  {s.start_x:>9.2f}  {s.start_y:>9.2f}  {s.end_x:>9.2f}  {s.end_y:>9.2f}"
            )

        lines.append("")
        lines.append("=== Path d Attribute ===")
        for s in slices:
            lines.append(f"{s.index}. {s.label}: {s.path_d}")

        return "\n".join(lines)


# =============================================================================
# Radar Chart Calculator
# =============================================================================

@dataclass
class RadarPoint:
    """Radar chart data point"""
    index: int
    label: str
    value: float
    percentage: float  # Percentage relative to max value
    angle: float       # Angle (degrees)
    x: float           # X relative to center
    y: float           # Y relative to center
    abs_x: float       # Absolute X coordinate
    abs_y: float       # Absolute Y coordinate
    label_x: float     # Label X position
    label_y: float     # Label Y position


class RadarChartCalculator:
    """Radar chart calculator"""

    def __init__(self, center: Tuple[float, float] = (640, 400), radius: float = 200):
        self.cx, self.cy = center
        self.radius = radius

    def calculate(self, data: Dict[str, float],
                  max_value: Optional[float] = None,
                  start_angle: float = -90) -> List[RadarPoint]:
        """
        Calculate radar chart vertex coordinates

        Args:
            data: Data dictionary {dimension_name: value}
            max_value: Maximum value (for normalization); uses data maximum if None
            start_angle: Start angle (degrees, -90 means starting from 12 o'clock)
        """
        labels = list(data.keys())
        values = list(data.values())
        n = len(labels)

        if n == 0:
            return []

        if max_value is None:
            max_value = max(values)

        angle_step = 360 / n
        results = []

        for i, (label, value) in enumerate(zip(labels, values)):
            angle = start_angle + i * angle_step
            rad = math.radians(angle)

            # Calculate normalized radius
            percentage = (value / max_value * 100) if max_value > 0 else 0
            point_radius = self.radius * (value / max_value) if max_value > 0 else 0

            # Calculate coordinates
            x = point_radius * math.cos(rad)
            y = point_radius * math.sin(rad)

            # Label position (outside the outermost ring)
            label_distance = self.radius + 30
            label_x = self.cx + label_distance * math.cos(rad)
            label_y = self.cy + label_distance * math.sin(rad)

            results.append(RadarPoint(
                index=i + 1,
                label=label,
                value=value,
                percentage=round(percentage, 1),
                angle=round(angle, 1),
                x=round(x, 2),
                y=round(y, 2),
                abs_x=round(self.cx + x, 2),
                abs_y=round(self.cy + y, 2),
                label_x=round(label_x, 1),
                label_y=round(label_y, 1)
            ))

        return results

    def calculate_grid(self, levels: int = 5) -> List[List[Tuple[float, float]]]:
        """Calculate grid layer coordinates (for drawing background polygons)"""
        n = 6  # Assume 6 dimensions
        grids = []

        for level in range(1, levels + 1):
            level_radius = self.radius * level / levels
            points = []

            angle_step = 360 / n
            for i in range(n):
                angle = -90 + i * angle_step
                rad = math.radians(angle)
                x = level_radius * math.cos(rad)
                y = level_radius * math.sin(rad)
                points.append((round(x, 2), round(y, 2)))

            grids.append(points)

        return grids

    def format_table(self, points: List[RadarPoint]) -> str:
        """Format as table output"""
        lines = []
        lines.append(f"Center: ({self.cx}, {self.cy}) | Radius: {self.radius}")
        lines.append("")
        lines.append("Index Dimension     Value     Pct     Angle      X        Y      Abs_X    Abs_Y")
        lines.append("----  ----------  ------  --------  ------  -------  -------  -------  -------")

        for p in points:
            lines.append(
                f"{p.index:4d}  {p.label:<10s}  {p.value:>6.1f}  {p.percentage:>6.1f}%  "
                f"{p.angle:>6.1f}  {p.x:>7.2f}  {p.y:>7.2f}  {p.abs_x:>7.1f}  {p.abs_y:>7.1f}"
            )

        # Generate polygon points attribute
        lines.append("")
        lines.append("=== SVG Polygon Points ===")
        points_str = " ".join([f"{p.x},{p.y}" for p in points])
        lines.append(f'points="{points_str}"')

        return "\n".join(lines)


# =============================================================================
# Line / Scatter Chart Calculator
# =============================================================================

@dataclass
class DataPoint:
    """Data point"""
    index: int
    x_value: float
    y_value: float
    svg_x: float
    svg_y: float
    label: Optional[str] = None


class LineChartCalculator:
    """Line / scatter chart calculator"""

    def __init__(self, coord_system: CoordinateSystem):
        self.coord = coord_system

    def calculate(self, data: List[Tuple[float, float]],
                  x_range: Optional[Tuple[float, float]] = None,
                  y_range: Optional[Tuple[float, float]] = None,
                  labels: Optional[List[str]] = None) -> List[DataPoint]:
        """
        Calculate data point coordinates

        Args:
            data: Data point list [(x1, y1), (x2, y2), ...]
            x_range: X axis range; auto-calculated if None
            y_range: Y axis range; auto-calculated if None
            labels: Point label list
        """
        if not data:
            return []

        x_values = [p[0] for p in data]
        y_values = [p[1] for p in data]

        if x_range is None:
            x_range = (min(x_values), max(x_values))
        if y_range is None:
            y_min = 0
            y_max = max(y_values) * 1.1
            y_range = (y_min, y_max)

        results = []
        for i, (x, y) in enumerate(data):
            svg_x, svg_y = self.coord.data_to_svg(x, y, x_range, y_range)

            results.append(DataPoint(
                index=i + 1,
                x_value=x,
                y_value=y,
                svg_x=round(svg_x, 1),
                svg_y=round(svg_y, 1),
                label=labels[i] if labels and i < len(labels) else None
            ))

        return results

    def generate_path(self, points: List[DataPoint], closed: bool = False) -> str:
        """Generate SVG path d attribute"""
        if not points:
            return ""

        parts = [f"M {points[0].svg_x},{points[0].svg_y}"]
        for p in points[1:]:
            parts.append(f"L {p.svg_x},{p.svg_y}")

        if closed:
            parts.append("Z")

        return " ".join(parts)

    def format_table(self, points: List[DataPoint]) -> str:
        """Format as table output"""
        lines = []
        area = self.coord.chart_area
        lines.append(f"Chart area: ({area.x_min}, {area.y_min}) - ({area.x_max}, {area.y_max})")
        lines.append("")
        lines.append("Index X_Value    Y_Value    SVG_X     SVG_Y")
        lines.append("----  ---------  ---------  --------  --------")

        for p in points:
            label_part = f"  ({p.label})" if p.label else ""
            lines.append(
                f"{p.index:4d}  {p.x_value:>9.2f}  {p.y_value:>9.2f}  {p.svg_x:>8.1f}  {p.svg_y:>8.1f}{label_part}"
            )

        lines.append("")
        lines.append("=== SVG Path ===")
        lines.append(self.generate_path(points))

        return "\n".join(lines)


# =============================================================================
# Grid Layout Calculator
# =============================================================================

@dataclass
class GridCell:
    """Grid cell"""
    row: int
    col: int
    index: int  # 1-based index
    x: float
    y: float
    width: float
    height: float
    center_x: float
    center_y: float


class GridLayoutCalculator:
    """Grid layout calculator"""

    def __init__(self, coord_system: CoordinateSystem):
        self.coord = coord_system

    def calculate(self, rows: int, cols: int,
                  padding: float = 20,
                  gap: float = 20) -> List[GridCell]:
        """
        Calculate grid layout

        Args:
            rows: Number of rows
            cols: Number of columns
            padding: Chart area inner padding
            gap: Cell spacing
        """
        area = self.coord.chart_area

        # Calculate available area
        available_width = area.width - 2 * padding - (cols - 1) * gap
        available_height = area.height - 2 * padding - (rows - 1) * gap

        cell_width = available_width / cols
        cell_height = available_height / rows

        results = []
        index = 1

        for row in range(rows):
            for col in range(cols):
                x = area.x_min + padding + col * (cell_width + gap)
                y = area.y_min + padding + row * (cell_height + gap)

                results.append(GridCell(
                    row=row + 1,
                    col=col + 1,
                    index=index,
                    x=round(x, 1),
                    y=round(y, 1),
                    width=round(cell_width, 1),
                    height=round(cell_height, 1),
                    center_x=round(x + cell_width / 2, 1),
                    center_y=round(y + cell_height / 2, 1)
                ))
                index += 1

        return results

    def format_table(self, cells: List[GridCell]) -> str:
        """Format as table output"""
        lines = []
        area = self.coord.chart_area
        lines.append(f"Chart area: ({area.x_min}, {area.y_min}) - ({area.x_max}, {area.y_max})")
        lines.append("")
        lines.append("Index Row   Col   X        Y       Width    Height  CenterX  CenterY")
        lines.append("----  ----  ----  -------  -------  -------  -------  -------  -------")

        for c in cells:
            lines.append(
                f"{c.index:4d}  {c.row:4d}  {c.col:4d}  {c.x:>7.1f}  {c.y:>7.1f}  "
                f"{c.width:>7.1f}  {c.height:>7.1f}  {c.center_x:>7.1f}  {c.center_y:>7.1f}"
            )

        return "\n".join(lines)


# =============================================================================
# SVG Validator
# =============================================================================

@dataclass
class ValidationResult:
    """Validation result"""
    element_type: str
    element_id: str
    attribute: str
    expected: float
    actual: float
    deviation: float
    passed: bool


class SVGPositionValidator:
    """SVG position validator"""

    def __init__(self, tolerance: float = 1.0):
        """
        Initialize the validator

        Args:
            tolerance: Allowed deviation (pixels)
        """
        self.tolerance = tolerance

    def validate_from_file(self, svg_file: str,
                           expected_coords: Dict[str, Dict[str, float]]) -> List[ValidationResult]:
        """
        Validate coordinates from file

        Args:
            svg_file: SVG file path
            expected_coords: Expected coordinates {element_ID: {attribute: value}}
        """
        svg_path = Path(svg_file)
        if not svg_path.exists():
            raise FileNotFoundError(f"SVG file does not exist: {svg_file}")

        with open(svg_path, 'r', encoding='utf-8') as f:
            content = f.read()

        return self.validate_content(content, expected_coords)

    def validate_content(self, svg_content: str,
                        expected_coords: Dict[str, Dict[str, float]]) -> List[ValidationResult]:
        """Validate coordinates in SVG content"""
        results = []

        for element_id, attrs in expected_coords.items():
            for attr, expected in attrs.items():
                actual = self._extract_attribute(svg_content, element_id, attr)

                if actual is not None:
                    deviation = abs(actual - expected)
                    passed = deviation <= self.tolerance

                    results.append(ValidationResult(
                        element_type=self._guess_element_type(element_id),
                        element_id=element_id,
                        attribute=attr,
                        expected=expected,
                        actual=actual,
                        deviation=round(deviation, 2),
                        passed=passed
                    ))
                else:
                    results.append(ValidationResult(
                        element_type=self._guess_element_type(element_id),
                        element_id=element_id,
                        attribute=attr,
                        expected=expected,
                        actual=float('nan'),
                        deviation=float('inf'),
                        passed=False
                    ))

        return results

    def _extract_attribute(self, content: str, element_id: str, attr: str) -> Optional[float]:
        """Extract attribute value from SVG content"""
        pattern = rf'<[^>]*(?<![\w:-])id\s*=\s*([\'"]){re.escape(element_id)}\1[^>]*>'
        match = re.search(pattern, content)
        if match:
            value = extract_attr(match.group(0), attr)
            if value is None:
                return None
            try:
                return float(value)
            except ValueError:
                return None

        return None

    def _guess_element_type(self, element_id: str) -> str:
        """Guess element type based on ID"""
        id_lower = element_id.lower()
        if 'bar' in id_lower or 'rect' in id_lower:
            return 'rect'
        elif 'circle' in id_lower or 'dot' in id_lower:
            return 'circle'
        elif 'path' in id_lower or 'slice' in id_lower:
            return 'path'
        elif 'line' in id_lower:
            return 'line'
        elif 'text' in id_lower or 'label' in id_lower:
            return 'text'
        return 'unknown'

    def extract_all_positions(self, svg_content: str) -> Dict[str, Dict[str, float]]:
        """Extract position information of all elements in SVG"""
        positions = {}

        # Extract rect elements
        for match in re.finditer(r'<rect[^>]*/?>', svg_content):
            elem = match.group(0)
            x = extract_attr(elem, 'x')
            y = extract_attr(elem, 'y')
            if x is None or y is None:
                continue
            id_val = extract_attr(elem, 'id') or f"rect_{len(positions)}"
            try:
                positions[id_val] = {'x': float(x), 'y': float(y)}
                width = extract_attr(elem, 'width')
                height = extract_attr(elem, 'height')
                if width is not None:
                    positions[id_val]['width'] = float(width)
                if height is not None:
                    positions[id_val]['height'] = float(height)
            except ValueError:
                continue

        # Extract circle elements
        for match in re.finditer(r'<circle[^>]*/?>', svg_content):
            elem = match.group(0)
            cx = extract_attr(elem, 'cx')
            cy = extract_attr(elem, 'cy')
            if cx is None or cy is None:
                continue
            id_val = extract_attr(elem, 'id') or f"circle_{len(positions)}"
            try:
                positions[id_val] = {'cx': float(cx), 'cy': float(cy)}
            except ValueError:
                continue

        return positions

    def format_results(self, results: List[ValidationResult]) -> str:
        """Format validation results"""
        lines = []
        lines.append("=== SVG Position Validation Results ===")
        lines.append(f"Tolerance: {self.tolerance}px")
        lines.append("")
        lines.append("Status Element_ID      Attr    Expected  Actual    Deviation")
        lines.append("----  --------------  ------  --------  --------  ------")

        passed_count = 0
        for r in results:
            status = "[OK]" if r.passed else "[X]"
            if r.passed:
                passed_count += 1

            actual_str = f"{r.actual:.1f}" if not math.isnan(r.actual) else "N/A"
            deviation_str = f"{r.deviation:.2f}" if not math.isinf(r.deviation) else "N/A"

            lines.append(
                f"{status}    {r.element_id:<14s}  {r.attribute:<6s}  "
                f"{r.expected:>8.1f}  {actual_str:>8s}  {deviation_str:>6s}"
            )

        lines.append("")
        pct = passed_count / len(results) * 100 if results else 0
        lines.append(f"Passed: {passed_count}/{len(results)} ({pct:.1f}%)")

        return "\n".join(lines)


# =============================================================================
# Command Line Interface
# =============================================================================

def parse_data_string(data_str: str) -> Dict[str, float]:
    """Parse data string in 'label1:value1,label2:value2' format"""
    result = {}
    for item in data_str.split(','):
        item = item.strip()
        if not item:
            continue
        if ':' in item:
            label, value = item.split(':', 1)
            try:
                result[label.strip()] = float(value.strip())
            except ValueError:
                print(f"[Warning] Unable to parse value: '{value.strip()}', skipped")
        else:
            print(f"[Warning] Invalid format (expected 'label:value'): '{item}'")
    return result


def parse_xy_data_string(data_str: str) -> List[Tuple[float, float]]:
    """Parse XY data string in 'x1:y1,x2:y2' format"""
    result = []
    for item in data_str.split(','):
        item = item.strip()
        if not item:
            continue
        if ':' in item:
            x, y = item.split(':', 1)
            try:
                result.append((float(x.strip()), float(y.strip())))
            except ValueError:
                print(f"[Warning] Unable to parse coordinates: '{item}', skipped")
        else:
            print(f"[Warning] Invalid format (expected 'x:y'): '{item}'")
    return result


def parse_tuple(s: str) -> Tuple[float, ...]:
    """Parse comma-separated numeric tuple"""
    return tuple(float(x.strip()) for x in s.split(','))


def extract_attr(element: str, attr_name: str) -> Optional[str]:
    """Extract attribute value from element string (attribute order independent)"""
    pattern = rf'(?<![\w:-]){re.escape(attr_name)}\s*=\s*([\'"])(.*?)\1'
    match = re.search(pattern, element)
    return match.group(2) if match else None


def analyze_svg_file(svg_file: str) -> None:
    """Analyze all chart elements in an SVG file"""
    svg_path = Path(svg_file)
    if not svg_path.exists():
        print(f"[Error] File does not exist: {svg_file}")
        return

    with open(svg_path, 'r', encoding='utf-8') as f:
        content = f.read()

    print(f"\n{'='*70}")
    print(f"SVG File Analysis: {svg_path.name}")
    print(f"{'='*70}")

    # Extract viewBox
    viewbox_match = re.search(r'viewBox="([^"]+)"', content)
    if viewbox_match:
        print(f"Canvas viewBox: {viewbox_match.group(1)}")

    # Use more robust element extraction (attribute order independent)
    # Extract all rect elements
    rect_elements = re.findall(r'<rect[^>]*/?>', content)
    rects = []
    for elem in rect_elements:
        x = extract_attr(elem, 'x')
        y = extract_attr(elem, 'y')
        w = extract_attr(elem, 'width')
        h = extract_attr(elem, 'height')
        if x is not None and y is not None:
            rects.append((x, y, w, h))

    # Extract all circle elements
    circle_elements = re.findall(r'<circle[^>]*/?>', content)
    circles = []
    for elem in circle_elements:
        cx = extract_attr(elem, 'cx')
        cy = extract_attr(elem, 'cy')
        r = extract_attr(elem, 'r')
        if cx is not None and cy is not None:
            circles.append((cx, cy, r))

    # Extract all polyline/polygon elements
    polylines = re.findall(r'<(?:polyline|polygon)[^>]*points="([^"]*)"', content)

    # Extract path elements
    paths = re.findall(r'<path[^>]*d="([^"]*)"', content)

    print(f"\nElement statistics:")
    print(f"  - rect (rectangle): {len(rects)}")
    print(f"  - circle: {len(circles)}")
    print(f"  - polyline/polygon: {len(polylines)}")
    print(f"  - path: {len(paths)}")

    # List rect elements in detail
    if rects:
        print(f"\n=== Rectangle Elements (rect) ===")
        print(f"{'Index':<6}{'X':<8}  {'Y':<8}  {'Width':<8}  {'Height':<8}")
        print("-" * 45)
        for i, (x, y, w, h) in enumerate(rects[:20], 1):  # Only show first 20
            w_str = w if w else '-'
            h_str = h if h else '-'
            print(f"{i:<6}{x:<8}  {y:<8}  {w_str:<8}  {h_str:<8}")
        if len(rects) > 20:
            print(f"... and {len(rects) - 20} more rectangle(s)")

    # List circle elements in detail
    if circles:
        print(f"\n=== Circle Elements (circle) ===")
        print(f"{'Index':<6}{'CX':<10}  {'CY':<10}  {'Radius':<8}")
        print("-" * 40)
        for i, (cx, cy, r) in enumerate(circles[:20], 1):
            r_str = r if r else '-'
            print(f"{i:<6}{cx:<10}  {cy:<10}  {r_str:<8}")
        if len(circles) > 20:
            print(f"... and {len(circles) - 20} more circle(s)")

    # List polyline points
    if polylines:
        print(f"\n=== Polyline/Polygon (polyline/polygon) ===")
        for i, points in enumerate(polylines, 1):
            point_list = points.strip().split()
            print(f"\nPolyline {i} ({len(point_list)} points):")
            # Parse and show first few points
            parsed_points = []
            for p in point_list[:5]:
                if ',' in p:
                    x, y = p.split(',')
                    parsed_points.append(f"({x},{y})")
            print(f"  Start points: {' -> '.join(parsed_points)}")
            if len(point_list) > 5:
                print(f"  ... {len(point_list)} points total")

    print(f"\n{'='*70}")


def interactive_mode() -> None:
    """Interactive calculation mode"""
    print("\n" + "="*60)
    print("SVG Position Calculator - Interactive Mode")
    print("="*60)
    print("\nSelect chart type:")
    print("  1. Bar chart (bar)")
    print("  2. Pie chart (pie)")
    print("  3. Radar chart (radar)")
    print("  4. Line chart (line)")
    print("  5. Grid layout (grid)")
    print("  6. Custom line (custom)")
    print("  0. Exit")

    while True:
        try:
            choice = input("\nSelect [1-6, 0 to exit]: ").strip()

            if choice == '0':
                print("Exiting interactive mode")
                break

            elif choice == '1':
                print("\n=== Bar Chart Calculation ===")
                data_str = input("Enter data (format: label1:value1,label2:value2): ").strip()
                if not data_str:
                    print("Example: East:185,South:142,North:128")
                    continue

                canvas = input("Canvas format [ppt169]: ").strip() or 'ppt169'
                coord = CoordinateSystem(canvas)
                calc = BarChartCalculator(coord)
                data = parse_data_string(data_str)
                positions = calc.calculate(data)
                print()
                print(calc.format_table(positions))

            elif choice == '2':
                print("\n=== Pie Chart Calculation ===")
                data_str = input("Enter data (format: label1:value1,label2:value2): ").strip()
                if not data_str:
                    print("Example: A:35,B:25,C:20,D:12,Other:8")
                    continue

                center_str = input("Center coordinates [420,400]: ").strip() or '420,400'
                radius = float(input("Radius [200]: ").strip() or '200')

                center = parse_tuple(center_str)
                calc = PieChartCalculator(center, radius)
                data = parse_data_string(data_str)
                slices = calc.calculate(data)
                print()
                print(calc.format_table(slices))

            elif choice == '3':
                print("\n=== Radar Chart Calculation ===")
                data_str = input("Enter data (format: dim1:value1,dim2:value2): ").strip()
                if not data_str:
                    print("Example: Performance:90,Security:85,Usability:75,Price:70")
                    continue

                center_str = input("Center coordinates [640,400]: ").strip() or '640,400'
                radius = float(input("Radius [200]: ").strip() or '200')

                center = parse_tuple(center_str)
                calc = RadarChartCalculator(center, radius)
                data = parse_data_string(data_str)
                points = calc.calculate(data)
                print()
                print(calc.format_table(points))

            elif choice == '4':
                print("\n=== Line Chart Calculation ===")
                data_str = input("Enter data (format: x1:y1,x2:y2): ").strip()
                if not data_str:
                    print("Example: 0:50,10:80,20:120,30:95")
                    continue

                canvas = input("Canvas format [ppt169]: ").strip() or 'ppt169'
                coord = CoordinateSystem(canvas)
                calc = LineChartCalculator(coord)
                data = parse_xy_data_string(data_str)
                points = calc.calculate(data)
                print()
                print(calc.format_table(points))

            elif choice == '5':
                print("\n=== Grid Layout Calculation ===")
                rows = int(input("Rows: ").strip() or '2')
                cols = int(input("Columns: ").strip() or '3')
                canvas = input("Canvas format [ppt169]: ").strip() or 'ppt169'

                coord = CoordinateSystem(canvas)
                calc = GridLayoutCalculator(coord)
                cells = calc.calculate(rows, cols)
                print()
                print(calc.format_table(cells))

            elif choice == '6':
                print("\n=== Custom Line Calculation ===")
                print("For custom formula line charts, such as price index charts")

                base_x = float(input("X start value [170]: ").strip() or '170')
                step_x = float(input("X step [40]: ").strip() or '40')
                base_y = float(input("Y baseline [595]: ").strip() or '595')
                scale_y = float(input("Y scale factor [20]: ").strip() or '20')
                ref_value = float(input("Reference baseline value [100]: ").strip() or '100')

                print(f"\nFormula: X = {base_x} + index * {step_x}")
                print(f"         Y = {base_y} - (value - {ref_value}) * {scale_y}")

                data_str = input("\nEnter data (comma-separated values): ").strip()
                if data_str:
                    values = [float(v.strip()) for v in data_str.split(',')]
                    print(f"\n{'Index':<6}{'Value':<10}  {'X':<8}  {'Y':<8}")
                    print("-" * 35)
                    for i, v in enumerate(values, 1):
                        x = base_x + i * step_x
                        y = base_y - (v - ref_value) * scale_y
                        print(f"{i:<6}{v:<10.1f}  {x:<8.0f}  {y:<8.0f}")

                    # Generate polyline points
                    points_list = []
                    for i, v in enumerate(values, 1):
                        x = base_x + i * step_x
                        y = base_y - (v - ref_value) * scale_y
                        points_list.append(f"{int(x)},{int(y)}")
                    print(f"\npolyline points:")
                    print(" ".join(points_list))

            else:
                print("Invalid selection, please enter 1-6 or 0")

        except KeyboardInterrupt:
            print("\nExiting interactive mode")
            break
        except Exception as e:
            print(f"Error: {e}")


def from_json_config(config_file: str) -> None:
    """Read and calculate from JSON config file"""
    import json

    config_path = Path(config_file)
    if not config_path.exists():
        print(f"[Error] Config file does not exist: {config_file}")
        return

    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    chart_type = config.get('type', 'bar')
    data = config.get('data', {})

    print(f"\nLoaded from config file: {config_path.name}")
    print(f"Chart type: {chart_type}")

    if chart_type == 'bar':
        canvas = config.get('canvas', 'ppt169')
        coord = CoordinateSystem(canvas)
        calc = BarChartCalculator(coord)
        positions = calc.calculate(data)
        print(calc.format_table(positions))

    elif chart_type == 'pie':
        center = tuple(config.get('center', [420, 400]))
        radius = config.get('radius', 200)
        calc = PieChartCalculator(center, radius)
        slices = calc.calculate(data)
        print(calc.format_table(slices))

    elif chart_type == 'line':
        canvas = config.get('canvas', 'ppt169')
        coord = CoordinateSystem(canvas)
        calc = LineChartCalculator(coord)
        # data should be list of [x, y] pairs
        points_data = [(p[0], p[1]) for p in data]
        points = calc.calculate(points_data)
        print(calc.format_table(points))

    elif chart_type == 'custom_line':
        # Custom line chart
        base_x = config.get('base_x', 170)
        step_x = config.get('step_x', 40)
        base_y = config.get('base_y', 595)
        scale_y = config.get('scale_y', 20)
        ref_value = config.get('ref_value', 100)
        values = config.get('values', [])

        print(f"\nFormula: X = {base_x} + index * {step_x}")
        print(f"         Y = {base_y} - (value - {ref_value}) * {scale_y}")
        print(f"\n{'Index':<6}{'Value':<10}  {'X':<8}  {'Y':<8}")
        print("-" * 35)

        points_list = []
        for i, v in enumerate(values, 1):
            x = base_x + i * step_x
            y = base_y - (v - ref_value) * scale_y
            print(f"{i:<6}{v:<10.1f}  {x:<8.0f}  {y:<8.0f}")
            points_list.append(f"{int(x)},{int(y)}")

        print(f"\npolyline points:")
        print(" ".join(points_list))


def main() -> None:
    """Run the CLI entry point."""
    parser = argparse.ArgumentParser(
        description='SVG Position Calculation and Validation Tool',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Common commands:
  # Analyze SVG file
  python svg_position_calculator.py analyze example.svg

  # Interactive mode
  python svg_position_calculator.py interactive

  # Calculate from JSON config
  python svg_position_calculator.py from-json config.json

  # Quick calculation
  python svg_position_calculator.py calc bar --data "East:185,South:142"
  python svg_position_calculator.py calc pie --data "A:35,B:25,C:20"
  python svg_position_calculator.py calc line --data "0:50,10:80,20:120"
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Command')

    # calc subcommand
    calc_parser = subparsers.add_parser('calc', help='Calculate coordinates')
    calc_subparsers = calc_parser.add_subparsers(dest='chart_type', help='Chart type')

    # Bar chart
    bar_parser = calc_subparsers.add_parser('bar', help='Bar chart')
    bar_parser.add_argument('--data', required=True, help='Data "label1:value1,label2:value2"')
    bar_parser.add_argument('--canvas', default='ppt169', help='Canvas format')
    bar_parser.add_argument('--area', help='Chart area "x_min,y_min,x_max,y_max"')
    bar_parser.add_argument('--bar-width', type=float, default=50, help='Bar width')
    bar_parser.add_argument('--horizontal', action='store_true', help='Horizontal bar chart')
    bar_parser.add_argument('--value-range', help='Value axis range "min,max" (from axis tick labels; omit to auto-normalize)')

    # Pie chart
    pie_parser = calc_subparsers.add_parser('pie', help='Pie / donut chart')
    pie_parser.add_argument('--data', required=True, help='Data "label1:value1,label2:value2"')
    pie_parser.add_argument('--center', default='420,400', help='Center "x,y"')
    pie_parser.add_argument('--radius', type=float, default=200, help='Radius')
    pie_parser.add_argument('--inner-radius', type=float, default=0, help='Inner radius (donut chart)')
    pie_parser.add_argument('--start-angle', type=float, default=-90, help='Start angle')

    # Radar chart
    radar_parser = calc_subparsers.add_parser('radar', help='Radar chart')
    radar_parser.add_argument('--data', required=True, help='Data "dim1:value1,dim2:value2"')
    radar_parser.add_argument('--center', default='640,400', help='Center "x,y"')
    radar_parser.add_argument('--radius', type=float, default=200, help='Radius')
    radar_parser.add_argument('--max-value', type=float, help='Maximum value')

    # Line / scatter chart
    line_parser = calc_subparsers.add_parser('line', help='Line / scatter chart')
    line_parser.add_argument('--data', required=True, help='Data "x1:y1,x2:y2"')
    line_parser.add_argument('--canvas', default='ppt169', help='Canvas format')
    line_parser.add_argument('--area', help='Chart area "x_min,y_min,x_max,y_max"')
    line_parser.add_argument('--x-range', help='X axis range "min,max"')
    line_parser.add_argument('--y-range', help='Y axis range "min,max"')

    # Grid layout
    grid_parser = calc_subparsers.add_parser('grid', help='Grid layout')
    grid_parser.add_argument('--rows', type=int, required=True, help='Number of rows')
    grid_parser.add_argument('--cols', type=int, required=True, help='Number of columns')
    grid_parser.add_argument('--canvas', default='ppt169', help='Canvas format')
    grid_parser.add_argument('--area', help='Chart area "x_min,y_min,x_max,y_max"')
    grid_parser.add_argument('--padding', type=float, default=20, help='Inner padding')
    grid_parser.add_argument('--gap', type=float, default=20, help='Spacing')

    # validate subcommand
    validate_parser = subparsers.add_parser('validate', help='Validate SVG')
    validate_parser.add_argument('svg_file', help='SVG file path')
    validate_parser.add_argument('--expected', help='Expected coordinates JSON file')
    validate_parser.add_argument('--extract', action='store_true', help='Extract all position information')
    validate_parser.add_argument('--tolerance', type=float, default=1.0, help='Tolerance (pixels)')

    # analyze subcommand - analyze SVG file
    analyze_parser = subparsers.add_parser('analyze', help='Analyze chart elements in SVG file')
    analyze_parser.add_argument('svg_file', help='SVG file path')

    # interactive subcommand - interactive mode
    subparsers.add_parser('interactive', help='Interactive calculation mode')

    # from-json subcommand - read from config file
    json_parser = subparsers.add_parser('from-json', help='Calculate from JSON config file')
    json_parser.add_argument('config_file', help='JSON config file path')

    args = parser.parse_args()

    if args.command == 'calc':
        # Parse chart area
        chart_area = None
        if hasattr(args, 'area') and args.area:
            parts = parse_tuple(args.area)
            chart_area = ChartArea(parts[0], parts[1], parts[2], parts[3])

        if args.chart_type == 'bar':
            canvas = args.canvas if hasattr(args, 'canvas') else 'ppt169'
            coord = CoordinateSystem(canvas, chart_area)
            calc = BarChartCalculator(coord)
            data = parse_data_string(args.data)

            # Parse value-range from axis tick labels (if provided)
            v_min, v_max = 0, None
            scale_source = 'auto (max*1.1)'
            if hasattr(args, 'value_range') and args.value_range:
                try:
                    vr = parse_tuple(args.value_range)
                except ValueError:
                    parser.error('calc bar --value-range must be numeric "min,max"')
                if len(vr) != 2:
                    parser.error('calc bar --value-range must contain exactly two values: "min,max"')
                v_min, v_max = vr[0], vr[1]
                if v_max <= v_min:
                    parser.error('calc bar --value-range max must be greater than min')
                scale_source = f'axis ticks ({v_min}-{v_max})'

            positions = calc.calculate(data, bar_width=args.bar_width,
                                      horizontal=args.horizontal,
                                      y_min=v_min, y_max=v_max)

            print(f"\n=== Bar Chart Coordinate Calculation ===")
            print(f"Canvas: {CANVAS_FORMATS.get(canvas, {}).get('dimensions', canvas)}")
            print(f"Chart area: ({coord.chart_area.x_min}, {coord.chart_area.y_min}) - "
                  f"({coord.chart_area.x_max}, {coord.chart_area.y_max})")
            print(f"Value scale: {scale_source}")
            print()
            print(calc.format_table(positions))

        elif args.chart_type == 'pie':
            center = parse_tuple(args.center)
            calc = PieChartCalculator(center, args.radius)
            data = parse_data_string(args.data)
            slices = calc.calculate(data, start_angle=args.start_angle, inner_radius=args.inner_radius)

            print(f"\n=== Pie Chart Slice Calculation ===")
            print(calc.format_table(slices))

        elif args.chart_type == 'radar':
            center = parse_tuple(args.center)
            calc = RadarChartCalculator(center, args.radius)
            data = parse_data_string(args.data)
            points = calc.calculate(data, max_value=args.max_value)

            print(f"\n=== Radar Chart Vertex Calculation ===")
            print(calc.format_table(points))

        elif args.chart_type == 'line':
            canvas = args.canvas if hasattr(args, 'canvas') else 'ppt169'
            coord = CoordinateSystem(canvas, chart_area)
            calc = LineChartCalculator(coord)
            data = parse_xy_data_string(args.data)

            x_range = parse_tuple(args.x_range) if args.x_range else None
            y_range = parse_tuple(args.y_range) if args.y_range else None

            points = calc.calculate(data, x_range, y_range)

            print(f"\n=== Line / Scatter Chart Coordinate Calculation ===")
            print(f"Canvas: {CANVAS_FORMATS.get(canvas, {}).get('dimensions', canvas)}")
            print(calc.format_table(points))

        elif args.chart_type == 'grid':
            canvas = args.canvas if hasattr(args, 'canvas') else 'ppt169'
            coord = CoordinateSystem(canvas, chart_area)
            calc = GridLayoutCalculator(coord)
            cells = calc.calculate(args.rows, args.cols, args.padding, args.gap)

            print(f"\n=== Grid Layout Calculation ({args.rows}x{args.cols}) ===")
            print(f"Canvas: {CANVAS_FORMATS.get(canvas, {}).get('dimensions', canvas)}")
            print(calc.format_table(cells))

        else:
            parser.print_help()

    elif args.command == 'validate':
        validator = SVGPositionValidator(tolerance=args.tolerance)

        if args.extract:
            # Extract mode
            with open(args.svg_file, 'r', encoding='utf-8') as f:
                content = f.read()

            positions = validator.extract_all_positions(content)

            print(f"\n=== Extracted Element Positions ===")
            print(f"File: {args.svg_file}")
            print()

            for element_id, attrs in positions.items():
                print(f"{element_id}:")
                for attr, value in attrs.items():
                    print(f"  {attr}: {value}")
        elif args.expected:
            import json
            expected_path = Path(args.expected)
            if not expected_path.exists():
                print(f"[Error] Expected coordinates file does not exist: {args.expected}")
                return
            with open(expected_path, 'r', encoding='utf-8') as f:
                expected_coords = json.load(f)
            results = validator.validate_from_file(args.svg_file, expected_coords)
            print(validator.format_results(results))
        else:
            print("Validation mode requires --expected <json_file>; use --extract to extract coordinates first")

    elif args.command == 'analyze':
        analyze_svg_file(args.svg_file)

    elif args.command == 'interactive':
        interactive_mode()

    elif args.command == 'from-json':
        from_json_config(args.config_file)

    else:
        parser.print_help()


if __name__ == '__main__':
    main()
