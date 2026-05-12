"""YouTube search and transcript extraction via yt-dlp for the v3.0.0 pipeline.

Uses yt-dlp (https://github.com/yt-dlp/yt-dlp) for both YouTube search and
transcript extraction. No API keys needed — just have yt-dlp installed.

Inspired by Peter Steinberger's toolchain approach (yt-dlp + summarize CLI).
"""

import json
import math
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Depth configurations: how many videos to search / transcribe
DEPTH_CONFIG = {
    "quick": 6,
    "default": 8,
    "deep": 40,
}

TRANSCRIPT_LIMITS = {
    "quick": 0,
    "default": 2,
    "deep": 8,
}

# Max words to keep from each transcript
TRANSCRIPT_MAX_WORDS = 5000

from . import http, log, subproc
from .relevance import token_overlap_relevance as _compute_relevance


def extract_transcript_highlights(transcript: str, topic: str, limit: int = 5) -> list[str]:
    """Extract quotable highlights from a YouTube transcript.

    Filters filler (subscribe, welcome back, etc.), scores sentences by
    specificity (numbers, proper nouns, topic relevance), and returns
    the top highlights.
    """
    if not transcript:
        return []

    sentences = re.split(r'(?<=[.!?])\s+', transcript)

    # Fallback for punctuation-free transcripts (common with auto-captions):
    # chunk into ~20-word segments so they pass the 8-50 word filter.
    if len(sentences) <= 1 and len(transcript.split()) > 50:
        words = transcript.split()
        sentences = [' '.join(words[i:i+20]) for i in range(0, len(words), 20)]

    filler = [
        r"^(hey |hi |what's up|welcome back|in today's video|don't forget to)",
        r"(subscribe|like and comment|hit the bell|check out the link|down below)",
        r"^(so |and |but |okay |alright |um |uh )",
        r"(thanks for watching|see you (next|in the)|bye)",
    ]

    topic_words = [w.lower() for w in topic.lower().split() if len(w) > 2]

    candidates = []
    for sent in sentences:
        sent = sent.strip()
        words = sent.split()
        if len(words) < 8 or len(words) > 50:
            continue
        if any(re.search(p, sent, re.IGNORECASE) for p in filler):
            continue

        score = 0
        if re.search(r'\d', sent):
            score += 2
        if re.search(r'[A-Z][a-z]+', sent):
            score += 1
        if '?' in sent:
            score += 1
        sent_lower = sent.lower()
        if any(w in sent_lower for w in topic_words):
            score += 2

        candidates.append((score, sent))

    candidates.sort(key=lambda x: -x[0])
    return [sent for _, sent in candidates[:limit]]


def _log(msg: str):
    log.source_log("YouTube", msg, tty_only=False)


def is_ytdlp_installed() -> bool:
    """Check if yt-dlp is available in PATH."""
    return shutil.which("yt-dlp") is not None


def _extract_core_subject(topic: str) -> str:
    """Extract core subject from verbose query for YouTube search.

    NOTE: 'tips', 'tricks', 'tutorial', 'guide', 'review', 'reviews'
    are intentionally KEPT — they're YouTube content types that improve search.
    """
    from .query import extract_core_subject
    # YouTube-specific noise set: smaller than default, keeps content-type words
    _YT_NOISE = frozenset({
        'best', 'top', 'good', 'great', 'awesome', 'killer',
        'latest', 'new', 'news', 'update', 'updates',
        'trending', 'hottest', 'popular', 'viral',
        'practices', 'features',
        'recommendations', 'advice',
        'prompt', 'prompts', 'prompting',
        'methods', 'strategies', 'approaches',
        # Temporal/meta words — planner generates these but they don't
        # appear in YouTube titles, so strip them for better search.
        'last', 'days', 'recent', 'recently', 'month', 'week',
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december',
        '2025', '2026', '2027',
        'music', 'public', 'appearances', 'developments', 'discussions', 'coverage',
    })
    return extract_core_subject(topic, noise=_YT_NOISE)


