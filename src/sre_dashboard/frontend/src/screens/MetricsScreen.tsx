import { useEffect, useState } from "react";
import { api } from "../api/client";
import { MetricChart } from "../components/MetricChart";
import type { AllMetricsResponse, AuditRecord, MetricType, Policy } from "../api/types";

const metricSpecs: Record<MetricType, string> = {
  cpu_usage_percent: "CPU %",
  memory_usage_percent: "Memory %",
  active_connections: "Connections",
  db_connection_pool_pct: "Connection Pool %",
  queue_depth: "Queue Depth",
  cache_hit_rate_pct: "Cache Hit Rate %",
  api_latency_ms: "Latency (ms)",
};

const metricTypes = Object.keys(metricSpecs) as MetricType[];

// Fill policies from handoff
const fillPolicies: Record<MetricType, "forward_fill" | "zero_fill"> = {
  cpu_usage_percent: "forward_fill",
  memory_usage_percent: "forward_fill",
  active_connections: "forward_fill",
  db_connection_pool_pct: "forward_fill",
  queue_depth: "zero_fill",
  cache_hit_rate_pct: "forward_fill",
  api_latency_ms: "forward_fill",
};

interface MetricsScreenProps {
  tenantId: string;
  serviceId: string;
  onServiceChange: (serviceId: string) => void;
}

export function MetricsScreen({ tenantId, serviceId, onServiceChange }: MetricsScreenProps) {
  const [services, setServices] = useState<string[]>([]);
  const [rangeMinutes, setRangeMinutes] = useState(120);
  const [metrics, setMetrics] = useState<AllMetricsResponse | null>(null);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    api
      .overview(tenantId)
      .then((response) => {
        const names = response.services.map((service) => service.service_name);
        setServices(names);
        if (!serviceId && names[0]) {
          onServiceChange(names[0]);
        }
      })
      .catch((err: Error) => setError(err.message));
    
    api
      .policies(tenantId)
      .then((response) => setPolicies(response.policies))
      .catch(() => undefined);
  }, [tenantId, serviceId, onServiceChange]);

  useEffect(() => {
    if (!tenantId || !serviceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");

    Promise.all([
      api.metrics(tenantId, serviceId, rangeMinutes).then(setMetrics),
      api.audits(tenantId, serviceId).then((response) => setAudits(response.records))
    ])
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [tenantId, serviceId, rangeMinutes]);

  const threshold = policies.find((policy) => policy.service_name === serviceId)?.static_threshold;

  // Detect and format AMP query errors or permission issues
  const isAmpError = metrics?.status === "error";
  const ampErrorMessage = metrics?.detail || "";
  const isAmpDenied = isAmpError && (ampErrorMessage.toLowerCase().includes("access denied") || ampErrorMessage.toLowerCase().includes("permission"));

  return (
    <section className="stack" style={{ gap: "1.5rem" }}>
      {/* Header Panel */}
      <div
        className="panel"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          background: "rgba(30, 41, 59, 0.4)",
          borderColor: "rgba(148, 163, 184, 0.15)",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Service Time-Series Metrics</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            Viewing 7 core performance metrics constructed server-side.
          </p>
        </div>
        <div className="row" style={{ gap: "0.75rem" }}>
          <select
            value={serviceId}
            onChange={(event) => onServiceChange(event.target.value)}
            style={{ fontWeight: "600", borderColor: "rgba(148, 163, 184, 0.3)" }}
          >
            {services.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={rangeMinutes}
            onChange={(event) => setRangeMinutes(Number(event.target.value))}
            style={{ fontWeight: "600", borderColor: "rgba(148, 163, 184, 0.3)" }}
          >
            <option value={30}>30 Minutes</option>
            <option value={60}>1 Hour</option>
            <option value={120}>2 Hours</option>
            <option value={360}>6 Hours</option>
          </select>
        </div>
      </div>

      {/* Error Banners */}
      {error ? (
        <div className="banner error" style={{ fontSize: "0.9rem" }}>
          <strong>Error loading metrics:</strong> {error}
        </div>
      ) : null}

      {isAmpDenied ? (
        <div
          className="banner error"
          style={{
            fontSize: "0.9rem",
            background: "rgba(251, 146, 60, 0.15)",
            borderColor: "rgba(251, 146, 60, 0.4)",
          }}
        >
          <strong>Access Denied:</strong> Cannot query AMP workspace. Verify your AWS SSO credentials.
        </div>
      ) : isAmpError ? (
        <div className="banner error" style={{ fontSize: "0.9rem" }}>
          <strong>AMP Query Error:</strong> {ampErrorMessage}
        </div>
      ) : null}

      {/* 7 Chart Cards Grid */}
      {loading ? (
        <div className="grid two">
          {metricTypes.map((t) => (
            <div
              key={t}
              className="card shimmer"
              style={{
                height: "280px",
                background: "rgba(30, 41, 59, 0.2)",
                border: "1px solid rgba(148, 163, 184, 0.1)",
              }}
            />
          ))}
        </div>
      ) : (
        <div className="grid two">
          {metricTypes.map((metricType) => (
            <MetricChart
              key={metricType}
              title={metricType}
              label={metricSpecs[metricType]}
              result={metrics?.metrics?.[metricType]}
              threshold={threshold}
              fillPolicy={fillPolicies[metricType]}
            />
          ))}
        </div>
      )}

      {/* Audit Log Table Section */}
      <section className="panel" style={{ background: "rgba(15, 23, 42, 0.4)" }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.15rem", color: "#f8fafc", margin: 0 }}>Audit History Log</h2>
          <span className="muted" style={{ fontSize: "0.75rem" }}>Last 50 Scaling Decisions</span>
        </div>
        <div className="table-wrap">
          <table style={{ fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Service</th>
                <th>Scaling Decision</th>
                <th>Score</th>
                <th>Anomaly</th>
                <th>Reasoning Explanation</th>
              </tr>
            </thead>
            <tbody>
              {audits.length > 0 ? (
                audits.map((record) => {
                  const isRecordAnomaly = record.anomaly;
                  const decision = record.decision || "UNKNOWN";
                  let decClass = "status skipped";
                  if (decision.includes("UP")) decClass = "status ok";
                  else if (decision.includes("DOWN")) decClass = "status denied";

                  return (
                    <tr
                      key={record.prediction_id || `${record.service_name}-${record.timestamp}`}
                      style={{
                        background: isRecordAnomaly ? "rgba(239, 68, 68, 0.05)" : undefined,
                      }}
                    >
                      <td style={{ whiteSpace: "nowrap", color: "#cbd5e1" }}>
                        {record.service_time || new Date(record.timestamp * 1000).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: "600", color: "#f8fafc" }}>{record.service_name}</td>
                      <td>
                        <span className={decClass} style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}>
                          {decision}
                        </span>
                      </td>
                      <td style={{ fontWeight: "600" }}>{record.score}</td>
                      <td>
                        {isRecordAnomaly ? (
                          <span className="status error" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                            anomaly
                          </span>
                        ) : (
                          <span className="status ok" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                            normal
                          </span>
                        )}
                      </td>
                      <td style={{ color: "#94a3b8", fontSize: "0.8rem", maxWidth: "400px", lineHeight: "1.4" }}>
                        {record.reasoning}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                    No audit records available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
