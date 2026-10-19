import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
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

/**
 * Simple CSV parser handling quotes, commas, and newlines
 */
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
        i++; // skip escaped quote
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

  const rawHeaders = lines[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const rows = [];

  for (let r = 1; r < lines.length; r++) {
    const rowValues = lines[r];
    const rowObj = {};
    for (let c = 0; c < lines[0].length; c++) {
      const headerKey = rawHeaders[c] || `col_${c}`;
      rowObj[headerKey] = rowValues[c] ?? '';
    }
    rows.push(rowObj);
  }

  return { headers: rawHeaders, rows };
}

/**
 * Maps CSV row to equipment_list schema
 */
function mapRowToEquipment(row, index) {
  // Find equipment ID
  const eqId =
    row.equipmentid ||
    row.assetid ||
    row.equipment ||
    row.asset ||
    row.id ||
    row.assetnumber ||
    `EQ-${String(index + 1).padStart(4, '0')}`;

  // Find Type
  let rawType = (
    row.type ||
    row.equipmenttype ||
    row.assettype ||
    row.category ||
    'GENERATOR'
  ).toUpperCase();

  let type = 'GENERATOR';
  if (rawType.includes('TANK') || rawType.includes('BOWSER') || rawType.includes('FUEL')) {
    type = 'TANK';
  } else if (rawType.includes('PLANT') || rawType.includes('LIGHT') || rawType.includes('TOWER') || rawType.includes('TELEHANDLER') || rawType.includes('PUMP')) {
    type = 'PLANT';
  } else if (rawType.includes('GEN') || rawType.includes('GENERATOR') || rawType.includes('POWER')) {
    type = 'GENERATOR';
  }

  // Find Area
  const area =
    row.area ||
    row.zone ||
    row.sector ||
    row.field ||
    row.site ||
    'Site Area';

  // Find Location
  const location =
    row.location ||
    row.description ||
    row.name ||
    row.title ||
    row.position ||
    'Location TBC';

  // Find What3Words
  let what3words =
    row.what3words ||
    row.w3w ||
    row.words ||
    row.coordinates ||
    '///setup.field.power';
  if (!what3words.startsWith('///')) {
    what3words = '///' + what3words.replace(/^[/]+/, '');
  }

  // Find Capacity
  let capacity = null;
  const rawCap = row.capacity || row.cap || row.fuelcapacity || row.litres || row.kva || row.size;
  if (rawCap) {
    const num = parseInt(String(rawCap).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num > 0) {
      capacity = num;
    }
  }

  // Find Rental Serial Number
  const rentalSerialNumber =
    row.rentalserialnumber ||
    row.serialnumber ||
    row.serial ||
    row.rsn ||
    row.fleetno ||
    row.fleetnumber ||
    `RSN-${eqId}`;

  return {
    equipment_id: eqId,
    area,
    location,
    what3words,
    type,
    capacity,
    rental_serial_number: rentalSerialNumber,
    device_id: null,
    powered_up_timestamp: null,
    powered_down_timestamp: null,
    updated_at: new Date().toISOString(),
  };
}

export async function importData(csvContent) {
  console.log('Parsing CSV content...');
  const { headers, rows } = parseCSV(csvContent);
  console.log(`Detected headers: ${headers.join(', ')}`);
  console.log(`Detected ${rows.length} rows.`);

  const equipmentRecords = rows
    .map((row, idx) => mapRowToEquipment(row, idx))
    .filter(eq => eq.equipment_id && eq.equipment_id.trim().length > 0);

  console.log(`Prepared ${equipmentRecords.length} equipment records for import.`);
  if (equipmentRecords.length === 0) {
    throw new Error('No valid equipment records parsed from CSV');
  }

  // Step 1: Wipe transactions
  console.log('Deleting existing transactions in Supabase...');
  const { error: txDelErr } = await supabase
    .from('transactions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Deletes all rows
  if (txDelErr) {
    console.error('Error deleting transactions:', txDelErr);
    throw txDelErr;
  }
  console.log('Transactions deleted successfully.');

  // Step 2: Wipe equipment_list
  console.log('Deleting existing equipment_list in Supabase...');
  const { error: eqDelErr } = await supabase
    .from('equipment_list')
    .delete()
    .neq('equipment_id', '__DUMMY_ID_THAT_DOES_NOT_EXIST__'); // Deletes all rows
  if (eqDelErr) {
    console.error('Error deleting equipment_list:', eqDelErr);
    throw eqDelErr;
  }
  console.log('Equipment list wiped successfully.');

  // Step 3: Insert new equipment records in chunks
  console.log(`Inserting ${equipmentRecords.length} new records into equipment_list...`);
  const chunkSize = 50;
  for (let i = 0; i < equipmentRecords.length; i += chunkSize) {
    const chunk = equipmentRecords.slice(i, i + chunkSize);
    const { error: insertErr } = await supabase
      .from('equipment_list')
      .upsert(chunk, { onConflict: 'equipment_id' });
    if (insertErr) {
      console.error(`Error inserting chunk ${i} - ${i + chunk.length}:`, insertErr);
      throw insertErr;
    }
  }
  console.log('All records inserted into Supabase successfully!');

  // Step 4: Synchronize local data/database.json
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
    transactions: [],
  };
  fs.writeFileSync(dbJsonPath, JSON.stringify(localDb, null, 2), 'utf8');
  console.log(`Updated local fallback database at ${dbJsonPath}`);

  return equipmentRecords.length;
}

// CLI Execution
async function main() {
  const arg = process.argv[2];

  let csvData = '';

  if (arg && fs.existsSync(arg)) {
    console.log(`Reading CSV from local file: ${arg}`);
    csvData = fs.readFileSync(arg, 'utf8');
  } else if (arg && arg.startsWith('http')) {
    console.log(`Fetching CSV from URL: ${arg}`);
    const res = await fetch(arg);
    if (!res.ok) {
      throw new Error(`Failed to fetch URL: HTTP ${res.status} ${res.statusText}`);
    }
    csvData = await res.text();
  } else {
    // Check if data/real_equipment.csv or data/equipment.csv exists
    const candidates = [
      path.join(ROOT_DIR, 'data', 'real_equipment.csv'),
      path.join(ROOT_DIR, 'data', 'equipment.csv'),
      path.join(ROOT_DIR, 'data', 'equipment_import.csv'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        console.log(`Found CSV file at: ${c}`);
        csvData = fs.readFileSync(c, 'utf8');
        break;
      }
    }
  }

  if (!csvData) {
    // Try downloading directly from the user's Google Sheet URL export link
    const sheetId = '1-pFXEhmhjs8lJ-sZYNecUqRd-D_nDbK_Uv5766Twt2M';
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    console.log(`Attempting to fetch Google Sheet export from: ${exportUrl}`);
    try {
      const res = await fetch(exportUrl);
      if (res.ok) {
        const text = await res.text();
        if (text.includes('<!DOCTYPE') || text.includes('accounts.google.com')) {
          console.error('\n[ACCESS ERROR]: Google Sheet requires sign-in. It is not shared publicly.');
          process.exit(2);
        } else {
          csvData = text;
        }
      } else {
        console.error(`Failed to fetch Google Sheet: HTTP ${res.status}`);
        process.exit(2);
      }
    } catch (err) {
      console.error('Fetch error:', err.message);
      process.exit(2);
    }
  }

  await importData(csvData);
  console.log('Import completed successfully!');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });
}
