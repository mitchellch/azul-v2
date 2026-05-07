export type ControllerType = 'main' | 'zone-extender';

export type ControllerStatus = 'online' | 'offline' | 'error';

export interface Controller {
  id: string;
  name: string;
  type: ControllerType;
  status: ControllerStatus;
  firmwareVersion: string;
  createdAt: string;
  updatedAt: string;
}
