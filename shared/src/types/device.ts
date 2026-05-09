export type AccountType = 'owner' | 'landscaper' | 'customer';

export type DeviceSummary = {
  id: string;
  mac: string;
  name: string;
  firmware: string | null;
  online: boolean;
  lastSeenAt: string | null;
};
