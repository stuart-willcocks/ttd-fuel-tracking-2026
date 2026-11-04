import * as XLSX from 'xlsx';
import type { Equipment, AssetType } from '../types';
import { isValidWhat3WordsFormat } from '../services/what3words';

export interface EquipmentFileValidationResult {
  isValid: boolean;
  fileName: string;
  sheetName: string;
  headersValid: boolean;
  detectedHeaders: string[];
  missingHeaders: string[];
  errors: string[];
  warnings: string[];
  equipmentList: Equipment[];
  newCount: number;
  overwriteCount: number;
  inFileDuplicateCount: number;
}

const REQUIRED_COLUMNS: Array<{ label: string; aliases: string[] }> = [
  { label: 'EquipmentId', aliases: ['equipmentid'] },
  { label: 'Area', aliases: ['area'] },
  { label: 'Location', aliases: ['location'] },
  { label: 'what3words', aliases: ['what3words', 'w3w'] },
  { label: 'Type', aliases: ['type', 'equipmenttype', 'assettype'] },
  { label: 'Size (or Capacity)', aliases: ['size', 'capacity'] },
  { label: 'SerialNumber', aliases: ['serialnumber', 'rentalserialnumber', 'rentalserial'] },
];

function normalizeKey(str: string): string {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Validates and parses an .xlsx or .csv equipment file before applying it to the database.
 * Verifies that all expected column headings are present and that every data row is valid.
 */
export async function validateAndParseEquipmentFile(
  file: File,
  existingAssets: Equipment[] = []
): Promise<EquipmentFileValidationResult> {
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
    return {
      isValid: false,
      fileName: file.name,
      sheetName: '',
      headersValid: false,
      detectedHeaders: [],
      missingHeaders: REQUIRED_COLUMNS.map((c) => c.label),
      errors: ['Could not find an "EquipmentList" sheet in the selected file.'],
      warnings: [],
      equipmentList: [],
      newCount: 0,
      overwriteCount: 0,
      inFileDuplicateCount: 0,
    };
  }

  const worksheet = workbook.Sheets[targetSheetName];
  const matrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });

  if (!matrix || matrix.length === 0) {
    return {
      isValid: false,
      fileName: file.name,
      sheetName: targetSheetName,
      headersValid: false,
      detectedHeaders: [],
      missingHeaders: REQUIRED_COLUMNS.map((c) => c.label),
      errors: ['The selected sheet is empty.'],
      warnings: [],
      equipmentList: [],
      newCount: 0,
      overwriteCount: 0,
      inFileDuplicateCount: 0,
    };
  }

  const rawHeaderRow = (matrix[0] || []).map((cell) => String(cell ?? '').trim()).filter(Boolean);
  const normalizedHeaders = new Set(rawHeaderRow.map(normalizeKey));

  const missingHeaders: string[] = [];
  for (const reqCol of REQUIRED_COLUMNS) {
    const found = reqCol.aliases.some((alias) => normalizedHeaders.has(alias));
    if (!found) {
      missingHeaders.push(reqCol.label);
    }
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const headersValid = missingHeaders.length === 0;
  if (!headersValid) {
    errors.push(
      `Missing expected column heading(s): ${missingHeaders.join(', ')}.`
    );
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
  const dedupedById = new Map<string, Equipment>();
  let inFileDuplicateCount = 0;
  let nonBlankRowCount = 0;

  if (headersValid) {
    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const rowNum = i + 2; // 1-based + header row

      const getVal = (aliases: string[]): any => {
        for (const k of Object.keys(raw)) {
          const nk = normalizeKey(k);
          if (aliases.includes(nk)) {
            return raw[k];
          }
        }
        return '';
      };

      const rawId = String(getVal(['equipmentid']) ?? '').trim();
      const rawArea = String(getVal(['area']) ?? '').trim();
      const rawLocation = String(getVal(['location']) ?? '').trim();
      const rawW3w = String(getVal(['what3words', 'w3w']) ?? '').trim();
      const rawType = String(getVal(['type', 'equipmenttype', 'assettype']) ?? '').trim();
      const rawSize = getVal(['size', 'capacity']);
      const rawSerial = String(getVal(['serialnumber', 'rentalserialnumber', 'rentalserial']) ?? '').trim();

      // Skip completely blank rows
      if (!rawId && !rawArea && !rawLocation && !rawW3w && !rawType && (rawSize === '' || rawSize === undefined) && !rawSerial) {
        continue;
      }

      nonBlankRowCount++;
      const rowLabel = rawId ? `Row ${rowNum} (${rawId})` : `Row ${rowNum}`;

      if (!rawId) {
        errors.push(`${rowLabel}: Missing EquipmentId.`);
      }

      const blankFields: string[] = [];
      if (!rawArea) {
        blankFields.push('Area');
      }
      if (!rawLocation) {
        blankFields.push('Location');
      }

      // Validate what3words (permit blank; convert placeholder what.three.words to empty field)
      let formattedW3w = '';
      const cleanW3wCandidate = rawW3w.replace(/^\/+/, '').trim().toLowerCase();
      if (!rawW3w) {
        blankFields.push('what3words');
      } else if (cleanW3wCandidate === 'what.three.words') {
        formattedW3w = '';
        blankFields.push('what3words (was "what.three.words")');
      } else {
        formattedW3w = rawW3w.startsWith('///') ? rawW3w : `///${rawW3w.replace(/^\/+/, '')}`;
        if (!isValidWhat3WordsFormat(formattedW3w)) {
          errors.push(
            `${rowLabel}: Invalid what3words "${rawW3w}" (expected 3 words separated by dots, e.g. ///word.word.word).`
          );
        }
      }

      // Validate Type (permit blank)
      const upperType = rawType.toUpperCase();
      let resolvedType: AssetType | null = null;
      if (!rawType) {
        resolvedType = '';
        blankFields.push('Type');
      } else if (upperType === 'GENERATOR' || upperType === 'GEN' || upperType.includes('GENERATOR')) {
        resolvedType = 'GENERATOR';
      } else if (upperType === 'TANK' || upperType.includes('TANK') || upperType.includes('BOWSER')) {
        resolvedType = 'TANK';
      } else if (
        upperType === 'PLANT' ||
        upperType.includes('PLANT') ||
        upperType.includes('LIGHT') ||
        upperType.includes('TOWER') ||
        upperType.includes('TELE') ||
        upperType.includes('FORK')
      ) {
        resolvedType = 'PLANT';
      } else {
        errors.push(
          `${rowLabel}: Invalid Type "${rawType}" (expected GENERATOR, TANK, PLANT, or blank).`
        );
      }

      // Validate Size / Capacity (permit blank or 0)
      let capacity: number | undefined = undefined;
      const sizeStr = String(rawSize ?? '').trim();
      if (!sizeStr) {
        if (resolvedType !== 'PLANT') {
          blankFields.push('Size');
        }
      } else if (resolvedType !== 'PLANT') {
        const parsedNum =
          typeof rawSize === 'number'
            ? rawSize
            : Number(sizeStr.replace(/,/g, '').replace(/\s*(kva|l|litres|liters)$/i, ''));
        if (Number.isNaN(parsedNum) || parsedNum < 0) {
          errors.push(
            `${rowLabel}: Invalid Size/Capacity "${sizeStr}" (must be a non-negative number or blank).`
          );
        } else if (parsedNum > 0) {
          capacity = Math.round(parsedNum);
        }
      }

      // Validate SerialNumber (permit blank)
      if (!rawSerial) {
        blankFields.push('SerialNumber');
      }

      if (blankFields.length > 0) {
        warnings.push(`${rowLabel}: Blank field(s) — ${blankFields.join(', ')}.`);
      }

      if (rawId && resolvedType !== null) {
        if (dedupedById.has(rawId)) {
          inFileDuplicateCount++;
        }
        dedupedById.set(rawId, {
          equipmentId: rawId,
          area: rawArea,
          location: rawLocation,
          what3words: formattedW3w,
          type: resolvedType,
          capacity,
          rentalSerialNumber: rawSerial,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    if (nonBlankRowCount === 0) {
      errors.push('No equipment data rows found beneath the header row.');
    }
  }

  const equipmentList = Array.from(dedupedById.values());
  const existingIdSet = new Set(existingAssets.map((a) => a.equipmentId));
  let newCount = 0;
  let overwriteCount = 0;
  for (const eq of equipmentList) {
    if (existingIdSet.has(eq.equipmentId)) {
      overwriteCount++;
    } else {
      newCount++;
    }
  }

  return {
    isValid: headersValid && errors.length === 0 && equipmentList.length > 0,
    fileName: file.name,
    sheetName: targetSheetName,
    headersValid,
    detectedHeaders: rawHeaderRow,
    missingHeaders,
    errors,
    warnings,
    equipmentList,
    newCount,
    overwriteCount,
    inFileDuplicateCount,
  };
}

export async function parseEquipmentFile(file: File): Promise<Equipment[]> {
  const result = await validateAndParseEquipmentFile(file);
  if (!result.isValid) {
    throw new Error(result.errors.join(' '));
  }
  return result.equipmentList;
}
