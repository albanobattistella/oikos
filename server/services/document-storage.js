/**
 * Module: Document storage
 * Purpose: Store and retrieve document binaries from SQLite, WebDAV, or DMS.
 */

import { randomUUID } from 'node:crypto';
import * as db from '../db.js';

const CONFIG_PREFIX = 'document_storage_webdav_';
const DEFAULT_BASE_PATH = 'yuvomi-documents';
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_READ_BYTES = 5 * 1024 * 1024;

const ENV_FIELDS = {
  enabled: 'DOCUMENT_STORAGE_WEBDAV_ENABLED',
  url: 'DOCUMENT_STORAGE_WEBDAV_URL',
  username: 'DOCUMENT_STORAGE_WEBDAV_USERNAME',
  password: 'DOCUMENT_STORAGE_WEBDAV_PASSWORD',
  path: 'DOCUMENT_STORAGE_WEBDAV_PATH',
};
const PASSWORD_MASK_RE = /^(?:\*|•){4,}$/;

let requestTimeoutMs = DEFAULT_TIMEOUT_MS;

export class StorageError extends Error {
  constructor(storageCode, message, options = {}) {
    super(message, options);
    this.name = 'StorageError';
    this.storageCode = storageCode;
  }
}

function cfgGet(field) {
  const row = db.get().prepare(
    'SELECT value FROM sync_config WHERE key = ?'
  ).get(`${CONFIG_PREFIX}${field}`);
  return row?.value ?? null;
}

function cfgSet(field, value) {
  db.get().prepare(`
    INSERT INTO sync_config (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  `).run(`${CONFIG_PREFIX}${field}`, value);
}

function cfgDelete(field) {
  db.get().prepare('DELETE FROM sync_config WHERE key = ?')
    .run(`${CONFIG_PREFIX}${field}`);
}

function readEnv(field) {
  const raw = process.env[ENV_FIELDS[field]];
  if (raw === undefined || raw.trim() === '') {
    return { controlled: false, value: null };
  }
  return {
    controlled: true,
    value: field === 'password' ? raw : raw.trim(),
  };
}

function parseEnabled(value) {
  if (value === null || value === undefined || String(value).trim() === '') return false;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new StorageError(
    'DOCUMENT_STORAGE_INVALID_CONFIG',
    'WebDAV enabled must be true, false, 1, or 0.'
  );
}

function normalizeBasePath(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return DEFAULT_BASE_PATH;
  if (/[\u0000-\u001f\u007f\\?#]/.test(raw) || raw.includes('://')) {
    throw new StorageError(
      'DOCUMENT_STORAGE_INVALID_CONFIG',
      'The WebDAV base path is invalid.'
    );
  }

  const segments = raw.split('/').filter(Boolean).map((segment) => {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch (error) {
      throw new StorageError(
        'DOCUMENT_STORAGE_INVALID_CONFIG',
        'The WebDAV base path contains invalid encoding.',
        { cause: error }
      );
    }
    if (
      decoded === '.'
      || decoded === '..'
      || decoded.includes('/')
      || decoded.includes('\\')
      || decoded.includes(':')
      || /[\u0000-\u001f\u007f?#]/.test(decoded)
    ) {
      throw new StorageError(
        'DOCUMENT_STORAGE_INVALID_CONFIG',
        'The WebDAV base path contains an unsafe segment.'
      );
    }
    return decoded;
  });

  if (segments.length === 0) return DEFAULT_BASE_PATH;
  return segments.join('/');
}

function normalizeStorageKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.startsWith('/') || /[\u0000-\u001f\u007f\\?#]/.test(raw)) {
    throw new StorageError(
      'DOCUMENT_STORAGE_INVALID_CONFIG',
      'The document storage key is invalid.'
    );
  }
  const segments = raw.split('/');
  for (const segment of segments) {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch (error) {
      throw new StorageError(
        'DOCUMENT_STORAGE_INVALID_CONFIG',
        'The document storage key contains invalid encoding.',
        { cause: error }
      );
    }
    if (
      !decoded
      || decoded === '.'
      || decoded === '..'
      || decoded.includes('/')
      || decoded.includes('\\')
      || /[\u0000-\u001f\u007f?#]/.test(decoded)
    ) {
      throw new StorageError(
        'DOCUMENT_STORAGE_INVALID_CONFIG',
        'The document storage key contains an unsafe segment.'
      );
    }
  }
  return segments.join('/');
}

function validateUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new StorageError(
      'DOCUMENT_STORAGE_INVALID_CONFIG',
      'The WebDAV URL is invalid.',
      { cause: error }
    );
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new StorageError(
      'DOCUMENT_STORAGE_INVALID_CONFIG',
      'The WebDAV URL must use HTTP or HTTPS without embedded credentials.'
    );
  }
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed;
}

