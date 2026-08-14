import mqtt from 'mqtt';
import { handleDeviceStatus, handleDeviceEvent, handleDeviceSchedules, handleDeviceConnection, setPublishFn, setClearRetainedFn, mqttStats } from './handlers';
import { handleConfigRequest, handleConfigAck } from '../lib/configSync';

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
      this.client!.subscribe('azul/+/schedules');
      this.client!.subscribe('azul/+/connection');
      this.client!.subscribe('azul/+/config/request');
      this.client!.subscribe('azul/+/config/ack');
      console.log('[MQTT] Subscribed to azul/+/status, azul/+/events, azul/+/schedules, azul/+/config/*');
    });

    this.client.on('message', (topic, payload) => {
      const parts = topic.split('/');
      if (parts.length < 3) return;
      const mac    = parts[1];
      const msgType = parts[2];

      try {
        const raw = payload.toString();
        const data = JSON.parse(raw);
        if      (msgType === 'status')     handleDeviceStatus(mac, data);
        else if (msgType === 'events')     handleDeviceEvent(mac, data);
        else if (msgType === 'schedules')  handleDeviceSchedules(mac, data);
        else if (msgType === 'connection') handleDeviceConnection(mac, data);
        else if (msgType === 'config') {
          const subType = parts[3];
          if      (subType === 'request') { mqttStats.configRequests++; handleConfigRequest(mac, data); }
          else if (subType === 'ack')     { mqttStats.configAcks++; handleConfigAck(mac, data); }
        }
      } catch (err: any) {
        const snippet = payload.toString().slice(0, 200);
        console.error(`[MQTT] Failed to parse on ${topic}: ${err.message} — "${snippet}"`);
      }
    });

    this.client.on('error', (err) => {
      console.error('[MQTT] Error:', err);
    });

    this.client.on('offline', () => {
      console.warn('[MQTT] Offline — will reconnect automatically');
    });
  }

  // Publish a command to a specific device.
  //
  // options.retain: the broker keeps the last-published message on the topic
  // and delivers it to any device that subscribes later. Used for ota/update
  // so a device that reboots or reconnects mid-transaction still receives
  // the command. Retained messages must be cleared by publishing an empty
  // payload with retain=true to the same topic.
  publish(mac: string, command: string, payload: object, options: { retain?: boolean } = {}) {
    if (!this.client?.connected) {
      console.error('[MQTT] Not connected — cannot publish');
      return;
    }
    const topic = `azul/${mac}/cmd/${command}`;
    this.client.publish(topic, JSON.stringify(payload), { retain: !!options.retain });
    if (command.startsWith('config/')) mqttStats.configPushes++;
  }

  // Clear a retained topic (empty payload with retain=true).
  clearRetained(mac: string, command: string) {
    if (!this.client?.connected) return;
    const topic = `azul/${mac}/cmd/${command}`;
    this.client.publish(topic, '', { retain: true });
  }
}

export const mqttClient = new MqttClient();
setPublishFn((mac, command, payload, options) => mqttClient.publish(mac, command, payload, options));
setClearRetainedFn((mac, command) => mqttClient.clearRetained(mac, command));
