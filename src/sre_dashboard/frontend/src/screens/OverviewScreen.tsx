import { useEffect, useState } from "react";
import { api } from "../api/client";
import { AuditPollingTable } from "../components/AuditPollingTable";
import { ServiceCard } from "../components/ServiceCard";
import type { OverviewResponse } from "../api/types";

interface OverviewScreenProps {
  tenantId: string;
  onTenantChange: (tenantId: string) => void;
  onOpenMetrics: (serviceName: string) => void;
}

export function OverviewScreen({ tenantId, onTenantChange, onOpenMetrics }: OverviewScreenProps) {
  const [tenants, setTenants] = useState<string[]>([]);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .tenants()
      .then((response) => {
        setTenants(response.tenants);
        if (!tenantId && response.tenants[0]) {
          onTenantChange(response.tenants[0]);
        }
        if (!response.tenants.length) {
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [tenantId, onTenantChange]);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    setError("");
    api
      .overview(tenantId)
      .then((res) => {
        setOverview(res);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

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
          <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Operational Control Room</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            Real-time CDO service overview and active policies.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.85rem", color: "#cbd5e1", fontWeight: "600" }}>SELECT TENANT:</span>
          <select
            value={tenantId}
            onChange={(event) => onTenantChange(event.target.value)}
            style={{ minWidth: "180px", fontWeight: "bold", border: "1px solid #38bdf8", color: "#38bdf8" }}
          >
            {tenants.map((tenant) => (
              <option key={tenant} value={tenant}>
                {tenant}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Global & Section Banners */}
      {error ? (
        <div className="banner error" style={{ fontSize: "0.9rem" }}>
          <strong>System Error:</strong> {error}
        </div>
      ) : null}

      {overview?.errors?.map((err, idx) => {
        const isAccessDenied = err.toLowerCase().includes("access denied") || err.toLowerCase().includes("denied");
        return (
          <div
            className="banner error"
            key={`err-${idx}`}
            style={{
              fontSize: "0.9rem",
              background: isAccessDenied ? "rgba(220, 38, 38, 0.15)" : undefined,
              borderColor: isAccessDenied ? "rgba(220, 38, 38, 0.4)" : undefined,
            }}
          >
            <strong>{isAccessDenied ? "Permission Error: " : "Probe Alert: "}</strong> {err}
          </div>
        );
      })}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="stack" style={{ gap: "1.5rem" }}>
          <div className="grid three">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="card shimmer"
                style={{
                  height: "160px",
                  background: "rgba(30, 41, 59, 0.2)",
                  border: "1px solid rgba(148, 163, 184, 0.1)",
                }}
              />
            ))}
          </div>
          <div className="card shimmer" style={{ height: "200px", background: "rgba(30, 41, 59, 0.2)" }} />
        </div>
      ) : (
        <>
          {/* Service Cards Grid */}
          <div>
            <h2 style={{ fontSize: "1.1rem", color: "#f8fafc", margin: "0 0 1rem" }}>Active CDO Services</h2>
            {overview && overview.services.length === 0 ? (
              <div className="panel muted" style={{ textAlign: "center", padding: "3rem 1rem" }}>
                No operational data found for this tenant.
              </div>
            ) : (
              <div className="grid three">
                {overview?.services.map((service) => (
                  <ServiceCard key={service.service_name} service={service} onOpen={onOpenMetrics} />
                ))}
              </div>
            )}
          </div>

          <AuditPollingTable tenantId={tenantId} />

          {/* Bottom Grid: Policy & Alarm Logs */}
          <div className="grid two" style={{ alignItems: "start" }}>
            {/* Policies Section */}
            <section className="panel" style={{ background: "rgba(15, 23, 42, 0.4)" }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1.1rem", color: "#f8fafc", margin: 0 }}>Active Thresholds</h2>
                <span className="muted" style={{ fontSize: "0.75rem" }}>Fallback Static Policies</span>
              </div>
              <div className="table-wrap">
                <table style={{ fontSize: "0.85rem" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "0.5rem" }}>Service</th>
                      <th style={{ padding: "0.5rem" }}>Threshold</th>
                      <th style={{ padding: "0.5rem" }}>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview?.policies && overview.policies.length > 0 ? (
                      overview.policies.map((policy) => (
                        <tr key={policy.service_name}>
                          <td style={{ padding: "0.5rem", fontWeight: "600" }}>{policy.service_name}</td>
                          <td style={{ padding: "0.5rem" }}>{policy.static_threshold}%</td>
                          <td style={{ padding: "0.5rem" }}>
                            <span className={`status ${policy.enabled ? "ok" : "skipped"}`} style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                              {policy.enabled ? "enabled" : "disabled"}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="muted" style={{ textAlign: "center", padding: "1.5rem" }}>
                          No policies configured.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* CloudWatch Alarms Section */}
            <section className="panel" style={{ background: "rgba(15, 23, 42, 0.4)" }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1.1rem", color: "#f8fafc", margin: 0 }}>Recent Active Alarms</h2>
                <span className="muted" style={{ fontSize: "0.75rem" }}>CloudWatch Status</span>
              </div>
              <div className="table-wrap">
                <table style={{ fontSize: "0.85rem" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "0.5rem" }}>Alarm Name</th>
                      <th style={{ padding: "0.5rem" }}>State</th>
                      <th style={{ padding: "0.5rem" }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview?.recent_alarms && overview.recent_alarms.length > 0 ? (
                      (overview.recent_alarms as any[]).map((alarm, idx) => (
                        <tr key={alarm.alarm_name || idx}>
                          <td style={{ padding: "0.5rem", fontWeight: "600", color: "#fca5a5" }}>{alarm.alarm_name}</td>
                          <td style={{ padding: "0.5rem" }}>
                            <span className={`status ${alarm.state_value?.toLowerCase() === "alarm" ? "error" : "ok"}`} style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                              {alarm.state_value}
                            </span>
                          </td>
                          <td style={{ padding: "0.5rem", fontSize: "0.75rem", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={alarm.state_reason}>
                            {alarm.state_reason}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="muted" style={{ textAlign: "center", padding: "1.5rem" }}>
                          No recent alarms triggered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
