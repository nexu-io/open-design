"""Web image source providers for PPT Master.

Each ``provider_<name>.py`` module exposes a ``search(request, *,
license_tier_filter)`` function returning a list of ``AssetCandidate``
objects, plus a ``parse_results(payload)`` helper. ``image_search.py``
dispatches to them by name.
"""

from __future__ import annotations
