"""Terminal UI utilities for last30days skill."""

import sys
import time
import threading
import random
from typing import Optional

# Check if we're in a real terminal (not captured by Claude Code)
IS_TTY = sys.stderr.isatty()

# ANSI color codes
class Colors:
    PURPLE = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    RESET = '\033[0m'


BANNER = f"""{Colors.PURPLE}{Colors.BOLD}
  ██╗      █████╗ ███████╗████████╗██████╗  ██████╗ ██████╗  █████╗ ██╗   ██╗███████╗
  ██║     ██╔══██╗██╔════╝╚══██╔══╝╚════██╗██╔═████╗██╔══██╗██╔══██╗╚██╗ ██╔╝██╔════╝
  ██║     ███████║███████╗   ██║    █████╔╝██║██╔██║██║  ██║███████║ ╚████╔╝ ███████╗
  ██║     ██╔══██║╚════██║   ██║    ╚═══██╗████╔╝██║██║  ██║██╔══██║  ╚██╔╝  ╚════██║
  ███████╗██║  ██║███████║   ██║   ██████╔╝╚██████╔╝██████╔╝██║  ██║   ██║   ███████║
  ╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝
{Colors.RESET}{Colors.DIM}  30 days of research. 30 seconds of work.{Colors.RESET}
"""

MINI_BANNER = f"""{Colors.PURPLE}{Colors.BOLD}/last30days{Colors.RESET} {Colors.DIM}· researching...{Colors.RESET}"""

# Fun status messages for each phase
REDDIT_MESSAGES = [
    "Diving into Reddit threads...",
    "Scanning subreddits for gold...",
    "Reading what Redditors are saying...",
    "Exploring the front page of the internet...",
    "Finding the good discussions...",
    "Upvoting mentally...",
    "Scrolling through comments...",
]

X_MESSAGES = [
    "Checking what X is buzzing about...",
    "Reading the timeline...",
    "Finding the hot takes...",
    "Scanning tweets and threads...",
    "Discovering trending insights...",
    "Following the conversation...",
    "Reading between the posts...",
]

ENRICHING_MESSAGES = [
    "Getting the juicy details...",
    "Fetching engagement metrics...",
    "Reading top comments...",
    "Extracting insights...",
    "Analyzing discussions...",
]

YOUTUBE_MESSAGES = [
    "Searching YouTube for videos...",
    "Finding relevant video content...",
    "Scanning YouTube channels...",
    "Discovering video discussions...",
    "Fetching transcripts...",
]

TIKTOK_MESSAGES = [
    "Searching TikTok for trending videos...",
    "Finding what's viral on TikTok...",
    "Scanning TikTok for relevant content...",
]

INSTAGRAM_MESSAGES = [
    "Searching Instagram Reels...",
    "Finding what's trending on Instagram...",
    "Scanning Instagram for relevant reels...",
]

HN_MESSAGES = [
    "Searching Hacker News...",
    "Scanning HN front page stories...",
    "Finding technical discussions...",
    "Discovering developer conversations...",
]

POLYMARKET_MESSAGES = [
    "Checking prediction markets...",
    "Finding what people are betting on...",
    "Scanning Polymarket for odds...",
    "Discovering prediction markets...",
]

PROCESSING_MESSAGES = [
    "Crunching the data...",
    "Scoring and ranking...",
    "Finding patterns...",
    "Removing duplicates...",
    "Organizing findings...",
]

WEB_ONLY_MESSAGES = [
    "Searching the web...",
    "Finding blogs and docs...",
    "Crawling news sites...",
    "Discovering tutorials...",
]

SOURCE_COMPLETION_ORDER = [
    "reddit",
    "x",
    "youtube",
    "tiktok",
    "instagram",
    "hackernews",
    "bluesky",
    "truthsocial",
    "polymarket",
    "grounding",
    "xiaohongshu",
]

SOURCE_COMPLETION_META = {
    "reddit": ("Reddit", "thread", "threads", Colors.YELLOW),
    "x": ("X", "post", "posts", Colors.CYAN),
    "youtube": ("YouTube", "video", "videos", Colors.RED),
    "tiktok": ("TikTok", "video", "videos", Colors.PURPLE),
    "instagram": ("Instagram", "reel", "reels", Colors.PURPLE),
    "hackernews": ("HN", "story", "stories", Colors.YELLOW),
    "bluesky": ("Bluesky", "post", "posts", Colors.BLUE),
    "truthsocial": ("Truth Social", "post", "posts", Colors.CYAN),
    "polymarket": ("Polymarket", "market", "markets", Colors.GREEN),
    "grounding": ("Web", "result", "results", Colors.GREEN),
    "xiaohongshu": ("Xiaohongshu", "post", "posts", Colors.RED),
}


