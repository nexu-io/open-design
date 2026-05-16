"""Entity extraction from initial search results for supplemental searches."""

import re
from collections import Counter
from typing import Any, Dict, List

# Handles that appear too frequently to be useful for targeted search.
# These are generic/platform accounts, not topic-specific voices.
GENERIC_HANDLES = {
    "elonmusk", "openai", "google", "microsoft", "apple", "meta",
    "github", "youtube", "x", "twitter", "reddit", "wikipedia",
    "nytimes", "washingtonpost", "cnn", "bbc", "reuters",
    "verified", "jack", "sundarpichai",
}


def extract_entities(
    reddit_items: List[Dict[str, Any]],
    x_items: List[Dict[str, Any]],
    max_handles: int = 5,
    max_hashtags: int = 3,
    max_subreddits: int = 5,
) -> Dict[str, List[str]]:
    """Extract key entities from Phase 1 results for supplemental searches.

    Parses X results for @handles and #hashtags, Reddit results for subreddit
    names and cross-referenced communities.

    Args:
        reddit_items: Raw Reddit item dicts from Phase 1
        x_items: Raw X item dicts from Phase 1
        max_handles: Maximum handles to return
        max_hashtags: Maximum hashtags to return
        max_subreddits: Maximum subreddits to return

    Returns:
        Dict with keys: x_handles, x_hashtags, reddit_subreddits
    """
    handles = _extract_x_handles(x_items)
    hashtags = _extract_x_hashtags(x_items)
    subreddits = _extract_subreddits(reddit_items)

    return {
        "x_handles": handles[:max_handles],
        "x_hashtags": hashtags[:max_hashtags],
        "reddit_subreddits": subreddits[:max_subreddits],
    }


def _extract_x_handles(x_items: List[Dict[str, Any]]) -> List[str]:
    """Extract and rank @handles from X results.

    Sources handles from:
    1. author_handle field (who posted)
    2. @mentions in post text (who they're talking about/to)

    Returns handles ranked by frequency, filtered for generic accounts.
    """
    handle_counts = Counter()

    for item in x_items:
        # Author handle
        author = item.get("author_handle", "").strip().lstrip("@").lower()
        if author and author not in GENERIC_HANDLES:
            handle_counts[author] += 1

        # @mentions in text
        text = item.get("text", "")
        mentions = re.findall(r'@(\w{1,15})', text)
        for mention in mentions:
            mention_lower = mention.lower()
            if mention_lower not in GENERIC_HANDLES:
                handle_counts[mention_lower] += 1

    # Return all handles ranked by frequency
    return [h for h, _ in handle_counts.most_common()]


def _extract_x_hashtags(x_items: List[Dict[str, Any]]) -> List[str]:
    """Extract and rank #hashtags from X results.

    Returns hashtags ranked by frequency.
    """
    hashtag_counts = Counter()

    for item in x_items:
        text = item.get("text", "")
        tags = re.findall(r'#(\w{2,30})', text)
        for tag in tags:
            hashtag_counts[tag.lower()] += 1

    # Return all hashtags ranked by frequency
    return [f"#{t}" for t, _ in hashtag_counts.most_common()]


def _extract_subreddits(reddit_items: List[Dict[str, Any]]) -> List[str]:
    """Extract and rank subreddits from Reddit results.

    Sources from:
    1. subreddit field on each result
    2. Cross-references in comment text (e.g., "check out r/localLLaMA")

    Returns subreddits ranked by frequency.
    """
    sub_counts = Counter()

    for item in reddit_items:
        # Primary subreddit
        sub = item.get("subreddit", "").strip().lstrip("r/")
        if sub:
            sub_counts[sub] += 1

        # Cross-references in comment insights
        for insight in item.get("comment_insights", []):
            cross_refs = re.findall(r'r/(\w{2,30})', insight)
            for ref in cross_refs:
                sub_counts[ref] += 1

        # Cross-references in top comments
        for comment in item.get("top_comments", []):
            excerpt = comment.get("excerpt", "")
            cross_refs = re.findall(r'r/(\w{2,30})', excerpt)
            for ref in cross_refs:
                sub_counts[ref] += 1

    # Return subreddits ranked by frequency
    return [sub for sub, _ in sub_counts.most_common()]
