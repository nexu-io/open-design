#!/usr/bin/env bash
# Lightweight Markdown validation for i18n / docs / blog contributions.
#
# Usage: validate-markdown.sh <file> [<file> ...] [--reference <orig>]
#
# Checks per file:
#   - File is non-empty.
#   - Code fences are balanced (count of ``` is even).
#   - Newly-introduced relative refs that don't resolve on disk fail.
#     Refs that ALREADY exist in the --reference file (the English source for
#     a translation, or HEAD's version for a docs edit) are NOT failed even
#     if they don't resolve — many OD docs reference website-router slugs
#     like `skills/blog-post/` that aren't files in the checked-out repo.
#   - External http(s) links return 2xx/3xx (best-effort, capped, 8s timeout).
#
# Without --reference, relative-ref checking is skipped entirely (since we
# can't tell route slugs from file paths in isolation). The other checks
# still run.

set -uo pipefail
source "$(dirname "$0")/config.sh"
set +e
set -uo pipefail  # restore the "accumulate diagnostics" stance after sourcing.

REFERENCE=""
FILES=()
while (($#)); do
  case "$1" in
    --reference) REFERENCE="$2"; shift 2 ;;
    --) shift; while (($#)); do FILES+=("$1"); shift; done ;;
    -*) od::die "unknown flag: $1" ;;
    *) FILES+=("$1"); shift ;;
  esac
done