def _completion_sources(source_counts: dict[str, int], display_sources: list[str] | None) -> list[str]:
    requested = list(dict.fromkeys(display_sources or []))
    if not requested:
        requested = [source for source, count in source_counts.items() if count]
    if not requested and source_counts:
        requested = list(source_counts)

    candidate_set = set(requested) | set(source_counts)
    ordered = [source for source in SOURCE_COMPLETION_ORDER if source in candidate_set]
    for source in requested + list(source_counts):
        if source in candidate_set and source not in ordered:
            ordered.append(source)
    return ordered


def _format_completion_part(source: str, count: int, tty: bool) -> str:
    label, singular, plural, color = SOURCE_COMPLETION_META.get(
        source,
        (source.replace("_", " ").title(), "result", "results", Colors.RESET),
    )
    unit = singular if count == 1 else plural
    if tty:
        return f"{color}{label}:{Colors.RESET} {count} {unit}"
    return f"{label}: {count} {unit}"

def _build_nux_message(diag: dict = None) -> str:
    """Build conversational NUX message with dynamic source status."""
    available = set((diag or {}).get("available_sources", []))
    if diag:
        reddit = "✓" if "reddit" in available else "✗"
        x = "✓" if "x" in available else "✗"
        youtube = "✓" if "youtube" in available else "✗"
        web = "✓" if "grounding" in available else "✗"
        status_line = f"Reddit {reddit}, X {x}, YouTube {youtube}, Web {web}"
    else:
        status_line = "YouTube ✓, Web ✓, Reddit ✗, X ✗"

    return f"""
I just researched that for you. Here's what I've got right now:

{status_line}

More sources means better research, but it works fine as-is. You can unlock more for free - log into x.com in your browser for X, and run `brew install yt-dlp` for YouTube transcripts. That gives you Reddit (with comments), X, YouTube, HN, and Polymarket - all free.

Some examples of what you can do:
- "last30 what are people saying about Figma"
- "last30 watch my biggest competitor every week"
- "last30 watch AI video tools monthly"
- "last30 what have you found about AI video?"

Just start with "last30" and talk to me like normal.
"""

# Shorter promo for single missing key
PROMO_SINGLE_KEY = {
    "reddit": "\n💡 Unlock TikTok and Instagram with SCRAPECREATORS_API_KEY - 10,000 free calls, no CC - scrapecreators.com\n",
    "x": "\n💡 Unlock X: log into x.com in Firefox or Safari, then re-run. Or add AUTH_TOKEN/CT0 or XAI_API_KEY.\n",
    "web": "\n💡 You can unlock native grounded web search with BRAVE_API_KEY or SERPER_API_KEY.\n",
}

# Bird auth help (for local users with vendored Bird CLI)
BIRD_AUTH_HELP = f"""
{Colors.YELLOW}Bird authentication failed.{Colors.RESET}

To fix this:
1. Add AUTH_TOKEN and CT0 to ~/.config/last30days/.env or .claude/last30days.env
2. Or set XAI_API_KEY for the xAI fallback backend
"""

BIRD_AUTH_HELP_PLAIN = """
Bird authentication failed.

To fix this:
1. Add AUTH_TOKEN and CT0 to ~/.config/last30days/.env or .claude/last30days.env
2. Or set XAI_API_KEY for the xAI fallback backend
"""

# Spinner frames
SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
DOTS_FRAMES = ['   ', '.  ', '.. ', '...']


