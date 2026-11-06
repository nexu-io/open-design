#!/usr/bin/env python3
"""Stable recommended Humanize PPT entrypoint.

This file is the public command README users should run. Versioned scripts remain
available as compatibility entrypoints while the implementation stays in
humanize_ppt_v2.py.
"""

from humanize_ppt_v2 import main


if __name__ == "__main__":
    import sys
    sys.exit(main())
