"""Normalization of source-specific payloads into the v3 generic item model."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from . import dates, schema


def filter_by_date_range(
    items: list[schema.SourceItem],
    from_date: str,
    to_date: str,
    require_date: bool = False,
) -> list[schema.SourceItem]:
    """Keep only items within the requested window."""
    filtered: list[schema.SourceItem] = []
    for item in items:
        if not item.published_at:
            if not require_date:
                filtered.append(item)
            continue
        if item.published_at < from_date or item.published_at > to_date:
            continue
        filtered.append(item)
    return filtered


def normalize_source_items(
    source: str,
    items: list[dict[str, Any]],
    from_date: str,
    to_date: str,
    freshness_mode: str = "balanced_recent",
) -> list[schema.SourceItem]:
    """Normalize raw source items, filter by date range, with evergreen fallback for how_to queries."""
    source = source.lower()
    normalizers = {
        "reddit": _normalize_reddit,
        "x": _normalize_x,
        "youtube": _normalize_youtube,
        "tiktok": lambda s, i, idx, fd, td: _normalize_shortform_video(s, i, idx, fd, td, "TK", "TikTok post"),
        "instagram": lambda s, i, idx, fd, td: _normalize_shortform_video(s, i, idx, fd, td, "IG", "Instagram reel"),
        "hackernews": _normalize_hackernews,
        "bluesky": lambda s, i, idx, fd, td: _normalize_microblog(s, i, idx, fd, td, "BS", "Bluesky post"),
        "truthsocial": lambda s, i, idx, fd, td: _normalize_microblog(s, i, idx, fd, td, "TS", "Truth Social post"),
        "threads": lambda s, i, idx, fd, td: _normalize_microblog(s, i, idx, fd, td, "TH", "Threads post"),
        "xquik": _normalize_x,
        "pinterest": _normalize_pinterest,
        "polymarket": _normalize_polymarket,
        "grounding": _normalize_grounding,
        "xiaohongshu": _normalize_grounding,
        "github": _normalize_github,
        "perplexity": _normalize_grounding,
    }
    normalizer = normalizers.get(source)
    if normalizer is None:
        raise ValueError(f"Unsupported source: {source}")
    normalized = [normalizer(source, item, index, from_date, to_date) for index, item in enumerate(items)]
    require_date = source == "grounding"
    filtered = filter_by_date_range(normalized, from_date, to_date, require_date=require_date)
    if filtered:
        return filtered
    if freshness_mode == "evergreen_ok" and source == "youtube":
        if require_date:
            return [item for item in normalized if item.published_at]
        return normalized
    return filtered


def _remap_comments(
    raw: list[Any],
    score_keys: tuple[str, ...],
    excerpt_keys: tuple[str, ...],
) -> list[dict[str, Any]]:
    """Normalize comments from any source into the shared Reddit-compatible shape.

    Downstream code (signals._top_comment_score, render._top_comments_list,
    entity_extract, rerank) all expect `score` and `excerpt`. This helper maps
    per-source field names (YT: likes/text, TikTok: digg_count/text) onto that
    shape while preserving author/date/url passthrough.
    """
    out: list[dict[str, Any]] = []
    for raw_c in raw:
        if not isinstance(raw_c, dict):
            continue
        score = _first_present(raw_c, score_keys, default=0)
        excerpt = _first_present(raw_c, excerpt_keys, default="")
        try:
            score_int = int(score or 0)
        except (TypeError, ValueError):
            score_int = 0
        entry: dict[str, Any] = {
            "score": score_int,
            "excerpt": str(excerpt or "")[:400],
            "author": str(raw_c.get("author") or ""),
            "date": str(raw_c.get("date") or ""),
        }
        if raw_c.get("url"):
            entry["url"] = str(raw_c["url"])
        out.append(entry)
    return out


def _first_present(d: dict[str, Any], keys: tuple[str, ...], default: Any) -> Any:
    for key in keys:
        if key in d and d[key] not in (None, ""):
            return d[key]
    return default


def _join_comment_excerpts(
    top_comments: list[Any],
    key: str,
    limit: int = 3,
) -> str:
    """Space-join the `key` field from the first `limit` dict-shaped comments."""
    return " ".join(
        str(comment.get(key) or "").strip()
        for comment in top_comments[:limit]
        if isinstance(comment, dict)
    )


def _domain_from_url(url: str) -> str | None:
    if not url:
        return None
    domain = urlparse(url).netloc.strip().lower()
    return domain or None


def _date_confidence(item: dict[str, Any], from_date: str, to_date: str, default: str = "low") -> str:
    if item.get("date_confidence"):
        return str(item["date_confidence"])
    date_value = item.get("date")
    if not date_value:
        return default
    return dates.get_date_confidence(str(date_value), from_date, to_date)


def _source_item(
    *,
    item_id: str,
    source: str,
    title: str,
    body: str,
    url: str,
    published_at: str | None,
    date_confidence: str,
    relevance_hint: float,
    why_relevant: str,
    author: str | None = None,
    container: str | None = None,
    engagement: dict[str, float | int] | None = None,
    snippet: str = "",
    metadata: dict[str, Any] | None = None,
) -> schema.SourceItem:
    return schema.SourceItem(
        item_id=item_id,
        source=source,
        title=title.strip() or body.strip()[:160] or item_id,
        body=body.strip(),
        url=url.strip(),
        author=(author or "").strip() or None,
        container=(container or "").strip() or None,
        published_at=published_at,
        date_confidence=date_confidence,
        engagement=engagement or {},
        relevance_hint=max(0.0, min(1.0, float(relevance_hint or 0.0))),
        why_relevant=why_relevant.strip(),
        snippet=snippet.strip(),
        metadata=metadata or {},
    )


def _normalize_reddit(
    source: str,
    item: dict[str, Any],
    index: int,
    from_date: str,
    to_date: str,
) -> schema.SourceItem:
    top_comments = item.get("top_comments") or []
    comment_text = _join_comment_excerpts(top_comments, "excerpt")
    body = "\n".join(
        part
        for part in [
            str(item.get("title") or "").strip(),
            str(item.get("selftext") or "").strip(),
            comment_text,
        ]
        if part
    )
    return _source_item(
        item_id=str(item.get("id") or f"R{index + 1}"),
        source=source,
        title=str(item.get("title") or ""),
        body=body,
        url=str(item.get("url") or ""),
        author=None,
        container=str(item.get("subreddit") or ""),
        published_at=item.get("date"),
        date_confidence=_date_confidence(item, from_date, to_date),
        engagement=item.get("engagement") or {},
        relevance_hint=item.get("relevance", 0.5),
        why_relevant=str(item.get("why_relevant") or ""),
        snippet=comment_text or str(item.get("selftext") or "")[:400],
        metadata={
            "top_comments": top_comments,
            "comment_insights": item.get("comment_insights") or [],
        },
    )


def _normalize_x(
    source: str,
    item: dict[str, Any],
    index: int,
    from_date: str,
    to_date: str,
) -> schema.SourceItem:
    text = str(item.get("text") or "").strip()
    return _source_item(
        item_id=str(item.get("id") or f"X{index + 1}"),
        source=source,
        title=text[:140] or f"X post {index + 1}",
        body=text,
        url=str(item.get("url") or ""),
        author=str(item.get("author_handle") or "").lstrip("@"),
        published_at=item.get("date"),
        date_confidence=_date_confidence(item, from_date, to_date),
        engagement=item.get("engagement") or {},
        relevance_hint=item.get("relevance", 0.5),
        why_relevant=str(item.get("why_relevant") or ""),
    )


def _normalize_youtube(
    source: str,
    item: dict[str, Any],
    index: int,
    from_date: str,
    to_date: str,
) -> schema.SourceItem:
    transcript = str(item.get("transcript_snippet") or "").strip()
    description = str(item.get("description") or "").strip()
    title = str(item.get("title") or "").strip()
    highlights = item.get("transcript_highlights") or []
    metadata: dict[str, Any] = {}
    if highlights:
        metadata["transcript_highlights"] = highlights
    metadata["top_comments"] = _remap_comments(
        item.get("top_comments") or [],
        score_keys=("score", "likes"),
        excerpt_keys=("excerpt", "text"),
    )
    return _source_item(
        item_id=str(item.get("video_id") or item.get("id") or f"YT{index + 1}"),
        source=source,
        title=title,
        body="\n".join(part for part in [title, description, transcript] if part),
        url=str(item.get("url") or ""),
        author=str(item.get("channel_name") or ""),
        published_at=item.get("date"),
        date_confidence=_date_confidence(item, from_date, to_date, default="high"),
        engagement=item.get("engagement") or {},
        relevance_hint=item.get("relevance", 0.5),
        why_relevant=str(item.get("why_relevant") or ""),
        snippet=transcript,
        metadata=metadata,
    )


def _normalize_shortform_video(
    source: str,
    item: dict[str, Any],
    index: int,
    from_date: str,
    to_date: str,
    id_prefix: str,
    default_title: str,
) -> schema.SourceItem:
    """Shared normalizer for TikTok and Instagram (identical structure)."""
    caption = str(item.get("caption_snippet") or "").strip()
    text = str(item.get("text") or "").strip()
    return _source_item(
        item_id=str(item.get("id") or f"{id_prefix}{index + 1}"),
        source=source,
        title=text[:140] or caption[:140] or f"{default_title} {index + 1}",
        body="\n".join(part for part in [text, caption] if part),
        url=str(item.get("url") or ""),
        author=str(item.get("author_name") or ""),
        published_at=item.get("date"),
        date_confidence=_date_confidence(item, from_date, to_date, default="high"),
        engagement=item.get("engagement") or {},
        relevance_hint=item.get("relevance", 0.5),
        why_relevant=str(item.get("why_relevant") or ""),
        snippet=caption,
        metadata={
            "hashtags": item.get("hashtags") or [],
            "top_comments": _remap_comments(
                item.get("top_comments") or [],
                # TikTok uses digg_count as the vote field; Instagram has no
                # comment fetcher today so the key is harmlessly absent.
                score_keys=("score", "digg_count", "likes"),
                excerpt_keys=("excerpt", "text"),
            ),
        },
    )


def _normalize_pinterest(
    source: str,
    item: dict[str, Any],
    index: int,
    from_date: str,
    to_date: str,
) -> schema.SourceItem:
    """Normalizer for Pinterest pins (visual content with descriptions).

    Saves are the primary engagement signal, analogous to likes/upvotes.
    """
    description = str(item.get("description") or "").strip()
    return _source_item(
        item_id=str(item.get("pin_id") or item.get("id") or f"PI{index + 1}"),
        source=source,
        title=description[:140] or f"Pinterest pin {index + 1}",
        body=description,
        url=str(item.get("url") or ""),
        author=str(item.get("author") or ""),
        container=str(item.get("board") or ""),
        published_at=item.get("date"),
        date_confidence=_date_confidence(item, from_date, to_date, default="low"),
        engagement=item.get("engagement") or {},
        relevance_hint=item.get("relevance", 0.5),
        why_relevant=str(item.get("why_relevant") or ""),
        snippet=description[:400],
    )


def _normalize_hackernews(
    source: str,
    item: dict[str, Any],
    index: int,
    from_date: str,
    to_date: str,
) -> schema.SourceItem:
    top_comments = item.get("top_comments") or []
    comment_text = _join_comment_excerpts(top_comments, "text")
    title = str(item.get("title") or "").strip()
    body = "\n".join(part for part in [title, str(item.get("text") or "").strip(), comment_text] if part)
    return _source_item(
        item_id=str(item.get("id") or f"HN{index + 1}"),
        source=source,
        title=title or f"HN story {index + 1}",
        body=body,
        url=str(item.get("url") or item.get("hn_url") or ""),
        author=str(item.get("author") or ""),
        container="Hacker News",
        published_at=item.get("date"),
        date_confidence=_date_confidence(item, from_date, to_date, default="high"),
        engagement=item.get("engagement") or {},
        relevance_hint=item.get("relevance", 0.5),
        why_relevant=str(item.get("why_relevant") or ""),
        snippet=comment_text,
        metadata={
            "hn_url": item.get("hn_url"),
            "top_comments": top_comments,
            "comment_insights": item.get("comment_insights") or [],
        },
    )


def _normalize_microblog(
    source: str,
    item: dict[str, Any],
    index: int,
    from_date: str,
    to_date: str,
    id_prefix: str,
    default_title: str,
) -> schema.SourceItem:
    """Shared normalizer for Bluesky and Truth Social (identical structure)."""
    text = str(item.get("text") or "").strip()
    return _source_item(
        item_id=str(item.get("id") or f"{id_prefix}{index + 1}"),
        source=source,
        title=text[:140] or f"{default_title} {index + 1}",
        body=text,
        url=str(item.get("url") or ""),
        author=str(item.get("handle") or item.get("author_handle") or "").lstrip("@"),
        published_at=item.get("date"),
        date_confidence=_date_confidence(item, from_date, to_date, default="high"),
        engagement=item.get("engagement") or {},
        relevance_hint=item.get("relevance", 0.5),
        why_relevant=str(item.get("why_relevant") or ""),
        metadata={"display_name": item.get("display_name")},
    )


def _normalize_polymarket(
    source: str,
    item: dict[str, Any],
    index: int,
    from_date: str,
    to_date: str,
) -> schema.SourceItem:
    title = str(item.get("title") or "").strip()
    question = str(item.get("question") or "").strip()
    engagement = {
        "volume": item.get("volume1mo") or item.get("volume24hr") or 0,
        "liquidity": item.get("liquidity") or 0,
    }
    return _source_item(
        item_id=str(item.get("id") or f"PM{index + 1}"),
        source=source,
        title=title or question or f"Polymarket event {index + 1}",
        body="\n".join(part for part in [title, question, str(item.get("price_movement") or "")] if part),
        url=str(item.get("url") or ""),
        author=None,
        container="Polymarket",
        published_at=item.get("date"),
        date_confidence=_date_confidence(item, from_date, to_date, default="high"),
        engagement=engagement,
        relevance_hint=item.get("relevance", 0.5),
        why_relevant=str(item.get("why_relevant") or ""),
        snippet=str(item.get("price_movement") or ""),
        metadata={
            "question": question,
            "end_date": item.get("end_date"),
            "outcome_prices": item.get("outcome_prices") or [],
            "outcomes_remaining": item.get("outcomes_remaining"),
        },
    )



def _normalize_github(
    source: str,
    item: dict[str, Any],
    index: int,
    from_date: str,
    to_date: str,
) -> schema.SourceItem:
    title = str(item.get("title") or "").strip()
    snippet_text = str(item.get("snippet") or "").strip()
    top_comments = item.get("metadata", {}).get("top_comments") or []
    comment_text = _join_comment_excerpts(top_comments, "excerpt")
    body = "\n".join(part for part in [title, snippet_text, comment_text] if part)
    metadata = item.get("metadata") or {}
    return _source_item(
        item_id=str(item.get("id") or f"GH{index + 1}"),
        source=source,
        title=title or f"GitHub item {index + 1}",
        body=body,
        url=str(item.get("url") or ""),
        author=str(item.get("author") or ""),
        container=str(item.get("container") or ""),
        published_at=item.get("date"),
        date_confidence=_date_confidence(item, from_date, to_date, default="high"),
        engagement=item.get("engagement") or {},
        relevance_hint=item.get("relevance", 0.5),
        why_relevant=str(item.get("why_relevant") or ""),
        snippet=comment_text or snippet_text[:400],
        metadata={
            "top_comments": top_comments,
            "labels": metadata.get("labels") or [],
            "state": metadata.get("state", ""),
            "is_pr": metadata.get("is_pr", False),
        },
    )

def _normalize_grounding(
    source: str,
    item: dict[str, Any],
    index: int,
    from_date: str,
    to_date: str,
) -> schema.SourceItem:
    title = str(item.get("title") or "").strip()
    snippet = str(item.get("snippet") or "").strip()
    url = str(item.get("url") or "").strip()
    return _source_item(
        item_id=str(item.get("id") or f"W{index + 1}"),
        source=source,
        title=title or _domain_from_url(url) or f"Web result {index + 1}",
        body="\n".join(part for part in [title, snippet] if part),
        url=url,
        author=None,
        container=str(item.get("source_domain") or _domain_from_url(url) or ""),
        published_at=item.get("date"),
        date_confidence=_date_confidence(item, from_date, to_date),
        engagement=item.get("engagement") or {},
        relevance_hint=item.get("relevance", 0.5),
        why_relevant=str(item.get("why_relevant") or ""),
        snippet=snippet,
        metadata=item.get("metadata") or {},
    )
