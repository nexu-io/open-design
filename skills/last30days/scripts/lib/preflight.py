"""Engine-side query-quality pre-flight.

Detects Class 1 (demographic shopping) keyword-trap queries and returns a
structured REFUSE message. The caller (scripts/last30days.py main()) writes
the message to stderr and exits code 2. No pipeline work runs on a doomed
query; the model sees the REFUSE on stderr and asks the user for the
hobbies/relationship/budget context it needs.

Patterns ported from SKILL.md Step 0.45 prose. Only Class 1 is implemented
here because it has a verified failure mode on v3.0.8 (2026-04-18 'birthday
gift for 40 year old' run returned r/todayilearned and unrelated drama
posts).
"""

from __future__ import annotations

import re

_CLASS_1_PATTERNS = [
    re.compile(
        r"^\s*(birthday\s+)?(gift|gifts|present|presents)\s+"
        r"(for|ideas\s+for)\s+(a\s+|my\s+)?\d+[\s-]?year[\s-]?old\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"^\s*(best|top)\s+[\w\s-]+?\s+for\s+"
        r"(men|women|kids|guys|girls|teens|dads|moms|husbands|wives|brothers|sisters|friends)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"^\s*what\s+to\s+(buy|get|gift)\s+(for\s+)?(a\s+|my\s+)?"
        r"(\d+[\s-]?year[\s-]?old|husband|wife|dad|mom|brother|sister|friend|boss|coworker)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"^\s*(present|presents|gift|gifts)\s+for\s+(a\s+|my\s+)?"
        r"(husband|wife|dad|mom|brother|sister|friend|boss|coworker)\b",
        re.IGNORECASE,
    ),
]

_QUALIFIER_PATTERNS = [
    re.compile(r"\$\d+"),
    re.compile(r"\bbudget\b", re.IGNORECASE),
    re.compile(r"\bwho\s+(loves|likes|is\s+into|enjoys)\b", re.IGNORECASE),
    re.compile(r"\bhobbies?\b", re.IGNORECASE),
    re.compile(r"\b(cooking|running|reading|gaming|golf|woodworking|coding|hiking|cycling|fishing|music)[\s-]?(obsessed|enthusiast|fan|lover)\b", re.IGNORECASE),
]

_RELATIONSHIP_WORDS = {
    "husband", "wife", "dad", "mom", "father", "mother", "brother", "sister",
    "friend", "boss", "coworker", "son", "daughter", "grandma", "grandpa",
    "aunt", "uncle", "nephew", "niece", "partner", "boyfriend", "girlfriend",
}

_YEAR_OLD_NOUN = re.compile(r"\byear[\s-]?old\s+(\w+)", re.IGNORECASE)


def _has_qualifier(topic: str) -> bool:
    """Return True if the topic contains hobbies/relationship/budget context.

    A Class 1 base pattern plus a qualifier means the user already filled in
    the specificity Step 0.45 would ask for. Skip the refuse-gate and let
    the engine run.

    Also skips when `{n} year old <activity-noun>` is present, but only when
    the noun is NOT a relationship word. 'year old runner' qualifies as an
    interest and skips; 'year old husband' is just another relationship
    reframing of the demographic query and does not skip.
    """
    if any(pattern.search(topic) for pattern in _QUALIFIER_PATTERNS):
        return True

    match = _YEAR_OLD_NOUN.search(topic)
    if match and match.group(1).lower() not in _RELATIONSHIP_WORDS:
        return True

    return False


def check_class_1_trap(topic: str) -> str | None:
    """Return a REFUSE message string if the topic matches Class 1, else None.

    Class 1 is the demographic-shopping keyword trap. The literal phrase
    'birthday gift for 40 year old' is not the vocabulary of actual gift
    discussions on Reddit, X, or TikTok, so running the engine returns
    low-signal generic posts. Refuse up-front and ask for context.
    """
    if not topic:
        return None

    matched = any(pattern.search(topic) for pattern in _CLASS_1_PATTERNS)
    if not matched:
        return None

    if _has_qualifier(topic):
        return None

    return _refuse_message(topic.strip())


def _refuse_message(topic: str) -> str:
    return (
        f'[last30days] REFUSE: topic "{topic}" matches Class 1 keyword-trap '
        "pattern (demographic shopping).\n"
        "\n"
        "The literal phrase is not the vocabulary of actual gift discussions "
        "on Reddit, X, or TikTok. Running the engine will return low-signal "
        "generic posts (the 2026-04-18 validation run returned "
        "r/todayilearned and unrelated drama).\n"
        "\n"
        "Ask the user for at least one of:\n"
        "  - hobbies (cooks / runs / reads / gaming / outdoors / golf / music)\n"
        "  - relationship (husband / dad / friend / boss / brother)\n"
        "  - budget range\n"
        "\n"
        "Then re-run with the enriched query. If the user insists 'just run it',\n"
        "re-invoke with LAST30DAYS_SKIP_PREFLIGHT=1 to bypass this gate.\n"
    )
