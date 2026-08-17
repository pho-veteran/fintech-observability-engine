// Continuous low-rate synthetic telemetry for the isolated demo generator.
// One minute produces exactly 7 metrics x 3 canonical services = 21 requests.
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { AWSConfig, SignatureV4, Endpoint } from './signature.js';

const TENANT_ID = __ENV.TENANT_ID || 'demo-tenant-001';
const TENANT_INGEST_TOKEN = __ENV.TENANT_INGEST_TOKEN || '';
const AWS_REGION = __ENV.AWS_REGION || 'us-east-1';
const DURATION = __ENV.DURATION || '30m';
const ENDPOINT = (__ENV.TELEMETRY_API_HOST || '').replace(/\/$/, '');
const SERVICES = ['ledger', 'payment-gw', 'fraud-detector'];
const COMMON_LABELS = { region: AWS_REGION, env: 'continuous-demo', service_tier: 'demo' };
const METRICS = [
  ['cpu_usage_percent', 42, COMMON_LABELS],
  ['memory_usage_percent', 55, COMMON_LABELS],
  ['active_connections', 120, COMMON_LABELS],
  ['db_connection_pool_pct', 35, { ...COMMON_LABELS, db_type: 'postgres' }],
  ['queue_depth', 3, { ...COMMON_LABELS, queue_name: 'continuous-demo' }],
  ['cache_hit_rate_pct', 91, { ...COMMON_LABELS, cache_type: 'redis' }],
  ['api_latency_ms', 180, COMMON_LABELS],
];

if (!ENDPOINT.startsWith('https://')) {
  throw new Error('TELEMETRY_API_HOST must be an HTTPS API Gateway URL');
}
if (!TENANT_INGEST_TOKEN) {
  throw new Error('TENANT_INGEST_TOKEN is required');
}
if (!__ENV.AWS_ACCESS_KEY_ID || !__ENV.AWS_SECRET_ACCESS_KEY || !__ENV.AWS_SESSION_TOKEN) {
  throw new Error('Temporary instance-role AWS credentials are required');
}

const config = new AWSConfig({
  region: AWS_REGION,
  accessKeyId: __ENV.AWS_ACCESS_KEY_ID,
  secretAccessKey: __ENV.AWS_SECRET_ACCESS_KEY,
  sessionToken: __ENV.AWS_SESSION_TOKEN,
});
const signer = new SignatureV4({
  service: 'execute-api',
  region: config.region,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
  },
  uriEscapePath: false,
  applyChecksum: true,
});

export const options = {
  scenarios: {
    continuous_demo: {
      executor: 'constant-arrival-rate',
      rate: 21,
      timeUnit: '1m',
      duration: DURATION,
      preAllocatedVUs: 1,
      maxVUs: 3,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    dropped_iterations: ['count<1'],
  },
  discardResponseBodies: true,
};

function boundedVariation(sequence, metricIndex) {
  return ((sequence + metricIndex * 3) % 9) - 4;
}

export default function () {
  const sequence = exec.scenario.iterationInTest;
  const pairIndex = sequence % (SERVICES.length * METRICS.length);
  const serviceIndex = Math.floor(pairIndex / METRICS.length);
  const metricIndex = pairIndex % METRICS.length;
  const serviceId = SERVICES[serviceIndex];
  const metric = METRICS[metricIndex];
  const variation = boundedVariation(sequence, metricIndex);
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    tenant_id: TENANT_ID,
    service_id: serviceId,
    metric_type: metric[0],
    value: Math.max(0, metric[1] + variation),
    labels: metric[2],
  });
  const headers = {
    'Content-Type': 'application/json',
    'X-Tenant-Id': TENANT_ID,
    'X-Tenant-Ingest-Token': TENANT_INGEST_TOKEN,
  };
  const signed = signer.sign({
    method: 'POST',
    path: '/v1/ingest',
    headers,
    body: payload,
    endpoint: new Endpoint(ENDPOINT),
  });

  const response = http.post(signed.url, signed.body || payload, {
    headers: signed.headers,
    tags: {
      scenario: 'continuous-demo',
      service_id: serviceId,
      metric_type: metric[0],
    },
  });

  check(response, {
    'status is accepted': (res) => res.status === 201 || res.status === 202,
  });
}
