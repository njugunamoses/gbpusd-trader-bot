/**
 * Backend server with Postgres (pg), SSE endpoint and broadcasting.
 *
 * ODO: Replace synthetic/demo components with production-grade services:
 *  - ODO: Replace SQLite fallback with Postgres (currently using Postgres via DATABASE_URL).
 *  - ODO: Ensure HMAC_SECRET is set and TradingView (or other producer) is signing payloads.
 *  - ODO: Use real TLS certs mounted at /etc/ssl and terminate at nginx (see docker-compose and nginx folder).
 *  - ODO: For MQL5, replace naive parsing with Json.mqh implementation in the EA.
 *
 * Security notes:
 * - Use HTTPS in production (nginx reverse-proxy service is included and expects certs in ./nginx/certs).
 * - Rotate API keys and HMAC secret; store secrets in secure stores.
 */

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const Joi = require('joi');
const { Pool } = require('pg');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'CHANGE_ME';
const HMAC_SECRET = process.env.HMAC_SECRET || 'CHANGE_ME';
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://gbpusd_user:change_me@localhost:5432/gbpusd';

const pool = new Pool({ connectionString: DATABASE_URL });

const app = express();
app.use(helmet());
app.use(bodyParser.json({ limit: '100kb' }));

// CORS policy
if (NODE_ENV === 'production') {
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN }));
} else {
  app.use(cors());
}

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use(limiter);

// Ensure DB tables exist
async function initDb(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      symbol TEXT,
      side TEXT,
      price DOUBLE PRECISION,
      size DOUBLE PRECISION,
      sl DOUBLE PRECISION,
      tp DOUBLE PRECISION,
      status TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      payload JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
initDb().catch(err => { console.error('DB init error', err); process.exit(1); });

// SSE clients store
const sseClients = new Set();

// helper to send SSE message
function sseSend(data){
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for(const res of sseClients){
    try{
      res.write(payload);
    }catch(e){
      // remove broken clients
      sseClients.delete(res);
    }
  }
}

// Simple WS broadcast helper (if you run ws-server separately you can call it)
let wsBroadcast = null;
try{
  const wsModule = require('./ws-server');
  if(wsModule && wsModule.broadcast) wsBroadcast = wsModule.broadcast;
} catch(e){
  // ws-server may not be present; that's fine
}

// HMAC verification
function verifyHmac(payload, signature){
  if(!signature) return false;
  const hash = crypto.createHmac('sha256', HMAC_SECRET).update(JSON.stringify(payload)).digest('hex');
  return hash === signature;
}

// Validation schema
const alertSchema = Joi.object({
  symbol: Joi.string().optional(),
  side: Joi.string().valid('buy','sell').insensitive().required(),
  price: Joi.number().optional().allow(null),
  size: Joi.number().optional().min(0.0001),
  sl: Joi.number().optional().allow(null),
  tp: Joi.number().optional().allow(null),
  engine: Joi.string().optional(),
  rsi: Joi.number().optional()
});

app.post('/webhook', async (req, res) => {
  const sig = req.headers['x-signature'];
  if (NODE_ENV === 'production' && process.env.HMAC_SECRET && !verifyHmac(req.body, sig)) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  const { error, value } = alertSchema.validate(req.body);
  if (error) return res.status(400).json({ error: 'invalid payload', details: error.details });

  const symbol = (value.symbol || 'FX:GBPUSD').replace('FX:','');
  const side = value.side.toLowerCase();
  const size = Number(value.size || 0.01);
  const price = value.price ? Number(value.price) : null;
  const sl = value.sl ? Number(value.sl) : null;
  const tp = value.tp ? Number(value.tp) : null;

  try{
    const result = await pool.query(
      `INSERT INTO orders (symbol, side, price, size, sl, tp, status) VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [symbol, side, price, size, sl, tp]
    );
    const order = result.rows[0];

    // broadcast to SSE clients and WS clients
    const payload = {
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      price: order.price,
      size: order.size,
      sl: order.sl,
      tp: order.tp,
      status: order.status,
      time: order.created_at,
      engine: value.engine || 'webhook'
    };

    // SSE
    sseSend(payload);
    // WS
    if(wsBroadcast) wsBroadcast({ type: 'order', data: payload });

    res.json({ status: 'ok', id: order.id });
  }catch(err){
    console.error('DB insert error', err);
    res.status(500).json({ error: 'db error' });
  }
});

// SSE endpoint
app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write('retry: 10000\n\n');
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// EA polls for orders (for backward compatibility)
app.get('/api/get-orders', async (req, res) => {
  const key = req.query.key;
  if (key !== API_KEY) return res.status(403).json({ error: 'invalid key' });

  try{
    const result = await pool.query(`SELECT * FROM orders WHERE status='pending' ORDER BY id ASC`);
    const rows = result.rows;

    const ids = rows.map(r => r.id);
    if(ids.length > 0){
      await pool.query(`UPDATE orders SET status='sent' WHERE id = ANY($1::int[])`, [ids]);
    }

    res.json({ orders: rows });
  }catch(err){
    console.error('DB query error', err);
    res.status(500).json({ error: 'db error' });
  }
});

// EA reports execution
app.post('/api/report', async (req, res) => {
  const key = req.query.key;
  if (key !== API_KEY) return res.status(403).json({ error: 'invalid key' });
  try{
    await pool.query(`INSERT INTO reports (payload) VALUES ($1)`, [req.body]);
    res.json({ status: 'ok' });
  }catch(err){
    console.error('DB insert report error', err);
    res.status(500).json({ error: 'db error' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
