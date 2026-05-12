"""Environment and API key management for last30days skill."""

from __future__ import annotations

import base64
import binascii
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

# Allow override via environment variable for testing
# Set LAST30DAYS_CONFIG_DIR="" for clean/no-config mode
# Set LAST30DAYS_CONFIG_DIR="/path/to/dir" for custom config location
_config_override = os.environ.get('LAST30DAYS_CONFIG_DIR')
if _config_override == "":
    # Empty string = no config file (clean mode)
    CONFIG_DIR = None
    CONFIG_FILE = None
elif _config_override:
    CONFIG_DIR = Path(_config_override)
    CONFIG_FILE = CONFIG_DIR / ".env"
else:
    CONFIG_DIR = Path.home() / ".config" / "last30days"
    CONFIG_FILE = CONFIG_DIR / ".env"

CODEX_AUTH_FILE = Path(os.environ.get("CODEX_AUTH_FILE", str(Path.home() / ".codex" / "auth.json")))

AuthSource = Literal["api_key", "codex", "none"]
AuthStatus = Literal["ok", "missing", "expired", "missing_account_id"]

AUTH_SOURCE_API_KEY: AuthSource = "api_key"
AUTH_SOURCE_CODEX: AuthSource = "codex"
AUTH_SOURCE_NONE: AuthSource = "none"

AUTH_STATUS_OK: AuthStatus = "ok"
AUTH_STATUS_MISSING: AuthStatus = "missing"
AUTH_STATUS_EXPIRED: AuthStatus = "expired"
AUTH_STATUS_MISSING_ACCOUNT_ID: AuthStatus = "missing_account_id"


@dataclass(frozen=True)
class OpenAIAuth:
    token: str | None
    source: AuthSource
    status: AuthStatus
    account_id: str | None
    codex_auth_file: str


def _check_file_permissions(path: Path) -> None:
    """Warn to stderr if a secrets file has overly permissive permissions."""
    try:
        mode = path.stat().st_mode
        # Check if group or other can read (bits 0o044)
        if mode & 0o044:
            sys.stderr.write(
                f"[last30days] WARNING: {path} is readable by other users. "
                f"Run: chmod 600 {path}\n"
            )
            sys.stderr.flush()
    except OSError as exc:
        sys.stderr.write(f"[last30days] WARNING: could not stat {path}: {exc}\n")
        sys.stderr.flush()