class Spinner:
    """Animated spinner for long-running operations."""

    def __init__(self, message: str = "Working", color: str = Colors.CYAN, quiet: bool = False):
        self.message = message
        self.color = color
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.frame_idx = 0
        self.shown_static = False
        self.quiet = quiet  # Suppress non-TTY start message (still shows ✓ completion)

    def _spin(self):
        while self.running:
            frame = SPINNER_FRAMES[self.frame_idx % len(SPINNER_FRAMES)]
            sys.stderr.write(f"\r{self.color}{frame}{Colors.RESET} {self.message}  ")
            sys.stderr.flush()
            self.frame_idx += 1
            time.sleep(0.08)

    def start(self):
        self.running = True
        if IS_TTY:
            # Real terminal - animate
            self.thread = threading.Thread(target=self._spin, daemon=True)
            self.thread.start()
        else:
            # Not a TTY (Claude Code) - just print once
            if not self.shown_static and not self.quiet:
                sys.stderr.write(f"⏳ {self.message}\n")
                sys.stderr.flush()
                self.shown_static = True

    def update(self, message: str):
        self.message = message
        if not IS_TTY and not self.shown_static:
            # Print update in non-TTY mode
            sys.stderr.write(f"⏳ {message}\n")
            sys.stderr.flush()

    def stop(self, final_message: str = ""):
        self.running = False
        if self.thread:
            self.thread.join(timeout=0.2)
        if IS_TTY:
            # Clear the line in real terminal
            sys.stderr.write("\r" + " " * 80 + "\r")
        if final_message:
            sys.stderr.write(f"✓ {final_message}\n")
        sys.stderr.flush()


