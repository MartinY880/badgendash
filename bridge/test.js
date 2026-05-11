/**
 * Minimal pcProx test — just polls cmd_8F and shows data changes.
 * No config commands, no writes — read-only and safe.
 * 
 * Usage: node test.js
 */
import HID from 'node-hid';

const dev = HID.devices().find(d => d.vendorId === 0x0C27);
if (!dev) { console.log('No rf IDEAS reader found!'); process.exit(1); }

console.log(`Found: ${dev.product} (${dev.path})\n`);
const device = new HID.HID(dev.path);
console.log('Opened! Polling every 500ms — scan different cards to see data change.\n');

let lastHex = '';
let pollCount = 0;

setInterval(() => {
  try {
    // Send 0x8F read command
    device.sendFeatureReport([0x00, 0x8F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const data = device.getFeatureReport(0x00, 16);
    const hex = Buffer.from(data.slice(1, 8)).toString('hex').match(/../g).join(' ');
    
    pollCount++;
    
    if (hex !== lastHex) {
      const cardBytes = data.slice(1, 4).reverse();
      const fac = cardBytes[0];
      const card = (cardBytes[1] << 8) | cardBytes[2];
      console.log(`[Poll #${pollCount}] DATA CHANGED → ${hex}`);
      console.log(`  Parsed: Facility=${fac}, Card=${card}`);
      console.log('');
      lastHex = hex;
    } else if (pollCount % 20 === 0) {
      process.stdout.write(`  ... still ${hex} (poll #${pollCount})\r`);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}, 500);

process.on('SIGINT', () => { device.close(); process.exit(0); });
