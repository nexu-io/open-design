#!/usr/bin/env python3
"""
PPT Master - Unified Configuration Management Module

Centrally manages all project configuration items to ensure consistency and maintainability.

Usage:
    from config import Config, CANVAS_FORMATS, DESIGN_COLORS

    # Get canvas format
    ppt169 = Config.get_canvas_format('ppt169')

    # Get color scheme
    colors = Config.get_color_scheme('consulting')
"""

from pathlib import Path
from typing import Dict, List, Optional, Any
import json
import os


# ============================================================
# Path Configuration
# ============================================================

# Project root directory
PROJECT_ROOT = Path(__file__).parent.parent

# Core directories
SCRIPTS_DIR = PROJECT_ROOT / 'scripts'
REFERENCES_DIR = PROJECT_ROOT / 'references'
TEMPLATES_DIR = PROJECT_ROOT / 'templates'
WORKFLOWS_DIR = PROJECT_ROOT / 'workflows'

# Repository root directory
REPO_ROOT = PROJECT_ROOT.parent.parent
EXAMPLES_DIR = REPO_ROOT / 'examples'
PROJECTS_DIR = REPO_ROOT / 'projects'

# Template subdirectories
CHART_TEMPLATES_DIR = TEMPLATES_DIR / 'charts'


# ============================================================
# Environment Configuration
# ============================================================

USER_CONFIG_DIR = Path.home() / '.ppt-master'
USER_ENV_FILE = USER_CONFIG_DIR / '.env'


def get_env_candidates() -> list[Path]:
    """Return the supported .env lookup order."""
    return [
        Path.cwd() / '.env',
        REPO_ROOT / '.env',
        USER_ENV_FILE,
    ]


def resolve_env_path() -> Path:
    """
    Return the first existing .env path.

    If no candidate exists, return the CWD .env path so callers can no-op
    consistently while still showing a useful default location in messages.
    """
    candidates = get_env_candidates()
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def strip_env_quotes(value: str) -> str:
    """Strip matching surrounding quotes from a .env value."""
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def load_prefixed_env_file(
    prefixes: tuple[str, ...],
    *,
    deprecated_keys: Optional[dict[str, str]] = None,
) -> Optional[Path]:
    """
    Load matching keys from the first supported .env file.

    Existing process environment variables always win. Keys outside the
    requested prefixes are ignored so one shared .env can hold image, search,
    and narration credentials without leaking unrelated values into the
    process.
    """
    env_path = resolve_env_path()
    if not env_path.exists():
        return None

    deprecated_keys = deprecated_keys or {}
    with env_path.open('r', encoding='utf-8') as fh:
        for lineno, raw_line in enumerate(fh, start=1):
            line = raw_line.strip()
            if not line or line.startswith('#'):
                continue
            if line.startswith('export '):
                line = line[7:].lstrip()
            if '=' not in line:
                raise ValueError(
                    f"Invalid line in {env_path}:{lineno}. Expected KEY=VALUE."
                )

            key, value = line.split('=', 1)
            key = key.strip()
            if not key:
                raise ValueError(
                    f"Invalid line in {env_path}:{lineno}. Missing variable name."
                )
            if not any(key.startswith(prefix) for prefix in prefixes):
                continue
            if key in deprecated_keys:
                raise ValueError(
                    f"Unsupported key in {env_path}:{lineno}: {key}\n"
                    f"{deprecated_keys[key]}"
                )
            os.environ.setdefault(key, strip_env_quotes(value.strip()))

    return env_path


# ============================================================
# Canvas Format Configuration
# ============================================================