class ProgressDisplay:
    """Progress display for research phases."""

    def __init__(self, topic: str, show_banner: bool = True):
        self.topic = topic
        self.spinner: Optional[Spinner] = None
        self.start_time = time.time()

        if show_banner:
            self._show_banner()

    def _show_banner(self):
        if IS_TTY:
            sys.stderr.write(MINI_BANNER + "\n")
            sys.stderr.write(f"{Colors.DIM}Topic: {Colors.RESET}{Colors.BOLD}{self.topic}{Colors.RESET}\n\n")
        else:
            # Simple text for non-TTY
            sys.stderr.write(f"/last30days · researching: {self.topic}\n")
        sys.stderr.flush()

    def start_reddit(self):
        msg = random.choice(REDDIT_MESSAGES)
        self.spinner = Spinner(f"{Colors.YELLOW}Reddit{Colors.RESET} {msg}", Colors.YELLOW)
        self.spinner.start()

    def end_reddit(self, count: int):
        if self.spinner:
            self.spinner.stop(f"{Colors.YELLOW}Reddit{Colors.RESET} Found {count} threads")

    def start_reddit_enrich(self, current: int, total: int):
        if self.spinner:
            self.spinner.stop()
        msg = random.choice(ENRICHING_MESSAGES)
        self.spinner = Spinner(f"{Colors.YELLOW}Reddit{Colors.RESET} [{current}/{total}] {msg}", Colors.YELLOW)
        self.spinner.start()

    def update_reddit_enrich(self, current: int, total: int):
        if self.spinner:
            msg = random.choice(ENRICHING_MESSAGES)
            self.spinner.update(f"{Colors.YELLOW}Reddit{Colors.RESET} [{current}/{total}] {msg}")

    def end_reddit_enrich(self):
        if self.spinner:
            self.spinner.stop(f"{Colors.YELLOW}Reddit{Colors.RESET} Enriched with engagement data")

    def start_x(self):
        msg = random.choice(X_MESSAGES)
        self.spinner = Spinner(f"{Colors.CYAN}X{Colors.RESET} {msg}", Colors.CYAN)
        self.spinner.start()

    def end_x(self, count: int):
        if self.spinner:
            self.spinner.stop(f"{Colors.CYAN}X{Colors.RESET} Found {count} posts")

    def start_youtube(self):
        msg = random.choice(YOUTUBE_MESSAGES)
        self.spinner = Spinner(f"{Colors.RED}YouTube{Colors.RESET} {msg}", Colors.RED)
        self.spinner.start()

    def end_youtube(self, count: int):
        if self.spinner:
            self.spinner.stop(f"{Colors.RED}YouTube{Colors.RESET} Found {count} videos")

    def start_tiktok(self):
        msg = random.choice(TIKTOK_MESSAGES)
        self.spinner = Spinner(f"{Colors.PURPLE}TikTok{Colors.RESET} {msg}", Colors.PURPLE)
        self.spinner.start()

    def end_tiktok(self, count: int):
        if self.spinner:
            self.spinner.stop(f"{Colors.PURPLE}TikTok{Colors.RESET} Found {count} videos")

    def start_instagram(self):
        msg = random.choice(INSTAGRAM_MESSAGES)
        self.spinner = Spinner(f"{Colors.PURPLE}Instagram{Colors.RESET} {msg}", Colors.PURPLE)
        self.spinner.start()

    def end_instagram(self, count: int):
        if self.spinner:
            self.spinner.stop(f"{Colors.PURPLE}Instagram{Colors.RESET} Found {count} reels")

    def start_hackernews(self):
        msg = random.choice(HN_MESSAGES)
        self.spinner = Spinner(f"{Colors.YELLOW}HN{Colors.RESET} {msg}", Colors.YELLOW, quiet=True)
        self.spinner.start()

    def end_hackernews(self, count: int):
        if self.spinner:
            self.spinner.stop(f"{Colors.YELLOW}HN{Colors.RESET} Found {count} stories")

    def start_polymarket(self):
        msg = random.choice(POLYMARKET_MESSAGES)
        self.spinner = Spinner(f"{Colors.GREEN}Polymarket{Colors.RESET} {msg}", Colors.GREEN, quiet=True)
        self.spinner.start()

    def end_polymarket(self, count: int):
        if self.spinner:
            self.spinner.stop(f"{Colors.GREEN}Polymarket{Colors.RESET} Found {count} markets")

    def start_processing(self):
        msg = random.choice(PROCESSING_MESSAGES)
        self.spinner = Spinner(f"{Colors.PURPLE}Processing{Colors.RESET} {msg}", Colors.PURPLE)
        self.spinner.start()

    def end_processing(self):
        if self.spinner:
            self.spinner.stop()

    def show_complete(
        self,
        reddit_count: int = 0,
        x_count: int = 0,
        youtube_count: int = 0,
        hn_count: int = 0,
        pm_count: int = 0,
        tiktok_count: int = 0,
        ig_count: int = 0,
        *,
        source_counts: dict[str, int] | None = None,
        display_sources: list[str] | None = None,
    ):
        elapsed = time.time() - self.start_time
        if source_counts is None:
            source_counts = {
                "reddit": reddit_count,
                "x": x_count,
                "youtube": youtube_count,
                "tiktok": tiktok_count,
                "instagram": ig_count,
                "hackernews": hn_count,
                "polymarket": pm_count,
            }
            if display_sources is None:
                display_sources = [source for source, count in source_counts.items() if count]
                if not display_sources:
                    display_sources = ["reddit", "x"]

        ordered_sources = _completion_sources(source_counts, display_sources)
        parts = [
            _format_completion_part(source, source_counts.get(source, 0), tty=IS_TTY)
            for source in ordered_sources
        ]
        if IS_TTY:
            sys.stderr.write(f"\n{Colors.GREEN}{Colors.BOLD}✓ Research complete{Colors.RESET} ")
            sys.stderr.write(f"{Colors.DIM}({elapsed:.1f}s){Colors.RESET}\n")
            sys.stderr.write("  " + "  ".join(parts))
            sys.stderr.write("\n\n")
        else:
            sys.stderr.write(f"✓ Research complete ({elapsed:.1f}s) - {', '.join(parts)}\n")
        sys.stderr.flush()

    def show_cached(self, age_hours: float = None):
        if age_hours is not None:
            age_str = f" ({age_hours:.1f}h old)"
        else:
            age_str = ""
        sys.stderr.write(f"{Colors.GREEN}⚡{Colors.RESET} {Colors.DIM}Using cached results{age_str} - use --refresh for fresh data{Colors.RESET}\n\n")
        sys.stderr.flush()

    def show_error(self, message: str):
        sys.stderr.write(f"{Colors.RED}✗ Error:{Colors.RESET} {message}\n")
        sys.stderr.flush()

    def start_web_only(self):
        """Show web-only mode indicator."""
        msg = random.choice(WEB_ONLY_MESSAGES)
        self.spinner = Spinner(f"{Colors.GREEN}Web{Colors.RESET} {msg}", Colors.GREEN)
        self.spinner.start()

    def end_web_only(self):
        """End web-only spinner."""
        if self.spinner:
            self.spinner.stop(f"{Colors.GREEN}Web{Colors.RESET} assistant will search the web")

    def show_web_only_complete(self):
        """Show completion for web-only mode."""
        elapsed = time.time() - self.start_time
        if IS_TTY:
            sys.stderr.write(f"\n{Colors.GREEN}{Colors.BOLD}✓ Ready for web search{Colors.RESET} ")
            sys.stderr.write(f"{Colors.DIM}({elapsed:.1f}s){Colors.RESET}\n")
            sys.stderr.write(f"  {Colors.GREEN}Web:{Colors.RESET} assistant will search blogs, docs & news\n\n")
        else:
            sys.stderr.write(f"✓ Ready for web search ({elapsed:.1f}s)\n")
        sys.stderr.flush()

    def show_promo(self, missing: str = "both", diag: dict = None):
        """Show NUX / promotional message for missing API keys.

        Args:
            missing: 'both', 'all', 'reddit', or 'x' - which keys are missing
            diag: Optional diagnostics dict for dynamic source status
        """
        if missing in ("both", "all"):
            sys.stderr.write(_build_nux_message(diag))
        elif missing in PROMO_SINGLE_KEY:
            sys.stderr.write(PROMO_SINGLE_KEY[missing])
        sys.stderr.flush()

    def show_bird_auth_help(self):
        """Show Bird authentication help."""
        if IS_TTY:
            sys.stderr.write(BIRD_AUTH_HELP)
        else:
            sys.stderr.write(BIRD_AUTH_HELP_PLAIN)
        sys.stderr.flush()


