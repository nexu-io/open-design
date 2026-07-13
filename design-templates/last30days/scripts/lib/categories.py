"""Category-peer subreddit map for Step 0.55 community resolution.

When a topic is a product in a known category (AI image generation, AI coding
agents, SaaS screen recording, etc.), brand-specific subreddits returned by
WebSearch are insufficient: cross-product technique discussion lives in
category-peer subs. This module classifies a topic into a category by matching
compound-term patterns against the lowercased topic string, then returns the
priority-ordered peer subreddit list for that category.

The map is intentionally small, curated, and code-reviewed. Adding a new
category is a code change; there is no user-editable override surface.

False-positive guard: every pattern is either a multi-word compound (e.g.
"image generation", "text to image") or a domain-specific single word
(e.g. "midjourney", "stablediffusion"). Bare common nouns like "image",
"ai", or "model" are never used as patterns.

First-match-wins: categories are evaluated in declared order. Entries are
sorted from most-specific to least-specific so narrower categories claim a
topic before broader ones. For example, `ai_image_generation` appears
before `ai_chat_model` so "gpt image 2" matches the image-gen category.
"""

from __future__ import annotations

from typing import List, Optional, TypedDict


class _CategoryEntry(TypedDict):
    patterns: List[str]
    peer_subs: List[str]


CATEGORY_PEERS: dict[str, _CategoryEntry] = {
    "ai_image_generation": {
        "patterns": [
            "image generation",
            "image gen",
            "text to image",
            "text-to-image",
            "gpt image",
            "gpt-image",
            "nano banana",
            "midjourney",
            "stable diffusion",
            "stablediffusion",
            "dall-e",
            "dalle",
            "flux.1",
            "flux schnell",
            "imagen",
            "seedance",
            "ideogram",
            "recraft",
        ],
        "peer_subs": [
            "StableDiffusion",
            "midjourney",
            "dalle2",
            "aiArt",
            "PromptEngineering",
            "MediaSynthesis",
        ],
    },
    "ai_video_generation": {
        "patterns": [
            "video generation",
            "text to video",
            "text-to-video",
            "sora",
            "veo 3",
            "veo3",
            "runway gen",
            "kling",
            "pika labs",
            "luma dream machine",
            "hailuo",
        ],
        "peer_subs": [
            "aivideo",
            "StableDiffusion",
            "runwayml",
            "singularity",
            "MediaSynthesis",
        ],
    },
    "ai_music_generation": {
        "patterns": [
            "music generation",
            "ai music",
            "suno",
            "udio",
            "riffusion",
            "stable audio",
        ],
        "peer_subs": [
            "SunoAI",
            "udiomusic",
            "aimusic",
            "artificial",
        ],
    },
    "ai_coding_agent": {
        "patterns": [
            "claude code",
            "cursor ide",
            "github copilot",
            "windsurf",
            "aider",
            "cline",
            "openclaw",
            "hermes agent",
            "continue.dev",
            "codeium",
            "sweep ai",
            "devin ai",
            "coding agent",
            "coding assistant",
        ],
        "peer_subs": [
            "ChatGPTCoding",
            "LocalLLaMA",
            "singularity",
            "PromptEngineering",
        ],
    },
    "ai_agent_framework": {
        "patterns": [
            "agent framework",
            "agentic framework",
            "langchain",
            "langgraph",
            "crewai",
            "autogen",
            "llamaindex",
            "dspy",
            "smolagents",
        ],
        "peer_subs": [
            "LangChain",
            "LocalLLaMA",
            "AI_Agents",
            "MachineLearning",
        ],
    },
    "ai_chat_model": {
        "patterns": [
            "gpt-5",
            "gpt-4",
            "claude opus",
            "claude sonnet",
            "claude haiku",
            "gemini pro",
            "gemini flash",
            "llama 3",
            "llama 4",
            "deepseek",
            "qwen",
            "mistral large",
            "grok",
        ],
        "peer_subs": [
            "LocalLLaMA",
            "ChatGPT",
            "ClaudeAI",
            "singularity",
            "artificial",
        ],
    },
    "saas_screen_recording": {
        "patterns": [
            "screen recording",
            "screen recorder",
            "loom video",
            "tella screen",
            "vidyard",
            "screen capture tool",
        ],
        "peer_subs": [
            "SaaS",
            "screenrecording",
            "productivity",
            "Entrepreneur",
        ],
    },
    "saas_productivity": {
        "patterns": [
            "notion app",
            "obsidian plugin",
            "obsidian app",
            "linear app",
            "asana",
            "clickup",
            "productivity app",
        ],
        "peer_subs": [
            "productivity",
            "SaaS",
            "ObsidianMD",
            "Notion",
        ],
    },
    "prediction_markets": {
        "patterns": [
            "polymarket",
            "kalshi",
            "prediction market",
            "event contracts",
            "manifold markets",
        ],
        "peer_subs": [
            "Polymarket",
            "Kalshi",
            "predictionmarkets",
        ],
    },
    "crypto_defi": {
        "patterns": [
            "defi protocol",
            "yield farming",
            "liquidity pool",
            "stablecoin",
            "ethereum layer",
            "layer 2",
            "l2 rollup",
        ],
        "peer_subs": [
            "defi",
            "ethfinance",
            "CryptoCurrency",
            "ethereum",
        ],
    },
    "dev_tool_cli": {
        "patterns": [
            "cli tool",
            "command line tool",
            "terminal app",
            "dev tool",
        ],
        "peer_subs": [
            "commandline",
            "programming",
            "webdev",
        ],
    },
}


def detect_category(topic: Optional[str]) -> Optional[str]:
    """Classify a topic into a known category by compound-term match.

    Returns the category id (e.g. "ai_image_generation") or None if no
    category's patterns match. Matching is case-insensitive substring over
    the lowercased topic. Declaration order wins (first-match-wins), so the
    map is ordered from most-specific to least-specific.

    A None or empty topic returns None. Classification never raises on
    normal string inputs; callers do not need to wrap in try/except for
    typical paths, though defensive callers may.
    """
    if not topic:
        return None
    lowered = topic.lower()
    for category_id, entry in CATEGORY_PEERS.items():
        for pattern in entry["patterns"]:
            if pattern in lowered:
                return category_id
    return None


def peer_subs_for(category_id: Optional[str]) -> List[str]:
    """Return the priority-ordered peer subreddit list for a category.

    Returns an empty list for None or unknown category ids. The returned
    list is a fresh copy; callers may safely mutate it.
    """
    if not category_id:
        return []
    entry = CATEGORY_PEERS.get(category_id)
    if not entry:
        return []
    return list(entry["peer_subs"])
