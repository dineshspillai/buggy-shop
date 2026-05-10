import * as dotenv from 'dotenv';
dotenv.config();

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { trace, context, SpanStatusCode, metrics } from '@opentelemetry/api';
import { Request, Response, NextFunction } from 'express';

const endpoint = process.env.GRAFANA_OTLP_ENDPOINT || '';
const instanceId = process.env.GRAFANA_INSTANCE_ID || '';
const apiToken = process.env.GRAFANA_API_TOKEN || '';
const grafanaConfigured = Boolean(endpoint && instanceId && apiToken);

const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'buggy-shop',
});

const loggerProvider = new LoggerProvider({ resource });
logs.setGlobalLoggerProvider(loggerProvider);

if (grafanaConfigured) {
  const authHeader = 'Basic ' + Buffer.from(`${instanceId}:${apiToken}`).toString('base64');
  const headers = { Authorization: authHeader };

  const traceExporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers });
  const metricExporter = new OTLPMetricExporter({ url: `${endpoint}/v1/metrics`, headers });
  const logExporter = new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers });

  loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 10000,
    }),
    logRecordProcessor: new BatchLogRecordProcessor(logExporter),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
} else {
  console.warn('[telemetry] GRAFANA_OTLP_ENDPOINT / INSTANCE_ID / API_TOKEN not set — exporting to console only');

  const sdk = new NodeSDK({
    resource,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}

// Express middleware for server-side HTTP metrics
export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const meter = metrics.getMeter('buggy-shop');
    const histogram = meter.createHistogram('http_server_duration_milliseconds', {
      description: 'HTTP server request duration',
      unit: 'ms',
    });
    histogram.record(duration, {
      http_method: req.method,
      http_route: req.route?.path ?? req.path,
      http_response_status_code: String(res.statusCode),
      service_name: 'buggy-shop',
    });
  });
  next();
}

// ── Direct Loki push ─────────────────────────────────────────────────────────
// Pushes a log line straight to the Loki HTTP API so SASHA can query it via
// {service_name="buggy-shop"} | level = "error" | error_class != ""
// Uses the same credentials as the OTLP pipeline (GRAFANA_INSTANCE_ID / API_TOKEN)
// plus LOKI_HOST which points to the Loki endpoint (not the OTLP gateway).
async function pushToLoki(body: Record<string, string | number>): Promise<void> {
  const lokiHost   = process.env.LOKI_HOST;          // https://logs-prod-021.grafana.net
  const lokiUser   = process.env.GRAFANA_INSTANCE_ID; // numeric instance id e.g. 1587132
  const lokiToken  = process.env.GRAFANA_API_TOKEN;

  if (!lokiHost || !lokiUser || !lokiToken) return;   // env not configured — skip silently

  const auth   = Buffer.from(`${lokiUser}:${lokiToken}`).toString('base64');
  const tsNano = String(Date.now() * 1_000_000);       // Loki expects nanosecond timestamps

  try {
    await fetch(`${lokiHost}/loki/api/v1/push`, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': `Basic ${auth}`,
        'X-Scope-OrgID': lokiUser,
      },
      body: JSON.stringify({
        streams: [{
          stream: {
            service_name: 'buggy-shop',
            level       : 'error',
            error_class : String(body.error_class ?? 'UnknownError'),
          },
          values: [[tsNano, JSON.stringify(body)]],
        }],
      }),
    });
  } catch (e) {
    console.error('[loki-push] failed:', (e as Error).message);
  }
}

// ── Structured error logger ───────────────────────────────────────────────────
export function logError(params: {
  error_class: string;
  file: string;
  line: number;
  message: string;
  error?: Error;
}) {
  const logger = logs.getLogger('buggy-shop');
  const span = trace.getActiveSpan();
  const traceId = span?.spanContext().traceId ?? 'none';

  const body = {
    level       : 'error',
    error_class : params.error_class,
    service_name: 'buggy-shop',
    file        : params.file,
    line        : params.line,
    message     : params.message,
    trace_id    : traceId,
  };

  // 1. Console (always — captured by Railway logs)
  console.error(JSON.stringify(body));

  // 2. OTLP pipeline → Grafana Cloud (traces + logs correlation)
  logger.emit({
    severityNumber: SeverityNumber.ERROR,
    severityText  : 'ERROR',
    body          : JSON.stringify(body),
    attributes    : body,
  });

  // 3. Direct Loki push → ensures SASHA can query logs immediately
  pushToLoki(body).catch(() => {/* already logged inside pushToLoki */});

  if (params.error && span) {
    span.recordException(params.error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: params.message });
  }
}

