import type { Equipment } from '../types';

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
