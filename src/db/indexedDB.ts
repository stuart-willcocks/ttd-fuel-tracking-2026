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
    this.version(2).stores({
      equipments: 'equipmentId, type, area, location',
      transactions: 'id, equipmentId, transactionTimestamp, [equipmentId+transactionTimestamp], syncStatus',
      outbox: 'id, equipmentId, createdAt',
    });
  }
}

export const db = new FuelTrackingDatabase();

export async function initializeDatabase(): Promise<void> {
  await db.open();
}
