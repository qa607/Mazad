#!/usr/bin/env bash
# Starts (headed, cold boot) or checks the Android emulator used by the Mazad mobile tests.
#
# Staging is reachable only through NetBird: NetBird's DNS resolves the staging host to an
# internal IP, while public DNS returns a public endpoint that rejects the request (403). The
# emulator does not see macOS per-domain resolvers, so it is pointed at NetBird's resolver with
# -dns-server. That resolver is found at launch (never hardcoded) and verified first.
#
#   start   Launch the AVD headed with -no-snapshot-load -no-snapshot-save (saved snapshots and
#           AVD settings are never written). If that AVD is already running, run "check" instead.
#   check   Read-only: compare how the Mac and the running emulator resolve the staging host,
#           and the emulator clock. Exit code 1 when the emulator cannot reach staging via VPN.
#
# Settings (shell environment first, then .env, then the default). Only these keys are read
# from .env, with grep; .env is never sourced, so credentials are never loaded or printed.
#   ANDROID_AVD             AVD name. Default: Pixel_10_Pro_XL
#   EMULATOR_DNS_MODE       require (default): do not launch unless NetBird DNS is verified
#                           auto: warn and launch with default DNS (staging will return 403)
#                           off: never pass -dns-server
#   EMULATOR_BOOT_TIMEOUT   Seconds to wait for boot. Default: 300
#   ANDROID_UDID            Device serial for "check" (also used by the Appium session)
#   TEST_ENV                Approved staging environment id (config/environments/<id>.json); required
#   BASE_URL                Optional; must equal that environment's baseURL
#   ANDROID_HOME            SDK path. Default: ~/Library/Android/sdk

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUBLIC_PROBE_HOST="connectivitycheck.gstatic.com"
MAX_CLOCK_SKEW=30

info() { printf '%s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

# Reads one key from .env without sourcing the file.
env_file_value() {
  local file="$ROOT/.env"
  [[ -f "$file" ]] || return 0
  grep -E "^$1=" "$file" | tail -n 1 | cut -d= -f2- | sed -E "s/^[\"']//; s/[\"']$//" || true
}

# Shell environment first, then .env, then the default.
setting() {
  local value="${!1:-}"
  [[ -n "$value" ]] || value="$(env_file_value "$1")"
  printf '%s' "${value:-$2}"
}

AVD="$(setting ANDROID_AVD Pixel_10_Pro_XL)"
DNS_MODE="$(setting EMULATOR_DNS_MODE require)"
BOOT_TIMEOUT="$(setting EMULATOR_BOOT_TIMEOUT 300)"
UDID="$(setting ANDROID_UDID '')"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$SDK/platform-tools/adb"
EMULATOR="$SDK/emulator/emulator"

case "$DNS_MODE" in
  require | auto | off) ;;
  *) die "EMULATOR_DNS_MODE must be require, auto or off (got \"$DNS_MODE\")." ;;
esac
[[ "$BOOT_TIMEOUT" =~ ^[0-9]+$ ]] || die "EMULATOR_BOOT_TIMEOUT must be a number of seconds."
[[ -x "$ADB" ]] || die "adb not found at $ADB (set ANDROID_HOME)."

staging_host() {
  # The selected approved staging environment (TEST_ENV; no default), as in
  # config/staging-environments.ts. Production names are refused; BASE_URL may only repeat it.
  local name file url override
  name="$(setting TEST_ENV '')"
  [[ -n "$name" ]] || die "TEST_ENV is not set: choose an approved staging environment (config/environments/<id>.json)."
  [[ "$name" =~ ^[a-z0-9][a-z0-9-]{1,40}$ ]] || die "TEST_ENV \"$name\" is not a valid environment id."
  if [[ "$name" =~ [Pp][Rr][Oo][Dd] || "$name" =~ (^|-)(live|prd)(-|$) ]]; then
    die "Production is permanently blocked: TEST_ENV \"$name\" is refused."
  fi
  file="$ROOT/config/environments/$name.json"
  [[ -f "$file" ]] || die "TEST_ENV \"$name\" is not an approved staging environment."
  url="$(sed -nE 's/.*"baseURL"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' "$file" | head -n 1)"
  override="$(setting BASE_URL '')"
  if [[ -n "$override" && "${override%/}" != "${url%/}" ]]; then
    die "BASE_URL does not match the approved baseURL of \"$name\"."
  fi
  url="${url#*://}"
  url="${url%%/*}"
  url="${url%%:*}"
  [[ -n "$url" ]] || die "Could not determine the staging host from $file."
  printf '%s' "$url"
}

is_private_ipv4() {
  [[ "$1" =~ ^10\. || "$1" =~ ^192\.168\. || "$1" =~ ^172\.(1[6-9]|2[0-9]|3[01])\. ]]
}

# First IPv4 address a DNS server returns for a name (empty when it does not answer).
dig_ipv4() {
  dig +short +time=3 +tries=1 "$1" @"$2" 2>/dev/null | grep -E '^[0-9]+(\.[0-9]+){3}$' | head -n 1 ||
    true
}

