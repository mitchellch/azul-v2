import { BleManager, Device, Subscription, State } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

// ---------------------------------------------------------------------------
// UUIDs
// ---------------------------------------------------------------------------

export const BLE_SERVICE_UUID   = '12345678-1234-1234-1234-1234567890ab';
export const BLE_CHAR_STATUS    = '12345678-1234-1234-1234-1234567890b1';
export const BLE_CHAR_COMMAND   = '12345678-1234-1234-1234-1234567890b2';
export const BLE_CHAR_ZONE_DATA = '12345678-1234-1234-1234-1234567890b3';
export const BLE_CHAR_RESPONSE  = '12345678-1234-1234-1234-1234567890b4';
export const BLE_CHAR_PIN       = '12345678-1234-1234-1234-1234567890b5';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PendingRequest = {
  id: string;
  chunks: string[];
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  timeoutMs: number;
};

type CommandQueueEntry = {
  execute: () => Promise<void>;
};

// Commands that may receive large chunked responses get a longer timeout
const LONG_TIMEOUT_CMDS = new Set(['get_schedules', 'create_schedule', 'update_schedule', 'get_log', 'set_wifi']);
const DEFAULT_TIMEOUT_MS = 10_000;
const LONG_TIMEOUT_MS    = 15_000;

// ---------------------------------------------------------------------------
// BleManager singleton
// ---------------------------------------------------------------------------

const manager = new BleManager();

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const pending   = new Map<string, PendingRequest>();
let responseSubscription: Subscription | null = null;
let commandQueue: CommandQueueEntry[] = [];
let commandInFlight = false;

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
  } else {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

export function scanForControllers(
  onFound: (device: Device) => void,
  timeoutMs = 15_000
): void {
  manager.startDeviceScan([BLE_SERVICE_UUID], null, (error, device) => {
    if (error) {
      console.warn('[BLE] Scan error:', error.message);
      return;
    }
    if (device) onFound(device);
  });

  setTimeout(() => manager.stopDeviceScan(), timeoutMs);
}

export function stopScan(): void {
  manager.stopDeviceScan();
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export async function connect(deviceId: string): Promise<Device> {
  const device = await manager.connectToDevice(deviceId, { requestMTU: 512 });
  await device.discoverAllServicesAndCharacteristics();
  _subscribeToResponses(device);
  return device;
}

export async function disconnect(device: Device): Promise<void> {
  responseSubscription?.remove();
  responseSubscription = null;
  await device.cancelConnection();
}

// ---------------------------------------------------------------------------
// Response notification subscription
// ---------------------------------------------------------------------------

function _subscribeToResponses(device: Device): void {
  responseSubscription?.remove();

  responseSubscription = device.monitorCharacteristicForService(
    BLE_SERVICE_UUID,
    BLE_CHAR_RESPONSE,
    (error, characteristic) => {
      if (error) {
        // Connection dropped — reject all pending requests
        for (const req of pending.values()) {
          clearTimeout(req.timer);
          req.reject(new Error('BLE disconnected'));
        }
        pending.clear();
        return;
      }
      if (!characteristic?.value) return;

      let envelope: { id: string; seq: number; done: boolean; d: string };
      try {
        const json = Buffer.from(characteristic.value, 'base64').toString('utf8');
        envelope = JSON.parse(json);
      } catch {
        return;
      }

      const req = pending.get(envelope.id);
      if (!req) return;

      req.chunks.push(envelope.d);

      if (envelope.done) {
        clearTimeout(req.timer);
        pending.delete(envelope.id);
        try {
          const assembled = req.chunks.join('');
          const result = JSON.parse(assembled);
          if (result.ok === false) {
            req.reject(new Error(result.error ?? 'BLE command failed'));
          } else {
            req.resolve(result.data ?? result);
          }
        } catch (e) {
          req.reject(new Error('Failed to parse BLE response'));
        }
        _drainQueue();
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Command queue
// ---------------------------------------------------------------------------

function _drainQueue(): void {
  commandInFlight = false;
  const next = commandQueue.shift();
  if (next) {
    commandInFlight = true;
    next.execute().catch(() => _drainQueue());
  }
}

// ---------------------------------------------------------------------------
// sendCommand
// ---------------------------------------------------------------------------

export function sendCommand(
  device: Device,
  cmd: string,
  data?: object,
  authToken?: string
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      const id = _uuid();
      const timeoutMs = LONG_TIMEOUT_CMDS.has(cmd) ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`BLE command "${cmd}" timed out`));
        _drainQueue();
      }, timeoutMs);

      pending.set(id, { id, chunks: [], resolve, reject, timer, timeoutMs });

      const payload = JSON.stringify({
        id,
        cmd,
        ...(data !== undefined && { data }),
        ...(authToken !== undefined && { auth_token: authToken }),
      });

      // Split large payloads into 180-byte raw chunks. Final chunk gets a
      // \x00 sentinel so the firmware knows to dispatch the assembled command.
      const WRITE_CHUNK = 180;
      const payloadBuf = Buffer.from(payload, 'utf8');
      const chunks: Buffer[] = [];
      for (let off = 0; off < payloadBuf.length; off += WRITE_CHUNK) {
        chunks.push(payloadBuf.slice(off, off + WRITE_CHUNK));
      }

      try {
        for (let i = 0; i < chunks.length; i++) {
          const isLast  = i === chunks.length - 1;
          const chunk   = isLast
            ? Buffer.concat([chunks[i], Buffer.from([0x00])]) // sentinel
            : chunks[i];
          const encoded = chunk.toString('base64');
          await device.writeCharacteristicWithResponseForService(
            BLE_SERVICE_UUID,
            BLE_CHAR_COMMAND,
            encoded
          );
        }
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(e);
        _drainQueue();
      }
    };

    if (commandInFlight) {
      commandQueue.push({ execute });
    } else {
      commandInFlight = true;
      execute().catch(() => _drainQueue());
    }
  });
}

// ---------------------------------------------------------------------------
// Provisioning helpers
// ---------------------------------------------------------------------------

export async function readPin(device: Device): Promise<string> {
  const char = await device.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHAR_PIN);
  if (!char.value) return '';
  return Buffer.from(char.value, 'base64').toString('utf8');
}

// ---------------------------------------------------------------------------
// Status notifications
// ---------------------------------------------------------------------------

export function subscribeToStatus(
  device: Device,
  onStatus: (status: object) => void
): Subscription {
  return device.monitorCharacteristicForService(
    BLE_SERVICE_UUID,
    BLE_CHAR_STATUS,
    (error, characteristic) => {
      if (error || !characteristic?.value) return;
      try {
        const json = Buffer.from(characteristic.value, 'base64').toString('utf8');
        onStatus(JSON.parse(json));
      } catch { /* ignore malformed */ }
    }
  );
}

// ---------------------------------------------------------------------------
// Zone data notifications (b3)
// ---------------------------------------------------------------------------

export function subscribeToZoneData(
  device: Device,
  onZones: (zones: object[]) => void
): Subscription {
  return device.monitorCharacteristicForService(
    BLE_SERVICE_UUID,
    BLE_CHAR_ZONE_DATA,
    (error, characteristic) => {
      if (error || !characteristic?.value) return;
      try {
        const json = Buffer.from(characteristic.value, 'base64').toString('utf8');
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) onZones(parsed);
      } catch { /* ignore malformed */ }
    }
  );
}

// ---------------------------------------------------------------------------
// BLE state observer
// ---------------------------------------------------------------------------

export function onStateChange(
  callback: (state: State) => void
): Subscription {
  return manager.onStateChange(callback, true);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function _uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
