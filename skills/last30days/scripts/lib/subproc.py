"""Subprocess helpers: safe timeout + process-group cleanup.

Used by bird_x.py (Node.js Bird search) and youtube_yt.py (yt-dlp search
and transcript download). Both need the same os.setsid/killpg cleanup
dance on timeout to avoid orphaning child processes.
"""

from __future__ import annotations

import os
import signal
import subprocess
from dataclasses import dataclass
from typing import Optional, Sequence


class SubprocTimeout(Exception):
    """Raised when a subprocess exceeds its timeout and is killed."""


@dataclass
class SubprocResult:
    """Result of a subprocess run that captured stdout and stderr."""

    returncode: int
    stdout: str
    stderr: str


def run_with_timeout(
    cmd: Sequence[str],
    *,
    timeout: int,
    env: Optional[dict] = None,
    on_pid: Optional[callable] = None,
) -> SubprocResult:
    """Run a subprocess with process-group cleanup on timeout.

    Spawns ``cmd`` inside its own process group via ``os.setsid`` where
    available. If ``communicate(timeout=...)`` raises ``TimeoutExpired``,
    signals ``SIGTERM`` to the entire group, falls back to ``proc.kill()``
    if the signal fails, then waits up to 5 seconds for cleanup, and
    raises ``SubprocTimeout``.

    Args:
        cmd: Command and arguments to spawn.
        timeout: Timeout in seconds passed to ``communicate()``.
        env: Optional environment dict. If None, inherits parent env.
        on_pid: Optional callable invoked with the child PID right after
            spawn. Used by bird_x.py to register child PIDs for cleanup
            tracking. Exceptions raised by the callback are suppressed.

    Returns:
        SubprocResult with returncode, stdout, and stderr as strings.

    Raises:
        SubprocTimeout: If the process exceeded ``timeout``.
        FileNotFoundError: If the executable is not found.
        OSError: For other spawn failures.
    """
    preexec = os.setsid if hasattr(os, "setsid") else None

    proc = subprocess.Popen(
        list(cmd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        preexec_fn=preexec,
        env=env,
    )

    if on_pid is not None:
        try:
            on_pid(proc.pid)
        except Exception:
            pass

    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            proc.kill()
        proc.wait(timeout=5)
        raise SubprocTimeout(f"Command {cmd[0]} timed out after {timeout}s")

    return SubprocResult(
        returncode=proc.returncode,
        stdout=stdout or "",
        stderr=stderr or "",
    )