CANVAS_FORMATS = {
    'ppt169': {
        'name': 'PPT 16:9',
        'dimensions': '1280×720',
        'viewbox': '0 0 1280 720',
        'width': 1280,
        'height': 720,
        'aspect_ratio': '16:9',
        'use_case': 'Modern projectors, online presentations'
    },
    'ppt43': {
        'name': 'PPT 4:3',
        'dimensions': '1024×768',
        'viewbox': '0 0 1024 768',
        'width': 1024,
        'height': 768,
        'aspect_ratio': '4:3',
        'use_case': 'Traditional projectors'
    },
    'wechat': {
        'name': 'WeChat Article Header',
        'dimensions': '900×383',
        'viewbox': '0 0 900 383',
        'width': 900,
        'height': 383,
        'aspect_ratio': '2.35:1',
        'use_case': 'WeChat article cover images'
    },
    'xiaohongshu': {
        'name': '小红书',
        'dimensions': '1242×1660',
        'viewbox': '0 0 1242 1660',
        'width': 1242,
        'height': 1660,
        'aspect_ratio': '3:4',
        'use_case': 'Knowledge sharing, product reviews'
    },
    'moments': {
        'name': 'Moments/Instagram',
        'dimensions': '1080×1080',
        'viewbox': '0 0 1080 1080',
        'width': 1080,
        'height': 1080,
        'aspect_ratio': '1:1',
        'use_case': 'Social media square images'
    },
    'story': {
        'name': 'Story/Vertical',
        'dimensions': '1080×1920',
        'viewbox': '0 0 1080 1920',
        'width': 1080,
        'height': 1920,
        'aspect_ratio': '9:16',
        'use_case': 'Short video covers, stories'
    },
    'banner': {
        'name': 'Horizontal Banner',
        'dimensions': '1920×1080',
        'viewbox': '0 0 1920 1080',
        'width': 1920,
        'height': 1080,
        'aspect_ratio': '16:9',
        'use_case': 'Web banners, large screen displays'
    },
    'a4': {
        'name': 'A4 Print',
        'dimensions': '1240×1754',
        'viewbox': '0 0 1240 1754',
        'width': 1240,
        'height': 1754,
        'aspect_ratio': '√2:1',
        'use_case': 'Print documents, PDF export'
    }
}


# ============================================================
# Design Color Configuration
# ============================================================

DESIGN_COLORS = {
    'consulting': {
        'name': 'Consulting Style',
        'primary': '#005587',
        'secondary': '#0076A8',
        'accent': '#F5A623',
        'success': '#27AE60',
        'warning': '#E74C3C',
        'text_dark': '#1A252F',
        'text_light': '#FFFFFF',
        'text_muted': '#7F8C8D',
        'background': '#FFFFFF',
        'background_alt': '#F8F9FA'
    },
    'general': {
        'name': 'General Flexible Style',
        'primary': '#2196F3',
        'secondary': '#4CAF50',
        'accent': '#FF9800',
        'purple': '#9C27B0',
        'success': '#27AE60',
        'warning': '#E74C3C',
        'text_dark': '#2C3E50',
        'text_light': '#FFFFFF',
        'text_muted': '#7F8C8D',
        'background': '#FFFFFF',
        'background_alt': '#F8F9FA'
    },
    'tech': {
        'name': 'Tech Style',
        'primary': '#00D1FF',
        'secondary': '#7B61FF',
        'accent': '#00FF88',
        'success': '#00FF88',
        'warning': '#FF6B6B',
        'text_dark': '#0A0E17',
        'text_light': '#FFFFFF',
        'text_muted': '#8892A0',
        'background': '#0A0E17',
        'background_alt': '#1A1F2E'
    },
    'academic': {
        'name': 'Academic Style',
        'primary': '#8B0000',
        'secondary': '#1E3A5F',
        'accent': '#C9B037',
        'success': '#2E7D32',
        'warning': '#D32F2F',
        'text_dark': '#1A1A1A',
        'text_light': '#FFFFFF',
        'text_muted': '#666666',
        'background': '#FFFFFF',
        'background_alt': '#F5F5F5'
    },
    'government': {
        'name': 'Government Style',
        'primary': '#C41E3A',
        'secondary': '#1E3A5F',
        'accent': '#D4AF37',
        'success': '#2E7D32',
        'warning': '#B71C1C',
        'text_dark': '#1A1A1A',
        'text_light': '#FFFFFF',
        'text_muted': '#555555',
        'background': '#FFFFFF',
        'background_alt': '#FFF8E1'
    }
}


