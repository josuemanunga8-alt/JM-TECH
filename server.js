'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const Database = require('better-sqlite3');

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '.private'));
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;
const BRANDS = new Set(['Apple', 'Samsung', 'Xiaomi', 'Motorola', 'HONOR', 'OPPO']);
const catalog = require('./productos.js');

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT debe ser un puerto válido.');
if (SESSION_SECRET.length < 32 || SESSION_SECRET.startsWith('replace-with-')) {
  throw new Error('Configura SESSION_SECRET con un valor aleatorio de al menos 32 caracteres en el archivo .env.');
}
if (!/^https?:\/\/[^/]+$/i.test(APP_ORIGIN) || (IS_PRODUCTION && !APP_ORIGIN.startsWith('https://'))) {
  throw new Error('APP_ORIGIN debe ser un origen válido y usar HTTPS en producción.');
}
if (IS_PRODUCTION && (!/^\d+$/.test(process.env.TRUST_PROXY || '') || Number(process.env.TRUST_PROXY) > 5)) {
  throw new Error('Configura TRUST_PROXY como el número (0 a 5) de proxies confiables del alojamiento HTTPS.');
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'jmtech.sqlite3'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires);
  CREATE TABLE IF NOT EXISTS site_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0
  );
`);

function initialState() {
  const products = catalog.map((product) => ({ ...product, features: [...product.features] }));
  return {
    products,
    clients: [],
    sales: [],
    nextP: Math.max(...products.map((product) => product.id)) + 1,
    nextC: 1,
    nextS: 1001
  };
}

db.prepare('INSERT OR IGNORE INTO site_state (id, data, updated_at) VALUES (1, ?, ?)')
  .run(JSON.stringify(initialState()), new Date().toISOString());

function getState() {
  const row = db.prepare('SELECT data FROM site_state WHERE id = 1').get();
  return JSON.parse(row.data);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value, maxLength, minLength = 0) {
  return typeof value === 'string' && value.length >= minLength && value.length <= maxLength;
}

function validImage(value) {
  if (value === '') return true;
  if (typeof value !== 'string') return false;
  if (value.startsWith('./imagenes/')) {
    try {
      const decoded = decodeURIComponent(value);
      return !decoded.includes('..') && !decoded.includes('\\') && !/[?#]/.test(decoded);
    } catch {
      return false;
    }
  }
  return /^https:\/\/[^\s]+$/i.test(value);
}

function validateState(state) {
  if (!isRecord(state)) return 'El formato del catálogo no es válido.';
  if (!Array.isArray(state.products) || state.products.length > 500) return 'El catálogo no es válido.';
  if (!Array.isArray(state.clients) || state.clients.length > 5000) return 'La lista de clientes no es válida.';
  if (!Array.isArray(state.sales) || state.sales.length > 10000) return 'La lista de ventas no es válida.';
  if (![state.nextP, state.nextC, state.nextS].every((value) => Number.isSafeInteger(value) && value > 0)) {
    return 'Los contadores del catálogo no son válidos.';
  }

  const productIds = new Set();
  for (const product of state.products) {
    if (!isRecord(product) || !Number.isSafeInteger(product.id) || product.id < 1 || productIds.has(product.id)) {
      return 'Hay un producto con identificador inválido o duplicado.';
    }
    productIds.add(product.id);
    if (!isText(product.name, 120, 1) || !BRANDS.has(product.brand) || !isText(product.storage, 40, 1)
      || !Number.isSafeInteger(product.price) || product.price < 1 || product.price > 1_000_000_000
      || !Number.isSafeInteger(product.stock) || product.stock < 0 || product.stock > 1_000_000
      || !isText(product.color, 60, 1) || !isText(product.condition, 40, 1)
      || !isText(product.desc, 2000) || !Array.isArray(product.features) || product.features.length > 30
      || !product.features.every((feature) => isText(feature, 200))
      || !validImage(product.image) || !isText(product.imageSource, 2048)
      || (product.imageSource && !/^https:\/\/[^\s]+$/i.test(product.imageSource))
      || !isText(product.imageCredit, 200) || !isText(product.imageLicense, 2048)
      || (product.imageLicense && !/^https:\/\/[^\s]+$/i.test(product.imageLicense))) {
      return 'Hay un producto con campos inválidos.';
    }
    if (product.oldPrice !== undefined && (!Number.isSafeInteger(product.oldPrice)
      || product.oldPrice <= product.price || product.oldPrice > 1_000_000_000)) {
      return 'Hay un precio anterior inválido.';
    }
    if (product.oldPriceSource !== undefined && (!isText(product.oldPriceSource, 2048)
      || (product.oldPriceSource && !/^https:\/\/[^\s]+$/i.test(product.oldPriceSource)))) {
      return 'La fuente de un precio anterior no es válida.';
    }
  }

  const clientIds = new Set();
  for (const client of state.clients) {
    if (!isRecord(client) || !Number.isSafeInteger(client.id) || client.id < 1 || clientIds.has(client.id)
      || !isText(client.name, 100, 3) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(client.email)
      || !isText(client.email, 254, 3) || !/^\d{10}$/.test(client.phone)
      || typeof client.created !== 'string' || Number.isNaN(Date.parse(client.created))) {
      return 'Hay un cliente con campos inválidos.';
    }
    clientIds.add(client.id);
  }

  for (const sale of state.sales) {
    if (!isRecord(sale) || !Number.isSafeInteger(sale.id) || sale.id < 1
      || !Number.isSafeInteger(sale.cid) || sale.cid < 0 || !isText(sale.client, 120, 1)
      || !Array.isArray(sale.items) || sale.items.length < 1 || sale.items.length > 100
      || !Number.isSafeInteger(sale.total) || sale.total < 0
      || typeof sale.date !== 'string' || Number.isNaN(Date.parse(sale.date))
      || !isText(sale.method, 40, 1) || !['Completada', 'Pendiente'].includes(sale.status)) {
      return 'Hay una venta con campos inválidos.';
    }
    for (const item of sale.items) {
      if (!isRecord(item) || !Number.isSafeInteger(item.pid) || item.pid < 1
        || !isText(item.name, 120, 1) || !BRANDS.has(item.brand)
        || !Number.isSafeInteger(item.price) || item.price < 1
        || !Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 1_000_000) {
        return 'Hay un artículo de venta con campos inválidos.';
      }
    }
  }
  return '';
}

function normalizeState(state) {
  return {
    products: state.products,
    clients: state.clients,
    sales: state.sales,
    nextP: state.nextP,
    nextC: state.nextC,
    nextS: state.nextS
  };
}

const saveStateIfRevisionMatches = db.transaction((state, revision) => {
  const result = db.prepare('UPDATE site_state SET data = ?, updated_at = ?, revision = revision + 1 WHERE id = 1 AND revision = ?')
    .run(JSON.stringify(state), new Date().toISOString(), revision);
  return result.changes === 1;
});

function importLegacyState(state) {
  const validationError = validateState(state);
  if (validationError) return { error: validationError };
  const row = db.prepare('SELECT revision FROM site_state WHERE id = 1').get();
  if (row.revision !== 0) return { conflict: true };

  const current = getState();
  const importedProducts = [];
  const usedIds = new Set();
  const oldToNewId = new Map();
  let nextId = Math.max(...current.products.map((product) => product.id), ...state.products.map((product) => product.id)) + 1;

  for (const product of current.products) {
    const previous = state.products.find((item) => item.name === product.name && item.brand === product.brand);
    if (previous) {
      importedProducts.push({ ...previous, id: product.id });
      oldToNewId.set(previous.id, product.id);
      usedIds.add(product.id);
    } else {
      importedProducts.push(product);
      usedIds.add(product.id);
    }
  }
  for (const product of state.products) {
    if (current.products.some((item) => item.name === product.name && item.brand === product.brand)) continue;
    const id = usedIds.has(product.id) ? nextId++ : product.id;
    importedProducts.push({ ...product, id });
    oldToNewId.set(product.id, id);
    usedIds.add(id);
  }

  const imported = {
    products: importedProducts,
    clients: state.clients,
    sales: state.sales.map((sale) => ({
      ...sale,
      items: sale.items.map((item) => ({ ...item, pid: oldToNewId.get(item.pid) || item.pid }))
    })),
    nextP: Math.max(state.nextP, Math.max(...importedProducts.map((product) => product.id)) + 1),
    nextC: Math.max(state.nextC, ...state.clients.map((client) => client.id + 1), 1),
    nextS: Math.max(state.nextS, ...state.sales.map((sale) => sale.id + 1), 1001)
  };
  if (!saveStateIfRevisionMatches(imported, 0)) return { conflict: true };
  return { state: imported };
}

class SqliteSessionStore extends session.Store {
  constructor(database) {
    super();
    this.db = database;
    this.getStatement = database.prepare('SELECT data, expires FROM sessions WHERE sid = ?');
    this.setStatement = database.prepare(`
      INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires
    `);
    this.touchStatement = database.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this.deleteStatement = database.prepare('DELETE FROM sessions WHERE sid = ?');
  }

  get(sid, callback) {
    try {
      const row = this.getStatement.get(sid);
      if (!row) return callback(null, null);
      if (row.expires <= Date.now()) {
        this.deleteStatement.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.data));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, value, callback = () => {}) {
    try {
      const expires = value.cookie && value.cookie.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + SESSION_MAX_AGE;
      this.setStatement.run(sid, JSON.stringify(value), expires);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  touch(sid, value, callback = () => {}) {
    try {
      const expires = value.cookie && value.cookie.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + SESSION_MAX_AGE;
      this.touchStatement.run(expires, sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.deleteStatement.run(sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'https:', 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  if (IS_PRODUCTION && !req.secure) return res.status(400).json({ error: 'Se requiere una conexión HTTPS.' });
  return next();
});
app.use(express.json({ limit: '2mb', strict: true }));
app.use(session({
  name: IS_PRODUCTION ? '__Host-jmtech.sid' : 'jmtech.sid',
  secret: SESSION_SECRET,
  store: new SqliteSessionStore(db),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' }
});

function requireSameOrigin(req, res, next) {
  if (req.get('origin') !== APP_ORIGIN) return res.status(403).json({ error: 'Origen de solicitud no permitido.' });
  return next();
}

function requireCsrf(req, res, next) {
  const supplied = req.get('x-csrf-token') || '';
  const expected = req.session.csrfToken || '';
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (!supplied || suppliedBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(403).json({ error: 'La sesión expiró o la solicitud no es válida. Recarga la página.' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  return next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

const dummySalt = crypto.randomBytes(32);
const dummyPasswordHash = scrypt(crypto.randomBytes(32).toString('hex'), dummySalt)
  .then((hash) => hash.toString('hex'));

async function passwordMatches(password, saltHex, hashHex) {
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'));
  const expected = Buffer.from(hashHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function createAdminAccount(username, password) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(normalizedUsername)) {
    throw new Error('El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.');
  }
  if (typeof password !== 'string' || password.length < 14 || password.length > 128) {
    throw new Error('La contraseña debe tener entre 14 y 128 caracteres.');
  }
  if (db.prepare('SELECT COUNT(*) AS count FROM admin_credentials').get().count > 0) {
    throw new Error('Ya existe una cuenta administrativa. No se creó otra.');
  }
  const salt = crypto.randomBytes(32);
  const hash = await scrypt(password, salt);
  db.prepare('INSERT INTO admin_credentials (id, username, salt, password_hash, created_at) VALUES (1, ?, ?, ?, ?)')
    .run(normalizedUsername, salt.toString('hex'), hash.toString('hex'), new Date().toISOString());
}

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/products', (req, res) => res.json(getState().products));

app.get('/api/auth/csrf', (req, res, next) => {
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  req.session.save((error) => {
    if (error) return next(error);
    return res.json({ csrfToken: req.session.csrfToken });
  });
});

app.get('/api/auth/session', (req, res) => {
  if (!req.session.admin) return res.json({ authenticated: false });
  return res.json({ authenticated: true, username: req.session.admin, csrfToken: req.session.csrfToken });
});

app.post('/api/auth/session', requireSameOrigin, requireCsrf, loginLimiter, asyncRoute(async (req, res, next) => {
  const body = isRecord(req.body) ? req.body : {};
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const account = db.prepare('SELECT username, salt, password_hash FROM admin_credentials WHERE username = ?').get(username);
  const salt = account ? account.salt : dummySalt.toString('hex');
  const hash = account ? account.password_hash : await dummyPasswordHash;
  const matches = await passwordMatches(password.slice(0, 128), salt, hash);
  if (!account || password.length > 128 || !matches) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.admin = account.username;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    req.session.save((saveError) => {
      if (saveError) return next(saveError);
      return res.json({ username: account.username, csrfToken: req.session.csrfToken });
    });
  });
}));

app.delete('/api/auth/session', requireSameOrigin, requireAdmin, requireCsrf, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(IS_PRODUCTION ? '__Host-jmtech.sid' : 'jmtech.sid', {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'strict',
      path: '/'
    });
    return res.status(204).end();
  });
});

app.put('/api/admin/state', requireSameOrigin, requireAdmin, requireCsrf, (req, res) => {
  const error = validateState(req.body);
  if (error) return res.status(400).json({ error });
  const revision = req.body.revision;
  if (!Number.isSafeInteger(revision) || revision < 0 || !saveStateIfRevisionMatches(normalizeState(req.body), revision)) {
    return res.status(409).json({ error: 'Los datos cambiaron en otra sesión. Se recargó la versión guardada.' });
  }
  return res.json({ ok: true, revision: revision + 1 });
});
app.get('/api/admin/state', requireAdmin, (req, res) => {
  const revision = db.prepare('SELECT revision FROM site_state WHERE id = 1').get().revision;
  return res.json({ ...getState(), revision });
});
app.post('/api/admin/import-local', requireSameOrigin, requireAdmin, requireCsrf, (req, res) => {
  const result = importLegacyState(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.conflict) return res.status(409).json({ error: 'El servidor ya tiene cambios; no se importaron los datos locales.' });
  return res.json({ ok: true });
});

app.use((req, res, next) => {
  const publicFile = ['/', '/index.html', '/script.js', '/productos.js', '/style.css'].includes(req.path)
    || req.path.startsWith('/imagenes/');
  if (publicFile) return next();
  if (req.path.startsWith('/api/')) return next();
  return res.status(404).send('Página no encontrada.');
});
app.use(express.static(__dirname, {
  dotfiles: 'ignore',
  index: 'index.html',
  fallthrough: true,
  etag: true,
  maxAge: IS_PRODUCTION ? '1h' : 0
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta de API no encontrada.' }));
app.use((req, res) => res.status(404).send('Página no encontrada.'));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status >= 500) console.error('Error de servidor JM TECH:', error);
  const message = status === 413 ? 'La solicitud supera el tamaño permitido.'
    : status === 400 ? 'La solicitud no tiene un formato válido.'
      : 'Ocurrió un error interno. Inténtalo de nuevo.';
  return res.status(status).json({ error: message });
});

const cleanupSessions = setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
  } catch (error) {
    console.error('No se pudieron limpiar las sesiones expiradas.', error);
  }
}, 60 * 60 * 1000);
cleanupSessions.unref();

if (require.main === module) {
  const host = IS_PRODUCTION ? '0.0.0.0' : '127.0.0.1';
  const server = app.listen(PORT, host, () => {
    console.log(`JM TECH listo en http://localhost:${PORT}`);
    console.log('La consola de administración requiere una cuenta creada con npm run admin:create.');
  });
  const shutdown = () => {
    clearInterval(cleanupSessions);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { app, createAdminAccount, db, getState, importLegacyState, validateState };
