#!/usr/bin/env bash
# Bypass anomaly detection latency test
# Usage: DEVICE_ID=DEV-A-101 DB_PASS=secret bash test-bypass-latency.sh
# Requires: mosquitto_pub, mysql client on the VPS

set -euo pipefail

DEVICE_ID="${DEVICE_ID:-DEV-A-101}"
MQTT_HOST="${MQTT_HOST:-localhost}"
MQTT_PORT="${MQTT_PORT:-1883}"
MQTT_USER="${MQTT_USER:-}"
MQTT_PASS="${MQTT_PASS:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"
DB_NAME="${DB_NAME:-flowmeter}"
TRIALS="${TRIALS:-3}"

# Backend subscribes to device/+/data  (NOT /telemetry)
TOPIC="device/${DEVICE_ID}/data"

# 21-byte bypass frame (binary-codec.ts layout, big-endian):
#   energy_total  uint32 ÷100   →   0 kWh          00 00 00 00  (4 B)
#   power         uint16 ÷10    →  60 W  (raw=600)  02 58        (2 B)
#   voltage       uint16 ÷10    → 220 V  (raw=2200) 08 98        (2 B)
#   current       uint16 ÷1000  → 0.27 A (raw=270)  01 0E        (2 B)
#   water_flow    uint16 ÷100   →   0 L/min          00 00        (2 B)
#   water_total   uint32 ÷1000  →   0 m³             00 00 00 00  (4 B)
#   balance       uint32        →   0                00 00 00 00  (4 B)
#   flags         uint8         → relay=0,valve=0    00           (1 B)
# Total: 4+2+2+2+2+4+4+1 = 21 bytes = 42 hex chars
FRAME_HEX="0000000002580898010E000000000000000000000000"

mqtt_auth_args=()
if [[ -n "$MQTT_USER" ]]; then
  mqtt_auth_args+=(-u "$MQTT_USER" -P "$MQTT_PASS")
fi

mysql_cmd() {
  mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -sNe "$1" 2>/dev/null
}

echo "=== Bypass Anomaly Latency Test ==="
echo "Device:  $DEVICE_ID"
echo "Topic:   $TOPIC"
echo "Frame:   $FRAME_HEX (21 bytes)"
echo "Trials:  $TRIALS"
echo ""

latencies=()

for trial in $(seq 1 "$TRIALS"); do
  echo "--- Trial $trial ---"

  T_START=$(date +%s%3N)

  printf '%b' "$(echo "$FRAME_HEX" | sed 's/../\\x&/g')" | \
    mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" \
      "${mqtt_auth_args[@]}" \
      -t "$TOPIC" -s

  echo "  Published at $(date -Iseconds)"

  TIMEOUT=60
  ELAPSED=0
  FOUND=0
  while [[ $ELAPSED -lt $TIMEOUT ]]; do
    COUNT=$(mysql_cmd "SELECT COUNT(*) FROM anomalies WHERE device_id='${DEVICE_ID}' AND type='jailbreak' AND created_at >= NOW() - INTERVAL 2 MINUTE;" || echo "0")
    if [[ "$COUNT" -gt 0 ]]; then
      T_END=$(date +%s%3N)
      DELTA=$(( T_END - T_START ))
      echo "  Anomaly detected after ${DELTA} ms"
      latencies+=("$DELTA")
      FOUND=1
      mysql_cmd "DELETE FROM anomalies WHERE device_id='${DEVICE_ID}' AND type='jailbreak' AND created_at >= NOW() - INTERVAL 2 MINUTE;" || true
      break
    fi
    sleep 0.5
    ELAPSED=$(( ELAPSED + 500 ))
  done

  if [[ $FOUND -eq 0 ]]; then
    echo "  TIMEOUT: no anomaly detected within ${TIMEOUT}s"
    latencies+=("TIMEOUT")
  fi

  [[ $trial -lt $TRIALS ]] && sleep 2
done

echo ""
echo "=== Results ==="
numeric=()
for l in "${latencies[@]}"; do
  [[ "$l" != "TIMEOUT" ]] && numeric+=("$l")
done

if [[ ${#numeric[@]} -gt 0 ]]; then
  sum=0
  for v in "${numeric[@]}"; do sum=$((sum + v)); done
  mean=$((sum / ${#numeric[@]}))
  echo "Latencies (ms): ${latencies[*]}"
  echo "Mean latency:   ${mean} ms"
  echo "Successful:     ${#numeric[@]}/${TRIALS}"
else
  echo "No successful trials."
fi
