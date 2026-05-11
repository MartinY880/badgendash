import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { db, stmts, bulkUpsert } from './db.js';
import cache from './cache.js';
import { getEmployeeData, isConfigured as graphConfigured } from './graph.js';
import { isConfigured as pdkConfigured, virtualRead as pdkVirtualRead } from './pdk.js';
import { syncAll as pdkSyncAll } from './pdk-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

// --- SSE clients for real-time scan push ---
const sseClients = new Set();

app.use(express.json({ limit: '10mb' }));

// Serve static files from public/
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve static Vite build
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// --- Health ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    cacheSize: cache.size(),
    graphConfigured: graphConfigured(),
    pdkConfigured: pdkConfigured(),
  });
});

// --- Employees ---
app.get('/api/employees', (req, res) => {
  try {
    const employees = stmts.listAll.all();
    res.json({ employees });
  } catch (err) {
    logger.error('Failed to list employees', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/employees', (req, res) => {
  try {
    const { cardNumber, upn, displayName, department, jobTitle, pdkPersonId } = req.body;
    if (!cardNumber || !upn || !displayName) {
      return res.status(400).json({ error: 'cardNumber, upn, and displayName are required' });
    }
    const result = stmts.upsertEmployee.run({
      card_number: cardNumber,
      upn,
      display_name: displayName,
      department: department || null,
      job_title: jobTitle || null,
      pdk_person_id: pdkPersonId || null,
    });
    cache.invalidate(upn);
    logger.info(`Employee upserted: ${upn} (card: ${cardNumber})`);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    logger.error('Failed to upsert employee', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/employees/bulk', (req, res) => {
  try {
    const { employees } = req.body;
    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ error: 'employees array is required' });
    }
    const mapped = employees.map((e) => ({
      card_number: e.cardNumber,
      upn: e.upn,
      display_name: e.displayName,
      department: e.department || null,
      job_title: e.jobTitle || null,
      pdk_person_id: e.pdkPersonId || null,
    }));
    const count = bulkUpsert(mapped);
    logger.info(`Bulk upserted ${count} employees`);
    res.json({ success: true, count });
  } catch (err) {
    logger.error('Bulk upsert failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// --- Scan Log ---
app.get('/api/scans/today', (req, res) => {
  try {
    const scans = stmts.todayScans.all();
    const count = stmts.todayScanCount.get().count;
    res.json({ scans, count });
  } catch (err) {
    logger.error('Failed to get today scans', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/scans/recent', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const scans = stmts.recentScans.all(limit);
    res.json({ scans });
  } catch (err) {
    logger.error('Failed to get recent scans', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// --- Scan ---
app.post('/api/scan', async (req, res) => {
  const startTime = Date.now();
  try {
    const cardNumber = (req.body.cardNumber || '').replace(/\D/g, '');
    if (!cardNumber) {
      return res.status(400).json({ error: 'cardNumber is required' });
    }

    const employee = stmts.findByCard.get(cardNumber);
    if (!employee) {
      logger.warn(`Unknown card scanned: ${cardNumber}`);
      return res.status(404).json({ error: 'unknown_card' });
    }

    // Check cache for photo/profile
    let cacheHit = false;
    let photo = null;
    let profile = null;

    const cached = cache.get(employee.upn);
    if (cached) {
      cacheHit = true;
      photo = cached.photo;
      profile = cached.profile;
    } else {
      const graphData = await getEmployeeData(employee.upn);
      photo = graphData.photo;
      profile = graphData.profile;
      if (photo || profile) {
        cache.set(employee.upn, { photo, profile });
      }
    }

    // Log scan
    const scanResult = stmts.insertScan.run({
      employee_id: employee.id,
      card_number: cardNumber,
      pdk_event_id: null,
      status: 'success',
    });

    logger.info(`Scan: ${employee.display_name} (card: ${cardNumber}, cache: ${cacheHit})`);

    // Fire PDK virtual-read (non-blocking — never delays the response)
    if (pdkConfigured() && employee.pdk_person_id) {
      pdkVirtualRead(employee.pdk_person_id).then((result) => {
        if (!result.success) {
          logger.warn(`PDK virtual-read failed for scan ${scanResult.lastInsertRowid}: ${result.message}`);
        }
      }).catch((err) => {
        logger.error('PDK virtual-read error', err);
      });
    }

    const employeeData = {
      displayName: employee.display_name,
      department: employee.department,
      jobTitle: employee.job_title,
      upn: employee.upn,
      photo,
      profile,
    };

    // Broadcast to SSE listeners (scan screen)
    const ssePayload = JSON.stringify({ type: 'scan', employee: employeeData });
    for (const client of sseClients) {
      client.write(`data: ${ssePayload}\n\n`);
    }

    res.json({
      success: true,
      employee: employeeData,
      timing: { totalMs: Date.now() - startTime, cacheHit },
    });
  } catch (err) {
    logger.error('Scan failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// --- Cache ---
app.post('/api/cache/clear', (req, res) => {
  const removed = cache.clear();
  res.json({ success: true, message: `Cache cleared (${removed} entries removed)` });
});

// --- SSE stream for scan screen ---
app.get('/api/scans/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// --- PDK Sync ---
app.post('/api/pdk/sync', async (req, res) => {
  try {
    logger.info('PDK sync started');
    const result = await pdkSyncAll();
    cache.clear();
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('PDK sync failed', err);
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  logger.info(`Badge Scanner server running on port ${PORT}`);
});

export default app;