# ============================================================
# Industry Color Templates
# ============================================================

INDUSTRY_COLORS = {
    'finance': {
        'name': 'Finance/Banking',
        'primary': '#003366',
        'secondary': '#4A90D9',
        'accent': '#D4AF37'
    },
    'healthcare': {
        'name': 'Healthcare/Medical',
        'primary': '#00796B',
        'secondary': '#4DB6AC',
        'accent': '#FF7043'
    },
    'technology': {
        'name': 'Technology/Internet',
        'primary': '#1565C0',
        'secondary': '#42A5F5',
        'accent': '#00E676'
    },
    'education': {
        'name': 'Education/Training',
        'primary': '#5E35B1',
        'secondary': '#7E57C2',
        'accent': '#FFD54F'
    },
    'retail': {
        'name': 'Retail/Consumer',
        'primary': '#E53935',
        'secondary': '#EF5350',
        'accent': '#FFB300'
    },
    'manufacturing': {
        'name': 'Manufacturing/Industrial',
        'primary': '#455A64',
        'secondary': '#78909C',
        'accent': '#FF6F00'
    },
    'energy': {
        'name': 'Energy/Environmental',
        'primary': '#2E7D32',
        'secondary': '#66BB6A',
        'accent': '#FDD835'
    },
    'realestate': {
        'name': 'Real Estate/Construction',
        'primary': '#795548',
        'secondary': '#A1887F',
        'accent': '#4CAF50'
    },
    'legal': {
        'name': 'Legal/Compliance',
        'primary': '#37474F',
        'secondary': '#546E7A',
        'accent': '#8D6E63'
    },
    'media': {
        'name': 'Media/Entertainment',
        'primary': '#7B1FA2',
        'secondary': '#AB47BC',
        'accent': '#FF4081'
    },
    'logistics': {
        'name': 'Logistics/Supply Chain',
        'primary': '#F57C00',
        'secondary': '#FFB74D',
        'accent': '#0288D1'
    },
    'agriculture': {
        'name': 'Agriculture/Food',
        'primary': '#558B2F',
        'secondary': '#8BC34A',
        'accent': '#FFCA28'
    },
    'tourism': {
        'name': 'Tourism/Hospitality',
        'primary': '#00ACC1',
        'secondary': '#4DD0E1',
        'accent': '#FF7043'
    },
    'automotive': {
        'name': 'Automotive/Transportation',
        'primary': '#263238',
        'secondary': '#455A64',
        'accent': '#D32F2F'
    }
}


# ============================================================
# Font Configuration
# ============================================================

FONTS = {
    'system_ui': "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    'sans_serif': "'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    'monospace': "'SF Mono', Monaco, Consolas, 'Liberation Mono', monospace"
}

FONT_SIZES = {
    'title_large': 48,
    'title': 36,
    'title_small': 28,
    'heading': 24,
    'subheading': 20,
    'body': 18,
    'body_small': 16,
    'caption': 14,
    'footnote': 12
}


# ============================================================
# Layout Configuration
# ============================================================

LAYOUT_MARGINS = {
    'ppt169': {
        'top': 60,
        'right': 60,
        'bottom': 60,
        'left': 60,
        'content_width': 1160,
        'content_height': 600
    },
    'ppt43': {
        'top': 50,
        'right': 50,
        'bottom': 50,
        'left': 50,
        'content_width': 924,
        'content_height': 608
    },
    'xiaohongshu': {
        'top': 80,
        'right': 60,
        'bottom': 80,
        'left': 60,
        'content_width': 1122,
        'content_height': 1500
    },
    'moments': {
        'top': 60,
        'right': 60,
        'bottom': 60,
        'left': 60,
        'content_width': 960,
        'content_height': 960
    },
    'story': {
        'top': 120,
        'right': 60,
        'bottom': 180,
        'left': 60,
        'content_width': 960,
        'content_height': 1620
    },
    'wechat': {
        'top': 40,
        'right': 40,
        'bottom': 40,
        'left': 40,
        'content_width': 820,
        'content_height': 303
    },
}