(( ${#FILES[@]} >= 1 )) || od::die "usage: validate-markdown.sh <file> [<file> ...] [--reference <orig>]"

# Build the "already-broken in source" set of relative refs (newline-delimited
# string for Bash 3 compatibility — no associative arrays). Anything in this
# set is excused from failing the new-file check.
KNOWN_DEAD=$'\n'
if [[ -n "$REFERENCE" ]]; then
  if [[ ! -f "$REFERENCE" ]]; then
    od::warn "--reference $REFERENCE does not exist; ignoring."
  else
    ref_dir="$(cd "$(dirname "$REFERENCE")" && pwd -P)"
    while IFS= read -r ref; do
      [[ -z "$ref" ]] && continue
      case "$ref" in http*|mailto:*|\#*|/*) continue ;; esac
      target="${ref%%#*}"; target="${target%%\?*}"
      [[ -z "$target" ]] && continue
      if [[ ! -e "$ref_dir/$target" ]]; then
        KNOWN_DEAD+="${ref}"$'\n'
      fi
    done < <(grep -oE '\!?\[[^]]*\]\([^)]+\)' "$REFERENCE" 2>/dev/null \
             | sed -E 's/.*\(([^)]+)\).*/\1/' \
             | sort -u)
  fi
fi

OVERALL=0
MAX_HTTP_PER_FILE=20

check_file() {
  local f="$1"
  local fail=0
  printf -- '--- %s ---\n' "$f"

  if [[ ! -f "$f" ]]; then
    printf 'FAIL  not a file: %s\n' "$f"
    return 1
  fi
  if [[ ! -s "$f" ]]; then
    printf 'FAIL  empty file: %s\n' "$f"
    return 1
  fi
  printf 'PASS  exists, non-empty\n'

  # Code fence balance.
  local fences
  fences="$(grep -cE '^```' "$f" 2>/dev/null)"
  if (( fences % 2 == 0 )); then
    printf 'PASS  code fences balanced (%d)\n' "$fences"
  else
    printf 'FAIL  unbalanced code fences (%d ``` lines)\n' "$fences"
    fail=1
  fi

  # Relative refs — tiered check:
  #
  #   Image refs (![alt](path)) — always validate. No website route uses
  #   image-syntax markdown; if it doesn't resolve on disk, it's broken.
  #
  #   Link refs starting with ./ or ../ — always validate. Explicit relative
  #   paths are unambiguously file references, not router slugs.
  #
  #   Other link refs (e.g. `skills/blog-post/`) — only validated when
  #   --reference is supplied (we excuse refs already broken in the source).
  #   Without --reference we skip these because OD docs use slug-style refs
  #   for website routes that don't resolve to files in the checkout.
  #
  # In all cases, refs already broken in --reference (when supplied) are
  # excused from failure rather than reported as regressions.
  local dir rel_bad=0 rel_excused=0 rel_skipped_ambiguous=0
  dir="$(cd "$(dirname "$f")" && pwd -P)"
  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    # `!?` in grep keeps the leading `!` for image refs; case-detect here.
    is_img=0
    case "$entry" in '!'*) is_img=1 ;; esac
    # Extract URL: between first `(` and last `)`.
    ref="${entry#*\(}"
    ref="${ref%\)*}"
    case "$ref" in http*|mailto:*|\#*|/*) continue ;; esac
    target="${ref%%#*}"; target="${target%%\?*}"
    [[ -z "$target" ]] && continue

    # Should we validate this ref?
    if (( is_img == 0 )); then
      case "$ref" in
        ./*|../*) ;;  # explicit relative — always validate
        *)
          # File-like targets (have an obvious file extension) are unambiguously
          # on-disk references — `[doc](missing.md)` is not a website route, it
          # is a sibling file. Validate without --reference. Otherwise (no
          # extension, looks like a slug), only validate when we have a
          # reference to compare against.
          case "${target##*/}" in
            *.md|*.markdown|*.mdx \
            |*.png|*.jpg|*.jpeg|*.gif|*.webp|*.svg|*.ico|*.bmp \
            |*.pdf|*.txt|*.json|*.yaml|*.yml|*.toml \
            |*.sh|*.ts|*.tsx|*.js|*.jsx|*.css|*.html|*.xml \
            |*.csv|*.zip|*.gz)
              ;;  # file-like — always validate
            *)
              if [[ -z "$REFERENCE" ]]; then
                rel_skipped_ambiguous=$((rel_skipped_ambiguous+1))
                continue
              fi
              ;;
          esac
          ;;
      esac
    fi

    if [[ ! -e "$dir/$target" ]]; then
      case "$KNOWN_DEAD" in
        *$'\n'"$ref"$'\n'*) rel_excused=$((rel_excused+1)) ;;
        *)
          printf 'FAIL  broken relative reference: %s\n' "$ref"
          rel_bad=$((rel_bad+1))
          fail=1
          ;;
      esac
    fi
  done < <(grep -oE '!?\[[^]]*\]\([^)]+\)' "$f" 2>/dev/null | sort -u)

  if (( rel_bad == 0 )); then
    msg="PASS  relative refs OK"
    (( rel_excused > 0 )) && msg+=" (${rel_excused} pre-existing dead refs kept as-is)"
    (( rel_skipped_ambiguous > 0 )) && msg+=" (${rel_skipped_ambiguous} slug-style refs skipped — pass --reference to check)"
    printf '%s\n' "$msg"
  fi

  # External link health (best-effort).
  local http_seen=0 http_bad=0
  while IFS= read -r url; do
    [[ -z "$url" ]] && continue
    (( http_seen >= MAX_HTTP_PER_FILE )) && break
    http_seen=$((http_seen+1))
    local code
    code="$(curl -sS -o /dev/null -m 8 -L -w '%{http_code}' --head "$url" 2>/dev/null)"
    [[ -z "$code" ]] && code="000"
    case "$code" in
      2*|3*|000) ;;  # OK, or network-flaky — don't punish.
      *)
        printf 'FAIL  external link %s returned %s\n' "$url" "$code"
        http_bad=$((http_bad+1))
        fail=1
        ;;
    esac
  # URL extraction: stop at whitespace, ), ", ', <, >, [, ]. HTML <img src="..."> in
  # OD docs would otherwise leak a trailing quote into the URL and cause false 404s.
  done < <(grep -oE 'https?://[^][[:space:]"'\''<>)]+' "$f" 2>/dev/null | sort -u)

  if (( http_bad == 0 && http_seen > 0 )); then
    printf 'PASS  %d external links return 2xx/3xx (or network-skipped)\n' "$http_seen"
  fi

  return "$fail"
}

for f in "${FILES[@]}"; do
  if ! check_file "$f"; then
    OVERALL=1
  fi
done

if [[ "$OVERALL" -eq 0 ]]; then
  printf 'RESULT=pass\n'
  exit 0
else
  printf 'RESULT=fail\n'
  exit 1
fi
