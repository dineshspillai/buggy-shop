# buggy-shop

A deliberately buggy Node.js + Express ecommerce demo instrumented with OpenTelemetry, designed to generate interesting errors, traces, and logs in Grafana Cloud.

## Planted bugs

| Route | Bug | Symptom |
|---|---|---|
| `GET /user/2/profile` | NPE — `user.address.street` without null check | 500, structured `NullPointerException` log |
| `POST /payments/charge` | Timeout — gateway takes 800ms, limit is 500ms | 504 `TimeoutError` log |
| `GET /statements/:period` | Date off-by-one — `new Date('2025-01')` is invalid | `DateParseError` log, NaN month |
| `POST /search` (empty body) | Unhandled rejection — no try/catch, throws on missing `query` | Unhandled promise rejection / 500 |
| `GET /noise/widget-check` | False positive — harmless `ResizeObserverLoopError` noise | Error log with no real impact |

## Endpoints

```
GET  /products              — list all products (baseline, no bugs)
GET  /user/:id/profile      — user profile (NPE on id=2)
POST /payments/charge       — charge payment (always times out)
GET  /statements/:period    — monthly statement e.g. /statements/2025-01
POST /search                — search catalog (send JSON body with "query" field)
GET  /noise/widget-check    — harmless noise error
GET  /noise/health          — health check
```

## Run locally

```bash
cp .env.example .env
# Fill in your Grafana Cloud OTLP credentials in .env

npm install
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) — the dashboard fires each endpoint 10× so you can watch errors appear in Grafana.

## Environment variables

| Variable | Description |
|---|---|
| `GRAFANA_OTLP_ENDPOINT` | Your Grafana Cloud OTLP HTTP endpoint (e.g. `https://otlp-gateway-prod-us-east-0.grafana.net/otlp`) |
| `GRAFANA_INSTANCE_ID` | Your Grafana Cloud instance ID (numeric) |
| `GRAFANA_API_TOKEN` | Grafana Cloud API token with MetricsPublisher + LogsPublisher + TracesPublisher scopes |
| `PORT` | HTTP port (default: 3000) |

## Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app)

```bash
railway login
railway init
railway up
railway variables set GRAFANA_OTLP_ENDPOINT=... GRAFANA_INSTANCE_ID=... GRAFANA_API_TOKEN=...
```

## Deploy with Docker

```bash
docker build -t buggy-shop .
docker run -p 3000:3000 \
  -e GRAFANA_OTLP_ENDPOINT=... \
  -e GRAFANA_INSTANCE_ID=... \
  -e GRAFANA_API_TOKEN=... \
  buggy-shop
```

## Grafana Cloud setup

1. Go to **Connections → Add new connection → OpenTelemetry**
2. Copy your OTLP endpoint, instance ID, and generate an API token
3. In Grafana, explore **Logs** (Loki), **Traces** (Tempo), and **Metrics** (Prometheus) — all fed by this app
