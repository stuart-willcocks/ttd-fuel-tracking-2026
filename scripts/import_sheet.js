import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Load environment variables from .env.local
const envPath = path.join(ROOT_DIR, '.env.local');
let supabaseUrl = process.env.VITE_SUPABASE_URL;
let supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...vals] = trimmed.split('=');
    const val = vals.join('=').trim();
    if (key.trim() === 'VITE_SUPABASE_URL') supabaseUrl = val;
    if (key.trim() === 'VITE_SUPABASE_ANON_KEY') supabaseKey = val;
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and Anon Key not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseCSV(csvText) {
  const cleanText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = [];
  let currentLine = [];
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
        if (currentLine.some(f => f.length > 0)) {
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
    if (currentLine.some(f => f.length > 0)) {
      lines.push(currentLine);
    }
  }

  if (lines.length < 2) {
    throw new Error('CSV contains no data rows');
  }

  const rawHeaders = lines[0].map(h => h.trim());
  const rows = [];

  for (let r = 1; r < lines.length; r++) {
    const rowValues = lines[r];
    const rowObj = {};
    for (let c = 0; c < lines[0].length; c++) {
      const headerKey = rawHeaders[c] || `col_${c}`;
      rowObj[headerKey] = (rowValues[c] ?? '').trim();
    }
    rows.push(rowObj);
  }

  return { headers: rawHeaders, rows };
}

function clamp(val, min, max) {
  if (val === null || val === undefined || isNaN(val)) return null;
  return Math.min(max, Math.max(min, Math.round(val)));
}

function parseIntSafe(val, min, max) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseInt(String(val).replace(/[^0-9-]/g, ''), 10);
  if (isNaN(num)) return null;
  if (min !== undefined && max !== undefined) {
    return clamp(num, min, max);
  }
  return num >= 0 ? num : null;
}