def load_env_file(path: Path) -> dict[str, str]:
    """Load environment variables from a file."""
    env = {}
    if not path or not path.exists():
        return env
    _check_file_permissions(path)

    with open(path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, _, value = line.partition('=')
                key = key.strip()
                value = value.strip()
                # Remove quotes if present
                if value and value[0] in ('"', "'") and value[-1] == value[0]:
                    value = value[1:-1]
                if key and value:
                    env[key] = value
    return env


def _decode_jwt_payload(token: str) -> dict[str, Any] | None:
    """Decode JWT payload without verification."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload_b64 = parts[1]
        pad = "=" * (-len(payload_b64) % 4)
        decoded = base64.urlsafe_b64decode(payload_b64 + pad)
        return json.loads(decoded.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError, binascii.Error, IndexError) as exc:
        sys.stderr.write(f"[last30days] WARNING: malformed JWT token: {exc}\n")
        sys.stderr.flush()
        return None


def _token_expired(token: str, leeway_seconds: int = 60) -> bool:
    """Check if JWT token is expired."""
    payload = _decode_jwt_payload(token)
    if not payload:
        return False
    exp = payload.get("exp")
    if not exp:
        return False
    return exp <= (time.time() + leeway_seconds)


def extract_chatgpt_account_id(access_token: str) -> str | None:
    """Extract chatgpt_account_id from JWT token."""
    payload = _decode_jwt_payload(access_token)
    if not payload:
        return None
    auth_claim = payload.get("https://api.openai.com/auth", {})
    if isinstance(auth_claim, dict):
        return auth_claim.get("chatgpt_account_id")
    return None


def load_codex_auth(path: Path = CODEX_AUTH_FILE) -> dict[str, Any]:
    """Load Codex auth JSON."""
    if not path.exists():
        return {}
    try:
        with open(path, "r") as f:
            return json.load(f)
    except json.JSONDecodeError:
        sys.stderr.write(
            f"[last30days] WARNING: {path} exists but contains invalid JSON -- ignoring\n"
        )
        sys.stderr.flush()
        return {}


def get_codex_access_token() -> tuple[str | None, str]:
    """Get Codex access token from auth.json.

    Returns:
        (token, status) where status is 'ok', 'missing', or 'expired'
    """
    auth = load_codex_auth()
    token = None
    if isinstance(auth, dict):
        tokens = auth.get("tokens") or {}
        if isinstance(tokens, dict):
            token = tokens.get("access_token")
        if not token:
            token = auth.get("access_token")
    if not token:
        return None, AUTH_STATUS_MISSING
    if _token_expired(token):
        return None, AUTH_STATUS_EXPIRED
    return token, AUTH_STATUS_OK


def get_openai_auth(file_env: dict[str, str]) -> OpenAIAuth:
    """Resolve OpenAI auth from API key or Codex login."""
    api_key = os.environ.get('OPENAI_API_KEY') or file_env.get('OPENAI_API_KEY')
    if api_key:
        return OpenAIAuth(
            token=api_key,
            source=AUTH_SOURCE_API_KEY,
            status=AUTH_STATUS_OK,
            account_id=None,
            codex_auth_file=str(CODEX_AUTH_FILE),
        )

    # Codex auth (chatgpt.com backend) intentionally skipped.
    # The endpoint is unstable and causes crashes when the token expires.
    # Users who want OpenAI should set OPENAI_API_KEY explicitly.

    return OpenAIAuth(
        token=None,
        source=AUTH_SOURCE_NONE,
        status=AUTH_STATUS_MISSING,
        account_id=None,
        codex_auth_file=str(CODEX_AUTH_FILE),
    )


def _find_project_env() -> Path | None:
    """Find per-project .env by walking up from cwd.

    Searches for .claude/last30days.env in each parent directory,
    stopping at the user's home directory or filesystem root.
    """
    cwd = Path.cwd()
    for parent in [cwd, *cwd.parents]:
        candidate = parent / '.claude' / 'last30days.env'
        if candidate.exists():
            return candidate
        # Stop at filesystem root or home
        if parent == Path.home() or parent == parent.parent:
            break
    return None


def get_config() -> dict[str, Any]:
    """Load configuration from multiple sources.

    Priority (highest wins):
      1. Environment variables (os.environ)
      2. .claude/last30days.env (per-project config)
      3. ~/.config/last30days/.env (global config)
    """
    # Load from global config file
    file_env = load_env_file(CONFIG_FILE) if CONFIG_FILE else {}

    # Load from per-project config (overrides global)
    project_env_path = _find_project_env()
    project_env = load_env_file(project_env_path) if project_env_path else {}

    # Merge: project overrides global
    merged_env = {**file_env, **project_env}

    openai_auth = get_openai_auth(merged_env)

    # Build config: Codex/OpenAI auth + process.env > project .env > global .env
    config = {
        'OPENAI_API_KEY': openai_auth.token,
        'OPENAI_AUTH_SOURCE': openai_auth.source,
        'OPENAI_AUTH_STATUS': openai_auth.status,
        'OPENAI_CHATGPT_ACCOUNT_ID': openai_auth.account_id,
        'CODEX_AUTH_FILE': openai_auth.codex_auth_file,
    }

    keys = [
        ('XAI_API_KEY', None),
        ('GOOGLE_API_KEY', None),
        ('GEMINI_API_KEY', None),
        ('GOOGLE_GENAI_API_KEY', None),
        ('XIAOHONGSHU_API_BASE', None),
        ('LAST30DAYS_REASONING_PROVIDER', 'auto'),
        ('LAST30DAYS_PLANNER_MODEL', None),
        ('LAST30DAYS_RERANK_MODEL', None),
        ('LAST30DAYS_X_MODEL', None),
        ('LAST30DAYS_X_BACKEND', None),
        ('OPENAI_MODEL_PIN', None),
        ('XAI_MODEL_PIN', None),
        ('SCRAPECREATORS_API_KEY', None),
        ('APIFY_API_TOKEN', None),
        ('AUTH_TOKEN', None),
        ('CT0', None),
        ('BSKY_HANDLE', None),
        ('BSKY_APP_PASSWORD', None),
        ('TRUTHSOCIAL_TOKEN', None),
        ('BRAVE_API_KEY', None),
        ('EXA_API_KEY', None),
        ('SERPER_API_KEY', None),
        ('OPENROUTER_API_KEY', None),
        ('PARALLEL_API_KEY', None),
        ('XQUIK_API_KEY', None),
        ('FROM_BROWSER', None),
        ('SETUP_COMPLETE', None),
        ('INCLUDE_SOURCES', ''),
    ]

    for key, default in keys:
        config[key] = os.environ.get(key) or merged_env.get(key, default)

    # Track which config source was used
    if project_env_path:
        config['_CONFIG_SOURCE'] = f'project:{project_env_path}'
    elif CONFIG_FILE and CONFIG_FILE.exists():
        config['_CONFIG_SOURCE'] = f'global:{CONFIG_FILE}'
    else:
        config['_CONFIG_SOURCE'] = 'env_only'

    # Extract browser credentials if configured
    browser_creds = extract_browser_credentials(config)
    for key, value in browser_creds.items():
        if not config.get(key):
            config[key] = value
            config[f"_{key}_SOURCE"] = "browser"

    return config


# ---------------------------------------------------------------------------
# Browser cookie extraction
# ---------------------------------------------------------------------------

COOKIE_DOMAINS: dict[str, dict[str, Any]] = {
    "x": {
        "domain": ".x.com",
        "cookies": ["auth_token", "ct0"],
        "mapping": {"auth_token": "AUTH_TOKEN", "ct0": "CT0"},
    },
    "truthsocial": {
        "domain": ".truthsocial.com",
        "cookies": ["_session_id"],
        "mapping": {"_session_id": "TRUTHSOCIAL_TOKEN"},
    },
}


def extract_browser_credentials(config: dict[str, Any]) -> dict[str, str]:
    """Extract auth cookies from local browsers.

    Default behavior (FROM_BROWSER unset): tries Firefox and Safari only.
    These read local files silently with no system dialogs.  Chrome is
    skipped because ``security find-generic-password`` triggers a macOS
    Keychain prompt that cannot be reliably suppressed.

    Set ``FROM_BROWSER=auto`` to also try Chrome (accepts the dialog),
    or ``FROM_BROWSER=off`` to disable extraction entirely.
    """
    from_browser = (config.get("FROM_BROWSER") or "").strip().lower()
    if from_browser == "off":
        return {}
    try:
        from . import cookie_extract
    except ImportError:
        return {}
    # Determine which browsers to try
    if from_browser in ("firefox", "chrome", "safari"):
        browsers = [from_browser]
    elif from_browser == "auto":
        browsers = ["firefox", "safari", "chrome"]
    else:
        # Default: silent browsers only (no Keychain dialog)
        browsers = ["firefox", "safari"]
    extracted: dict[str, str] = {}
    for _service, spec in COOKIE_DOMAINS.items():
        if all(config.get(env_key) for env_key in spec["mapping"].values()):
            continue
        for browser in browsers:
            try:
                cookies = cookie_extract.extract_cookies(browser, spec["domain"], spec["cookies"])
            except Exception:
                continue
            if cookies:
                for cookie_name, env_key in spec["mapping"].items():
                    if cookie_name in cookies and not config.get(env_key):
                        extracted[env_key] = cookies[cookie_name]
                break  # Found cookies for this service, stop trying browsers
    return extracted


def get_x_source_with_method(config: dict[str, Any]) -> tuple[str | None, str]:
    """Return (source, method) for X search, where method describes the auth origin."""
    if config.get("XAI_API_KEY"):
        return "xai", "xai"
    if config.get("AUTH_TOKEN") and config.get("CT0"):
        method = config.get("_AUTH_TOKEN_SOURCE", "env")
        return "bird", method
    # Fall back to xurl CLI (official X API v2, OAuth2, free developer app)
    from . import xurl_x
    if xurl_x.is_available():
        return "xurl", "oauth2"
    return None, "none"


def config_exists() -> bool:
    """Check if any configuration source exists."""
    if _find_project_env():
        return True
    if CONFIG_FILE:
        return CONFIG_FILE.exists()
    return False


def get_reddit_source(config: dict[str, Any]) -> str | None:
    """Determine which Reddit backend to use.

    Returns: 'scrapecreators' or None
    """
    if config.get('SCRAPECREATORS_API_KEY'):
        return 'scrapecreators'
    return None


def get_x_source(config: dict[str, Any]) -> str | None:
    """Determine the best available explicit X/Twitter source.

    Priority: explicit backend pin, then xAI, then Bird with explicit cookies.

    Browser-cookie probing is intentionally not used here. Automatic Keychain
    access causes popups during normal pipeline runs. Bird is only considered
    available when AUTH_TOKEN and CT0 are present explicitly.

    Args:
        config: Configuration dict from get_config()

    Returns:
        'bird' if Bird is installed and explicit cookies are configured,
        'xai' if XAI_API_KEY is configured,
        'xurl' if xurl CLI is installed and authenticated,
        None if no X source available.
    """
    # Import here to avoid circular dependency
    from . import bird_x

    preferred = (config.get('LAST30DAYS_X_BACKEND') or '').lower()
    has_bird_creds = bool(config.get('AUTH_TOKEN') and config.get('CT0'))
    if has_bird_creds:
        bird_x.set_credentials(config.get('AUTH_TOKEN'), config.get('CT0'))

    if preferred == 'xai':
        return 'xai' if config.get('XAI_API_KEY') else None
    if preferred == 'bird':
        return 'bird' if has_bird_creds and bird_x.is_bird_installed() else None

    if config.get('XAI_API_KEY'):
        return 'xai'
    if has_bird_creds and bird_x.is_bird_installed():
        return 'bird'

    # Fall back to xurl CLI (official X API v2, OAuth2, free developer app)
    from . import xurl_x
    if xurl_x.is_available():
        return 'xurl'

    return None


def is_ytdlp_available() -> bool:
    """Check if yt-dlp is installed for YouTube search."""
    from . import youtube_yt
    return youtube_yt.is_ytdlp_installed()


def is_youtube_comments_available(config: dict[str, Any]) -> bool:
    """Check if YouTube comment enrichment is available.

    Requires SCRAPECREATORS_API_KEY AND youtube_comments in INCLUDE_SOURCES.
    """
    if not config.get('SCRAPECREATORS_API_KEY'):
        return False
    include = _parse_include_sources(config)
    return 'youtube_comments' in include


def is_tiktok_comments_available(config: dict[str, Any]) -> bool:
    """Check if TikTok comment enrichment is available.

    Requires SCRAPECREATORS_API_KEY AND tiktok_comments in INCLUDE_SOURCES.
    Mirrors the youtube_comments opt-in pattern.
    """
    if not config.get('SCRAPECREATORS_API_KEY'):
        return False
    include = _parse_include_sources(config)
    return 'tiktok_comments' in include


def is_youtube_sc_available(config: dict[str, Any]) -> bool:
    """Check if ScrapeCreators YouTube search fallback is available.

    Used when yt-dlp is not installed or fails.
    """
    return bool(config.get('SCRAPECREATORS_API_KEY'))


def is_hackernews_available() -> bool:
    """Check if Hacker News source is available.

    Always returns True - HN uses free Algolia API, no key needed.
    """
    return True


def is_bluesky_available(config: dict[str, Any]) -> bool:
    """Check if Bluesky source is available.

    Requires BSKY_HANDLE and BSKY_APP_PASSWORD (app password from bsky.app/settings).
    """
    return bool(config.get('BSKY_HANDLE') and config.get('BSKY_APP_PASSWORD'))


def is_truthsocial_available(config: dict[str, Any]) -> bool:
    """Check if Truth Social source is available.

    Requires TRUTHSOCIAL_TOKEN (bearer token from browser dev tools).
    """
    return bool(config.get('TRUTHSOCIAL_TOKEN'))


def is_polymarket_available() -> bool:
    """Check if Polymarket source is available.

    Always returns True - Gamma API is free, no key needed.
    """
    return True


def is_tiktok_available(config: dict[str, Any]) -> bool:
    """Check if TikTok source is available (ScrapeCreators or legacy Apify).

    Returns True if SCRAPECREATORS_API_KEY or APIFY_API_TOKEN is set.
    """
    return bool(config.get('SCRAPECREATORS_API_KEY') or config.get('APIFY_API_TOKEN'))


def get_tiktok_token(config: dict[str, Any]) -> str:
    """Get TikTok API token, preferring ScrapeCreators over legacy Apify."""
    return config.get('SCRAPECREATORS_API_KEY') or config.get('APIFY_API_TOKEN') or ''


def _parse_include_sources(config: dict[str, Any]) -> set[str]:
    """Parse INCLUDE_SOURCES config value into a set of lowercase source names."""
    raw = config.get('INCLUDE_SOURCES') or ''
    return {s.strip().lower() for s in raw.split(',') if s.strip()}


def is_threads_available(config: dict[str, Any]) -> bool:
    """Check if Threads source is available.

    Requires SCRAPECREATORS_API_KEY AND 'threads' in INCLUDE_SOURCES.
    Threads is an opt-in source - it is not activated by default.
    """
    if not config.get('SCRAPECREATORS_API_KEY'):
        return False
    return 'threads' in _parse_include_sources(config)


def is_instagram_available(config: dict[str, Any]) -> bool:
    """Check if Instagram source is available (ScrapeCreators).

    Returns True if SCRAPECREATORS_API_KEY is set.
    Instagram uses the same key as TikTok.
    """
    return bool(config.get('SCRAPECREATORS_API_KEY'))


def get_instagram_token(config: dict[str, Any]) -> str:
    """Get Instagram API token (same ScrapeCreators key as TikTok)."""
    return config.get('SCRAPECREATORS_API_KEY') or ''


def get_xiaohongshu_api_base(config: dict[str, Any]) -> str:
    """Get Xiaohongshu HTTP API base URL.

    Defaults to host.docker.internal so OpenClaw Docker can reach host service.
    """
    return (config.get('XIAOHONGSHU_API_BASE') or "http://host.docker.internal:18060").rstrip("/")


def is_xiaohongshu_available(config: dict[str, Any]) -> bool:
    """Check whether Xiaohongshu HTTP API is reachable and logged in."""
    # Import here to avoid heavy imports at module load.
    from . import http

    base = get_xiaohongshu_api_base(config)
    try:
        # Keep health probe snappy, but allow one retry for transient hiccups.
        health = http.get(f"{base}/health", timeout=3, retries=2)
        if not isinstance(health, dict):
            return False
        if not health.get("success"):
            return False

        # Login probe can be slower on some deployments (browser/session checks),
        # so use a slightly longer timeout to avoid false negatives.
        login = http.get(f"{base}/api/v1/login/status", timeout=8, retries=2)
        is_logged_in = (
            login.get("data", {}).get("is_logged_in")
            if isinstance(login, dict) else False
        )
        return bool(is_logged_in)
    except (OSError, http.HTTPError):
        return False
    except Exception as exc:
        sys.stderr.write(
            f"[last30days] WARNING: unexpected error checking Xiaohongshu: "
            f"{type(exc).__name__}: {exc}\n"
        )
        sys.stderr.flush()
        return False


# Backward compat alias
is_apify_available = is_tiktok_available


def get_x_source_status(config: dict[str, Any]) -> dict[str, Any]:
    """Get detailed X source status for UI decisions.

    Returns:
        Dict with keys: source, bird_installed, bird_authenticated,
        bird_username, xai_available, can_install_bird
    """
    from . import bird_x

    if config.get('AUTH_TOKEN') and config.get('CT0'):
        bird_x.set_credentials(config.get('AUTH_TOKEN'), config.get('CT0'))
    bird_status = bird_x.get_bird_status()
    xai_available = bool(config.get('XAI_API_KEY'))

    # Determine active source
    if bird_status["authenticated"]:
        source = 'bird'
    elif xai_available:
        source = 'xai'
    else:
        # Fall back to xurl CLI
        from . import xurl_x as _xurl_check
        source = 'xurl' if _xurl_check.is_available() else None

    from . import xurl_x as _xurl_x
    return {
        "source": source,
        "bird_installed": bird_status["installed"],
        "bird_authenticated": bird_status["authenticated"],
        "bird_username": bird_status["username"],
        "xai_available": xai_available,
        "xurl_available": _xurl_x.is_available(),
        "can_install_bird": bird_status["can_install"],
    }


# Pinterest
def is_pinterest_available(config: dict[str, Any]) -> bool:
    """Check if Pinterest source is available.

    Returns True when SCRAPECREATORS_API_KEY is set AND 'pinterest' is in
    INCLUDE_SOURCES (or requested_sources at the pipeline level).  Pinterest
    is opt-in because not every topic benefits from visual pin results.
    """
    return bool(config.get('SCRAPECREATORS_API_KEY'))


def get_pinterest_token(config: dict[str, Any]) -> str:
    """Get Pinterest API token (same ScrapeCreators key as TikTok/Instagram)."""
    return config.get('SCRAPECREATORS_API_KEY') or ''


# Xquik
def is_xquik_available(config: dict[str, Any]) -> bool:
    """Check if Xquik X search source is available.

    Requires XQUIK_API_KEY (API key from xquik.com).
    """
    return bool(config.get('XQUIK_API_KEY'))


def get_xquik_token(config: dict[str, Any]) -> str:
    """Get Xquik API key."""
    return config.get('XQUIK_API_KEY') or ''
