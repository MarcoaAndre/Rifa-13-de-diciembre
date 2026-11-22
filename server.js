const express = require('express');
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

const { MONGODB_URI, ADMIN_USER, ADMIN_PASSWORD, JWT_SECRET } = process.env;
const DB_NAME = process.env.DB_NAME || 'rifa';
const PORT = process.env.PORT || 3000;

if (!MONGODB_URI || !ADMIN_USER || !ADMIN_PASSWORD || !JWT_SECRET) {
  console.error('Faltan variables de entorno: MONGODB_URI, ADMIN_USER, ADMIN_PASSWORD y JWT_SECRET.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  next();
});

// Comparacion segura de textos (evita ataques por tiempo de respuesta)
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

// Limite de intentos de login: 5 por IP cada 15 minutos
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
function blocked(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() > a.until) { attempts.delete(ip); return false; }
  return a.count >= 5;
}
function fail(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() > a.until) attempts.set(ip, { count: 1, until: Date.now() + WINDOW });
  else a.count++;
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  try { jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { res.status(401).json({ error: 'No autorizado' }); }
}

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: 'Error del servidor' });
});

let col;

// Publico: solo dice cuales numeros estan vendidos (sin datos de compradores)
app.get('/api/numeros', wrap(async (req, res) => {
  const docs = await col.find({ vendido: true }, { projection: { _id: 1 } }).toArray();
  res.set('Cache-Control', 'no-store');
  res.json({ vendidos: docs.map((d) => d._id) });
}));

app.post('/api/login', wrap(async (req, res) => {
  if (blocked(req.ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  const { user, password } = req.body || {};
  const ok = typeof user === 'string' && typeof password === 'string' &&
    safeEqual(user.trim().toLowerCase(), ADMIN_USER.trim().toLowerCase()) && safeEqual(password, ADMIN_PASSWORD);
  if (!ok) { fail(req.ip); return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' }); }
  attempts.delete(req.ip);
  res.json({ token: jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '12h' }) });
}));

// Solo organizador: lista completa con datos de compradores
app.get('/api/admin/numeros', auth, wrap(async (req, res) => {
  const docs = await col.find({}).toArray();
  res.set('Cache-Control', 'no-store');
  res.json({ items: docs.map((d) => ({ n: d._id, vendido: !!d.vendido, nombre: d.nombre || '', telefono: d.telefono || '' })) });
}));

app.put('/api/admin/numeros/:n', auth, wrap(async (req, res) => {
  const n = Number(req.params.n);
  if (!Number.isInteger(n) || n < 0 || n > 99) return res.status(400).json({ error: 'Numero invalido' });
  const b = req.body || {};
  const set = {};
  if (typeof b.vendido === 'boolean') set.vendido = b.vendido;
  if (typeof b.nombre === 'string') set.nombre = b.nombre.trim().slice(0, 80);
  if (typeof b.telefono === 'string') set.telefono = b.telefono.trim().slice(0, 30);
  if (!Object.keys(set).length) return res.status(400).json({ error: 'Nada que actualizar' });
  set.actualizado = new Date();
  await col.updateOne({ _id: n }, { $set: set }, { upsert: true });
  res.json({ ok: true });
}));

app.get('/health', (req, res) => res.send('ok'));
app.use(express.static(path.join(__dirname, 'public')));

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  col = client.db(DB_NAME).collection('numeros');
  app.listen(PORT, () => console.log('Rifa lista en el puerto ' + PORT));
})().catch((e) => { console.error('No se pudo conectar a MongoDB:', e.message); process.exit(1); });
