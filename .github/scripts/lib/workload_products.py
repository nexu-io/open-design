"""Restore opaque workload products as one verified, immutable local set.

See docs/ci/workload-products.md for the producer and consumer contract.
"""
from __future__ import annotations

import hashlib
import os
import tempfile
import urllib.request
from pathlib import Path
from typing import Any, Callable

from lib.config import ConfigError


def materialize_products(
    products: dict[str, Any],
    destination: Path,
    request: Callable[[str], urllib.request.Request],
    *,
    timeout: float,
) -> dict[str, int]:
    """Caller validates manifest identities; bytes stay opaque, never extracted.

    A fresh destination is mandatory. A failed download or hash check leaves no
    published set; callers can execute the workload instead. Never merge into
    existing outputs, where stale files could masquerade as a cache hit.
    """
    if not products:
        raise ConfigError("cannot materialize an empty product set")
    if destination.exists() or destination.is_symlink():
        raise ConfigError("product destination must not already exist")
    for name, product in products.items():
        if Path(name).name != name or name in {".", ".."} or "\\" in name:
            raise ConfigError("unsafe product name")
        digest = product.get("data", {}).get("sha256")
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ConfigError("materialized products require SHA-256")
    destination.parent.mkdir(parents=True, exist_ok=True)
    sizes: dict[str, int] = {}
    with tempfile.TemporaryDirectory(prefix=".workload-products-", dir=destination.parent) as temporary:
        stage = Path(temporary) / "set"
        stage.mkdir()
        for name, product in products.items():
            digest = hashlib.sha256()
            size = 0
            with urllib.request.urlopen(request(product["source"]), timeout=timeout) as source:
                if source.status != 200:
                    raise OSError(f"unexpected product HTTP status {source.status}")
                with (stage / name).open("xb") as target:
                    while chunk := source.read(1024 * 1024):
                        target.write(chunk)
                        digest.update(chunk)
                        size += len(chunk)
            if digest.hexdigest() != product["data"]["sha256"]:
                raise ConfigError(f"product digest mismatch: {name}")
            sizes[name] = size
        # Single rename after all products validate. The caller owns this unique
        # destination; concurrent writers to the same output are unsupported.
        os.rename(stage, destination)
    return sizes