def _infer_query_intent(topic: str) -> str:
    """Tiny local intent classifier for YouTube query expansion."""
    text = topic.lower().strip()
    if re.search(r"\b(vs|versus|compare|difference between)\b", text):
        return "comparison"
    if re.search(r"\b(how to|tutorial|guide|setup|step by step|deploy|install|configure|troubleshoot|error|fix|debug)\b", text):
        return "how_to"
    if re.search(r"\b(thoughts on|worth it|should i|opinion|review)\b", text):
        return "opinion"
    if re.search(r"\b(pricing|feature|features|best .* for)\b", text):
        return "product"
    return "breaking_news"


def expand_youtube_queries(topic: str, depth: str) -> List[str]:
    """Generate multiple YouTube search queries from a topic.

    Mirrors reddit.py's expand_reddit_queries() pattern:
    1. Extract core subject (strip noise words)
    2. Include original topic if different from core
    3. Add intent-specific OR-joined content-type variants
    4. Cap by depth: 1 for quick, 2 for default, 3 for deep

    Returns 1-3 query strings depending on depth.
    """
    core = _extract_core_subject(topic)
    queries = [core]

    # Include cleaned original topic as variant if different from core
    original_clean = topic.strip().rstrip('?!.')
    if core.lower() != original_clean.lower() and len(original_clean.split()) <= 8:
        queries.append(original_clean)

    qtype = _infer_query_intent(topic)

    # Intent-specific YouTube content-type variants
    if qtype == "opinion":
        queries.append(f"{core} review OR reaction OR breakdown")
    elif qtype == "product":
        queries.append(f"{core} review OR comparison OR unboxing")
    elif qtype == "comparison":
        queries.append(f"{core} vs OR compared OR head to head")
    elif qtype == "how_to":
        queries.append(f"{core} tutorial OR guide OR explained")
    else:
        # breaking_news / general — YouTube content types
        queries.append(f"{core} review OR reaction OR breakdown")

    # Deep depth: add full-length content variant
    if depth == "deep":
        queries.append(f"{core} full OR complete OR official")

    # Cap by depth budget
    caps = {"quick": 1, "default": 2, "deep": 3}
    cap = caps.get(depth, 2)
    return queries[:cap]


def search_youtube(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
) -> Dict[str, Any]:
    """Search YouTube via yt-dlp. No API key needed.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: 'quick', 'default', or 'deep'

    Returns:
        Dict with 'items' list of video metadata dicts.
    """
    if not is_ytdlp_installed():
        return {"items": [], "error": "yt-dlp not installed"}

    count = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    core_topic = _extract_core_subject(topic)

    _log(f"Searching YouTube for '{core_topic}' (since {from_date}, count={count})")

    # yt-dlp search with full metadata (no --flat-playlist so dates are real).
    # NOTE: --dateafter intentionally omitted — YouTube search returns
    # relevance-sorted results and strict date filtering returns 0 for
    # evergreen topics. Python soft filter (below) handles date filtering.
    cmd = [
        "yt-dlp",
        "--ignore-config",
        "--no-cookies-from-browser",
        f"ytsearch{count}:{core_topic}",
        "--dump-json",
        "--no-warnings",
        "--no-download",
    ]

    try:
        result = subproc.run_with_timeout(cmd, timeout=120)
    except subproc.SubprocTimeout:
        _log("YouTube search timed out (120s)")
        return {"items": [], "error": "Search timed out"}
    except FileNotFoundError:
        return {"items": [], "error": "yt-dlp not found"}

    stdout = result.stdout
    if not stdout.strip():
        _log("YouTube search returned 0 results")
        return {"items": []}

    # Parse JSON-per-line output
    items = []
    for line in stdout.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            video = json.loads(line)
        except json.JSONDecodeError:
            continue

        video_id = video.get("id", "")
        view_count = video.get("view_count") if video.get("view_count") is not None else 0
        like_count = video.get("like_count") if video.get("like_count") is not None else 0
        comment_count = video.get("comment_count") if video.get("comment_count") is not None else 0
        upload_date = video.get("upload_date", "")  # YYYYMMDD

        # Convert YYYYMMDD to YYYY-MM-DD
        date_str = None
        if upload_date and len(upload_date) == 8:
            date_str = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"

        description = str(video.get("description", ""))[:500]
        items.append({
            "video_id": video_id,
            "title": video.get("title", ""),
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "channel_name": video.get("channel", video.get("uploader", "")),
            "date": date_str,
            "engagement": {
                "views": view_count,
                "likes": like_count,
                "comments": comment_count,
            },
            "duration": video.get("duration"),
            "relevance": _compute_relevance(core_topic, f"{video.get('title', '')} {description}"),
            "why_relevant": f"YouTube: {video.get('title', core_topic)[:60]}",
            "description": description,
        })

    # Soft date filter: prefer recent items but fall back to all if too few
    recent = [i for i in items if i["date"] and i["date"] >= from_date]
    if len(recent) >= 3:
        items = recent
        _log(f"Found {len(items)} videos within date range")
    else:
        _log(f"Found {len(items)} videos ({len(recent)} within date range, keeping all)")

    # Sort by views descending
    items.sort(key=lambda x: x["engagement"]["views"], reverse=True)

    return {"items": items}


