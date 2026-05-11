import logger from './logger.js';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const photoCache = new Map();

function get(upn) {
  const entry = photoCache.get(upn);
  if (!entry) return null;

  if (Date.now() - entry.cachedAt > CACHE_TTL) {
    photoCache.delete(upn);
    logger.debug(`Cache expired for ${upn}`);
    return null;
  }

  logger.debug(`Cache hit for ${upn}`);
  return entry;
}

function set(upn, data) {
  photoCache.set(upn, {
    photo: data.photo,
    profile: data.profile,
    cachedAt: Date.now(),
  });
  logger.debug(`Cache set for ${upn}`);
}

function invalidate(upn) {
  photoCache.delete(upn);
  logger.debug(`Cache invalidated for ${upn}`);
}

function clear() {
  const size = photoCache.size;
  photoCache.clear();
  logger.info(`Cache cleared (${size} entries removed)`);
  return size;
}

function size() {
  return photoCache.size;
}

export default { get, set, invalidate, clear, size };
