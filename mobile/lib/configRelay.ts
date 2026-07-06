import { Device } from 'react-native-ble-plx';
import { sendCommand } from '@/services/ble';
import { configCache, ConfigBlob } from './configCache';

export async function relayConfigIfNeeded(
  device: Device,
  mac: string,
  ownerSub: string
): Promise<{ pushed: boolean; version: number }> {
  // Get controller's current config version
  const result = await sendCommand(device, 'get_config_version', undefined, ownerSub) as any;
  const controllerVersion: number = result?.version ?? 0;

  // Get our cached config version
  const cached = await configCache.get(mac);
  if (!cached || cached.version <= controllerVersion) {
    return { pushed: false, version: controllerVersion };
  }

  // Phone has newer config — push it to controller
  await sendCommand(device, 'push_config', cached, ownerSub);
  return { pushed: true, version: cached.version };
}
