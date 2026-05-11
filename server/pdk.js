import fetch from 'node-fetch';
import logger from './logger.js';

const PDK_CLIENT_ID = process.env.PDK_CLIENT_ID;
const PDK_CLIENT_SECRET = process.env.PDK_CLIENT_SECRET;
const PDK_SYSTEM_ID = process.env.PDK_SYSTEM_ID;
const PDK_CLOUD_NODE_ID = process.env.PDK_CLOUD_NODE_ID;
const PDK_DEVICE_ID = process.env.PDK_DEVICE_ID;

const ACCOUNTS_URL = 'https://accounts.pdk.io';
const SYSTEMS_URL = 'https://systems.pdk.io';

const PDK_TIMEOUT_MS = 3000;

let systemTokenCache = { token: null, expiresAt: 0 };

function isConfigured() {
  return !!(PDK_CLIENT_ID && PDK_CLIENT_SECRET && PDK_SYSTEM_ID && PDK_CLOUD_NODE_ID && PDK_DEVICE_ID);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function getSystemToken() {
  const now = Date.now();
  if (systemTokenCache.token && systemTokenCache.expiresAt > now) {
    return systemTokenCache.token;
  }

  // Step 1: Client credentials → id_token
  const authString = Buffer.from(`${PDK_CLIENT_ID}:${PDK_CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetchWithTimeout(
    `${ACCOUNTS_URL}/oauth2/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authString}`,
      },
      body: 'grant_type=client_credentials',
    },
    PDK_TIMEOUT_MS
  );

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`PDK token request failed (${tokenRes.status}): ${text}`);
  }

  const tokenData = await tokenRes.json();
  const idToken = tokenData.id_token;

  // Step 2: Exchange id_token for system token
  const sysRes = await fetchWithTimeout(
    `${ACCOUNTS_URL}/api/systems/${PDK_SYSTEM_ID}/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    },
    PDK_TIMEOUT_MS
  );

  if (!sysRes.ok) {
    const text = await sysRes.text();
    throw new Error(`PDK system token exchange failed (${sysRes.status}): ${text}`);
  }

  const sysData = await sysRes.json();
  const systemToken = sysData.token;

  // Cache for 4 minutes (token expires in 5 min)
  systemTokenCache = { token: systemToken, expiresAt: now + 4 * 60 * 1000 };
  logger.info('PDK system token acquired/refreshed');
  return systemToken;
}

async function virtualRead(holderId) {
  if (!isConfigured()) {
    logger.debug('PDK not configured, skipping virtual-read');
    return { success: false, message: 'not_configured' };
  }

  if (!holderId) {
    logger.warn('PDK virtual-read requires holderId, skipping');
    return { success: false, message: 'no_holder_id' };
  }

  let token;
  try {
    token = await getSystemToken();
  } catch (err) {
    logger.error(`PDK auth failed: ${err.message}`);
    return { success: false, message: 'pdk_auth_failed' };
  }

  try {
    const url = `${SYSTEMS_URL}/${PDK_SYSTEM_ID}/cloud-nodes/${PDK_CLOUD_NODE_ID}/devices/${PDK_DEVICE_ID}/virtual-read`;
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ holderId }),
      },
      PDK_TIMEOUT_MS
    );

    if (res.status === 204 || res.ok) {
      logger.info(`PDK virtual-read OK for holder ${holderId}`);
      return { success: true };
    }

    const text = await res.text().catch(() => '');
    logger.error(`PDK virtual-read failed (${res.status}): ${text}`);
    return { success: false, message: `pdk_error_${res.status}` };
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.error('PDK virtual-read timed out');
      return { success: false, message: 'pdk_timeout' };
    }
    logger.error(`PDK virtual-read error: ${err.message}`);
    return { success: false, message: 'pdk_error' };
  }
}

async function testConnectivity() {
  if (!isConfigured()) {
    logger.warn('PDK not configured — skipping connectivity test');
    return false;
  }

  try {
    const token = await getSystemToken();
    logger.info('PDK connectivity OK (token acquired)');
    return true;
  } catch (err) {
    logger.warn(`PDK unreachable: ${err.message}`);
    return false;
  }
}

export { isConfigured, virtualRead, getSystemToken, testConnectivity };
