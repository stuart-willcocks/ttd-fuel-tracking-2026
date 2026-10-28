export type AssetType = 'GENERATOR' | 'TANK' | 'PLANT';

export type TransactionType =
  // Generator
  | 'CheckInGenerator'
  | 'CheckOutGenerator'
  | 'FuelTransferGenerator'
  | 'PoweredUp'
  | 'PoweredDown'
  // Tank
  | 'CheckInTank'
  | 'CheckOutTank'
  | 'FuelTransferTank'
  // Plant
  | 'CheckInPlant'
  | 'CheckOutPlant'
  | 'FuelTransferPlant';

export interface Equipment {
  equipmentId: string; // TTD-vvv-nnnn
  area: string;
  location: string;
  what3words: string;
  latitude?: number;
  longitude?: number;
  type: AssetType;
  capacity?: number; // kVA for generator, litres for tank, undefined for plant
  rentalSerialNumber: string;
  poweredUpTimestamp?: string; // YYYY-MM-DD HH:mm:SS (generators only)
  poweredDownTimestamp?: string; // YYYY-MM-DD HH:mm:SS (generators only)
  updatedAt?: string;
}

export interface Transaction {
  id: string; // Client UUID
  equipmentId: string;
  transactionTimestamp: string; // YYYY-MM-DD HH:mm:SS (PDA local time)
  uploadTimestamp?: string; // YYYY-MM-DD HH:mm:SS (Server/Sync time)
  transactionType: TransactionType;

  // Measurement fields
  checkInFuelEighths?: number; // 0-8
  checkOutFuelEighths?: number; // 0-8
  checkInFuelPercentage?: number; // 0-100
  checkOutFuelPercentage?: number; // 0-100
  checkInDefPercentage?: number; // 0-100
  checkOutDefPercentage?: number; // 0-100
  fuelTransferLitres?: number; // positive int
  defTransferLitres?: number; // positive int
  checkInKWH?: number; // positive int
  checkOutKWH?: number; // positive int

  // Sync state & device info
  syncStatus: 'pending' | 'synced' | 'failed';
  syncError?: string;
  deviceId?: string; // Identifier of the PDA that executed the transaction
  createdAt: string;
}

export type DeviceStatus = 'active' | 'pending' | 'revoked';

export interface DeviceTelemetry {
  batteryLevel?: number | null; // 0 - 100 (%)
  isCharging?: boolean | null; // true / false
  latitude?: number | null;
  longitude?: number | null;
  locationAccuracy?: number | null; // in meters
  lastTelemetryAt?: string | null; // ISO timestamp
}

export interface AuthorizedDevice extends DeviceTelemetry {
  deviceId: string;
  deviceName?: string;
  authToken: string;
  status: DeviceStatus;
  registeredAt: string;
  lastSeenAt: string;
}

export type ActionType = 'check-in' | 'record-fuel' | 'check-out' | 'power-up' | 'power-down';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
