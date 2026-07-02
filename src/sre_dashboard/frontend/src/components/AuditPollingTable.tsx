import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { AuditRecord, AuditRawItem } from "../api/types";

interface AuditPollingTableProps {
  tenantId: string;
  maxRecords?: number;
  pollIntervalMs?: number;
}

const rowId = (record: AuditRecord) => record.prediction_id || `${record.service_name}-${record.service_time}`;

function sourceBadge(record: AuditRecord) {
  if (record.prediction_source === "AI_ENGINE") {
    return { label: "AI Engine", className: "status ok" };
  }
  if (record.prediction_source === "STATIC_THRESHOLD_FALLBACK") {
    return { label: "Fallback", className: "status denied" };
  }
  return { label: record.prediction_source || "Unknown", className: "status skipped" };
}

function decisionClass(decision: string) {
  if (decision.includes("UP")) return "status ok";
  if (decision.includes("DOWN") || decision.includes("RETIRE") || decision.includes("ROLLBACK")) return "status denied";
  if (decision.includes("INVESTIGATE")) return "status error";
  return "status skipped";
}

function sourceDetail(record: AuditRecord) {
  if (record.prediction_source === "AI_ENGINE") {
    const status = record.ai_status_code ? `HTTP ${record.ai_status_code}` : "AI response";
    return record.ai_latency_ms ? `${status} · ${record.ai_latency_ms}ms` : status;
  }
  if (record.prediction_source === "STATIC_THRESHOLD_FALLBACK") {
    return record.prediction_status === "fallback" ? "AI/no-data fallback" : "data-gap fallback";
  }
  return record.prediction_status || "unknown";
}

function formatTime(record: AuditRecord) {
  if (record.service_time) return new Date(record.service_time).toLocaleString();
  if (record.timestamp) return new Date(record.timestamp * 1000).toLocaleString();
  return "unknown";
}

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "n/a";
  if (typeof value === "object") {
    return <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(value, null, 2)}</pre>;
  }
  return String(value);
}

function rawFields(record: AuditRecord): AuditRawItem {
  return record.raw_item ?? { ...record };
}

