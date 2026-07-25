#!/usr/bin/env bash
# Promote staged stock images into the game.
#
# Usage: scripts/promote-stock.sh <stage-dir> [name...]
#
# Moves <stage-dir>/<name>.png to public/images/<name>.png and builds
# public/images/thumbs/<name>.webp. With no names, promotes every PNG in
# <stage-dir>.
#
# The thumbnail IS the registration: StartScreen globs
# public/images/thumbs/*.webp, so an image without a thumb is invisible to the
# game no matter where the PNG sits. That is what makes --stage safe to review
# in, and it is why this script always writes both.
#
# Refuses to clobber an existing public/images/<name>.png unless --force.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
  shift
fi

STAGE_DIR="${1:-}"
if [[ -z "$STAGE_DIR" ]]; then
  echo "Usage: $0 [--force] <stage-dir> [name...]" >&2
  exit 1
fi
shift

[[ "$STAGE_DIR" = /* ]] || STAGE_DIR="$ROOT/$STAGE_DIR"
if [[ ! -d "$STAGE_DIR" ]]; then
  echo "No such stage dir: $STAGE_DIR" >&2
  exit 1
fi

NAMES=("$@")
if [[ ${#NAMES[@]} -eq 0 ]]; then
  for f in "$STAGE_DIR"/*.png; do
    [[ -e "$f" ]] || { echo "No PNGs in $STAGE_DIR" >&2; exit 1; }
    NAMES+=("$(basename "$f" .png)")
  done
fi

mkdir -p "$ROOT/public/images/thumbs"

promoted=0
for name in "${NAMES[@]}"; do
  src="$STAGE_DIR/${name}.png"
  dst="$ROOT/public/images/${name}.png"
  thumb="$ROOT/public/images/thumbs/${name}.webp"

  if [[ ! -f "$src" ]]; then
    echo "skip $name -- not in stage dir" >&2
    continue
  fi
  if [[ -f "$dst" && "$FORCE" != 1 ]]; then
    echo "skip $name -- already in public/images (use --force to replace)" >&2
    continue
  fi

  mv "$src" "$dst"
  convert "$dst" -resize 300x450^ -gravity center -extent 300x450 -quality 82 "$thumb"
  echo "promoted $name"
  promoted=$((promoted + 1))
done

echo "Promoted $promoted image(s)."
remaining=$(find "$STAGE_DIR" -maxdepth 1 -name '*.png' | wc -l)
if [[ "$remaining" -gt 0 ]]; then
  echo "$remaining candidate(s) left in $STAGE_DIR -- rm -rf it once you are done."
fi
