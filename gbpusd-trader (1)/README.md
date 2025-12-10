# GBPUSD-Trader (updated)

This repo is prepared for Docker-based local development and includes:
- backend (Node.js + Postgres, SSE)
- python_engine (signal generator)
- frontend (React + TradingView)
- nginx reverse-proxy to terminate TLS (expects certs at ./nginx/certs)

## HTTPS (local / production)
- The `nginx` service in `docker-compose.yml` expects TLS certs at `./nginx/certs/fullchain.pem` and `./nginx/certs/privkey.pem`.
- For local testing you can create self-signed certs and place them in `./nginx/certs/`.
- For production use Let's Encrypt (Certbot) or a managed TLS solution and place certs in the same path or mount them securely.

## ODO comments (places that must be replaced before production)
- ODO: Replace synthetic market feed in `python_engine/signal_engine.py` with a reliable broker or market data API.
- ODO: Rotate and secure `HMAC_SECRET` and `API_KEY`. Use secrets manager.
- ODO: Ensure the MQL5 EA replaces naive JSON parsing with `Json.mqh` (see `mql5/`).
- ODO: Replace SQLite usage (if present) with Postgres; this repo is converted to Postgres and the backend uses DATABASE_URL.

## Quick start (docker)
1. Copy env:
   ```
   cp backend/.env.example backend/.env
   # edit backend/.env
   ```
2. Create certs (for local testing) and place in ./nginx/certs/
3. Build and run:
   ```
   docker-compose build
   docker-compose up -d
   ```
4. Frontend is available via HTTPS on https://localhost (if certs are installed). Backend listens internally on port 3000.

## Notes
- Test everything on demo MetaTrader accounts.
- Do not deploy trading code to production until audited and tested.
