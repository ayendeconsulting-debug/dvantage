/**
 * OpenTelemetry instrumentation bootstrap.
 *
 * CRITICAL: This file must be imported at the very top of main.ts,
 * before any other import. OTEL patches Node.js core modules at load
 * time — if anything loads first, those modules will not be instrumented.
 *
 * The SDK is only initialised when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * In local dev without a Grafana Cloud endpoint, this is a no-op.
 *
 * The NodeSDK reads OTEL_EXPORTER_OTLP_ENDPOINT from the environment
 * automatically — no need to instantiate an exporter explicitly.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

if (endpoint) {
  const sdk = new NodeSDK({
    serviceName: 'vantage-api',
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy instrumentations that add little signal in dev
        '@opentelemetry/instrumentation-fs':  { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    void sdk.shutdown().finally(() => process.exit(0));
  });

  console.log(`[otel] Tracing enabled → ${endpoint}`);
} else {
  console.log('[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled');
}
