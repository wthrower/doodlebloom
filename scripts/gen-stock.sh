#!/usr/bin/env bash
# Generate a stock image for doodlebloom.
#
# Usage: scripts/gen-stock.sh <name> "<prompt>"
#
# Generates public/images/<name>.png  (1024x1536)
#        public/images/thumbs/<name>.jpg  (300x450)
#
# Example:
#   scripts/gen-stock.sh fox "A red fox sitting on a mossy log in an autumn forest"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
LEO="$HOME/src/leo/cli.py"

NAME="${1:-}"
PROMPT="${2:-}"

if [[ -z "$NAME" || -z "$PROMPT" ]]; then
  echo "Usage: $0 <name> \"<prompt>\""
  exit 1
fi

STYLE_SUFFIX=" Photorealistic, sharp focus, natural colors. Crisp edges and clear boundaries between distinct color areas. No painterly brushwork, no soft blending or gradients, no watercolor or impressionist texture."

OUT_PNG="$ROOT/public/images/${NAME}.png"
OUT_THUMB="$ROOT/public/images/thumbs/${NAME}.jpg"

mkdir -p "$(dirname "$OUT_PNG")" "$(dirname "$OUT_THUMB")"

echo "Generating $NAME..."
"$LEO" oai "${PROMPT}${STYLE_SUFFIX}" -o "$OUT_PNG" --size 1024x1536 --quality high

echo "Creating thumbnail..."
convert "$OUT_PNG" -resize 300x450^ -gravity center -extent 300x450 "$OUT_THUMB"

echo "Done!"
echo "  $OUT_PNG"
echo "  $OUT_THUMB"
