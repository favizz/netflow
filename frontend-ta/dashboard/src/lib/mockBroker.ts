// Tiny in-page pub/sub that stands in for the MQTT broker in the static demo.
// mockDb's command/config/OTA broadcast handlers "publish" simulated device
// acks here after a short delay; ControlCenterPage subscribes to render its
// live Command Log the same way it used to via MQTT topic subscriptions.

export type AckChannel = 'command_ack' | 'config_ack' | 'ota_ack';

export interface AckPayload {
    status: 'ok' | 'noop' | 'error';
    type?: string;
    version?: string;
    error?: string | number;
}

export interface BrokerAckEvent {
    channel: AckChannel;
    deviceId: string;
    payload: AckPayload;
}

type Listener = (event: BrokerAckEvent) => void;

const listeners = new Set<Listener>();

export function subscribeBroker(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function publishAck(deviceId: string, channel: AckChannel, payload: AckPayload): void {
    listeners.forEach(listener => {
        try { listener({ channel, deviceId, payload }); } catch { /* ignore listener errors */ }
    });
}