def _clean_vtt(vtt_text: str) -> str:
    """Convert VTT subtitle format to clean plaintext."""
    # Strip VTT header
    text = re.sub(r'^WEBVTT.*?\n\n', '', vtt_text, flags=re.DOTALL)
    # Strip timestamps
    text = re.sub(r'\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}.*\n', '', text)
    # Strip position/alignment tags
    text = re.sub(r'<[^>]+>', '', text)
    # Strip cue numbers
    text = re.sub(r'^\d+\s*$', '', text, flags=re.MULTILINE)
    # Deduplicate overlapping lines
    lines = text.strip().split('\n')
    seen = set()
    unique = []
    for line in lines:
        stripped = line.strip()
        if stripped and stripped not in seen:
            seen.add(stripped)
            unique.append(stripped)
    return re.sub(r'\s+', ' ', ' '.join(unique)).strip()


_YT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"


def _fetch_transcript_direct(video_id: str, timeout: int = 30) -> Optional[str]:
    """Fetch YouTube transcript via direct HTTP without yt-dlp.

    Scrapes the watch page HTML for the captions track URL in
    ytInitialPlayerResponse, then fetches the VTT subtitle file.

    Args:
        video_id: YouTube video ID
        timeout: HTTP request timeout in seconds

    Returns:
        Raw VTT text, or None if captions are unavailable.
    """
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    headers = {
        "User-Agent": _YT_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
    }

    # Step 1: Fetch the watch page HTML
    req = urllib.request.Request(watch_url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError) as exc:
        _log(f"Direct transcript: failed to fetch watch page for {video_id}: {exc}")
        return None

    # Step 2: Extract captions URL from ytInitialPlayerResponse
    # YouTube embeds this as a JS variable in the page HTML
    match = re.search(
        r'ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;(?:\s*var\s|\s*<\/script>)',
        html,
    )
    if not match:
        # Fallback: try the JSON embedded in the script tag
        match = re.search(
            r'var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;',
            html,
        )
    if not match:
        _log(f"Direct transcript: no ytInitialPlayerResponse found for {video_id}")
        return None

    try:
        player_response = json.loads(match.group(1))
    except json.JSONDecodeError:
        _log(f"Direct transcript: failed to parse ytInitialPlayerResponse for {video_id}")
        return None

    # Navigate to caption tracks
    captions = player_response.get("captions", {})
    renderer = captions.get("playerCaptionsTracklistRenderer", {})
    caption_tracks = renderer.get("captionTracks", [])

    if not caption_tracks:
        _log(f"Direct transcript: no caption tracks for {video_id}")
        return None

    # Find English track (prefer exact 'en', then any en variant, then first track)
    base_url = None
    for track in caption_tracks:
        lang = track.get("languageCode", "")
        if lang == "en":
            base_url = track.get("baseUrl")
            break
    if not base_url:
        for track in caption_tracks:
            lang = track.get("languageCode", "")
            if lang.startswith("en"):
                base_url = track.get("baseUrl")
                break
    if not base_url:
        # Fall back to first available track
        base_url = caption_tracks[0].get("baseUrl")
    if not base_url:
        _log(f"Direct transcript: no baseUrl in caption tracks for {video_id}")
        return None

    # Step 3: Fetch the VTT subtitle file
    sep = "&" if "?" in base_url else "?"
    vtt_url = f"{base_url}{sep}fmt=vtt"
    vtt_req = urllib.request.Request(vtt_url, headers=headers)
    try:
        with urllib.request.urlopen(vtt_req, timeout=timeout) as resp:
            vtt_text = resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError) as exc:
        _log(f"Direct transcript: failed to fetch VTT for {video_id}: {exc}")
        return None

    if not vtt_text or not vtt_text.strip():
        return None

    return vtt_text


