#!/usr/bin/env bash
# Build the Graphify graph for the demo repo's main and copy it into this app.
#   scripts/import-graph.sh ../pr-reality-check-demo
# Needs: uv tool install graphifyy   (code-only extraction, no API key)
set -euo pipefail
DEMO="${1:-../pr-reality-check-demo}"
APP="$(cd "$(dirname "$0")/.." && pwd)"
command -v graphify >/dev/null || { echo "graphify not found: run 'uv tool install graphifyy' (then 'uv tool update-shell')"; exit 1; }
cd "$DEMO"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] || { echo "Demo repo is on '$BRANCH'. Run: git -C $DEMO checkout main"; exit 1; }
git diff --quiet || { echo "Demo repo has uncommitted changes; the graph must match a pushed commit."; exit 1; }
COMMIT="$(git rev-parse HEAD)"
OWNER_REPO="$(git remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' || true)"
if [ -z "$OWNER_REPO" ]; then
  APP_OWNER="$(git -C "$APP" remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##; s#/.*##' || true)"
  OWNER_REPO="${APP_OWNER:-CHANGE_ME}/pr-reality-check-demo"
fi
GRAPHIFY_BACKEND=none graphify extract . --code-only
[ -f graphify-out/graph.html ] || GRAPHIFY_BACKEND=none graphify cluster-only . --no-label || true
cp graphify-out/graph.json "$APP/data/graph.json"
[ -f graphify-out/graph.html ] && cp graphify-out/graph.html "$APP/data/graph.html" || echo "WARN: no graph.html produced; /graph will show a 'Graph unavailable' page"
[ -f graphify-out/GRAPH_REPORT.md ] && cp graphify-out/GRAPH_REPORT.md "$APP/data/GRAPH_REPORT.md" || true
VERSION="$(graphify --version 2>/dev/null | head -1 | tr -d '\r')"
OWNER="${OWNER_REPO%%/*}"; NAME="${OWNER_REPO##*/}"
cat > "$APP/data/manifest.json" <<JSON
{
  "repo": { "owner": "${OWNER}", "name": "${NAME}" },
  "graphCommit": "$COMMIT",
  "graphifyVersion": "${VERSION:-unknown}"
}
JSON
echo "Graph for $OWNER_REPO @ $COMMIT copied into $APP/data/"
cd "$APP" && node scripts/check.js --inspect data/graph.json
if git -C "$DEMO" ls-remote --exit-code origin main >/dev/null 2>&1; then
  REMOTE="$(git -C "$DEMO" ls-remote origin refs/heads/main | cut -f1)"
  [ "$REMOTE" = "$COMMIT" ] || echo "WARN: origin/main is $REMOTE but the graph is $COMMIT. Push main first, or the card will say graphStale."
fi
