#!/usr/bin/env bash
# Generate multiple stock images in parallel.
# Usage: scripts/gen-batch.sh
# Define jobs in tmp/gen-jobs.sh (sourced at runtime).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
GEN="$SCRIPT_DIR/gen-stock.sh"
JOBS_FILE="$ROOT/tmp/gen-jobs.sh"

if [[ ! -f "$JOBS_FILE" ]]; then
  echo "No jobs file at $JOBS_FILE"
  echo "Create it with a JOBS array, e.g.:"
  echo '  JOBS=('
  echo '    "eagle|A bald eagle in flight"'
  echo '    "swan|A white swan on a lake"'
  echo '  )'
  exit 1
fi

source "$JOBS_FILE"

if [[ ${#JOBS[@]} -eq 0 ]]; then
  echo "JOBS array is empty in $JOBS_FILE"
  exit 0
fi

pids=()
for job in "${JOBS[@]}"; do
  name="${job%%|*}"
  prompt="${job#*|}"
  echo "Starting: $name"
  "$GEN" "$name" "$prompt" &
  pids+=($!)
done

echo "Waiting for ${#pids[@]} jobs..."
failed=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    ((failed++))
  fi
done

echo "Done. ${#pids[@]} jobs, $failed failed."
