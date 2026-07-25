#!/usr/bin/env bash
# Generate multiple stock images in parallel.
#
# Usage: scripts/gen-batch.sh [gen-stock flags...]
#
# Flags are forwarded verbatim to every job, so a whole batch can stage or skip
# the style suffix:
#   scripts/gen-batch.sh --stage tmp/batch-1
#   scripts/gen-batch.sh --no-style --stage tmp/glass-batch
#
# A single job can override with its own flags by prefixing them in the JOBS
# entry: "--no-style|athena_stained_glass|A stained glass window of Athena"
# Per-job overrides must be valueless flags -- --stage takes a value and only
# works as a batch-wide flag, since the value field would be read as the name.
#
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

BATCH_FLAGS=("$@")

pids=()
for job in "${JOBS[@]}"; do
  # Leading --flag fields are per-job overrides; the last two fields are
  # always name|prompt.
  job_flags=()
  while [[ "$job" == --* ]]; do
    job_flags+=("${job%%|*}")
    job="${job#*|}"
  done
  name="${job%%|*}"
  prompt="${job#*|}"
  echo "Starting: $name"
  "$GEN" "${BATCH_FLAGS[@]}" "${job_flags[@]}" "$name" "$prompt" &
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
