import { Dexie, type EntityTable } from 'dexie';
import type { Equipment, Transaction } from '../types';

export interface OutboxItem {
  id: string; // matches transaction.id
  equipmentId: string;
  createdAt: string;
  attempts: number;
  lastAttempt?: string;
  error?: string;
}

export class FuelTrackingDatabase extends Dexie {
  equipments!: EntityTable<Equipment, 'equipmentId'>;
  transactions!: EntityTable<Transaction, 'id'>;
  outbox!: EntityTable<OutboxItem, 'id'>;

  constructor() {
    super('TTDFuelTrackingDB');
    this.version(1).stores({
      equipments: 'equipmentId, type, area, location',
      transactions: 'id, equipmentId, transactionTimestamp, syncStatus',
      outbox: 'id, equipmentId, createdAt',
    });
  }
}

export const db = new FuelTrackingDatabase();

// Pre-seeded equipment matching the brief format: TTD-vvv-nnnn
export const INITIAL_EQUIPMENT: Equipment[] = [
  {
    equipmentId: 'TTD-MAT-0001',
    area: 'North Zone',
    location: 'Stage Alpha Power Compound',
    what3words: '///puzzle.stages.daring',
    type: 'GENERATOR',
    capacity: 100, // 100 kVA
    rentalSerialNumber: 'RSN-40291',
    poweredUpTimestamp: '2026-10-14 08:30:00',
    poweredDownTimestamp: undefined,
  },
  {
    equipmentId: 'TTD-MAT-0002',
    area: 'Main Arena',
    location: 'Main Sound & Light Generator',
    what3words: '///barks.flesh.gravel',
    type: 'GENERATOR',
    capacity: 250, // 250 kVA
    rentalSerialNumber: 'RSN-40295',
    poweredUpTimestamp: undefined,
    poweredDownTimestamp: undefined,
  },
  {
    equipmentId: 'TTD-MAT-0003',
    area: 'North Zone',
    location: 'Bulk Fuel Farm Alpha',
    what3words: '///tracks.sparks.silver',
    type: 'TANK',
    capacity: 3000, // 3000 Litres
    rentalSerialNumber: 'TNK-99211',
  },
  {
    equipmentId: 'TTD-MAT-0004',
    area: 'Logistics Hub',
    location: 'Vehicle Refuel Station Tank 2',
    what3words: '///launch.bright.solid',
    type: 'TANK',
    capacity: 5000, // 5000 Litres
    rentalSerialNumber: 'TNK-88320',
  },
  {
    equipmentId: 'TTD-MAT-0005',
    area: 'South Gate',
    location: 'Tower Light Unit 04',
    what3words: '///amber.tower.cliff',
    type: 'PLANT',
    capacity: undefined,
    rentalSerialNumber: 'PLT-11422',
  },
  {
    equipmentId: 'TTD-MAT-0006',
    area: 'West Gate',
    location: 'Telehandler 02 - Rigging Team',
    what3words: '///cables.signal.entry',
    type: 'PLANT',
    capacity: undefined,
    rentalSerialNumber: 'PLT-77401',
  },
];

// Initial pre-loaded transaction history to demonstrate immediate live view
export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'seed-tx-001',
    equipmentId: 'TTD-MAT-0001',
    transactionTimestamp: '2026-10-14 08:30:00',
    uploadTimestamp: '2026-10-14 08:31:12',
    transactionType: 'CheckInGenerator',
    checkInFuelPercentage: 85,
    checkInDefPercentage: 90,
    checkInKWH: 12450,
    syncStatus: 'synced',
    createdAt: '2026-10-14T08:30:00Z',
  },
  {
    id: 'seed-tx-002',
    equipmentId: 'TTD-MAT-0001',
    transactionTimestamp: '2026-10-14 08:30:00',
    uploadTimestamp: '2026-10-14 08:31:15',
    transactionType: 'PoweredUp',
    syncStatus: 'synced',
    createdAt: '2026-10-14T08:30:00Z',
  },
  {
    id: 'seed-tx-003',
    equipmentId: 'TTD-MAT-0001',
    transactionTimestamp: '2026-10-15 11:15:00',
    uploadTimestamp: '2026-10-15 11:16:02',
    transactionType: 'FuelTransferGenerator',
    fuelTransferLitres: 420,
    defTransferLitres: 45,
    syncStatus: 'synced',
    createdAt: '2026-10-15T11:15:00Z',
  },
  {
    id: 'seed-tx-004',
    equipmentId: 'TTD-MAT-0003',
    transactionTimestamp: '2026-10-14 09:00:00',
    uploadTimestamp: '2026-10-14 09:02:10',
    transactionType: 'CheckInTank',
    checkInFuelEighths: 7, // 7/8ths
    syncStatus: 'synced',
    createdAt: '2026-10-14T09:00:00Z',
  },
];

export async function initializeDatabase() {
  const count = await db.equipments.count();
  if (count === 0) {
    await db.equipments.bulkAdd(INITIAL_EQUIPMENT);
  }
}

export async function resetDatabaseToDemo() {
  await db.equipments.clear();
  await db.transactions.clear();
  await db.outbox.clear();
  await db.equipments.bulkAdd(INITIAL_EQUIPMENT);
  await db.transactions.bulkAdd(INITIAL_TRANSACTIONS);
}