# ============================================================
# SVG Technical Specifications
# ============================================================

SVG_CONSTRAINTS = {
    # Forbidden elements - PPT incompatible
    'forbidden_elements': [
        # Clipping / Masking
        # Note: `clipPath` on <image> elements is conditionally allowed — the
        # converter maps qualifying clip shapes to DrawingML picture geometry.
        # See references/shared-standards.md §1.2. It is NOT listed here
        # because this flat list has no per-parent-element semantics; the
        # actual validation is in svg_quality_checker._check_forbidden_elements.
        'mask',
        # Style system
        'style',
        # Structure / Nesting
        'foreignObject',
        # Text / Fonts
        'textPath',
        # Animation / Interaction
        'animate',
        'animateMotion',
        'animateTransform',
        'animateColor',
        'set',
        'script',
        # Others
        'iframe',
    ],
    # Forbidden attributes
    # Note: marker-start / marker-end are NOT banned — they are conditionally
    # allowed (see references/shared-standards.md §1.1). The svg_to_pptx
    # converter maps qualifying <marker> defs to native DrawingML
    # <a:headEnd>/<a:tailEnd>.
    'forbidden_attributes': [
        'class',
        'id',
        'onclick', 'onload', 'onmouseover', 'onmouseout',
        'onfocus', 'onblur', 'onchange',
    ],
    # Forbidden patterns (regex matching)
    'forbidden_patterns': [
        r'@font-face',  # Web fonts
        r'rgba\s*\(',   # rgba colors (PPT incompatible)
        r'<\?xml-stylesheet\b',  # External CSS
        r'<link[^>]*rel\s*=\s*["\']stylesheet["\']',
        r'@import\s+',  # External CSS
        r'<g[^>]*\sopacity\s*=',  # Group opacity
        r'<image[^>]*\sopacity\s*=',  # Image opacity
        r'\bon\w+\s*=',  # Event attributes
        r'(?s)(?=.*<symbol)(?=.*<use\b)',  # <symbol> + <use> complex usage (order-independent)
    ],
    'recommended_fonts': [
        'system-ui',
        '-apple-system',
        'BlinkMacSystemFont',
        'Segoe UI'
    ]
}


# ============================================================
# Configuration Manager Class
# ============================================================

