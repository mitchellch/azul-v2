import mqtt from 'mqtt';
import { handleDeviceStatus } from './handlers';

const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://localhost:1883';

class MqttClient {
  private client: mqtt.MqttClient | null = null;

  connect() {
    this.client = mqtt.connect(MQTT_URL);

    this.client.on('connect', () => {
      console.log(`[MQTT] Connected to ${MQTT_URL}`);
      // Subscribe to all device status and event topics
      this.client!.subscribe('azul/+/status');
      this.client!.subscribe('azul/+/events');
      console.log('[MQTT] Subscribed to azul/+/status and azul/+/events');
    });

    this.client.on('message', (topic, payload) => {
      const parts = topic.split('/');
      if (parts.length < 3) return;
      const mac    = parts[1];
      const msgType = parts[2];

      try {
        const data = JSON.parse(payload.toString());
        if (msgType === 'status') handleDeviceStatus(mac, data);
      } catch {
        console.error(`[MQTT] Failed to parse message on ${topic}`);
      }
    });

    this.client.on('error', (err) => {
      console.error('[MQTT] Error:', err.message);
    });

    this.client.on('offline', () => {
      console.warn('[MQTT] Offline — will reconnect automatically');
    });
  }

  // Publish a command to a specific device
  publish(mac: string, command: string, payload: object) {
    if (!this.client?.connected) {
      console.error('[MQTT] Not connected — cannot publish');
      return;
    }
    const topic = `azul/${mac}/cmd/${command}`;
    this.client.publish(topic, JSON.stringify(payload));
    console.log(`[MQTT] Published to ${topic}`);
  }
}

export const mqttClient = new MqttClient();
