import fetch from 'node-fetch';
import logger from './logger.js';
import { stmts, bulkUpsert } from './db.js';

const PDK_CLIENT_ID = process.env.PDK_CLIENT_ID;
const PDK_CLIENT_SECRET = process.env.PDK_CLIENT_SECRET;
const PDK_SYSTEM_ID = process.env.PDK_SYSTEM_ID;

const ACCOUNTS_URL = 'https://accounts.pdk.io';
const SYSTEMS_URL = 'https://systems.pdk.io';

let systemTokenCache = { token: null, expiresAt: 0 };

async function getSystemToken() {
  const now = Date.now();
  if (systemTokenCache.token && systemTokenCache.expiresAt > now) {
    return systemTokenCache.token;
  }

  const authString = Buffer.from(`${PDK_CLIENT_ID}:${PDK_CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch(`${ACCOUNTS_URL}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${authString}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenRes.ok) throw new Error(`PDK token failed (${tokenRes.status})`);
  const { id_token } = await tokenRes.json();

  const sysRes = await fetch(`${ACCOUNTS_URL}/api/systems/${PDK_SYSTEM_ID}/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${id_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!sysRes.ok) throw new Error(`PDK system token failed (${sysRes.status})`);
  const { token } = await sysRes.json();

  systemTokenCache = { token, expiresAt: now + 4 * 60 * 1000 };
  return token;
}

async function fetchAllHolders() {
  const token = await getSystemToken();
  const headers = { Authorization: `Bearer ${token}` };

  // Fetch all holders (paginate if needed)
  let allHolders = [];
  let page = 0;
  const pageSize = 100;

  while (true) {
    const holdersRes = await fetch(
      `${SYSTEMS_URL}/${PDK_SYSTEM_ID}/holders?page=${page}&per_page=${pageSize}`,
      { headers }
    );
    if (!holdersRes.ok) {
      // Try without pagination params
      if (page === 0) {
        const fallbackRes = await fetch(`${SYSTEMS_URL}/${PDK_SYSTEM_ID}/holders`, { headers });
        if (!fallbackRes.ok) throw new Error(`Failed to fetch holders (${fallbackRes.status})`);
        allHolders = await fallbackRes.json();
        break;
      }
      throw new Error(`Failed to fetch holders page ${page} (${holdersRes.status})`);
    }
    const batch = await holdersRes.json();
    allHolders.push(...batch);
    if (batch.length < pageSize) break;
    page++;
  }

  logger.info(`PDK sync: fetched ${allHolders.length} holders`);
  return allHolders;
}

async function fetchCredentials(holderId) {
  const token = await getSystemToken();
  const res = await fetch(`${SYSTEMS_URL}/${PDK_SYSTEM_ID}/holders/${holderId}/credentials`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

async function syncAll() {
  if (!PDK_CLIENT_ID || !PDK_CLIENT_SECRET || !PDK_SYSTEM_ID) {
    throw new Error('PDK not configured');
  }

  const holders = await fetchAllHolders();

  // Fetch credentials for all holders in batches of 10
  const employees = [];
  const batchSize = 10;

  for (let i = 0; i < holders.length; i += batchSize) {
    const batch = holders.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (holder) => {
        const credentials = await fetchCredentials(holder.id);
        return { holder, credentials };
      })
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { holder, credentials } = result.value;

      // Skip holders without email (can't map to Entra)
      if (!holder.email && !holder.firstName) continue;

      const displayName = [holder.firstName, holder.lastName].filter(Boolean).join(' ') || holder.email || 'Unknown';
      const upn = holder.email || '';

      // Card credentials
      const cardCreds = credentials.filter((c) => c.credentialNumber != null);

      if (cardCreds.length > 0) {
        // One employee entry per card credential
        for (const cred of cardCreds) {
          employees.push({
            card_number: String(cred.credentialNumber),
            upn,
            display_name: displayName,
            department: null,
            job_title: null,
            pdk_person_id: String(holder.id),
          });
        }
      } else {
        // Holder without cards — still store them with a placeholder card
        // so we have the mapping for when they get a card
        employees.push({
          card_number: `PDK-${holder.id}`,
          upn,
          display_name: displayName,
          department: null,
          job_title: null,
          pdk_person_id: String(holder.id),
        });
      }
    }
  }

  // Bulk upsert into database
  const count = bulkUpsert(employees);
  logger.info(`PDK sync complete: ${count} employee records upserted from ${holders.length} holders`);

  return {
    holdersFound: holders.length,
    employeesUpserted: count,
    employees: employees.map((e) => ({
      cardNumber: e.card_number,
      displayName: e.display_name,
      upn: e.upn,
      pdkPersonId: e.pdk_person_id,
    })),
  };
}

export { syncAll, fetchAllHolders };
