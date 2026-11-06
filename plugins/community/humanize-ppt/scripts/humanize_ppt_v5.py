#!/usr/bin/env python3
"""Humanize PPT V0.5 Presenter / Export Adapter entrypoint.

The implementation stays in humanize_ppt_v2.py for backward compatibility with
existing V0.2/V0.3/V0.4 commands; this wrapper gives V0.5 a stable public command name.
"""

from humanize_ppt_v2 import main


if __name__ == "__main__":
    import sys
    sys.exit(main())