function requireWebdavConfig(config) {
  if (!config.url || !config.username || !config.password) {
    throw new StorageError(
      'DOCUMENT_STORAGE_NOT_CONFIGURED',
      'WebDAV document storage is not fully configured.'
    );
  }
  validateUrl(config.url);
  normalizeBasePath(config.basePath);
  return config;
}

function isPasswordMask(value) {
  return typeof value === 'string' && PASSWORD_MASK_RE.test(value.trim());
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function encodePath(segments) {
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function remoteUrl(config, relativeSegments) {
  const url = validateUrl(config.url);
  const basePath = url.pathname.replace(/\/+$/, '');
  const suffix = encodePath(relativeSegments);
  url.pathname = `${basePath}/${suffix}`.replace(/\/{2,}/g, '/');
  return url;
}

async function davFetch(config, method, relativeSegments, { body, headers } = {}) {
  const url = remoteUrl(config, relativeSegments);
  return fetch(url, {
    method,
    redirect: 'manual',
    headers: {
      Authorization: basicAuth(config.username, config.password),
      ...headers,
    },
    signal: AbortSignal.timeout(requestTimeoutMs),
    ...(body === undefined ? {} : { body }),
  });
}

async function ensureCollections(config, extraSegments = []) {
  const baseSegments = normalizeBasePath(config.basePath).split('/');
  const segments = [...baseSegments, ...extraSegments];
  for (let index = 1; index <= segments.length; index += 1) {
    const response = await davFetch(config, 'MKCOL', segments.slice(0, index));
    if (!response.ok && response.status !== 405) {
      throw new Error(`MKCOL failed with status ${response.status}.`);
    }
  }
}

async function readResponseBuffer(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_READ_BYTES) {
    await response.body?.cancel();
    throw new StorageError(
      'DOCUMENT_STORAGE_TOO_LARGE',
      'The remote document exceeds the 5 MiB read limit.'
    );
  }
  if (!response.body) return Buffer.alloc(0);

  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_READ_BYTES) {
        await reader.cancel();
        throw new StorageError(
          'DOCUMENT_STORAGE_TOO_LARGE',
          'The remote document exceeds the 5 MiB read limit.'
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function slug(value, fallback) {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function filenameParts(originalName) {
  const basename = String(originalName ?? '').split(/[\\/]/).pop() || 'document';
  const extensionMatch = basename.match(/(\.[a-z0-9]{1,16})$/i);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
  const stem = extension ? basename.slice(0, -extension.length) : basename;
  return {
    stem: slug(stem, 'document'),
    extension,
  };
}

function toStorageError(error, storageCode, message) {
  if (error instanceof StorageError) {
    if (
      error.storageCode === 'DOCUMENT_STORAGE_INVALID_CONFIG'
      || error.storageCode === 'DOCUMENT_STORAGE_NOT_CONFIGURED'
      || error.storageCode === 'DOCUMENT_STORAGE_TOO_LARGE'
    ) {
      return error;
    }
  }
  return new StorageError(storageCode, message, { cause: error });
}

export function getConfig() {
  const envControlled = {};
  const effective = {};
  for (const field of Object.keys(ENV_FIELDS)) {
    const env = readEnv(field);
    envControlled[field] = env.controlled;
    effective[field] = env.controlled ? env.value : cfgGet(field);
  }

  return {
    enabled: parseEnabled(effective.enabled),
    url: effective.url ? String(effective.url).trim() : null,
    username: effective.username ? String(effective.username).trim() : null,
    password: effective.password || null,
    basePath: normalizeBasePath(effective.path),
    lastTest: cfgGet('last_test'),
    lastError: cfgGet('last_error'),
    envControlled,
  };
}

export function getStatus() {
  const config = getConfig();
  let configured = false;
  try {
    requireWebdavConfig(config);
    configured = true;
  } catch {
    configured = false;
  }
  return {
    enabled: config.enabled,
    url: config.url,
    username: config.username,
    passwordConfigured: Boolean(config.password),
    basePath: config.basePath,
    configured,
    lastTest: config.lastTest,
    lastError: config.lastError,
    envControlled: config.envControlled,
  };
}

export function isWebdavUploadEnabled() {
  return getConfig().enabled;
}

export function resolveConfig(overrides = {}) {
  const current = getConfig();
  const config = { ...current };
  const controlled = current.envControlled;

  if (Object.hasOwn(overrides, 'enabled') && !controlled.enabled) {
    config.enabled = parseEnabled(overrides.enabled);
  }
  if (Object.hasOwn(overrides, 'url') && !controlled.url) {
    const value = String(overrides.url ?? '').trim();
    if (value) validateUrl(value);
    config.url = value || null;
  }
  if (Object.hasOwn(overrides, 'username') && !controlled.username) {
    const value = String(overrides.username ?? '').trim();
    config.username = value || null;
  }
  if (!controlled.password) {
    if (overrides.clear_password === true) {
      config.password = null;
    } else if (Object.hasOwn(overrides, 'password')) {
      const value = String(overrides.password ?? '');
      if (value.trim() && !isPasswordMask(value)) config.password = value;
    }
  }
  if (
    (Object.hasOwn(overrides, 'path') || Object.hasOwn(overrides, 'basePath'))
    && !controlled.path
  ) {
    config.basePath = normalizeBasePath(overrides.path ?? overrides.basePath);
  }

  return config;
}

export function getEffectiveTarget(config = getConfig()) {
  if (!config.url) return null;
  try {
    const url = validateUrl(config.url);
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${normalizeBasePath(config.basePath)}`
      .replace(/\/{2,}/g, '/');
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function saveConfig(data = {}) {
  const controlled = getConfig().envControlled;
  const fields = {
    enabled: data.enabled,
    url: data.url,
    username: data.username,
    password: data.password,
    path: data.path ?? data.basePath,
  };
  if (fields.enabled !== undefined && !controlled.enabled) {
    cfgSet('enabled', parseEnabled(fields.enabled) ? '1' : '0');
  }
  for (const field of ['url', 'username', 'password']) {
    if (fields[field] === undefined || controlled[field]) continue;
    const value = String(fields[field] ?? '');
    if (field === 'password') {
      if (value.trim() && !isPasswordMask(value)) cfgSet(field, value);
    } else if (value.trim() === '') {
      cfgDelete(field);
    } else {
      cfgSet(field, value.trim());
    }
  }
  if (data.clear_password === true && !controlled.password) {
    cfgDelete('password');
  }
  if (fields.path !== undefined && !controlled.path) {
    const value = String(fields.path);
    if (value.trim() === '') cfgDelete('path');
    else cfgSet('path', normalizeBasePath(value));
  }
  return getStatus();
}

export function buildStorageKey({ category, originalName } = {}) {
  const safeCategory = slug(category, 'documents');
  const { stem, extension } = filenameParts(originalName);
  return `${safeCategory}/${randomUUID()}-${stem}${extension}`;
}

export async function stageDocumentUpload({
  buffer,
  mime = 'application/octet-stream',
  category,
  originalName,
}) {
  const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const config = getConfig();
  if (!config.enabled) {
    return {
      storage_backend: 'local',
      storage_provider: 'local',
      storage_key: null,
      content_data: content.toString('base64'),
    };
  }

  requireWebdavConfig(config);
  const storageKey = buildStorageKey({ category, originalName });
  const keySegments = normalizeStorageKey(storageKey).split('/');
  try {
    await ensureCollections(config, keySegments.slice(0, -1));
    const response = await davFetch(config, 'PUT', [
      ...config.basePath.split('/'),
      ...keySegments,
    ], {
      body: content,
      headers: { 'Content-Type': mime },
    });
    if (!response.ok) {
      throw new Error(`PUT failed with status ${response.status}.`);
    }
  } catch (error) {
    throw toStorageError(
      error,
      'DOCUMENT_STORAGE_UPLOAD_FAILED',
      'The document could not be uploaded to WebDAV.'
    );
  }

  return {
    storage_backend: 'webdav',
    storage_provider: 'external',
    storage_key: storageKey,
    content_data: '',
  };
}

export async function verifyExistingWebdavDocument(document, config) {
  requireWebdavConfig(config);
  if (document?.storage_backend !== 'webdav') {
    throw new StorageError(
      'DOCUMENT_STORAGE_CONFIG_PROTECTED',
      'An existing WebDAV document is required for configuration verification.'
    );
  }
  try {
    const response = await davFetch(config, 'GET', [
      ...normalizeBasePath(config.basePath).split('/'),
      ...normalizeStorageKey(document.storage_key).split('/'),
    ]);
    if (!response.ok) {
      throw new Error(`GET failed with status ${response.status}.`);
    }
    await readResponseBuffer(response);
    return { ok: true };
  } catch (error) {
    throw new StorageError(
      'DOCUMENT_STORAGE_CONFIG_PROTECTED',
      'The proposed WebDAV configuration cannot read an existing document.',
      { cause: error }
    );
  }
}

export async function readDocumentContent(document, { dmsResolver } = {}) {
  if (document.storage_backend === 'local') {
    return {
      buffer: Buffer.from(document.content_data || '', 'base64'),
      mime: document.mime_type || 'application/octet-stream',
    };
  }
  if (document.storage_backend === 'dms') {
    if (!dmsResolver) {
      throw new StorageError(
        'DOCUMENT_STORAGE_READ_FAILED',
        'The DMS document is not available.'
      );
    }
    try {
      const resolved = await dmsResolver(document);
      if (Buffer.isBuffer(resolved)) {
        return {
          buffer: resolved,
          mime: document.mime_type || 'application/octet-stream',
        };
      }
      return {
        buffer: Buffer.from(resolved.buffer),
        mime: resolved.mime || document.mime_type || 'application/octet-stream',
      };
    } catch (error) {
      throw toStorageError(
        error,
        'DOCUMENT_STORAGE_READ_FAILED',
        'The DMS document could not be read.'
      );
    }
  }
  if (document.storage_backend !== 'webdav') {
    throw new StorageError(
      'DOCUMENT_STORAGE_READ_FAILED',
      'The document storage backend is not supported.'
    );
  }

  const config = requireWebdavConfig(getConfig());
  try {
    const response = await davFetch(config, 'GET', [
      ...config.basePath.split('/'),
      ...normalizeStorageKey(document.storage_key).split('/'),
    ]);
    if (!response.ok) {
      throw new Error(`GET failed with status ${response.status}.`);
    }
    return {
      buffer: await readResponseBuffer(response),
      mime: document.mime_type
        || response.headers.get('content-type')
        || 'application/octet-stream',
    };
  } catch (error) {
    throw toStorageError(
      error,
      'DOCUMENT_STORAGE_READ_FAILED',
      'The WebDAV document could not be read.'
    );
  }
}

export async function deleteDocumentContent(document) {
  if (document.storage_backend !== 'webdav') return;
  const config = requireWebdavConfig(getConfig());
  try {
    const response = await davFetch(config, 'DELETE', [
      ...config.basePath.split('/'),
      ...normalizeStorageKey(document.storage_key).split('/'),
    ]);
    if (!response.ok && response.status !== 404) {
      throw new Error(`DELETE failed with status ${response.status}.`);
    }
  } catch (error) {
    throw toStorageError(
      error,
      'DOCUMENT_STORAGE_DELETE_FAILED',
      'The WebDAV document could not be deleted.'
    );
  }
}

export async function cleanupStagedUpload(staged) {
  try {
    return await deleteDocumentContent(staged);
  } catch (error) {
    throw new StorageError(
      'DOCUMENT_STORAGE_CLEANUP_FAILED',
      'The staged WebDAV document could not be cleaned up.',
      { cause: error }
    );
  }
}

export async function testConnection(overrides = {}) {
  const config = resolveConfig(overrides);
  const testedAt = new Date().toISOString();
  let testKey;
  let primaryError;

  try {
    requireWebdavConfig(config);
    await ensureCollections(config);
    testKey = `.connection-test-${randomUUID()}.bin`;
    const expected = Buffer.from(`yuvomi-document-storage:${randomUUID()}`);
    const putResponse = await davFetch(config, 'PUT', [
      ...config.basePath.split('/'),
      testKey,
    ], {
      body: expected,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    if (!putResponse.ok) {
      throw new Error(`PUT failed with status ${putResponse.status}.`);
    }

    const getResponse = await davFetch(config, 'GET', [
      ...config.basePath.split('/'),
      testKey,
    ]);
    if (!getResponse.ok) {
      throw new Error(`GET failed with status ${getResponse.status}.`);
    }
    const actual = await readResponseBuffer(getResponse);
    if (!actual.equals(expected)) {
      throw new Error('WebDAV connection verification returned different bytes.');
    }
  } catch (error) {
    primaryError = error;
  } finally {
    if (testKey) {
      try {
        const response = await davFetch(config, 'DELETE', [
          ...config.basePath.split('/'),
          testKey,
        ]);
        if (!response.ok && response.status !== 404) {
          throw new Error(`DELETE failed with status ${response.status}.`);
        }
      } catch (error) {
        primaryError ||= error;
      }
    }
  }

  if (primaryError) {
    if (primaryError instanceof StorageError) {
      cfgSet('last_error', primaryError.message);
      throw primaryError;
    }
    const error = new StorageError(
      'DOCUMENT_STORAGE_CONNECTION_TEST_FAILED',
      `WebDAV connection test failed: ${primaryError.message}`,
      { cause: primaryError }
    );
    cfgSet('last_error', error.message);
    throw error;
  }
  cfgSet('last_test', testedAt);
  cfgDelete('last_error');
  return { ok: true };
}

export function __setRequestTimeoutForTests(timeoutMs) {
  requestTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
}
