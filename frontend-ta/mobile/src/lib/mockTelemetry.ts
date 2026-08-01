// Synthetic replacement for the old MQTT live-telemetry stream.
// Generates plausible fluctuating power/water readings on an interval and
// mirrors relay/valve state out of mockDb so toggling the switches in
// dashboard.tsx is reflected in the live feed (power drops near zero when
// the relay is off, flow stays at zero when the valve is closed).

import { findUnitByDeviceId, hashSeed, mulberry32 } from './mockDb'

export interface LiveTelemetryPoint {
  watts: number
  voltage: number
  current: number
  flowRate: number
  kwh: number
  water: number
  relayOn: boolean
  valveOn: boolean
}

/**
 * Subscribes to a synthetic live telemetry stream for `deviceId`.
 * Returns an unsubscribe function.
 */
export function subscribeLiveTelemetry(
  deviceId: string,
  onData: (point: LiveTelemetryPoint) => void,
  intervalMs = 2000,
): () => void {
  const rng = mulberry32(hashSeed(deviceId))

  // Stable per-device baseline so a given device "looks" the same across remounts.
  const basePowerW = 250 + rng() * 500 // 250-750W typical household draw
  const flowChance = 0.3 + rng() * 0.35 // likelihood of a water burst each tick

  let cumulativeKwh = 5 + rng() * 15
  let cumulativeWater = 1 + rng() * 5

  const tick = () => {
    const unit = findUnitByDeviceId(deviceId)
    const relayOn = unit ? unit.relayStatus : true
    const valveOn = unit ? unit.valveStatus : true

    const now = new Date()
    const hour = now.getHours() + now.getMinutes() / 60

    // Soft day/night curve: gentle peaks around 06-09h and 17-22h, low overnight.
    const morningPeak = Math.exp(-((hour - 7.5) ** 2) / (2 * 2.2 ** 2))
    const eveningPeak = Math.exp(-((hour - 19.5) ** 2) / (2 * 3 ** 2))
    const curve = 0.35 + 0.65 * Math.max(morningPeak, eveningPeak)
    const jitter = 0.85 + rng() * 0.3

    const watts = relayOn ? Math.max(0, basePowerW * curve * jitter) : 2 + rng() * 3 // small standby draw
    const voltage = 220 + (rng() - 0.5) * 6
    const current = voltage > 0 ? watts / voltage : 0

    let flowRate = 0
    if (valveOn && rng() < flowChance) {
      flowRate = rng() * 4 // 0-4 L/min bursts
    }

    cumulativeKwh += relayOn ? (watts / 1000) * (intervalMs / 3_600_000) : 0
    cumulativeWater += (flowRate * (intervalMs / 60_000)) / 1000

    onData({
      watts: Math.round(watts),
      voltage: Number(voltage.toFixed(1)),
      current: Number(current.toFixed(3)),
      flowRate: Number(flowRate.toFixed(2)),
      kwh: Number(cumulativeKwh.toFixed(3)),
      water: Number(cumulativeWater.toFixed(4)),
      relayOn,
      valveOn,
    })
  }

  tick()
  const id = window.setInterval(tick, intervalMs)
  return () => window.clearInterval(id)
}
