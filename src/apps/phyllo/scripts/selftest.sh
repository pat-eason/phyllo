#!/bin/sh
# In-app self-test (T7.5a): build a release Phyllo, launch it with PHYLLO_SELFTEST=1 and a throwaway PHYLLO_HOME,
# wait for the report the app writes (src/selftest/), print a PASS/FAIL summary and exit non-zero on failure.
#
#   pnpm --filter phyllo selftest              # build + run
#   sh scripts/selftest.sh --skip-build        # reuse the last build
#   SELFTEST_TIMEOUT=180 sh scripts/selftest.sh
#
# Build order: `tauri build --bundles app` (Phyllo.app), then `--no-bundle` (bare release binary) if bundling
# fails (signing / notarization config), then a debug `--no-bundle` build as the last resort. The window appears
# while the test runs; audio plays for ~3 s. The user's ~/Music/Phyllo is never touched.
set -eu

cd "$(dirname "$0")/.."
APP_DIR=$(pwd)
TARGET=${CARGO_TARGET_DIR:-$APP_DIR/src-tauri/target}
TIMEOUT=${SELFTEST_TIMEOUT:-120}
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    *) echo "usage: $0 [--skip-build]" >&2; exit 2 ;;
  esac
done

WORK=$(mktemp -d "${TMPDIR:-/tmp}/phyllo-selftest.XXXXXX")
REPORT=${PHYLLO_SELFTEST_REPORT:-$WORK/report.json}
LOG=$WORK/app.log
mkdir -p "$WORK/home"

find_binary() {
  for candidate in \
    "$TARGET/release/bundle/macos/Phyllo.app/Contents/MacOS/phyllo" \
    "$TARGET/release/bundle/macos/Phyllo.app/Contents/MacOS/Phyllo" \
    "$TARGET/release/phyllo" \
    "$TARGET/debug/phyllo"; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

BUILD_KIND="reused"
if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "==> building release app bundle (tauri build --bundles app)"
  if pnpm tauri build --bundles app; then
    BUILD_KIND="release .app bundle"
  else
    echo "==> bundling failed; falling back to tauri build --no-bundle" >&2
    rm -rf "$TARGET/release/bundle/macos/Phyllo.app"
    if pnpm tauri build --no-bundle; then
      BUILD_KIND="release binary (--no-bundle fallback)"
    else
      echo "==> release build failed; falling back to a debug build" >&2
      pnpm tauri build --debug --no-bundle
      BUILD_KIND="debug binary (fallback)"
    fi
  fi
fi

BIN=$(find_binary) || { echo "no built Phyllo binary under $TARGET" >&2; exit 1; }
echo "==> launching $BIN"
echo "    build: $BUILD_KIND"
echo "    PHYLLO_HOME=$WORK/home"
echo "    report: $REPORT"

PHYLLO_SELFTEST=1 PHYLLO_HOME="$WORK/home" PHYLLO_SELFTEST_REPORT="$REPORT" "$BIN" >"$LOG" 2>&1 &
PID=$!

# The app quits itself once the report is complete; the deadline catches hangs (the partial report stays).
elapsed=0
while kill -0 "$PID" 2>/dev/null; do
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "==> timed out after ${TIMEOUT}s; killing the app" >&2
    kill "$PID" 2>/dev/null || true
    sleep 1
    kill -9 "$PID" 2>/dev/null || true
    break
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done
wait "$PID" 2>/dev/null || true

if [ ! -s "$REPORT" ]; then
  echo "==> FAIL: no report written. App log ($LOG):" >&2
  tail -n 40 "$LOG" >&2 || true
  exit 1
fi

node -e '
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(report.summary || "(no summary)");
if (!report.complete) console.log("INCOMPLETE: the app stopped before the last step (timeout or crash)");
const f = report.findings || {};
const pick = (k) => (f[k] === undefined ? "n/a" : JSON.stringify(f[k]));
console.log("--- WKWebView findings");
for (const k of ["audioAutoplay", "audioContext", "captureTap", "dataWorkletOffline", "unconnectedAnalyser", "setSinkId", "offlineRender", "binaryIpcExport", "assetProtocol", "mediaRecorder", "notifications"]) {
  console.log(`${k}: ${pick(k)}`);
}
const errors = (report.console || []).filter((c) => c.level !== "warn");
if (errors.length) console.log(`--- ${errors.length} console error(s); first: ${errors[0].message.slice(0, 300)}`);
process.exit(report.ok && report.complete ? 0 : 1);
' "$REPORT" && STATUS=0 || STATUS=$?

echo "==> full report: $REPORT"
exit "$STATUS"