def _fetch_transcript_ytdlp(video_id: str, temp_dir: str) -> Optional[str]:
    """Fetch transcript using yt-dlp (original implementation).

    Args:
        video_id: YouTube video ID
        temp_dir: Temporary directory for subtitle files

    Returns:
        Raw VTT text, or None if no captions available.
    """
    cmd = [
        "yt-dlp",
        "--ignore-config",
        "--no-cookies-from-browser",
        "--write-auto-subs",
        "--sub-lang", "en",
        "--sub-format", "vtt",
        "--skip-download",
        "--no-warnings",
        "-o", f"{temp_dir}/%(id)s",
        f"https://www.youtube.com/watch?v={video_id}",
    ]

    try:
        subproc.run_with_timeout(cmd, timeout=30)
    except subproc.SubprocTimeout:
        return None
    except FileNotFoundError:
        return None

    # yt-dlp may save as .en.vtt or .en-orig.vtt
    vtt_path = Path(temp_dir) / f"{video_id}.en.vtt"
    if not vtt_path.exists():
        # Try alternate naming
        for p in Path(temp_dir).glob(f"{video_id}*.vtt"):
            vtt_path = p
            break
        else:
            return None

    try:
        return vtt_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def fetch_transcript(video_id: str, temp_dir: str) -> Optional[str]:
    """Fetch auto-generated transcript for a YouTube video.

    Uses yt-dlp when available (preferred, more robust). Falls back to
    direct HTTP transcript fetching when yt-dlp is not installed.

    Args:
        video_id: YouTube video ID
        temp_dir: Temporary directory for subtitle files

    Returns:
        Plaintext transcript string, or None if no captions available.
    """
    raw_vtt = None
    if is_ytdlp_installed():
        raw_vtt = _fetch_transcript_ytdlp(video_id, temp_dir)
        if not raw_vtt:
            _log(f"yt-dlp transcript failed for {video_id}, trying direct HTTP fallback")
            raw_vtt = _fetch_transcript_direct(video_id)
    else:
        _log("yt-dlp not installed, using direct HTTP transcript fetch")
        raw_vtt = _fetch_transcript_direct(video_id)

    if not raw_vtt:
        _log(f"No transcript available for {video_id} (no captions found)")
        return None

    transcript = _clean_vtt(raw_vtt)

    # Truncate to max words
    words = transcript.split()
    if len(words) > TRANSCRIPT_MAX_WORDS:
        transcript = ' '.join(words[:TRANSCRIPT_MAX_WORDS]) + '...'

    return transcript if transcript else None


def fetch_transcripts_parallel(
    video_ids: List[str],
    max_workers: int = 5,
) -> Dict[str, Optional[str]]:
    """Fetch transcripts for multiple videos in parallel.

    Args:
        video_ids: List of YouTube video IDs
        max_workers: Max parallel fetches

    Returns:
        Dict mapping video_id to transcript text (or None).
    """
    if not video_ids:
        return {}

    _log(f"Fetching transcripts for {len(video_ids)} videos")

    results = {}
    with tempfile.TemporaryDirectory() as temp_dir:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(fetch_transcript, vid, temp_dir): vid
                for vid in video_ids
            }
            for future in as_completed(futures):
                vid = futures[future]
                try:
                    results[vid] = future.result()
                except OSError as exc:
                    _log(f"Transcript fetch error for {vid}: {exc}")
                    results[vid] = None
                except Exception as exc:
                    _log(f"Unexpected transcript error for {vid}: {type(exc).__name__}: {exc}")
                    results[vid] = None

    got = sum(1 for v in results.values() if v)
    errors = sum(1 for v in results.values() if v is None)
    _log(f"Got transcripts for {got}/{len(video_ids)} videos ({errors} failed)")
    return results


