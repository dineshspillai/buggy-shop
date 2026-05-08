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
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const endpoint = process.env.GRAFANA_OTLP_ENDPOINT || '';
const instanceId = process.env.GRAFANA_INSTANCE_ID || '';
const apiToken = process.env.GRAFANA_API_TOKEN || '';
const authHeader = 'Basic ' + Buffer.from(`${instanceId}:${apiToken}`).toString('base64');

const headers = { Authorization: authHeader };

const resource = new Resource({
  [ATTR_SERVICE_NAME]: 'buggy-shop',
});

// Trace exporter
const traceExporter = new OTLPTraceExporter({
  url: `${endpoint}/v1/traces`,
  headers,
});

// Metric exporter
const metricExporter = new OTLPMetricExporter({
  url: `${endpoint}/v1/metrics`,
  headers,
});

// Log exporter
const logExporter = new OTLPLogExporter({
  url: `${endpoint}/v1/logs`,
  headers,
});

// Logger provider
const loggerProvider = new LoggerProvider({ resource });
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));
logs.setGlobalLoggerProvider(loggerProvider);

// SDK
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

// Structured error logger
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
    level: 'error',
    error_class: params.error_class,
    service_name: 'buggy-shop',
    file: params.file,
    line: params.line,
    message: params.message,
    trace_id: traceId,
  };

  console.error(JSON.stringify(body));

  logger.emit({
    severityNumber: SeverityNumber.ERROR,
    severityText: 'ERROR',
    body: JSON.stringify(body),
    attributes: body,
  });

  if (params.error && span) {
    span.recordException(params.error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: params.message });
  }
}

export { sdk };
