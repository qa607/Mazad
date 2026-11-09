#!/usr/bin/env bash
# Mazad iOS Simulator setup for the UI-test build. Simulator only: never the physical iPhone.
#
#   bash scripts/ios-sim.sh check   <sim-udid>               read-only status (Xcode, runtime, device)
#   bash scripts/ios-sim.sh trust-ca <sim-udid>              add the QA test CA to THIS simulator's keychain
#   bash scripts/ios-sim.sh install <sim-udid> <path.app>    install the UI-test .app on this simulator
#   bash scripts/ios-sim.sh shutdown <sim-udid>
#
# The test CA (reports/ios-guard/ca, gitignored) is created by the iOS fixture on first use, or by
# `trust-ca`. It is trusted only by the simulator it is added to.
set -euo pipefail
cmd="${1:-}"; udid="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CA_CERT="$ROOT/reports/ios-guard/ca/mazad-qa-test-ca.pem"

die() { echo "ios-sim: $*" >&2; exit 1; }
[[ "$udid" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$ ]] \
  || die "give a simulator UDID (xcrun simctl list devices)"
xcrun simctl list devices | grep -q "$udid" || die "$udid is not a simulator on this Mac"

case "$cmd" in
  check)
    # sed reads all input (head would close the pipe early and trip pipefail).
    xcodebuild -version | sed -n 1p
    xcrun simctl list runtimes | grep -i ios || true
    xcrun simctl list devices | grep "$udid"
    [ -f "$CA_CERT" ] && echo "test CA: present" || echo "test CA: not created yet"
    ;;
  trust-ca)
    if [ ! -f "$CA_CERT" ]; then
      mkdir -p "$(dirname "$CA_CERT")"
      openssl genrsa -out "${CA_CERT%.pem}.key" 2048 2>/dev/null
      chmod 600 "${CA_CERT%.pem}.key"
      openssl req -x509 -new -key "${CA_CERT%.pem}.key" -sha256 -days 30 -out "$CA_CERT" \
        -subj "/CN=Mazad QA test CA (simulator only)" \
        -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
    fi
    xcrun simctl bootstatus "$udid" -b >/dev/null
    xcrun simctl keychain "$udid" add-root-cert "$CA_CERT"
    echo "test CA trusted by simulator $udid only"
    ;;
  install)
    app="${3:-}"; [ -d "$app" ] && [[ "$app" == *.app ]] || die "give the path to the UI-test .app"
    xcrun simctl bootstatus "$udid" -b >/dev/null
    xcrun simctl install "$udid" "$app"
    /usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" -c "Print CFBundleShortVersionString" \
      -c "Print CFBundleVersion" "$app/Info.plist"
    ;;
  shutdown)
    xcrun simctl shutdown "$udid" || true
    ;;
  *) die "usage: check|trust-ca|install|shutdown <sim-udid> [path.app]" ;;
esac