class Config:
    """Configuration manager."""

    @staticmethod
    def get_canvas_format(format_key: str) -> Optional[Dict]:
        """
        Get canvas format configuration.

        Args:
            format_key: Format key name (e.g. 'ppt169', 'xiaohongshu')

        Returns:
            Format configuration dict, or None if not found
        """
        return CANVAS_FORMATS.get(format_key)

    @staticmethod
    def get_all_canvas_formats() -> Dict:
        """Get all canvas formats."""
        return CANVAS_FORMATS.copy()

    @staticmethod
    def get_color_scheme(style: str) -> Optional[Dict]:
        """
        Get color scheme.

        Args:
            style: Style name (e.g. 'consulting', 'general', 'tech')

        Returns:
            Color scheme dict
        """
        return DESIGN_COLORS.get(style)

    @staticmethod
    def get_industry_colors(industry: str) -> Optional[Dict]:
        """
        Get industry color palette.

        Args:
            industry: Industry name (e.g. 'finance', 'healthcare')

        Returns:
            Industry color dict
        """
        return INDUSTRY_COLORS.get(industry)

    @staticmethod
    def get_all_industries() -> List[str]:
        """Get list of all industries."""
        return list(INDUSTRY_COLORS.keys())

    @staticmethod
    def get_layout_margins(format_key: str) -> Optional[Dict]:
        """
        Get layout margin configuration.

        Args:
            format_key: Format key name

        Returns:
            Margin configuration dict
        """
        return LAYOUT_MARGINS.get(format_key)

    @staticmethod
    def get_font(font_type: str = 'system_ui') -> str:
        """
        Get font declaration.

        Args:
            font_type: Font type ('system_ui', 'sans_serif', 'monospace')

        Returns:
            Font declaration string
        """
        return FONTS.get(font_type, FONTS['system_ui'])

    @staticmethod
    def get_font_size(size_name: str) -> int:
        """
        Get font size.

        Args:
            size_name: Size name (e.g. 'title', 'body', 'caption')

        Returns:
            Font size (pixels)
        """
        return FONT_SIZES.get(size_name, FONT_SIZES['body'])

    @staticmethod
    def validate_svg_element(element_name: str) -> bool:
        """
        Validate whether an SVG element is allowed.

        Args:
            element_name: Element name

        Returns:
            Whether the element is allowed
        """
        return element_name.lower() not in [e.lower() for e in SVG_CONSTRAINTS['forbidden_elements']]

    @staticmethod
    def get_project_path(subdir: str = '') -> Path:
        """
        Get project path.

        Args:
            subdir: Subdirectory name

        Returns:
            Full path
        """
        if subdir:
            return PROJECT_ROOT / subdir
        return PROJECT_ROOT

    @staticmethod
    def export_config(output_file: str = 'config_export.json'):
        """
        Export configuration to a JSON file.

        Args:
            output_file: Output file path
        """
        config_data = {
            'canvas_formats': CANVAS_FORMATS,
            'design_colors': DESIGN_COLORS,
            'industry_colors': INDUSTRY_COLORS,
            'fonts': FONTS,
            'font_sizes': FONT_SIZES,
            'svg_constraints': SVG_CONSTRAINTS
        }

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, ensure_ascii=False, indent=2)

        print(f"Configuration exported to: {output_file}")


# ============================================================
# Command Line Interface
# ============================================================

def print_usage() -> None:
    """Print CLI usage information."""
    print("PPT Master - Configuration Management Tool\n")
    print("Usage:")
    print("  python3 scripts/config.py list-formats     # List all canvas formats")
    print("  python3 scripts/config.py list-colors      # List all color schemes")
    print("  python3 scripts/config.py list-industries  # List all industry colors")
    print("  python3 scripts/config.py export           # Export configuration to JSON")
    print("  python3 scripts/config.py format <key>     # View a specific canvas format")


def main() -> None:
    """Command line entry point."""
    import sys

    if len(sys.argv) < 2:
        print_usage()
        return

    command = sys.argv[1]
    if command in {"-h", "--help", "help"}:
        print_usage()
        return

    if command == 'list-formats':
        print("\nCanvas Format List:\n")
        for key, info in CANVAS_FORMATS.items():
            print(
                f"  {key:15} | {info['name']:15} | {info['dimensions']:12} | {info['use_case']}")

    elif command == 'list-colors':
        print("\nColor Scheme List:\n")
        for key, info in DESIGN_COLORS.items():
            print(f"  {key:12} | {info['name']:15} | Primary: {info['primary']}")

    elif command == 'list-industries':
        print("\nIndustry Color List:\n")
        for key, info in INDUSTRY_COLORS.items():
            print(f"  {key:15} | {info['name']:15} | Primary: {info['primary']}")

    elif command == 'export':
        output_file = sys.argv[2] if len(
            sys.argv) > 2 else 'config_export.json'
        Config.export_config(output_file)

    elif command == 'format' and len(sys.argv) > 2:
        format_key = sys.argv[2]
        info = Config.get_canvas_format(format_key)
        if info:
            print(f"\nCanvas Format: {format_key}\n")
            for key, value in info.items():
                print(f"  {key}: {value}")
        else:
            print(f"[ERROR] Format not found: {format_key}")
            print(f"   Available formats: {', '.join(CANVAS_FORMATS.keys())}")

    else:
        print(f"[ERROR] Unknown command: {command}")


if __name__ == '__main__':
    main()
