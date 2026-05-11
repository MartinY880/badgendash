import fetch from 'node-fetch';
import logger from './logger.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

function getConfig() {
  return {
    tenantId: process.env.AZURE_TENANT_ID,
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  };
}

let tokenCache = { accessToken: null, expiresAt: 0 };

function isConfigured() {
  const { tenantId, clientId, clientSecret } = getConfig();
  return !!(tenantId && clientId && clientSecret);
}

async function getToken() {
  // Return cached token if still valid (with 5-min buffer)
  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 5 * 60 * 1000) {
    return tokenCache.accessToken;
  }

  const { tenantId, clientId, clientSecret } = getConfig();
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  logger.info('MS Graph token acquired/refreshed');
  return tokenCache.accessToken;
}

async function getProfile(upn) {
  const token = await getToken();
  const url = `${GRAPH_BASE}/users/${encodeURIComponent(upn)}?$select=id,displayName,jobTitle,department,mail,officeLocation`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 404) {
      logger.warn(`MS Graph: user not found: ${upn}`);
      return null;
    }
    const text = await res.text();
    throw new Error(`Graph profile request failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function getPhoto(upn) {
  const token = await getToken();
  const url = `${GRAPH_BASE}/users/${encodeURIComponent(upn)}/photos/240x240/$value`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 404) {
      logger.debug(`MS Graph: no photo for ${upn}`);
      return null;
    }
    logger.warn(`Graph photo request failed (${res.status}) for ${upn}`);
    return null;
  }

  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return `data:${contentType};base64,${base64}`;
}

async function getEmployeeData(upn) {
  if (!isConfigured()) {
    logger.debug('MS Graph not configured, skipping');
    return { profile: null, photo: null };
  }

  const [profile, photo] = await Promise.all([
    getProfile(upn).catch((err) => {
      logger.error(`Graph profile error for ${upn}`, err);
      return null;
    }),
    getPhoto(upn).catch((err) => {
      logger.error(`Graph photo error for ${upn}`, err);
      return null;
    }),
  ]);

  return { profile, photo };
}

export { isConfigured, getProfile, getPhoto, getEmployeeData };
