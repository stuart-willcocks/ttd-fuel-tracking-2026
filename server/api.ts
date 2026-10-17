import type { Connect } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

const INITIAL_DATA = {
  equipments: [
    {
      equipmentId: 'TTD-MAT-0001',
      area: 'North Zone',
      location: 'Stage Alpha Power Compound',
      what3words: '///puzzle.stages.daring',
      type: 'GENERATOR',
      capacity: 100,
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
      capacity: 250,
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
      capacity: 3000,
      rentalSerialNumber: 'TNK-99211',
    },
    {
      equipmentId: 'TTD-MAT-0004',
      area: 'Logistics Hub',
      location: 'Vehicle Refuel Station Tank 2',
      what3words: '///launch.bright.solid',
      type: 'TANK',
      capacity: 5000,
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
  ],
  transactions: [
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
      checkInFuelEighths: 7,
      syncStatus: 'synced',
      createdAt: '2026-10-14T09:00:00Z',
    },
  ],
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_DATA, null, 2), 'utf-8');
  }
}

function readData(): typeof INITIAL_DATA {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read db file, returning initial data:', err);
    return INITIAL_DATA;
  }
}

function writeData(data: typeof INITIAL_DATA) {
  ensureDataFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function parseJsonBody(req: Connect.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function apiMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const rawUrl = req.url || '';
    if (!rawUrl.startsWith('/api/')) {
      return next();
    }

    const pathname = rawUrl.split('?')[0];

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      // GET /api/equipment
      if (pathname === '/api/equipment' && req.method === 'GET') {
        const data = readData();
        res.statusCode = 200;
        res.end(JSON.stringify(data.equipments));
        return;
      }

      // POST /api/equipment
      if (pathname === '/api/equipment' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const data = readData();
        const idx = data.equipments.findIndex((e) => e.equipmentId === body.equipmentId);
        if (idx >= 0) {
          data.equipments[idx] = { ...data.equipments[idx], ...body };
        } else {
          data.equipments.push(body);
        }
        writeData(data);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, equipment: body }));
        return;
      }

      // GET /api/transactions
      if (pathname === '/api/transactions' && req.method === 'GET') {
        const data = readData();
        res.statusCode = 200;
        res.end(JSON.stringify(data.transactions));
        return;
      }

      // POST /api/transactions
      if (pathname === '/api/transactions' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const data = readData();
        const uploadTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

        const newTx = {
          ...body,
          uploadTimestamp,
          syncStatus: 'synced',
        };

        // Update or append transaction
        const existingIdx = data.transactions.findIndex((t) => t.id === newTx.id);
        if (existingIdx >= 0) {
          data.transactions[existingIdx] = newTx;
        } else {
          data.transactions.unshift(newTx); // most recent first
        }

        // Also update equipment state if PoweredUp or PoweredDown
        let eq: any = data.equipments.find((e: any) => e.equipmentId === newTx.equipmentId);
        if (!eq) {
          const isTank = newTx.equipmentId.includes('TNK') || newTx.equipmentId.includes('TANK');
          const isPlant = newTx.equipmentId.includes('PLT') || newTx.equipmentId.includes('PLANT');
          const type = isTank ? 'TANK' : isPlant ? 'PLANT' : 'GENERATOR';
          eq = {
            equipmentId: newTx.equipmentId,
            area: 'Site Area',
            location: 'Field Grid',
            what3words: '///field.power.setup',
            type,
            rentalSerialNumber: 'RSN-UNKNOWN',
          };
          (data.equipments as any[]).push(eq);
        }

        if (newTx.transactionType === 'PoweredUp') {
          eq.poweredUpTimestamp = newTx.transactionTimestamp;
          delete eq.poweredDownTimestamp;
        } else if (newTx.transactionType === 'PoweredDown') {
          eq.poweredDownTimestamp = newTx.transactionTimestamp;
        }

        writeData(data);

        console.log(`[API] Transaction ${newTx.id} recorded for ${newTx.equipmentId} (${newTx.transactionType})`);

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, uploadTimestamp, transaction: newTx }));
        return;
      }

      // POST /api/reset
      if (pathname === '/api/reset' && req.method === 'POST') {
        writeData(INITIAL_DATA);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, message: 'Database reset to default' }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    } catch (err: any) {
      console.error('[API Error]:', err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
    }
  };
}
