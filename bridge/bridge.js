/**
 * Badge Scanner Bridge
 * 
 * Reads cards from a pcProx reader (RDR-80582AKU) via USB HID
 * and POSTs the card number to the Badge n' Dash API.
 * 
 * Protocol (confirmed via diagnostic):
 *   1. Send feature report [0x00, 0x8F, ...] to request card ID
 *   2. Read feature report 0x00 (16 bytes)
 *   3. Bytes 1-3 contain card data in LSB-first order
 *   4. Reverse to MSB → byte 0 = facility (8-bit), bytes 1-2 = card number (16-bit)
 *   5. Data is LATCHED — reader remembers last card until a new one is read
 *
 * Usage:
 *   npm install
 *   node bridge.js
 */

import HID from 'node-hid';

// --- Configuration ---
const API_URL = process.env.API_URL || 'http://localhost:3002/api/scan';
const POLL_INTERVAL_MS = 200;   // How often to poll the reader (ms)
const DEBOUNCE_MS = 2000;       // Ignore same card for this long after a scan
const RF_IDEAS_VID = 0x0C27;    // rf IDEAS vendor ID

// --- State ---
let device = null;

// --- Find and open the reader ---
function openReader() {
  const devices = HID.devices();
  const reader = devices.find(d => d.vendorId === RF_IDEAS_VID);
  
  if (!reader) {
    console.error('No rf IDEAS reader found. Connected USB HID devices:');
    devices.forEach(d => {
      console.error(`  VID:${d.vendorId.toString(16).padStart(4,'0')} PID:${d.productId.toString(16).padStart(4,'0')} — ${d.product || 'unknown'}`);
    });
    return false;
  }

  console.log(`Found: ${reader.product || 'rf IDEAS'} (VID:${reader.vendorId.toString(16).padStart(4,'0')} PID:${reader.productId.toString(16).padStart(4,'0')})`);

  try {
    device = new HID.HID(reader.path);
    console.log('Reader opened successfully');
    return true;
  } catch (err) {
    console.error(`Failed to open reader: ${err.message}`);
    if (err.message.includes('Access denied') || err.message.includes('could not open')) {
      console.error('  → Close the rf IDEAS Configuration Utility and try again');
      console.error('  → On Windows, you may need to run as Administrator');
    }
    return false;
  }
}

// --- Read raw card bytes from reader (returns zeros when no card) ---
function readRawBytes() {
  if (!device) return null;

  try {
    // Send 0x8F command to request active card ID
    device.sendFeatureReport([0x00, 0x8F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    
    // Read response from report 0x00
    const data = device.getFeatureReport(0x00, 16);
    if (!data || data.length < 4) return null;

    // Bytes 1-7 are card data (LSB-first), byte 0 is report ID
    return data.slice(1, 8);
  } catch (err) {
    console.error('Read error:', err.message);
    return null;
  }
}

// --- Parse card bytes to facility + card number ---
// Card data from reader is LSB-first. For 24-bit (parity-stripped 26-bit Wiegand):
//   Reader bytes: [0x23, 0x8A, 0x2E] (LSB first)
//   Reversed (MSB): [0x2E, 0x8A, 0x23]
//   Facility = 0x2E = 46, Card = 0x8A23 = 35363
function parseCard(cardBytes) {
  // Find significant bytes (non-zero, from the start)
  let sigLen = 0;
  for (let i = cardBytes.length - 1; i >= 0; i--) {
    if (cardBytes[i] !== 0) { sigLen = i + 1; break; }
  }
  if (sigLen === 0) return null;

  // Take significant bytes and reverse to MSB-first
  const msb = cardBytes.slice(0, sigLen).reverse();

  // For 3 bytes (24-bit): first byte = facility, next 2 = card number
  if (msb.length >= 3) {
    const facilityCode = msb[0];
    const cardNumber = (msb[1] << 8) | msb[2];
    return { facilityCode, cardNumber };
  }
  
  // For 2 bytes: treat as card number only
  if (msb.length === 2) {
    const cardNumber = (msb[0] << 8) | msb[1];
    return { facilityCode: 0, cardNumber };
  }

  // For 1 byte: treat as card number
  return { facilityCode: 0, cardNumber: msb[0] };
}

// --- Send scan to Badge n' Dash API ---
async function sendScan(cardNumber) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardNumber: String(cardNumber) }),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      console.log(`  ✓ ${data.employee.displayName} (${data.timing.totalMs}ms)`);
    } else {
      console.log(`  ✗ ${data.error || 'unknown error'} (HTTP ${res.status})`);
    }
  } catch (err) {
    console.error(`  ✗ API error: ${err.message}`);
  }
}

// --- Startup ---
function start() {
  console.log(`\nPolling every ${POLL_INTERVAL_MS}ms | API: ${API_URL}`);
  console.log(`Debounce: ${DEBOUNCE_MS}ms\n`);
  console.log('Waiting for badge scans...\n');

  let cardPresent = false;  // Track card on/off state
  let lastFiredCard = 0;
  let lastFiredTime = 0;

  setInterval(() => {
    const rawBytes = readRawBytes();
    if (!rawBytes) return;

    const hasData = rawBytes.some(b => b !== 0);

    if (!hasData) {
      // Card removed — reset state so same card can trigger again
      cardPresent = false;
      return;
    }

    // Card is present
    if (cardPresent) return; // Already handled this placement

    // New card placement detected!
    cardPresent = true;

    const parsed = parseCard(rawBytes);
    if (!parsed || parsed.cardNumber === 0) return;

    const now = Date.now();

    // Debounce: skip if same card was just fired
    if (parsed.cardNumber === lastFiredCard && (now - lastFiredTime) < DEBOUNCE_MS) {
      return;
    }

    lastFiredCard = parsed.cardNumber;
    lastFiredTime = now;

    const hex = Buffer.from(rawBytes.slice(0, 3)).toString('hex');
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] Card: ${parsed.cardNumber} (FAC: ${parsed.facilityCode}) [${hex}]`);
    
    sendScan(parsed.cardNumber);
  }, POLL_INTERVAL_MS);
}

// --- Startup ---
console.log('╔══════════════════════════════════════╗');
console.log('║   Badge n\' Dash — Reader Bridge     ║');
console.log('╠══════════════════════════════════════╣');
console.log('║  pcProx USB HID → API scan bridge   ║');
console.log('╚══════════════════════════════════════╝\n');

if (openReader()) {
  start();
} else {
  console.error('\nFailed to connect to reader. Exiting.');
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  if (device) device.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Unexpected error:', err.message);
  if (device) {
    try { device.close(); } catch {}
  }
});