# The macOS per-domain resolver that serves a host (most specific matching domain).
scoped_resolver_for() {
  scutil --dns | awk -v host="$1" '
    function flush() {
      if (dom != "" && ns != "" && (host == dom || substr(host, length(host) - length(dom)) == "." dom)) {
        if (length(dom) > length(best_dom)) { best_dom = dom; best_ns = ns }
      }
      dom = ""; ns = ""
    }
    /^DNS configuration \(for scoped queries\)/ { flush(); exit }
    /^resolver #/ { flush() }
    $1 == "domain" { dom = $3 }
    $1 == "nameserver[0]" { ns = $3 }
    END { flush(); if (best_ns != "") print best_ns }
  '
}

# Verifies NetBird DNS for a host. Sets NETBIRD_DNS (the resolver) and NETBIRD_NOTE (what was
# verified, or why it failed). Returns 1 when NetBird DNS cannot be used.
NETBIRD_DNS=""
NETBIRD_NOTE=""
NETBIRD_WARNING=""
netbird_fail() {
  NETBIRD_NOTE="$1"
  return 1
}
verify_netbird_dns() {
  local host="$1" status available resolver internal_ip public_ip
  NETBIRD_DNS=""
  NETBIRD_WARNING=""
  command -v netbird >/dev/null || netbird_fail "NetBird CLI not found." || return 1
  status="$(netbird status 2>/dev/null)" ||
    netbird_fail "NetBird daemon is not responding (netbird status failed)." || return 1
  grep -q '^Management: Connected' <<<"$status" ||
    netbird_fail "NetBird is not connected (Management)." || return 1
  grep -q '^Signal: Connected' <<<"$status" ||
    netbird_fail "NetBird is not connected (Signal)." || return 1
  # NetBird's own nameserver health probe can report 0 available while its resolver answers
  # correctly. In require mode that is only a warning: the direct DNS checks below decide.
  # In auto mode it still falls back to default DNS, as before.
  available="$(sed -nE 's/^Nameservers: ([0-9]+)\/[0-9]+ Available.*/\1/p' <<<"$status")"
  if [[ "${available:-0}" -eq 0 ]]; then
    [[ "$DNS_MODE" == "require" ]] ||
      netbird_fail "NetBird reports no available nameservers." || return 1
    NETBIRD_WARNING="NetBird reports no available nameservers; continuing because its resolver"
    NETBIRD_WARNING+=" passed the direct DNS checks."
  fi
  resolver="$(scoped_resolver_for "$host")"
  [[ -n "$resolver" ]] ||
    netbird_fail "No VPN DNS resolver is registered for $host (scutil --dns)." || return 1
  internal_ip="$(dig_ipv4 "$host" "$resolver")"
  [[ -n "$internal_ip" ]] || netbird_fail "NetBird DNS $resolver did not resolve $host." ||
    return 1
  is_private_ipv4 "$internal_ip" ||
    netbird_fail "NetBird DNS $resolver resolved $host to $internal_ip, not an internal IP." ||
    return 1
  public_ip="$(dig_ipv4 "$PUBLIC_PROBE_HOST" "$resolver")"
  [[ -n "$public_ip" ]] ||
    netbird_fail "NetBird DNS $resolver does not resolve public names ($PUBLIC_PROBE_HOST)." ||
    return 1
  NETBIRD_DNS="$resolver"
  NETBIRD_NOTE="NetBird DNS $resolver: $host -> $internal_ip (internal), $PUBLIC_PROBE_HOST -> $public_ip"
}

# Serial of the running emulator for an AVD (empty when it is not running).
serial_for_avd() {
  local serial name
  for serial in $("$ADB" devices | awk '$1 ~ /^emulator-/ && $2 == "device" { print $1 }'); do
    name="$("$ADB" -s "$serial" emu avd name 2>/dev/null | head -n 1 | tr -d '\r')"
    [[ "$name" == "$1" ]] && {
      printf '%s' "$serial"
      return 0
    }
  done
  return 0
}

# Resolves a name inside the device with Android's own resolver (ICMP result is ignored).
guest_resolve() {
  { "$ADB" -s "$1" shell ping -c 1 -W 2 "$2" 2>/dev/null || true; } |
    sed -nE 's/^PING [^ ]+ \(([0-9.]+)\).*/\1/p' | head -n 1
}

