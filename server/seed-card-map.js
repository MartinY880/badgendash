import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { stmts, bulkUpsert } from './db.js';
import logger from './logger.js';

const SAMPLE_EMPLOYEES = [
  {
    card_number: '02681234',
    upn: 'jsmith@mtgpros.com',
    display_name: 'John Smith',
    department: 'Loan Processing',
    job_title: 'Sr. Processor',
    pdk_person_id: 'PDK-001',
  },
  {
    card_number: '02685678',
    upn: 'jdoe@mtgpros.com',
    display_name: 'Jane Doe',
    department: 'Underwriting',
    job_title: 'Underwriter',
    pdk_person_id: 'PDK-002',
  },
  {
    card_number: '02689999',
    upn: 'mbrown@mtgpros.com',
    display_name: 'Mike Brown',
    department: 'IT',
    job_title: 'Systems Admin',
    pdk_person_id: 'PDK-003',
  },
];

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const header = lines[0].split(',').map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row = {};
    header.forEach((h, i) => {
      row[h] = values[i] || null;
    });
    return {
      card_number: row.cardNumber,
      upn: row.upn,
      display_name: row.displayName,
      department: row.department || null,
      job_title: row.jobTitle || null,
      pdk_person_id: row.pdkPersonId || null,
    };
  });
}

const csvPath = process.argv[2];

try {
  let employees;
  if (csvPath) {
    const resolved = path.resolve(csvPath);
    if (!fs.existsSync(resolved)) {
      console.error(`File not found: ${resolved}`);
      process.exit(1);
    }
    employees = parseCSV(resolved);
    console.log(`Importing ${employees.length} employees from ${resolved}`);
  } else {
    employees = SAMPLE_EMPLOYEES;
    console.log(`Seeding ${employees.length} sample employees`);
  }

  const count = bulkUpsert(employees);
  console.log(`Successfully upserted ${count} employees`);

  const all = stmts.listAll.all();
  console.log(`\nCurrent employees (${all.length}):`);
  all.forEach((e) => {
    console.log(`  ${e.card_number} → ${e.display_name} (${e.upn})`);
  });
} catch (err) {
  console.error('Seed failed:', err.message);
  logger.error('Seed failed', err);
  process.exit(1);
}