export function AuditPollingTable({ tenantId, maxRecords = 50, pollIntervalMs = 15_000 }: AuditPollingTableProps) {
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [limit, setLimit] = useState(maxRecords);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageInput, setPageInput] = useState("1");
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = useCallback(async (initial = false, page = pageIndex) => {
    if (!tenantId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await api.audits(tenantId, undefined, limit, undefined, page);
      setRecords(response.records);
      setNextCursor(response.next_cursor ?? null);
      setLastUpdated(new Date());
      setExpandedId(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit records");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, limit, pageIndex]);

  useEffect(() => {
    setPageIndex(0);
    setPageInput("1");
    setNextCursor(null);
    setExpandedId(null);
  }, [tenantId, limit]);

  useEffect(() => {
    void load(true, pageIndex);
  }, [load, pageIndex]);

  useEffect(() => {
    if (pageIndex !== 0) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (!cancelled) void load(false, 0);
    }, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load, pageIndex, pollIntervalMs]);

  const counts = useMemo(() => {
    const ai = records.filter((record) => record.prediction_source === "AI_ENGINE").length;
    const fallback = records.filter((record) => record.prediction_source === "STATIC_THRESHOLD_FALLBACK").length;
    const anomaly = records.filter((record) => record.anomaly).length;
    return { ai, fallback, anomaly, total: records.length };
  }, [records]);

  const goToPage = (page: number) => {
    const nextPage = Math.max(0, page);
    setPageIndex(nextPage);
    setPageInput(String(nextPage + 1));
  };

  const submitPage = () => {
    const nextPage = Number.parseInt(pageInput, 10);
    if (Number.isNaN(nextPage)) {
      setPageInput(String(pageIndex + 1));
      return;
    }
    goToPage(nextPage - 1);
  };

  const goNext = () => {
    if (!nextCursor) return;
    goToPage(pageIndex + 1);
  };

  const goPrev = () => {
    goToPage(pageIndex - 1);
  };

  if (!tenantId) {
    return (
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Recent Audit Decisions</h2>
        <p className="muted">Select a tenant to view audit decisions.</p>
      </section>
    );
  }

  return (
    <section className="panel stack" style={{ background: "rgba(15, 23, 42, 0.48)", gap: "1rem" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, color: "#f8fafc" }}>Recent Audit Decisions</h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Live DynamoDB audit history{pageIndex === 0 ? `, polling every ${Math.round(pollIntervalMs / 1000)}s.` : " paused on older page."}
          </p>
        </div>
        <div className="row">
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} aria-label="Audit record count">
            <option value={25}>Latest 25</option>
            <option value={50}>Latest 50</option>
            <option value={100}>Latest 100</option>
          </select>
          <button className="secondary" type="button" onClick={() => void load(false, pageIndex)} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="row">
        <span className="status skipped">{counts.total} records</span>
        <span className="status ok">{counts.ai} AI Engine</span>
        <span className="status denied">{counts.fallback} Fallback</span>
        <span className="status error">{counts.anomaly} Anomaly</span>
        <span className="muted">Page {pageIndex + 1}</span>
        <span className="muted">Updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "never"}</span>
      </div>

      {error ? (
        <div className="banner error" style={{ fontSize: "0.9rem" }}>
          Failed to refresh audit records: {error}. Showing last known data.
        </div>
      ) : null}

      <div className="table-wrap">
        <table style={{ fontSize: "0.84rem" }}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Service</th>
              <th>Decision</th>
              <th>Source</th>
              <th>Score</th>
              <th>Anomaly</th>
              <th>Evidence</th>
              <th>Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1, 2, 3, 4, 5].map((item) => (
                <tr key={item}>
                  <td colSpan={8}><div className="shimmer" style={{ height: "18px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                </tr>
              ))
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                  No audit records found.
                </td>
              </tr>
            ) : (
              records.flatMap((record) => {
                const source = sourceBadge(record);
                const id = rowId(record);
                const isFallback = record.prediction_source === "STATIC_THRESHOLD_FALLBACK";
                const isAiEngine = record.prediction_source === "AI_ENGINE";
                const isAnomaly = Boolean(record.anomaly);
                const decision = record.decision || "UNKNOWN";
                const expanded = expandedId === id;
                return [
                  <tr
                    key={id}
                    onClick={() => isAiEngine && setExpandedId(expanded ? null : id)}
                    style={{
                      background: isFallback
                        ? "rgba(251, 146, 60, 0.04)"
                        : isAnomaly
                          ? "rgba(239, 68, 68, 0.035)"
                          : undefined,
                      cursor: isAiEngine ? "pointer" : "default",
                    }}
                  >
                    <td style={{ whiteSpace: "nowrap", color: "#cbd5e1" }}>{formatTime(record)}</td>
                    <td style={{ fontWeight: 700, color: "#f8fafc" }}>{record.service_name || "unknown"}</td>
                    <td><span className={decisionClass(decision)}>{decision}</span></td>
                    <td>
                      <span className={source.className}>{source.label}</span>
                      <div className="muted" style={{ fontSize: "0.72rem", marginTop: "0.2rem" }}>
                        {sourceDetail(record)}{isAiEngine ? " · click for details" : ""}
                      </div>
                    </td>
                    <td style={{ fontWeight: 700 }}>{Number(record.score ?? 0).toFixed(1)}</td>
                    <td>
                      <span className={`status ${isAnomaly ? "error" : "ok"}`}>{isAnomaly ? "anomaly" : "normal"}</span>
                    </td>
                    <td>{record.evidence_status || "n/a"}</td>
                    <td
                      title={record.reasoning || ""}
                      style={{ maxWidth: "420px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#94a3b8" }}
                    >
                      {record.reasoning || "—"}
                    </td>
                  </tr>,
                  expanded ? (
                    <tr key={`${id}-details`}>
                      <td colSpan={8} style={{ background: "rgba(2, 6, 23, 0.45)", padding: "1rem" }}>
                        <div className="grid two" style={{ gap: "0.75rem" }}>
                          {Object.entries(rawFields(record)).map(([key, value]) => (
                            <div key={key} className="card" style={{ padding: "0.65rem", background: "rgba(15, 23, 42, 0.7)" }}>
                              <div className="muted" style={{ fontSize: "0.72rem", marginBottom: "0.25rem" }}>{key}</div>
                              <div style={{ color: "#e5e7eb", wordBreak: "break-word" }}>{renderValue(value)}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ].filter(Boolean);
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted">{pageIndex === 0 ? "Live polling active" : "Live polling paused on older page"}</span>
        <div className="row">
          <button className="secondary" type="button" onClick={goPrev} disabled={pageIndex === 0 || refreshing || loading}>Prev</button>
          <label className="muted" htmlFor="audit-page-input">Page</label>
          <input
            id="audit-page-input"
            min={1}
            type="number"
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            onBlur={submitPage}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitPage();
            }}
            style={{ width: "5rem" }}
            aria-label="Audit page number"
            disabled={refreshing || loading}
          />
          <button className="secondary" type="button" onClick={submitPage} disabled={refreshing || loading}>Go</button>
          <button className="secondary" type="button" onClick={goNext} disabled={!nextCursor || refreshing || loading}>Next</button>
        </div>
      </div>
    </section>
  );
}
