/**
 * pcProx Reader Diagnostic v2
 * 
 * Two-phase approach: captures baseline (no card), then card-present data.
 * Tries feature reports, SDK commands, and input report events.
 * 
 * Usage: node diagnose.js
 */

import HID from 'node-hid';
import readline from 'readline';

const RF_IDEAS_VID = 0x0C27;

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

function hexDump(data) {
  return Buffer.from(data).toString('hex').match(/../g).join(' ');
}

function readAllReports(device) {
  const results = {};
  for (const id of [0x00, 0x01, 0x02, 0x03, 0x04, 0x05]) {
    try {
      const data = device.getFeatureReport(id, 16);
      results[`report_${id}`] = Array.from(data);
    } catch (e) {
      // not supported
    }
  }
  // Also try SDK commands (read-only — no config writes)
  const cmds = [
    { name: 'cmd_8F_00', send: [0x00, 0x8F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], readId: 0x00 },
    { name: 'cmd_8F_01', send: [0x01, 0x8F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], readId: 0x01 },
  ];
  for (const c of cmds) {
    try {
      device.sendFeatureReport(c.send);
      const data = device.getFeatureReport(c.readId, 16);
      results[c.name] = Array.from(data);
    } catch (e) {
      // not supported
    }
  }
  return results;
}

console.log('=== pcProx Diagnostic v2 ===\n');

const devices = HID.devices();
const rfDevices = devices.filter(d => d.vendorId === RF_IDEAS_VID);

if (rfDevices.length === 0) {
  console.log('No rf IDEAS devices found!\n');
  console.log('All USB HID devices:');
  devices.forEach(d => {
    console.log(`  VID:${d.vendorId.toString(16).padStart(4,'0')} PID:${d.productId.toString(16).padStart(4,'0')} | ${d.product || '?'} | usage:${d.usage} page:${d.usagePage}`);
  });
  process.exit(1);
}

const target = rfDevices[0];
console.log(`Reader: ${target.product} (VID:${target.vendorId.toString(16).padStart(4,'0')} PID:${target.productId.toString(16).padStart(4,'0')})`);
console.log(`  Path: ${target.path}`);
console.log(`  Usage: ${target.usage} / UsagePage: ${target.usagePage}\n`);

let device;
try {
  device = new HID.HID(target.path);
  console.log('Opened successfully!\n');
} catch (err) {
  console.error(`Failed to open: ${err.message}`);
  console.error('→ Close rf IDEAS Configuration Utility and retry');
  process.exit(1);
}

// Phase 1: Baseline (no card)
await ask('REMOVE any card from the reader, then press Enter...');
console.log('\nReading baseline (no card)...');
const baseline = readAllReports(device);

for (const [name, data] of Object.entries(baseline)) {
  console.log(`  ${name}: ${hexDump(data)}`);
}

// Phase 2: Card present
await ask('\nPLACE a card ON the reader, then press Enter...');
console.log('\nReading with card...');
const withCard = readAllReports(device);

console.log('\n=== DIFF (baseline → card) ===\n');
let foundDiff = false;
for (const [name, cardData] of Object.entries(withCard)) {
  const base = baseline[name];
  if (!base) {
    console.log(`  ${name}: NEW → ${hexDump(cardData)}`);
    foundDiff = true;
    continue;
  }
  const changed = cardData.some((b, i) => b !== base[i]);
  if (changed) {
    foundDiff = true;
    console.log(`  ${name}:`);
    console.log(`    no card: ${hexDump(base)}`);
    console.log(`    w/ card: ${hexDump(cardData)}`);
    // highlight which bytes changed
    const diff = cardData.map((b, i) => b !== base[i] ? `[${b.toString(16).padStart(2,'0')}]` : ' . ').join(' ');
    console.log(`    changed: ${diff}`);
    
    // Try parsing — assume byte 1 is bit count, bytes 2+ are data
    const bitCount = cardData[1];
    if (bitCount >= 8 && bitCount <= 64 && bitCount !== base[1]) {
      const dataBytes = cardData.slice(2);
      let bits = '';
      for (const b of dataBytes) bits += b.toString(2).padStart(8, '0');
      bits = bits.substring(0, bitCount);
      console.log(`    bitCount=${bitCount}, raw bits: ${bits}`);
      
      if (bitCount === 24) {
        const fac = parseInt(bits.substring(0, 8), 2);
        const card = parseInt(bits.substring(8, 24), 2);
        console.log(`    → 24-bit parse: Facility=${fac}, Card=${card}`);
      } else if (bitCount === 26) {
        const fac = parseInt(bits.substring(1, 9), 2);
        const card = parseInt(bits.substring(9, 25), 2);
        console.log(`    → 26-bit parse: Facility=${fac}, Card=${card}`);
      }
    }
  }
}

if (!foundDiff) {
  console.log('  No differences found in feature reports!');
  console.log('  The reader may only send input reports (keyboard events).');
}

// Phase 3: Listen for input reports
console.log('\n=== Listening for input reports (8 seconds) ===');
console.log('Tap the card on/off the reader a few times...\n');

let inputCount = 0;
device.on('data', (data) => {
  inputCount++;
  const arr = Array.from(data);
  const nonZero = arr.some(b => b !== 0);
  if (nonZero) {
    console.log(`  ✓ Input #${inputCount}: ${hexDump(arr)}`);
    console.log(`    Dec: [${arr.join(', ')}]`);
    
    // Try to interpret as keyboard HID report
    // Standard keyboard: [modifier, reserved, key1, key2, key3, key4, key5, key6]
    if (arr.length >= 3 && arr[2] !== 0) {
      const keycode = arr[2];
      // USB HID keycode to character (subset)
      const keyMap = {
        0x04:'a',0x05:'b',0x06:'c',0x07:'d',0x08:'e',0x09:'f',0x0a:'g',0x0b:'h',0x0c:'i',0x0d:'j',
        0x0e:'k',0x0f:'l',0x10:'m',0x11:'n',0x12:'o',0x13:'p',0x14:'q',0x15:'r',0x16:'s',0x17:'t',
        0x18:'u',0x19:'v',0x1a:'w',0x1b:'x',0x1c:'y',0x1d:'z',
        0x1e:'1',0x1f:'2',0x20:'3',0x21:'4',0x22:'5',0x23:'6',0x24:'7',0x25:'8',0x26:'9',0x27:'0',
        0x28:'ENTER',0x2c:'SPACE',0x2d:'-',0x2e:'=',0x36:',',0x37:'.',0x38:'/'
      };
      const ch = keyMap[keycode] || `key(0x${keycode.toString(16)})`;
      console.log(`    → Keyboard: '${ch}'`);
    }
  }
});

device.on('error', (err) => {
  console.error('Device error:', err.message);
});

setTimeout(() => {
  console.log(`\n=== Done (${inputCount} input reports received) ===`);
  if (inputCount === 0) {
    console.log('No input reports — reader is in SDK-only mode.');
    console.log('Card data must come from feature reports.');
  } else {
    console.log('Input reports received — reader is sending keyboard events!');
  }
  device.close();
  process.exit(0);
}, 8000);
