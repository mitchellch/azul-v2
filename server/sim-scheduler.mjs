#!/usr/bin/env node
// Simulates firmware publishing scheduled zone activations to MQTT.
// Each zone runs for 60 seconds, zones cycle 1→8 indefinitely.
// The server sees source:"scheduler" and broadcasts via SSE — both web and
// mobile show the zone as running with the "(Scheduled)" badge.
//
// Usage:
//   node scripts/sim-scheduler.mjs <mac>
//   node scripts/sim-scheduler.mjs <mac> --zone-secs 30 --total-zones 4
//
// Ctrl-C to stop (publishes all-idle before exiting).

import mqtt from 'mqtt';

const mac = process.argv[2];
if (!mac) { console.error('Usage: node sim-scheduler.mjs <mac>'); process.exit(1); }

const args     = process.argv.slice(3);
const zoneSecs = parseInt(args[args.indexOf('--zone-secs')  + 1]) || 60;
const numZones = parseInt(args[args.indexOf('--total-zones') + 1]) || 8;

const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const TOPIC    = `azul/${mac}/status`;

const client = mqtt.connect(MQTT_URL);

function allIdle() {
  return Array.from({ length: numZones }, (_, i) => ({
    id: i + 1, status: 'idle', runtime: 0,
  }));
}

function buildPayload(activeZone, remainingSecs) {
  return {
    firmware: 'sim-0.0.1',
    zones: Array.from({ length: numZones }, (_, i) => {
      const id = i + 1;
      if (id === activeZone) {
        return { id, status: 'running', runtime: remainingSecs, source: 'scheduler' };
      }
      return { id, status: 'idle', runtime: 0 };
    }),
  };
}

let activeZone    = 1;
let remainingSecs = zoneSecs;
let tickInterval  = null;
let stopped       = false; // true when a stop/stop-all command received

function tick() {
  if (stopped) {
    const payload = { firmware: 'sim-0.0.1', zones: allIdle() };
    client.publish(TOPIC, JSON.stringify(payload));
    return;
  }
  if (remainingSecs <= 0) {
    activeZone = (activeZone % numZones) + 1;
    remainingSecs = zoneSecs;
  }
  const payload = buildPayload(activeZone, remainingSecs);
  client.publish(TOPIC, JSON.stringify(payload));
  console.log(`[sim] zone ${activeZone} running — ${remainingSecs}s remaining`);
  remainingSecs--;
}

client.on('connect', () => {
  console.log(`[sim] connected to ${MQTT_URL}`);
  console.log(`[sim] cycling ${numZones} zones × ${zoneSecs}s on ${TOPIC}`);

  // Listen for stop commands from the server
  client.subscribe(`azul/${mac}/cmd/zone/stop`);
  client.subscribe(`azul/${mac}/cmd/zone/stop-all`);
  client.on('message', (topic, payload) => {
    if (topic.endsWith('/stop') || topic.endsWith('/stop-all')) {
      try {
        const data = JSON.parse(payload.toString());
        console.log(`[sim] received stop command:`, data);
      } catch {}
      stopped = true;
      console.log(`[sim] stopped — publishing all-idle`);
      client.publish(TOPIC, JSON.stringify({ firmware: 'sim-0.0.1', zones: allIdle() }));
    }
  });

  tick();
  tickInterval = setInterval(tick, 1000);
});

client.on('error', err => { console.error('[sim] MQTT error:', err.message); });

async function shutdown() {
  console.log('\n[sim] stopping — publishing all-idle');
  clearInterval(tickInterval);
  const idle = { firmware: 'sim-0.0.1', zones: allIdle() };
  await new Promise(r => client.publish(TOPIC, JSON.stringify(idle), r));
  client.end();
  process.exit(0);
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
