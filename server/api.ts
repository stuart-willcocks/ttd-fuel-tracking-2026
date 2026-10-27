import type { Connect } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

interface DatabaseSchema {
  equipments: any[];
  transactions: any[];
}

const EMPTY_DATABASE: DatabaseSchema = {
  equipments: [],
  transactions: [],
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DATABASE, null, 2), 'utf-8');
  }
}

function readData(): DatabaseSchema {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read db file, returning empty data:', err);
    return { equipments: [], transactions: [] };
  }
}

function writeData(data: DatabaseSchema) {
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

      // DELETE /api/equipment
      if (pathname === '/api/equipment' && req.method === 'DELETE') {
        const query = new URL(rawUrl, 'http://localhost').searchParams;
        let targetId = query.get('id') || query.get('equipmentId');
        if (!targetId) {
          const body = await parseJsonBody(req).catch(() => ({}));
          targetId = body.equipmentId || body.id;
        }
        if (!targetId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing equipmentId parameter' }));
          return;
        }
        const data = readData();
        const beforeCount = data.equipments.length;
        data.equipments = data.equipments.filter((e) => e.equipmentId !== targetId);
        writeData(data);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, deletedId: targetId, removed: beforeCount !== data.equipments.length }));
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

      // DELETE /api/transactions
      if (pathname === '/api/transactions' && req.method === 'DELETE') {
        const query = new URL(rawUrl, 'http://localhost').searchParams;
        let targetId = query.get('id') || query.get('transactionId');
        if (!targetId) {
          const body = await parseJsonBody(req).catch(() => ({}));
          targetId = body.transactionId || body.id;
        }
        if (!targetId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing transaction id parameter' }));
          return;
        }
        const data = readData();
        const deletedTx = data.transactions.find((t) => t.id === targetId);
        const beforeCount = data.transactions.length;
        data.transactions = data.transactions.filter((t) => t.id !== targetId);

        // If the deleted transaction was a power event, re-evaluate equipment power state
        if (deletedTx && (deletedTx.transactionType === 'PoweredUp' || deletedTx.transactionType === 'PoweredDown')) {
          const eq: any = data.equipments.find((e: any) => e.equipmentId === deletedTx.equipmentId);
          if (eq) {
            const powerTxs = data.transactions
              .filter((t) => t.equipmentId === deletedTx.equipmentId && (t.transactionType === 'PoweredUp' || t.transactionType === 'PoweredDown'))
              .sort((a, b) => new Date(b.transactionTimestamp).getTime() - new Date(a.transactionTimestamp).getTime());

            if (powerTxs.length > 0) {
              const latest = powerTxs[0];
              if (latest.transactionType === 'PoweredUp') {
                eq.poweredUpTimestamp = latest.transactionTimestamp;
                delete eq.poweredDownTimestamp;
              } else {
                eq.poweredDownTimestamp = latest.transactionTimestamp;
              }
            } else {
              delete eq.poweredUpTimestamp;
              delete eq.poweredDownTimestamp;
            }
          }
        }

        writeData(data);
        console.log(`[API] Transaction ${targetId} deleted`);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, deletedId: targetId, removed: beforeCount !== data.transactions.length }));
        return;
      }

      // POST /api/reset
      if (pathname === '/api/reset' && req.method === 'POST') {
        writeData(EMPTY_DATABASE);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, message: 'Database reset to empty' }));
        return;
      }

      // POST /api/clear
      if (pathname === '/api/clear' && req.method === 'POST') {
        writeData({ equipments: [], transactions: [] });
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, message: 'All equipment and transactions cleared' }));
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
