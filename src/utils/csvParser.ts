import type { Equipment, Transaction, TransactionType } from '../types';

/**
 * Robust RFC 4180 compliant CSV parser
 */
export function parseCSV(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const cleanText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        currentLine.push(currentField.trim());
        if (currentLine.some((f) => f.length > 0)) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some((f) => f.length > 0)) {
      lines.push(currentLine);
    }
  }

  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = lines[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < lines.length; r++) {
    const rowValues = lines[r];
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < lines[0].length; c++) {
      const headerKey = rawHeaders[c] || `col_${c}`;
      rowObj[headerKey] = rowValues[c] ?? '';
    }
    rows.push(rowObj);
  }

  return { headers: rawHeaders, rows };
}

/**
 * Maps CSV row to Equipment object
 */
export function mapRowToEquipment(row: Record<string, string>, index: number): Equipment {
  const eqId =
    row.equipmentid ||
    row.assetid ||
    row.equipment ||
    row.asset ||
    row.id ||
    row.assetnumber ||
    `EQ-${String(index + 1).padStart(4, '0')}`;

  const rawType = (
    row.type ||
    row.equipmenttype ||
    row.assettype ||
    row.category ||
    'GENERATOR'
  ).toUpperCase();

  let type: 'GENERATOR' | 'TANK' | 'PLANT' = 'GENERATOR';
  if (rawType.includes('TANK') || rawType.includes('BOWSER') || rawType.includes('FUEL')) {
    type = 'TANK';
  } else if (
    rawType.includes('PLANT') ||
    rawType.includes('LIGHT') ||
    rawType.includes('TOWER') ||
    rawType.includes('TELEHANDLER') ||
    rawType.includes('PUMP')
  ) {
    type = 'PLANT';
  } else if (rawType.includes('GEN') || rawType.includes('GENERATOR') || rawType.includes('POWER')) {
    type = 'GENERATOR';
  }

  const area =
    row.area ||
    row.zone ||
    row.sector ||
    row.field ||
    row.site ||
    'Site Area';

  const location =
    row.location ||
    row.description ||
    row.name ||
    row.title ||
    row.position ||
    'Location TBC';

  let what3words =
    row.what3words ||
    row.w3w ||
    row.words ||
    row.coordinates ||
    '///setup.field.power';
  if (!what3words.startsWith('///')) {
    what3words = '///' + what3words.replace(/^[/]+/, '');
  }

  let capacity: number | undefined = undefined;
  const rawCap = row.capacity || row.cap || row.fuelcapacity || row.litres || row.kva || row.size;
  if (rawCap) {
    const num = parseInt(String(rawCap).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num > 0) {
      capacity = num;
    }
  }

  const rentalSerialNumber =
    row.rentalserialnumber ||
    row.serialnumber ||
    row.serial ||
    row.rsn ||
    row.fleetno ||
    row.fleetnumber ||
    `RSN-${eqId}`;

  return {
    equipmentId: eqId.trim(),
    area: area.trim(),
    location: location.trim(),
    what3words: what3words.trim(),
    type,
    capacity,
    rentalSerialNumber: rentalSerialNumber.trim(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Extracts CheckIn, FuelTransfer, and CheckOut transactions from CSV row
 */
export function mapRowToTransactions(
  row: Record<string, string>,
  index: number,
  equipment: Equipment
): Transaction[] {
  const txs: Transaction[] = [];
  const baseCheckInTime = new Date('2026-07-02T08:00:00Z').getTime();
  const baseFuelTime = new Date('2026-07-04T12:00:00Z').getTime();
  const baseCheckOutTime = new Date('2026-07-07T16:00:00Z').getTime();

  const checkInDate = new Date(baseCheckInTime + index * 60000).toISOString();
  const fuelDate = new Date(baseFuelTime + index * 60000).toISOString();
  const checkOutDate = new Date(baseCheckOutTime + index * 60000).toISOString();

  const qtyIn = parseInt(row.qtycheckins || '0', 10);
  const qtyOut = parseInt(row.qtycheckouts || '0', 10);
  const fuelLitres = parseInt(row.fueltransferred || '0', 10);
  const defLitres = parseInt(row.deftransferred || '0', 10);

  // 1. Check-In Transaction (when QtyCheckIns > 0)
  if (qtyIn > 0) {
    const txType: TransactionType =
      equipment.type === 'TANK'
        ? 'CheckInTank'
        : equipment.type === 'PLANT'
        ? 'CheckInPlant'
        : 'CheckInGenerator';

    const fuelPct =
      row.checkinfuelpercentage !== undefined && row.checkinfuelpercentage !== ''
        ? Math.min(100, Math.max(0, parseInt(row.checkinfuelpercentage, 10) || 0))
        : undefined;
    const defPct =
      row.checkindefpercentage !== undefined && row.checkindefpercentage !== ''
        ? Math.min(100, Math.max(0, parseInt(row.checkindefpercentage, 10) || 0))
        : undefined;
    const kwh = row.checkinkwh ? parseInt(row.checkinkwh, 10) || undefined : undefined;

    txs.push({
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `tx-in-${index}-${Date.now()}`,
      equipmentId: equipment.equipmentId,
      transactionTimestamp: checkInDate,
      uploadTimestamp: new Date().toISOString(),
      transactionType: txType,
      checkInFuelPercentage: fuelPct,
      checkInDefPercentage: defPct,
      checkInKWH: kwh,
      syncStatus: 'synced',
      deviceId: 'IMPORT-SEED',
      createdAt: checkInDate,
    });
  }

  // 2. Fuel Transfer Transaction (when FuelTransferred > 0 or DefTransferred > 0)
  if (fuelLitres > 0 || defLitres > 0) {
    const txType: TransactionType =
      equipment.type === 'TANK'
        ? 'FuelTransferTank'
        : equipment.type === 'PLANT'
        ? 'FuelTransferPlant'
        : 'FuelTransferGenerator';

    txs.push({
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `tx-fuel-${index}-${Date.now()}`,
      equipmentId: equipment.equipmentId,
      transactionTimestamp: fuelDate,
      uploadTimestamp: new Date().toISOString(),
      transactionType: txType,
      fuelTransferLitres: fuelLitres > 0 ? fuelLitres : undefined,
      defTransferLitres: defLitres > 0 ? defLitres : undefined,
      syncStatus: 'synced',
      deviceId: 'IMPORT-SEED',
      createdAt: fuelDate,
    });
  }

  // 3. Check-Out Transaction (when QtyCheckOuts > 0)
  if (qtyOut > 0) {
    const txType: TransactionType =
      equipment.type === 'TANK'
        ? 'CheckOutTank'
        : equipment.type === 'PLANT'
        ? 'CheckOutPlant'
        : 'CheckOutGenerator';

    const fuelPct =
      row.checkoutfuelpercentage !== undefined && row.checkoutfuelpercentage !== ''
        ? Math.min(100, Math.max(0, parseInt(row.checkoutfuelpercentage, 10) || 0))
        : undefined;
    const defPct =
      row.checkoutdefpercentage !== undefined && row.checkoutdefpercentage !== ''
        ? Math.min(100, Math.max(0, parseInt(row.checkoutdefpercentage, 10) || 0))
        : undefined;
    const kwh = row.checkoutkwh ? parseInt(row.checkoutkwh, 10) || undefined : undefined;

    txs.push({
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `tx-out-${index}-${Date.now()}`,
      equipmentId: equipment.equipmentId,
      transactionTimestamp: checkOutDate,
      uploadTimestamp: new Date().toISOString(),
      transactionType: txType,
      checkOutFuelPercentage: fuelPct,
      checkOutDefPercentage: defPct,
      checkOutKWH: kwh,
      syncStatus: 'synced',
      deviceId: 'IMPORT-SEED',
      createdAt: checkOutDate,
    });
  }

  return txs;
}
