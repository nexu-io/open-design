#!/usr/bin/env bash
# Find translation gaps in nexu-io/open-design.
# Usage: discover-i18n-gaps.sh <workdir>
# Stdout: NDJSON, one row per gap:
#   {"doc":"README","english":"README.md","lang":"es","translated":null,"status":"missing"}
#   {"doc":"QUICKSTART","english":"QUICKSTART.md","lang":"zh-CN","translated":"QUICKSTART.zh-CN.md","status":"stale","english_mtime":"...","translated_mtime":"...","english_commits_since":12}
#
# A "stale" translation is one whose last-touched commit is older than the most recent
# commit touching the English source. Ranking is left to the caller (the agent).

set -euo pipefail
source "$(dirname "$0")/config.sh"

WORKDIR="${1:?workdir required}"
[[ -d "$WORKDIR/.git" ]] || od::die "not a git workdir: $WORKDIR"

cd "$WORKDIR"
od::require git
od::require jq

# Translatable English source files we care about (top-level docs).
ENGLISH_DOCS=(README.md QUICKSTART.md CONTRIBUTING.md MAINTAINERS.md TRANSLATIONS.md PRIVACY.md)

# Common language suffixes seen in OD's tree (extend as the project grows).
LANGS=(zh-CN zh-TW ja-JP de fr es ko ru pt-BR tr uk ar)

# Languages already represented for a given doc are detected from disk;
# the LANGS array is what we *offer* to a contributor when no translation exists.

last_commit_epoch() {
  # Last commit touching $1 — empty string if file has never been committed.
  git log -1 --format=%ct -- "$1" 2>/dev/null || true
}

commits_between() {
  # How many commits touched $newer that are NOT ancestors of $older_ref's tip
  # commit. Uses commit ancestry rather than `--since=<epoch>` math because
  # `--since` is inclusive of the boundary epoch — so when English source and
  # translation are touched in the SAME commit (very common: bulk i18n
  # refresh, structural change applied across all translations), `--since`
  # would count that shared commit and mark the translation "stale" by 1.
  #
  # `tr_sha..HEAD -- $newer` reads as: "commits reachable from HEAD but not
  # from tr_sha, that touched $newer". When tr_sha is HEAD's tip for $newer
  # too (same-commit update), the answer is correctly 0.
  local newer="$1" older_ref="$2"
  local tr_sha
  tr_sha="$(git log -1 --format=%H -- "$older_ref" 2>/dev/null)"
  if [[ -z "$tr_sha" ]]; then
    # Translation never committed; count all history of $newer.
    git log --format=%H -- "$newer" 2>/dev/null | wc -l | tr -d ' '
  else
    git rev-list "${tr_sha}..HEAD" -- "$newer" 2>/dev/null | wc -l | tr -d ' '
  fi
}

emit() {
  jq -nc \
    --arg doc "$1" --arg english "$2" --arg lang "$3" \
    --arg translated "$4" --arg status "$5" \
    --arg en_epoch "$6" --arg tr_epoch "$7" --arg en_commits_since "$8" \
    '{
      doc: $doc, english: $english, lang: $lang,
      translated: ($translated | select(length>0)),
      status: $status,
      english_mtime_epoch: ($en_epoch | select(length>0) | tonumber? // null),
      translated_mtime_epoch: ($tr_epoch | select(length>0) | tonumber? // null),
      english_commits_since_translation: ($en_commits_since | tonumber? // null)
    }'
}

for english in "${ENGLISH_DOCS[@]}"; do
  [[ -f "$english" ]] || continue
  doc="${english%.md}"
  en_epoch="$(last_commit_epoch "$english")"

  # Track observed languages for this doc as a newline-delimited string.
  # Avoids `declare -A` (associative arrays), which requires Bash 4 — macOS
  # ships with Bash 3.2 by default and most agent-spawned bash subprocesses
  # inherit that. The leading + trailing newlines let us match `\n<lang>\n`
  # without false positives on prefix overlap (e.g. zh vs zh-CN).
  SEEN_LANGS=$'\n'

  while IFS= read -r -d '' translated; do
    # Filename pattern: <DOC>.<lang>.md  (e.g. README.zh-CN.md).
    # `find . ... -print0` emits paths with a leading `./`; strip that first
    # and operate on the basename so the prefix-strip below works regardless.
    base="${translated#./}"
    base="$(basename "$base")"
    lang_part="${base#${doc}.}"
    lang_part="${lang_part%.md}"
    [[ -z "$lang_part" || "$lang_part" == "$base" ]] && continue
    SEEN_LANGS+="${lang_part}"$'\n'

    tr_epoch="$(last_commit_epoch "$translated")"
    if [[ -z "$tr_epoch" ]]; then
      emit "$doc" "$english" "$lang_part" "$translated" "untracked" "$en_epoch" "" ""
      continue
    fi
    en_commits_since="$(commits_between "$english" "$translated")"
    if [[ "$en_commits_since" -gt 0 ]]; then
      emit "$doc" "$english" "$lang_part" "$translated" "stale" "$en_epoch" "$tr_epoch" "$en_commits_since"
    fi
    # else: up-to-date, skip emission entirely.
  done < <(find . -maxdepth 1 -type f -name "${doc}.*.md" -print0)

  # Then, for each language in LANGS that we didn't see, emit a "missing" row.
  for lang in "${LANGS[@]}"; do
    case "$SEEN_LANGS" in
      *$'\n'"$lang"$'\n'*) continue ;;
    esac
    emit "$doc" "$english" "$lang" "" "missing" "$en_epoch" "" ""
  done
done