def show_diagnostic_banner(diag: dict):
    """Show pre-flight source status banner when sources are missing.

    Args:
        diag: Dict from pipeline.diagnose() with available_sources, x_backend,
            bird status, provider availability, and native web backend info.
    """
    available_sources = set(diag.get("available_sources") or [])
    has_reddit = "reddit" in available_sources
    has_scrapecreators = diag.get("has_scrapecreators", False)
    has_x = "x" in available_sources
    has_youtube = "youtube" in available_sources
    has_web = "grounding" in available_sources
    has_xiaohongshu = "xiaohongshu" in available_sources
    x_backend = diag.get("x_backend")
    native_web_backend = diag.get("native_web_backend")

    # If everything is available, no banner needed
    if has_reddit and has_x and has_youtube and has_web:
        return

    lines = []

    if IS_TTY:
        lines.append(f"{Colors.DIM}┌─────────────────────────────────────────────────────┐{Colors.RESET}")
        lines.append(f"{Colors.DIM}│{Colors.RESET} {Colors.BOLD}/last30days v3.0.0 - Source Status{Colors.RESET}                 {Colors.DIM}│{Colors.RESET}")
        lines.append(f"{Colors.DIM}│{Colors.RESET}                                                     {Colors.DIM}│{Colors.RESET}")

        # Reddit
        if has_reddit and has_scrapecreators:
            lines.append(f"{Colors.DIM}│{Colors.RESET}  {Colors.GREEN}✅ Reddit{Colors.RESET}    — full threads with comments          {Colors.DIM}│{Colors.RESET}")
        elif has_reddit:
            lines.append(f"{Colors.DIM}│{Colors.RESET}  {Colors.GREEN}✅ Reddit{Colors.RESET}    — public threads (titles + scores)   {Colors.DIM}│{Colors.RESET}")
        else:
            lines.append(f"{Colors.DIM}│{Colors.RESET}  {Colors.RED}❌ Reddit{Colors.RESET}    — unavailable                         {Colors.DIM}│{Colors.RESET}")

        # X/Twitter
        if has_x:
            username = diag.get("bird_username", "")
            label = f"Bird ({username})" if x_backend == "bird" and username else str(x_backend or "xai").upper()
            lines.append(f"{Colors.DIM}│{Colors.RESET}  {Colors.GREEN}✅ X/Twitter{Colors.RESET} — {label}                          {Colors.DIM}│{Colors.RESET}")
        else:
            lines.append(f"{Colors.DIM}│{Colors.RESET}  {Colors.RED}❌ X/Twitter{Colors.RESET} — No X auth or fallback key        {Colors.DIM}│{Colors.RESET}")
            if diag.get("bird_installed"):
                lines.append(f"{Colors.DIM}│{Colors.RESET}     └─ Add AUTH_TOKEN/CT0 or XAI_API_KEY      {Colors.DIM}│{Colors.RESET}")
            else:
                lines.append(f"{Colors.DIM}│{Colors.RESET}     └─ Needs Node.js 22+ (Bird is bundled)           {Colors.DIM}│{Colors.RESET}")

        # YouTube
        if has_youtube:
            lines.append(f"{Colors.DIM}│{Colors.RESET}  {Colors.GREEN}✅ YouTube{Colors.RESET}   — yt-dlp found                      {Colors.DIM}│{Colors.RESET}")
        else:
            lines.append(f"{Colors.DIM}│{Colors.RESET}  {Colors.RED}❌ YouTube{Colors.RESET}   — yt-dlp not installed                {Colors.DIM}│{Colors.RESET}")
            lines.append(f"{Colors.DIM}│{Colors.RESET}     └─ Fix: brew install yt-dlp (free)                {Colors.DIM}│{Colors.RESET}")

        # Xiaohongshu (only show when configured)
        if has_xiaohongshu:
            lines.append(f"{Colors.DIM}│{Colors.RESET}  {Colors.GREEN}✅ Xiaohongshu{Colors.RESET} — API connected + logged in         {Colors.DIM}│{Colors.RESET}")

        # Web
        if has_web:
            backend = native_web_backend or "native"
            lines.append(f"{Colors.DIM}│{Colors.RESET}  {Colors.GREEN}✅ Web{Colors.RESET}       — {backend} API                       {Colors.DIM}│{Colors.RESET}")
        else:
            lines.append(f"{Colors.DIM}│{Colors.RESET}  {Colors.YELLOW}⚡ Web{Colors.RESET}       — Add BRAVE_API_KEY or SERPER_API_KEY {Colors.DIM}│{Colors.RESET}")

        lines.append(f"{Colors.DIM}│{Colors.RESET}                                                     {Colors.DIM}│{Colors.RESET}")
        lines.append(f"{Colors.DIM}│{Colors.RESET}  Config: {Colors.BOLD}~/.config/last30days/.env{Colors.RESET}                  {Colors.DIM}│{Colors.RESET}")
        lines.append(f"{Colors.DIM}└─────────────────────────────────────────────────────┘{Colors.RESET}")
    else:
        # Plain text for non-TTY (Claude Code / Codex)
        lines.append("┌─────────────────────────────────────────────────────┐")
        lines.append("│ /last30days v3.0.0 - Source Status                 │")
        lines.append("│                                                     │")

        if has_reddit and has_scrapecreators:
            lines.append("│  ✅ Reddit    — full threads with comments          │")
        elif has_reddit:
            lines.append("│  ✅ Reddit    — public threads (titles + scores)   │")
        else:
            lines.append("│  ❌ Reddit    — unavailable                         │")

        if has_x:
            lines.append("│  ✅ X/Twitter — available                            │")
        else:
            lines.append("│  ❌ X/Twitter — No X auth or fallback key          │")
            if diag.get("bird_installed"):
                lines.append("│     └─ Add AUTH_TOKEN/CT0 or XAI_API_KEY           │")
            else:
                lines.append("│     └─ Needs Node.js 22+ (Bird is bundled)           │")

        if has_youtube:
            lines.append("│  ✅ YouTube   — yt-dlp found                        │")
        else:
            lines.append("│  ❌ YouTube   — yt-dlp not installed                │")
            lines.append("│     └─ Fix: brew install yt-dlp (free)                │")

        if has_xiaohongshu:
            lines.append("│  ✅ Xiaohongshu — API connected + logged in         │")

        if has_web:
            backend = native_web_backend or "native"
            lines.append(f"│  ✅ Web       — {backend} API available{' ' * max(0, 13 - len(backend))}│")
        else:
            lines.append("│  ⚡ Web       — Add BRAVE_API_KEY or SERPER_API_KEY │")

        lines.append("│                                                     │")
        lines.append("│  Config: ~/.config/last30days/.env                  │")
        lines.append("└─────────────────────────────────────────────────────┘")

    sys.stderr.write("\n".join(lines) + "\n\n")
    sys.stderr.flush()


def print_phase(phase: str, message: str):
    """Print a phase message."""
    colors = {
        "reddit": Colors.YELLOW,
        "x": Colors.CYAN,
        "process": Colors.PURPLE,
        "done": Colors.GREEN,
        "error": Colors.RED,
    }
    color = colors.get(phase, Colors.RESET)
    sys.stderr.write(f"{color}▸{Colors.RESET} {message}\n")
    sys.stderr.flush()
