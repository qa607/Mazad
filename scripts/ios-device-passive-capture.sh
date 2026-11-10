#!/usr/bin/env bash
# ONE passive network capture of the QA iPhone during ONE launch of Mazad.
# Approved once by the QA owner on 2026-11-08; NOT yet run. Re-confirm with the QA owner before running.
# Observation only: nothing is blocked, nothing is tapped, no request is sent from the Mac.
#
# Run it yourself, as your normal user (NOT with sudo), from a Terminal:
#   bash scripts/ios-device-passive-capture.sh   (from the Mazad project folder)
# It asks for your password once, only to let tcpdump read the capture interface.
#
# Steps: check device and exact build -> rvictl -s -> start tcpdump -> wait 5 s -> launch Mazad
# once (fresh launch: an already-running instance is ended first) -> observe 45 s -> stop tcpdump
# -> rvictl -x. Cleanup also runs on error or Ctrl-C. Nothing else on the phone is changed.
set -euo pipefail

UDID=00008120-0002703C1162601E
BUNDLE=com.motory.dealer
VERSION=8.3
BUILD=1491
PRE_SECONDS=5
OBSERVE_SECONDS=45
ROOT=/Users/madleen/Documents/Mazad
OUT="$ROOT/reports/ios-device-capture/$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$OUT/run.log"
PCAP="$OUT/capture.pcapng"

stamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }
log() { echo "$(stamp) $*" | tee -a "$LOG"; }
die() { echo "REFUSED: $*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || die "run as your normal user, not with sudo (devicectl must see your device)."
mkdir -p "$OUT" && chmod 700 "$OUT"

# 1. Device connected and the exact approved build installed (read-only).
xcrun devicectl list devices 2>/dev/null | grep "$UDID" | grep -q connected \
  || die "QA's iPhone ($UDID) is not connected."
APP_JSON="$(mktemp)"
xcrun devicectl device info apps --device "$UDID" --bundle-id "$BUNDLE" --json-output "$APP_JSON" >/dev/null 2>&1
INSTALLED="$(/usr/bin/python3 -c 'import json,sys; a=json.load(open(sys.argv[1]))["result"]["apps"]; print(a[0]["version"] + " " + a[0]["bundleVersion"] if a else "none")' "$APP_JSON")"
rm -f "$APP_JSON"
[ "$INSTALLED" = "$VERSION $BUILD" ] || die "installed $BUNDLE is '$INSTALLED', approved is '$VERSION $BUILD'."
log "device $UDID connected; $BUNDLE $VERSION ($BUILD) installed"

# Ask for the password now (before anything starts).
sudo -v

TCPDUMP_PID=""
RVI_STARTED=0
cleanup() {
  set +e
  if [ -n "$TCPDUMP_PID" ]; then
    sudo kill -INT "$TCPDUMP_PID" 2>/dev/null
    wait "$TCPDUMP_PID" 2>/dev/null
    log "capture stopped"
  fi
  if [ "$RVI_STARTED" = 1 ]; then
    rvictl -x "$UDID" >>"$LOG" 2>&1 && log "rvi interface removed"
  fi
  [ -f "$PCAP" ] && sudo chown "$(id -un)" "$PCAP" && chmod 600 "$PCAP"
  ifconfig -l | tr ' ' '\n' | grep -q '^rvi' && log "WARNING: an rvi interface is still present" \
    || log "no rvi interface present"
  pgrep -x tcpdump >/dev/null && log "WARNING: a tcpdump process is still running" \
    || log "no tcpdump process running"
}
trap cleanup EXIT INT TERM

# 2. Temporary capture interface.
rvictl -s "$UDID" >>"$LOG" 2>&1 || die "rvictl -s failed (see $LOG)."
RVI_STARTED=1
log "rvi0 created"

# 3. Passive capture (pcapng keeps the per-packet process metadata when the interface provides it).
sudo tcpdump -i rvi0 -n -s 0 -P -w "$PCAP" 2>>"$LOG" &
TCPDUMP_PID=$!
sleep "$PRE_SECONDS"
kill -0 "$TCPDUMP_PID" 2>/dev/null || die "tcpdump did not start (see $LOG)."
log "CAPTURE START"

# 4. ONE fresh launch of Mazad. No taps, no navigation.
log "LAUNCH $BUNDLE"
xcrun devicectl device process launch --device "$UDID" --terminate-existing "$BUNDLE" >>"$LOG" 2>&1 \
  || log "WARNING: launch command reported an error (see above)"

# 5. Observe without interaction, then stop (cleanup runs on exit).
sleep "$OBSERVE_SECONDS"
log "CAPTURE END (observation window ${OBSERVE_SECONDS}s after launch)"
echo
echo "Evidence: $OUT"
