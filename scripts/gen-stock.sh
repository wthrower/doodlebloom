#!/usr/bin/env bash
# Generate a stock image for doodlebloom.
#
# Usage: scripts/gen-stock.sh [--no-style] [--stage <dir>] <name> "<prompt>"
#
# Generates public/images/<name>.png  (1024x1536)
#        public/images/thumbs/<name>.webp  (300x450)
#
# --no-style sends the prompt verbatim, without STYLE_SUFFIX. The default
# suffix asks for flat cel-shaded art with traceable region boundaries; pass
# --no-style when the prompt dictates a competing look (stained glass, art
# deco, mosaic, folk art) that the suffix would fight.
#
# --stage <dir> writes only <dir>/<name>.png and skips the thumbnail. Staged
# images are invisible to the app: StartScreen globs public/images/thumbs/,
# so an image is not "in the game" until it has a thumb. Curate a staged batch
# in a gallery, then run promote-stock.sh on the keepers.
#
# Example:
#   scripts/gen-stock.sh fox "A red fox sitting on a mossy log in an autumn forest"
#   scripts/gen-stock.sh --no-style athena_stained_glass "A stained glass window of Athena"
#   scripts/gen-stock.sh --stage tmp/batch-1 fox "A red fox on a mossy log"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
LEO="$HOME/src/leo/cli.py"

USE_STYLE=1
STAGE_DIR=""

while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --no-style) USE_STYLE=0; shift ;;
    --stage)
      STAGE_DIR="${2:-}"
      if [[ -z "$STAGE_DIR" ]]; then
        echo "--stage requires a directory" >&2
        exit 1
      fi
      shift 2
      ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

NAME="${1:-}"
PROMPT="${2:-}"

if [[ -z "$NAME" || -z "$PROMPT" ]]; then
  echo "Usage: $0 [--no-style] [--stage <dir>] <name> \"<prompt>\""
  exit 1
fi

# Single source of truth, shared with src/hooks/useOpenAI.ts.
STYLE_SUFFIX=" $(cat "$ROOT/prompts/style-suffix.txt")"

if [[ -n "$STAGE_DIR" ]]; then
  [[ "$STAGE_DIR" = /* ]] || STAGE_DIR="$ROOT/$STAGE_DIR"
  OUT_PNG="$STAGE_DIR/${NAME}.png"
  OUT_THUMB=""
else
  OUT_PNG="$ROOT/public/images/${NAME}.png"
  OUT_THUMB="$ROOT/public/images/thumbs/${NAME}.webp"
fi

mkdir -p "$(dirname "$OUT_PNG")"
[[ -n "$OUT_THUMB" ]] && mkdir -p "$(dirname "$OUT_THUMB")"

echo "Generating $NAME..."
if [[ "$USE_STYLE" == 1 ]]; then
  FULL_PROMPT="${PROMPT}${STYLE_SUFFIX}"
else
  FULL_PROMPT="$PROMPT"
fi
"$LEO" oai "$FULL_PROMPT" -o "$OUT_PNG" --size 1024x1536 --quality high

echo "Done!"
echo "  $OUT_PNG"

if [[ -n "$OUT_THUMB" ]]; then
  echo "Creating thumbnail..."
  convert "$OUT_PNG" -resize 300x450^ -gravity center -extent 300x450 -quality 82 "$OUT_THUMB"
  echo "  $OUT_THUMB"
fi
