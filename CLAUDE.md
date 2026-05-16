# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build   # tsc → dist/ and copies src/public → dist/public
npm start       # runs compiled dist/index.js (requires build first)
npm run dev     # ts-node src/index.ts (skip build step)
```

There is no test suite, no linter, and no formatter configured. `tsc` (via `npm run build`) is the only static check.

The build's `cp -r src/public dist/public` step means any new static asset directories under `src/` must be added to the build script or they won't reach `dist/`.

## Purpose & intentional bugs

This is a **deliberately buggy** Express demo. Each route under `src/routes/` plants a specific failure mode so it generates a distinct, structured error signal in Grafana Cloud (Loki/Tempo/Prometheus). Bug locations and `error_class` values are documented in `README.md`.

**Do not "fix" the planted bugs unless explicitly asked.** Routes are tagged with `// BUG:` comments and have hand-written `logError({...})` calls whose `file`/`line`/`error_class` values are referenced by external tooling and dashboards. If you genuinely need to edit a buggy route, keep the bug behavior and the existing `error_class` string intact, and update the `line:` field if you move the offending statement.

## Architecture

### Telemetry is the product

`src/telemetry.ts` is imported **first** in `src/index.ts` — before Express — because `@opentelemetry/sdk-node` must initialize before any HTTP client is loaded for auto-instrumentation to patch them. Do not reorder these imports.

Telemetry runs **three parallel egress paths** for the same error event, by design:

1. `console.error(JSON.stringify(body))` — captured by the host (e.g. Railway) log collector.
2. **OTLP** → Grafana Cloud via `NodeSDK` (traces + metrics + logs, batched, correlated by `trace_id`).
3. **Direct Loki HTTP push** (`pushToLoki` in `telemetry.ts`) — bypasses the OTLP pipeline so downstream consumers can query logs with sub-second latency under the `{service_name="buggy-shop"} | level="error" | error_class!=""` selector.

The Loki host is derived from `GRAFANA_OTLP_ENDPOINT` (gateway → logs URL) unless `LOKI_HOST` overrides it. If any of `GRAFANA_OTLP_ENDPOINT` / `GRAFANA_INSTANCE_ID` / `GRAFANA_API_TOKEN` are missing, OTLP exporters are skipped and the SDK runs in console-only mode — the app still boots.

`httpMetricsMiddleware` (exported from `telemetry.ts`, wired in `index.ts`) emits the `http_server_duration_milliseconds` histogram with `http_method` / `http_route` / `http_response_status_code` / `service_name` labels. Grafana alerts in `grafana-alerts.json` and the dashboard in `grafana-dashboard.json` depend on these exact label names.

### Error logging contract

Every planted bug funnels through `logError({ error_class, file, line, message, error? })` from `src/telemetry.ts`. The shape of the emitted log body — keys `level`, `error_class`, `service_name`, `file`, `line`, `message`, `trace_id` — is a **stable schema** that external SASHA AutoFix tooling parses. Adding new error sites? Reuse `logError` and match the existing structure. New keys are fine; renaming existing ones will break consumers.

When an active span exists and an `error` is passed, `logError` also calls `span.recordException()` and sets the span status to ERROR, which is how traces in Tempo correlate to the same incident.

### Route layout

All routes are mounted in `src/index.ts` and live as small self-contained modules under `src/routes/`. Each module owns its in-memory fixture data (no DB), declares its bug in a top comment, and handles its own try/catch + `logError` call. There is no shared error-handling middleware — that's intentional, so each error site can carry its own hand-tuned `error_class`/`file`/`line` metadata.

## Configuration files outside source

- `grafana-dashboard.json`, `grafana-alerts.json` — Grafana Cloud dashboard + alert definitions; reference the metric/label names emitted by `telemetry.ts`.
- `slack-app-manifest.json` — Slack app config for incident notifications.
- `Dockerfile` — container build for Railway/Docker deployment (see README).