def search_and_transcribe(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
) -> Dict[str, Any]:
    """Full YouTube search: find videos, then fetch transcripts for top results.

    Uses expand_youtube_queries() to generate multiple search queries,
    runs yt-dlp for each, and merges/deduplicates results by video ID.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: 'quick', 'default', or 'deep'

    Returns:
        Dict with 'items' list. Each item has a 'transcript_snippet' field.
    """
    # Step 1: Multi-query search — run yt-dlp for each expanded query
    queries = expand_youtube_queries(topic, depth)
    seen_ids: Set[str] = set()
    items: List[Dict[str, Any]] = []
    for q in queries:
        search_result = search_youtube(q, from_date, to_date, depth)
        for item in search_result.get("items", []):
            vid = item.get("video_id", "")
            if vid and vid not in seen_ids:
                seen_ids.add(vid)
                items.append(item)

    # Sort merged results by views descending
    items.sort(key=lambda x: x.get("engagement", {}).get("views", 0), reverse=True)

    if not items:
        return search_result

    # Step 2: Fetch transcripts for top videos by views.
    # Try more candidates than the limit because some videos (music videos,
    # short clips) lack captions. Attempt up to 3x the limit so we have a
    # good chance of reaching the target number of successful transcripts.
    transcript_limit = TRANSCRIPT_LIMITS.get(depth, TRANSCRIPT_LIMITS["default"])
    transcripts: Dict[str, Optional[str]] = {}
    if transcript_limit > 0:
        attempt_count = min(len(items), transcript_limit * 3)
        candidate_ids = [item["video_id"] for item in items[:attempt_count]]
        _log(f"Fetching transcripts for up to {attempt_count} videos (target: {transcript_limit}): {candidate_ids}")
        transcripts = fetch_transcripts_parallel(candidate_ids)
    else:
        _log(f"Transcript limit is 0 for depth={depth}, skipping transcript fetch")

    # Step 3: Attach transcripts and extract highlights
    core_topic = _extract_core_subject(topic)
    for item in items:
        vid = item["video_id"]
        transcript = transcripts.get(vid)
        item["transcript_snippet"] = transcript or ""
        item["transcript_highlights"] = extract_transcript_highlights(
            transcript or "", core_topic,
        )

    return {"items": items}


