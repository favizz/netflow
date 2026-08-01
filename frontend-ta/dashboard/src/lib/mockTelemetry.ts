// Synthetic "live" telemetry generator, replacing the MQTT `device/+/data`
// subscription used against the real broker. Values fluctuate plausibly
// around a soft day/night power curve and stay in sync with the relay/valve
// status stored in mockDb, so toggling a unit's power/water in the UI is
// reflected in the next live tick.

import { getUnitByDeviceId, isDeviceOnline, hashString, mulberry32 } from './mockDb';

export interface TelemetryPoint {
    watts: number;
    voltage: number;
    current: number;
    flowRate: number;
    energyTotal: number;
    waterTotal: number;
    relayOn: boolean;
    valveOn: boolean;
}

// Running cumulative totals per device, kept alive for the session so
// repeated subscriptions (e.g. re-entering the Live tab) keep counting up.
const runningTotals = new Map<string, { energy: number; water: number }>();

function dayNightFactor(date: Date): number {
    const hour = date.getHours() + date.getMinutes() / 60;
    // Peaks around 19:00 (evening usage), lowest around ~04:00-07:00.
    return 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((2 * Math.PI * (hour - 13)) / 24));
}

export function subscribeLiveTelemetry(
    deviceId: string,
    onData: (point: TelemetryPoint) => void,
    intervalMs = 2000,
): () => void {
    const rand = mulberry32(hashString(deviceId));
    const isLeaky = deviceId.includes('A-302');

    if (!runningTotals.has(deviceId)) {
        const unit = getUnitByDeviceId(deviceId);
        runningTotals.set(deviceId, {
            energy: unit?.last_energy_reading ?? rand() * 400,
            water: unit?.last_water_reading ?? rand() * 40,
        });
    }

    const tick = () => {
        // Offline devices simply don't send telemetry — matches real behavior.
        if (!isDeviceOnline(deviceId)) return;

        const unit = getUnitByDeviceId(deviceId);
        const relayOn = unit ? !!unit.relay_status : true;
        const valveOn = unit ? !!unit.valve_status : true;

        const now = new Date();
        const factor = dayNightFactor(now);
        const noise = 0.85 + rand() * 0.3;
        const watts = relayOn ? (90 + 260 * factor) * noise : Number((0.5 + rand() * 1.5).toFixed(1));
        const voltage = 220 + (rand() - 0.5) * 6;
        const current = watts / voltage;

        let flowRate = 0;
        if (valveOn) {
            if (isLeaky) {
                flowRate = 0.3 + rand() * 0.5;
            } else if (rand() < 0.18) {
                flowRate = 2 + rand() * 6;
            }
        }

        const totals = runningTotals.get(deviceId)!;
        totals.energy += (watts * (intervalMs / 3_600_000)) / 1000;
        totals.water += (flowRate * (intervalMs / 60_000)) / 1000;

        onData({
            watts: Number(watts.toFixed(1)),
            voltage: Number(voltage.toFixed(1)),
            current: Number(current.toFixed(3)),
            flowRate: Number(flowRate.toFixed(2)),
            energyTotal: Number(totals.energy.toFixed(2)),
            waterTotal: Number(totals.water.toFixed(3)),
            relayOn,
            valveOn,
        });
    };

    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
}
