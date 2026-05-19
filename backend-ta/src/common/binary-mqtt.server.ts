import { ServerMqtt, MqttContext } from '@nestjs/microservices';

/**
 * Extends the default NestJS MQTT server to preserve raw binary payloads.
 *
 * Problem: ServerMqtt.handleMessage() calls `buffer.toString()` before parsing,
 * which irreversibly corrupts non-UTF-8 binary data (e.g. the custom 21-byte
 * telemetry frame from ESP32 devices).
 *
 * Fix: Try JSON.parse first; on failure, pass the raw Buffer to the handler
 * so the controller receives it as a Buffer (not a garbled string).
 */
export class BinaryAwareMqttServer extends ServerMqtt {
  async handleMessage(
    channel: string,
    buffer: Buffer,
    pub: unknown,
    originalPacket: unknown,
  ): Promise<void> {
    // Try JSON first; if it fails, preserve the raw Buffer
    let rawPacket: unknown;
    try {
      rawPacket = JSON.parse(buffer.toString('utf8'));
    } catch {
      rawPacket = buffer; // ← key fix: preserve binary data
    }

    const packet = await this.deserializer.deserialize(
      rawPacket as Record<string, any>,
      { channel },
    );
    const mqttContext = new MqttContext([
      channel,
      originalPacket as Record<string, any>,
    ]);

    // Event-based pattern (all handlers in this project use this path)
    if ((packet as any).id == null) {
      return this.handleEvent(channel, packet, mqttContext);
    }

    // Request-response pattern (included for completeness)
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    const publish = (this as any).getPublisher(
      pub,
      mqttContext,
      (packet as any).id,
    );
    const handler = (this as any).getHandlerByPattern(channel);
    if (!handler) {
      return publish({
        id: (packet as any).id,
        status: 'error',
        err: 'No matching message handler.',
      });
    }
    const response$ = this.transformToObservable(
      await handler(packet.data, mqttContext),
    );
    response$ && this.send(response$, publish);
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }
}