def parse_youtube_response(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Parse YouTube search response to normalized format.

    Returns:
        List of item dicts ready for normalization.
    """
    return response.get("items", [])


# ---------------------------------------------------------------------------
# ScrapeCreators YouTube API support
# ---------------------------------------------------------------------------

SCRAPECREATORS_YT_BASE = "https://api.scrapecreators.com/v1/youtube"

try:
    import requests as _requests
except ImportError:
    _requests = None


def _total_engagement(item: Dict[str, Any]) -> int:
    """Combined engagement score for ranking which videos to enrich."""
    eng = item.get("engagement", {})
    views = eng.get("views", 0) or 0
    likes = eng.get("likes", 0) or 0
    comments = eng.get("comments", 0) or 0
    return views + likes + comments


def enrich_with_comments(
    items: List[Dict[str, Any]],
    token: str,
    max_videos: int = 3,
    max_comments: int = 5,
) -> List[Dict[str, Any]]:
    """Enrich top YouTube videos with comment data from ScrapeCreators.

    For the top N videos by engagement, fetches comments via the SC API
    and attaches them as a ``top_comments`` field on each item.

    Args:
        items: YouTube items from search_and_transcribe() or search_youtube_sc()
        token: ScrapeCreators API key
        max_videos: How many videos to enrich with comments
        max_comments: Max comments to keep per video

    Returns:
        Items list (mutated in place) with top_comments added to enriched items.
    """
    if not items or not token or max_videos <= 0:
        return items

    ranked = sorted(items, key=_total_engagement, reverse=True)
    top_items = ranked[:max_videos]
    _log(f"Enriching comments for {len(top_items)} YouTube videos")

    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _enrich_one(item: dict) -> bool:
        video_id = item.get("video_id", "")
        if not video_id:
            return False
        try:
            comments = _fetch_video_comments(video_id, token, max_comments)
            if comments:
                item["top_comments"] = comments
                return True
        except Exception as exc:
            _log(f"Comment enrichment failed for {video_id}: {exc}")
        return False

    enriched_count = 0
    with ThreadPoolExecutor(max_workers=min(4, len(top_items))) as executor:
        futures = {executor.submit(_enrich_one, item): item for item in top_items}
        for future in as_completed(futures):
            if future.result():
                enriched_count += 1

    _log(f"Enriched {enriched_count}/{len(top_items)} videos with comments")
    return items


def _fetch_video_comments(
    video_id: str,
    token: str,
    max_comments: int = 5,
) -> List[Dict[str, Any]]:
    """Fetch comments for a single YouTube video via ScrapeCreators.

    Args:
        video_id: YouTube video ID
        token: ScrapeCreators API key
        max_comments: Maximum comments to return

    Returns:
        List of comment dicts with author, text, likes, date.
    """
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    if not _requests:
        try:
            from urllib.parse import urlencode
            params = urlencode({"url": video_url})
            url = f"{SCRAPECREATORS_YT_BASE}/video/comments?{params}"
            headers = http.scrapecreators_headers(token)
            headers["User-Agent"] = http.USER_AGENT
            data = http.get(url, headers=headers, timeout=30, retries=2)
        except Exception as exc:
            _log(f"Comment fetch error (urllib) for {video_id}: {exc}")
            return []
    else:
        try:
            resp = _requests.get(
                f"{SCRAPECREATORS_YT_BASE}/video/comments",
                params={"url": video_url},
                headers=http.scrapecreators_headers(token),
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            _log(f"Comment fetch error for {video_id}: {exc}")
            return []

    raw_comments = data.get("comments", data.get("data", []))
    comments = []
    for c in raw_comments[:max_comments]:
        text = c.get("text") or c.get("body") or c.get("content", "")
        if not text:
            continue

        # SC returns author as {"name": "@handle", ...}; legacy mocks may pass a string.
        author = c.get("author") or c.get("author_name", "")
        if isinstance(author, dict):
            author = author.get("name") or author.get("handle") or ""

        # SC nests likes under engagement.likes; legacy shapes used top-level keys.
        engagement = c.get("engagement") or {}
        likes = c.get("likes")
        if likes is None:
            likes = engagement.get("likes", 0) if isinstance(engagement, dict) else 0
        if not likes:
            likes = c.get("vote_count", 0)

        date = (
            c.get("date")
            or c.get("published_at")
            or c.get("publishedTime")
            or c.get("publishedTimeText", "")
        )

        comments.append({
            "author": author,
            "text": text[:400],
            "likes": likes,
            "date": date,
        })

    return comments


def search_youtube_sc(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: str = None,
) -> Dict[str, Any]:
    """Search YouTube via ScrapeCreators API (fallback when yt-dlp is unavailable).

    Uses SC keyword search to find videos and SC transcript endpoint to
    fetch transcripts. Called by pipeline.py when yt-dlp fails.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: 'quick', 'default', or 'deep'
        token: ScrapeCreators API key

    Returns:
        Dict with 'items' list of video metadata dicts.
    """
    if not token:
        return {"items": [], "error": "No SCRAPECREATORS_API_KEY configured"}

    count = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    core_topic = _extract_core_subject(topic)
    _log(f"Searching YouTube via ScrapeCreators for '{core_topic}' (depth={depth})")

    # Step 1: Search
    raw_items = _sc_youtube_search(core_topic, token)
    if not raw_items:
        _log("SC YouTube search returned 0 results")
        return {"items": []}

    # Parse into normalized items
    items = []
    for i, raw in enumerate(raw_items[:count]):
        video_id = (
            raw.get("id") or raw.get("video_id") or raw.get("videoId") or ""
        )
        title = raw.get("title", "")
        channel = raw.get("channel") or raw.get("channel_name") or raw.get("uploader", "")
        description = str(raw.get("description", ""))[:500]
        view_count = raw.get("view_count") or raw.get("views", 0)
        like_count = raw.get("like_count") or raw.get("likes", 0)
        comment_count = raw.get("comment_count") or raw.get("comments", 0)

        # Date: try multiple field names
        date_str = raw.get("upload_date") or raw.get("date") or raw.get("published_at", "")
        if date_str and len(date_str) == 8 and date_str.isdigit():
            date_str = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
        elif date_str and "T" in date_str:
            date_str = date_str[:10]

        url = raw.get("url", "")
        if not url and video_id:
            url = f"https://www.youtube.com/watch?v={video_id}"

        items.append({
            "video_id": video_id,
            "title": title,
            "url": url,
            "channel_name": channel,
            "date": date_str if date_str else None,
            "engagement": {
                "views": view_count or 0,
                "likes": like_count or 0,
                "comments": comment_count or 0,
            },
            "duration": raw.get("duration"),
            "relevance": _compute_relevance(core_topic, f"{title} {description}"),
            "why_relevant": f"YouTube: {title[:60]}" if title else f"YouTube: {core_topic}",
            "description": description,
        })

    # Soft date filter
    recent = [i for i in items if i["date"] and i["date"] >= from_date]
    if len(recent) >= 3:
        items = recent
        _log(f"Found {len(items)} videos within date range")
    else:
        _log(f"Found {len(items)} videos ({len(recent)} within date range, keeping all)")

    # Sort by views
    items.sort(key=lambda x: x["engagement"]["views"], reverse=True)

    # Step 2: Fetch transcripts for top videos
    transcript_limit = TRANSCRIPT_LIMITS.get(depth, TRANSCRIPT_LIMITS["default"])
    if transcript_limit > 0 and items:
        attempt_count = min(len(items), transcript_limit * 3)
        _log(f"Fetching SC transcripts for up to {attempt_count} videos (target: {transcript_limit})")
        for item in items[:attempt_count]:
            vid = item["video_id"]
            if not vid:
                continue
            transcript = _sc_fetch_transcript(vid, token)
            item["transcript_snippet"] = transcript or ""
            item["transcript_highlights"] = extract_transcript_highlights(
                transcript or "", core_topic,
            )
    else:
        for item in items:
            item["transcript_snippet"] = ""
            item["transcript_highlights"] = []

    _log(f"SC YouTube: {len(items)} videos returned")
    return {"items": items}


def _sc_youtube_search(keyword: str, token: str) -> List[Dict[str, Any]]:
    """Call ScrapeCreators YouTube search endpoint.

    Args:
        keyword: Search keyword
        token: ScrapeCreators API key

    Returns:
        List of raw video dicts from the API.
    """
    if not _requests:
        try:
            from urllib.parse import urlencode
            params = urlencode({"keyword": keyword})
            url = f"{SCRAPECREATORS_YT_BASE}/search?{params}"
            headers = http.scrapecreators_headers(token)
            headers["User-Agent"] = http.USER_AGENT
            data = http.get(url, headers=headers, timeout=30, retries=2)
            return data.get("videos", data.get("data", data.get("items", [])))
        except Exception as exc:
            _log(f"SC YouTube search error (urllib): {exc}")
            return []

    try:
        resp = _requests.get(
            f"{SCRAPECREATORS_YT_BASE}/search",
            params={"keyword": keyword},
            headers=http.scrapecreators_headers(token),
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("videos", data.get("data", data.get("items", [])))
    except Exception as exc:
        _log(f"SC YouTube search error: {exc}")
        return []


def _sc_fetch_transcript(video_id: str, token: str) -> Optional[str]:
    """Fetch transcript for a YouTube video via ScrapeCreators.

    Args:
        video_id: YouTube video ID
        token: ScrapeCreators API key

    Returns:
        Plaintext transcript string, or None if unavailable.
    """
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    if not _requests:
        try:
            from urllib.parse import urlencode
            params = urlencode({"url": video_url})
            url = f"{SCRAPECREATORS_YT_BASE}/video/transcript?{params}"
            headers = http.scrapecreators_headers(token)
            headers["User-Agent"] = http.USER_AGENT
            data = http.get(url, headers=headers, timeout=30, retries=2)
        except Exception as exc:
            _log(f"SC transcript error (urllib) for {video_id}: {exc}")
            return None
    else:
        try:
            resp = _requests.get(
                f"{SCRAPECREATORS_YT_BASE}/video/transcript",
                params={"url": video_url},
                headers=http.scrapecreators_headers(token),
                timeout=30,
            )
            if resp.status_code != 200:
                _log(f"SC transcript returned {resp.status_code} for {video_id}")
                return None
            data = resp.json()
        except Exception as exc:
            _log(f"SC transcript error for {video_id}: {exc}")
            return None

    transcript = data.get("transcript")
    if not transcript:
        return None

    if isinstance(transcript, list):
        transcript = " ".join(str(s) for s in transcript)

    # Clean VTT formatting if present
    transcript = _clean_vtt(transcript)

    # Truncate to max words
    words = transcript.split()
    if len(words) > TRANSCRIPT_MAX_WORDS:
        transcript = " ".join(words[:TRANSCRIPT_MAX_WORDS]) + "..."

    return transcript if transcript else None
