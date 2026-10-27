import * as XLSX from 'xlsx';
import type { Equipment, AssetType } from '../types';

/**
 * Parses an .xlsx or .csv equipment file.
 * The sheets are expected to be "EquipmentList" and "Transactions".
 * The "Transactions" sheet is ignored.
 * The "EquipmentList" sheet has columns:
 * EquipmentId, Area, Location, what3words, Type, Size, SerialNumber
 */
export async function parseEquipmentFile(file: File): Promise<Equipment[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  // Look for "EquipmentList" tab (ignoring "Transactions")
  let targetSheetName = workbook.SheetNames.find(
    (name) => name.trim().toLowerCase() === 'equipmentlist'
  );

  // If not explicitly named EquipmentList (e.g. single-sheet CSV), pick first sheet that is NOT Transactions
  if (!targetSheetName) {
    targetSheetName = workbook.SheetNames.find(
      (name) => name.trim().toLowerCase() !== 'transactions'
    );
  }

  if (!targetSheetName) {
    throw new Error('Could not find "EquipmentList" sheet in file.');
  }

  const worksheet = workbook.Sheets[targetSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

  const equipmentList: Equipment[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];

    // Helper to find key case-insensitively and space-insensitively
    const getVal = (keyName: string): any => {
      const lowerKey = keyName.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const k of Object.keys(raw)) {
        if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerKey) {
          return raw[k];
        }
      }
      return '';
    };

    const rawId = String(getVal('equipmentid')).trim();
    if (!rawId) continue; // skip blank rows

    const area = String(getVal('area')).trim() || 'Site Area';
    const location = String(getVal('location')).trim() || 'Field Station';
    let w3w = String(getVal('what3words')).trim();
    if (w3w && !w3w.startsWith('///')) {
      w3w = `///${w3w}`;
    }
    if (!w3w) {
      w3w = '///field.power.setup';
    }

    const rawType = String(getVal('type')).trim().toUpperCase();
    let type: AssetType = 'GENERATOR';
    if (rawType.includes('TANK') || rawType.includes('BOWSER') || rawType.includes('FUEL')) {
      type = 'TANK';
    } else if (
      rawType.includes('PLANT') ||
      rawType.includes('LIGHT') ||
      rawType.includes('TOWER') ||
      rawType.includes('TELE') ||
      rawType.includes('FORK')
    ) {
      type = 'PLANT';
    } else {
      type = 'GENERATOR';
    }

    const rawSize = getVal('size');
    let capacity: number | undefined = undefined;
    if (type !== 'PLANT' && rawSize !== undefined && rawSize !== '') {
      const parsed =
        typeof rawSize === 'number'
          ? rawSize
          : parseInt(String(rawSize).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(parsed) && parsed > 0) {
        capacity = parsed;
      }
    }

    const serialNumber = String(getVal('serialnumber')).trim() || 'RSN-UNKNOWN';

    equipmentList.push({
      equipmentId: rawId,
      area,
      location,
      what3words: w3w,
      type,
      capacity,
      rentalSerialNumber: serialNumber,
      updatedAt: new Date().toISOString(),
    });
  }

  if (equipmentList.length === 0) {
    throw new Error('No valid equipment rows found in "EquipmentList" tab.');
  }

  return equipmentList;
}