export async function runWipeAndImport(csvContent) {
  console.log('--- STARTING DATABASE WIPE & IMPORT ---');
  const { headers, rows } = parseCSV(csvContent);
  console.log(`Parsed CSV headers: ${headers.join(', ')}`);
  console.log(`Parsed ${rows.length} total equipment records.`);

  const equipmentRecords = [];
  const transactions = [];

  const baseCheckInTime = new Date('2026-07-02T08:00:00Z').getTime();
  const baseCheckOutTime = new Date('2026-07-06T17:00:00Z').getTime();

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const eqId = row.EquipmentId || `TTD-EQ-${String(idx + 1).padStart(4, '0')}`;
    const area = row.Area || 'Site Area';
    const location = row.Location || 'Field Location';
    let w3w = row.what3words || 'test.test.test';
    if (!w3w.startsWith('///')) w3w = `///${w3w.replace(/^[/]+/, '')}`;

    let type = (row.Type || 'GENERATOR').toUpperCase();
    if (!['GENERATOR', 'TANK', 'PLANT'].includes(type)) {
      if (type.includes('TANK')) type = 'TANK';
      else if (type.includes('PLANT')) type = 'PLANT';
      else type = 'GENERATOR';
    }

    const size = parseIntSafe(row.Size, 0, 100000);
    const serial = row.SerialNumber || `RSN-${eqId}`;

    const eqRecord = {
      equipment_id: eqId,
      area,
      location,
      what3words: w3w,
      type,
      capacity: size,
      rental_serial_number: serial,
      device_id: 'IMPORT-SYNC',
      powered_up_timestamp: null,
      powered_down_timestamp: null,
      updated_at: new Date().toISOString(),
    };
    equipmentRecords.push(eqRecord);

    // Stagger timestamps by asset index so transactions sort naturally
    const checkInDate = new Date(baseCheckInTime + idx * 60000).toISOString();
    const checkOutDate = new Date(baseCheckOutTime + idx * 60000).toISOString();

    const qtyCheckIns = parseInt(row.QtyCheckIns || '0', 10);
    const qtyCheckOuts = parseInt(row.QtyCheckOuts || '0', 10);

    const checkInFuelEighths = parseIntSafe(row.CheckInFuelEighths, 0, 8);
    const checkInFuelPct = parseIntSafe(row.CheckInFuelPercentage, 0, 100);
    const checkInDefPct = parseIntSafe(row.CheckInDefPercentage, 0, 100);
    const checkInKwh = parseIntSafe(row.CheckInKWH);

    const checkOutFuelEighths = parseIntSafe(row.CheckOutFuelEighths, 0, 8);
    const checkOutFuelPct = parseIntSafe(row.CheckOutFuelPercentage, 0, 100);
    const checkOutDefPct = parseIntSafe(row.CheckOutDefPercentage, 0, 100);
    const checkOutKwh = parseIntSafe(row.CheckOutKWH);

    const fuelTransfer = parseIntSafe(row.FuelTransferred);
    const defTransfer = parseIntSafe(row.DefTransferred);

    // If Check-In occurred
    if (qtyCheckIns > 0 || checkInFuelPct !== null || checkInKwh !== null) {
      transactions.push({
        id: crypto.randomUUID(),
        equipment_id: eqId,
        transaction_timestamp: checkInDate,
        upload_timestamp: new Date().toISOString(),
        transaction_type: 'CheckIn',
        device_id: 'IMPORT-SEED',
        check_in_fuel_eighths: checkInFuelEighths,
        check_out_fuel_eighths: null,
        check_in_fuel_percentage: checkInFuelPct,
        check_out_fuel_percentage: null,
        check_in_def_percentage: checkInDefPct,
        check_out_def_percentage: null,
        fuel_transfer_litres: fuelTransfer,
        def_transfer_litres: defTransfer,
        check_in_kwh: checkInKwh,
        check_out_kwh: null,
      });
    }

    // If Check-Out occurred
    if (qtyCheckOuts > 0 || checkOutFuelPct !== null || checkOutKwh !== null) {
      transactions.push({
        id: crypto.randomUUID(),
        equipment_id: eqId,
        transaction_timestamp: checkOutDate,
        upload_timestamp: new Date().toISOString(),
        transaction_type: 'CheckOut',
        device_id: 'IMPORT-SEED',
        check_in_fuel_eighths: null,
        check_out_fuel_eighths: checkOutFuelEighths,
        check_in_fuel_percentage: null,
        check_out_fuel_percentage: checkOutFuelPct,
        check_in_def_percentage: null,
        check_out_def_percentage: checkOutDefPct,
        fuel_transfer_litres: null,
        def_transfer_litres: null,
        check_in_kwh: null,
        check_out_kwh: checkOutKwh,
      });
    }
  }

  console.log(`Generated ${equipmentRecords.length} equipment records.`);
  console.log(`Generated ${transactions.length} matching real-world transactions.`);

  // 1. DELETE ALL TRANSACTIONS
  console.log('1. Deleting all transactions in Supabase...');
  const { error: delTxErr } = await supabase
    .from('transactions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delTxErr) {
    console.error('Failed to wipe transactions:', delTxErr);
    throw delTxErr;
  }
  console.log('Transactions wiped successfully.');

  // 2. DELETE ALL EQUIPMENT
  console.log('2. Deleting all equipment in Supabase...');
  const { error: delEqErr } = await supabase
    .from('equipment_list')
    .delete()
    .neq('equipment_id', '__NEQ_ALL__');
  if (delEqErr) {
    console.error('Failed to wipe equipment_list:', delEqErr);
    throw delEqErr;
  }
  console.log('Equipment list wiped successfully.');

  // 3. INSERT EQUIPMENT RECORDS IN BATCHES
  console.log(`3. Inserting ${equipmentRecords.length} equipment records...`);
  const eqBatchSize = 50;
  for (let i = 0; i < equipmentRecords.length; i += eqBatchSize) {
    const chunk = equipmentRecords.slice(i, i + eqBatchSize);
    const { error: insEqErr } = await supabase.from('equipment_list').upsert(chunk);
    if (insEqErr) {
      console.error(`Error inserting equipment batch ${i}-${i + chunk.length}:`, insEqErr);
      throw insEqErr;
    }
    process.stdout.write(`   Equipment inserted: ${Math.min(i + eqBatchSize, equipmentRecords.length)} / ${equipmentRecords.length}\r`);
  }
  console.log(`\nAll ${equipmentRecords.length} equipment records successfully inserted into Supabase!`);

  // 4. INSERT TRANSACTIONS IN BATCHES
  if (transactions.length > 0) {
    console.log(`4. Inserting ${transactions.length} transaction records...`);
    const txBatchSize = 50;
    for (let i = 0; i < transactions.length; i += txBatchSize) {
      const chunk = transactions.slice(i, i + txBatchSize);
      const { error: insTxErr } = await supabase.from('transactions').insert(chunk);
      if (insTxErr) {
        console.error(`Error inserting transaction batch ${i}-${i + chunk.length}:`, insTxErr);
        throw insTxErr;
      }
      process.stdout.write(`   Transactions inserted: ${Math.min(i + txBatchSize, transactions.length)} / ${transactions.length}\r`);
    }
    console.log(`\nAll ${transactions.length} transaction records successfully inserted into Supabase!`);
  }

  // 5. UPDATE LOCAL FALLBACK data/database.json
  const dbJsonPath = path.join(ROOT_DIR, 'data', 'database.json');
  const localDb = {
    equipment: equipmentRecords.map(eq => ({
      equipmentId: eq.equipment_id,
      area: eq.area,
      location: eq.location,
      what3words: eq.what3words,
      type: eq.type,
      capacity: eq.capacity,
      rentalSerialNumber: eq.rental_serial_number,
      poweredUpTimestamp: null,
      poweredDownTimestamp: null,
      updatedAt: eq.updated_at,
    })),
    transactions: transactions.map(tx => ({
      id: tx.id,
      equipmentId: tx.equipment_id,
      transactionTimestamp: tx.transaction_timestamp,
      uploadTimestamp: tx.upload_timestamp,
      transactionType: tx.transaction_type,
      checkInFuelEighths: tx.check_in_fuel_eighths ?? undefined,
      checkOutFuelEighths: tx.check_out_fuel_eighths ?? undefined,
      checkInFuelPercentage: tx.check_in_fuel_percentage ?? undefined,
      checkOutFuelPercentage: tx.check_out_fuel_percentage ?? undefined,
      checkInDefPercentage: tx.check_in_def_percentage ?? undefined,
      checkOutDefPercentage: tx.check_out_def_percentage ?? undefined,
      fuelTransferLitres: tx.fuel_transfer_litres ?? undefined,
      defTransferLitres: tx.def_transfer_litres ?? undefined,
      checkInKWH: tx.check_in_kwh ?? undefined,
      checkOutKWH: tx.check_out_kwh ?? undefined,
      syncStatus: 'synced',
      deviceId: tx.device_id,
      createdAt: tx.transaction_timestamp,
    })),
  };
  fs.writeFileSync(dbJsonPath, JSON.stringify(localDb, null, 2), 'utf8');
  console.log(`5. Synchronized local fallback database at: ${dbJsonPath}`);

  console.log('--- WIPE AND IMPORT COMPLETED SUCCESSFULLY ---');
  return { equipmentCount: equipmentRecords.length, transactionCount: transactions.length };
}

async function main() {
  const filePath = path.join(ROOT_DIR, 'data', 'real_equipment.csv');
  let csvData = '';

  if (fs.existsSync(filePath)) {
    console.log(`Reading cached CSV from: ${filePath}`);
    csvData = fs.readFileSync(filePath, 'utf8');
  } else {
    const sheetId = '1-pFXEhmhjs8lJ-sZYNecUqRd-D_nDbK_Uv5766Twt2M';
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    console.log(`Fetching live Google Sheet export from: ${exportUrl}`);
    const res = await fetch(exportUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch Google Sheet: HTTP ${res.status}`);
    }
    csvData = await res.text();
  }

  await runWipeAndImport(csvData);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Fatal error during import:', err);
    process.exit(1);
  });
}