cmd_check() {
  local serial="${1:-}" host mac_ip guest_ip guest_public guest_time skew failed=0
  host="$(staging_host)"
  [[ -n "$serial" ]] || serial="$UDID"
  [[ -n "$serial" ]] || serial="$(serial_for_avd "$AVD")"
  if [[ -z "$serial" ]]; then
    local devices
    devices="$("$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
    [[ "$(grep -c . <<<"$devices")" -eq 1 ]] && serial="$devices"
  fi
  [[ -n "$serial" ]] || die "No running device for AVD $AVD (start it with: npm run emulator:start)."

  mac_ip="$(dscacheutil -q host -a name "$host" | awk '/^ip_address:/ { print $2; exit }')"
  guest_ip="$(guest_resolve "$serial" "$host")"
  guest_public="$(guest_resolve "$serial" "$PUBLIC_PROBE_HOST")"
  guest_time="$("$ADB" -s "$serial" shell date +%s 2>/dev/null | tr -d '\r')"
  skew="unknown"
  if [[ "$guest_time" =~ ^[0-9]+$ ]]; then
    skew=$((guest_time - $(date +%s)))
    skew="${skew#-}"
  fi

  info "Device:            $serial"
  info "Mac resolves:      $host -> ${mac_ip:-unresolved}"
  info "Emulator resolves: $host -> ${guest_ip:-unresolved}"
  info "Emulator public:   $PUBLIC_PROBE_HOST -> ${guest_public:-unresolved}"
  info "Clock difference:  ${skew}s"

  if [[ -z "$guest_public" ]]; then
    warn "Emulator DNS is not working. If NetBird disconnected, reconnect it, or restart:"
    warn "  $ADB -s $serial emu kill && npm run emulator:start"
    failed=1
  elif [[ -z "$guest_ip" ]]; then
    warn "Emulator cannot resolve $host."
    failed=1
  elif ! is_private_ipv4 "$guest_ip"; then
    warn "Emulator resolves $host to the public endpoint $guest_ip, which staging rejects (403)."
    warn "The emulator is not using NetBird DNS. Restart it with NetBird connected:"
    warn "  $ADB -s $serial emu kill && npm run emulator:start"
    failed=1
  elif [[ -n "$mac_ip" && "$mac_ip" != "$guest_ip" ]]; then
    warn "Mac and emulator resolve $host differently ($mac_ip vs $guest_ip)."
  fi
  if [[ "$skew" == "unknown" || "$skew" -gt "$MAX_CLOCK_SKEW" ]]; then
    warn "Emulator clock differs from the Mac by more than ${MAX_CLOCK_SKEW}s (TLS may fail)."
    failed=1
  fi

  if [[ "$failed" -eq 0 ]]; then
    info "PASS: the emulator reaches $host through the VPN path."
  else
    info "FAIL: the emulator network is not ready for staging."
  fi
  return "$failed"
}

cmd_start() {
  local host running dns_server="" log pid serial="" waited=0
  local -a cmd
  host="$(staging_host)"

  "$EMULATOR" -list-avds 2>/dev/null | grep -qxF "$AVD" || die "AVD \"$AVD\" not found."

  running="$(serial_for_avd "$AVD")"
  if [[ -n "$running" ]]; then
    info "AVD $AVD is already running as $running; it is not relaunched. Checking it instead."
    cmd_check "$running"
    return
  fi

  if [[ "$DNS_MODE" != "off" ]]; then
    if verify_netbird_dns "$host"; then
      dns_server="$NETBIRD_DNS"
      [[ -z "$NETBIRD_WARNING" ]] || warn "$NETBIRD_WARNING"
      info "$NETBIRD_NOTE"
    elif [[ "$DNS_MODE" == "require" ]]; then
      die "Not launching: $NETBIRD_NOTE Connect NetBird, or set EMULATOR_DNS_MODE=auto to" \
        "launch without it."
    else
      warn "$NETBIRD_NOTE"
      warn "Launching with default DNS: staging will resolve to its public endpoint (403)."
    fi
  fi

  cmd=("$EMULATOR" -avd "$AVD")
  [[ -n "$dns_server" ]] && cmd+=(-dns-server "$dns_server")
  cmd+=(-no-snapshot-load -no-snapshot-save)

  mkdir -p "$ROOT/reports"
  log="$ROOT/reports/emulator-$AVD.log"
  info "Launching (headed): ${cmd[*]}"
  info "Emulator log: $log"
  nohup "${cmd[@]}" >"$log" 2>&1 &
  pid=$!

  while [[ -z "$serial" ]]; do
    kill -0 "$pid" 2>/dev/null || die "The emulator exited during startup; see $log."
    [[ "$waited" -lt "$BOOT_TIMEOUT" ]] || die "No device after ${BOOT_TIMEOUT}s; see $log."
    sleep 2
    waited=$((waited + 2))
    serial="$(serial_for_avd "$AVD")"
  done
  info "Device $serial is up; waiting for Android to finish booting..."
  until [[ "$("$ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    kill -0 "$pid" 2>/dev/null || die "The emulator exited during boot; see $log."
    [[ "$waited" -lt "$BOOT_TIMEOUT" ]] || die "Boot did not complete after ${BOOT_TIMEOUT}s."
    sleep 2
    waited=$((waited + 2))
  done
  info "Booted."
  cmd_check "$serial"
}

case "${1:-}" in
  start) cmd_start ;;
  check) cmd_check ;;
  *)
    echo "Usage: $0 {start|check}" >&2
    exit 2
    ;;
esac
