import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { ProbeResult, ProbesResponse } from "../api/types";

const probeKeys: { key: keyof ProbesResponse; label: string }[] = [
  { key: "sts", label: "STS Credential Identity" },
  { key: "amp", label: "Amazon Managed Prometheus" },
  { key: "dynamodb_audit", label: "DynamoDB Audit Log Table" },
  { key: "dynamodb_policies", label: "DynamoDB Policies Table" },
  { key: "sqs", label: "SQS Metrics Queue" },
  { key: "cloudwatch", label: "CloudWatch Alarms API" },
  { key: "ecs", label: "ECS Service Control" },
];

function ProbeCard({ label, result, loading }: { label: string; result?: ProbeResult; loading: boolean }) {
  if (loading) {
    return (
      <article
        className="card shimmer"
        style={{
          height: "170px",
          background: "rgba(30, 41, 59, 0.2)",
          border: "1px solid rgba(148, 163, 184, 0.1)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "1rem", color: "#cbd5e1" }}>{label}</h3>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>Probing AWS resource...</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div className="spinner" style={{ width: "14px", height: "14px", border: "2px solid rgba(56, 189, 248, 0.2)", borderTopColor: "#38bdf8", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
          <span className="muted" style={{ fontSize: "0.75rem" }}>Checking permission...</span>
        </div>
      </article>
    );
  }

  const status = result?.status ?? "skipped";

  // Visual config based on status
  let statusText = "SKIPPED";
  let statusColorClass = "status skipped";
  let statusIcon = "⚪";
  let borderStyle = "1px solid rgba(148, 163, 184, 0.2)";
  let bgStyle = "rgba(15, 23, 42, 0.6)";

  if (status === "ok") {
    statusText = "OK";
    statusColorClass = "status ok";
    statusIcon = "✓";
    borderStyle = "1px solid rgba(34, 197, 94, 0.3)";
    bgStyle = "rgba(34, 197, 94, 0.04)";
  } else if (status === "error") {
    statusText = "ERROR";
    statusColorClass = "status error";
    statusIcon = "✗";
    borderStyle = "1px solid rgba(239, 68, 68, 0.4)";
    bgStyle = "rgba(239, 68, 68, 0.05)";
  } else if (status === "denied") {
    statusText = "DENIED";
    statusColorClass = "status denied";
    statusIcon = "⚠️";
    borderStyle = "1px solid rgba(251, 146, 60, 0.4)";
    bgStyle = "rgba(251, 146, 60, 0.05)";
  }

  // Format the details based on target resource types
  const renderDetails = () => {
    if (!result) return <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>No probe executed.</p>;

    if (status === "skipped") {
      return (
        <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
          {result.detail || "Skipped: Not configured in settings."}
        </p>
      );
    }

    if (status === "denied") {
      return (
        <div style={{ fontSize: "0.8rem", color: "#fbd5a9" }}>
          <strong>Access Denied:</strong> {result.detail || "Insufficient IAM permissions."}
        </div>
      );
    }

    if (status === "error") {
      return (
        <div style={{ fontSize: "0.8rem", color: "#fecaca" }}>
          <strong>Error detail:</strong> {result.detail || "Connection timed out."}
        </div>
      );
    }

    // OK State rendering custom metadata
    return (
      <div style={{ fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "0.25rem", color: "#cbd5e1" }}>
        {result.arn && (
          <div>
            <span className="muted">ARN:</span> <code style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{result.arn}</code>
          </div>
        )}
        {result.account_id && (
          <div>
            <span className="muted">Account ID:</span> <code>{result.account_id}</code>
          </div>
        )}
        {result.table && (
          <div>
            <span className="muted">Table:</span> <code>{result.table}</code>
          </div>
        )}
        {result.queue_url && (
          <div>
            <span className="muted">Queue URL:</span> <code style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{result.queue_url}</code>
          </div>
        )}
        {result.approximate_number_of_messages !== undefined && (
          <div>
            <span className="muted">Queue Depth:</span> <strong>{result.approximate_number_of_messages} messages</strong>
          </div>
        )}
        {result.alarm_count !== undefined && (
          <div>
            <span className="muted">Monitored Alarms:</span> <strong>{result.alarm_count} alarms</strong>
          </div>
        )}
        {result.workspace_count !== undefined && (
          <div>
            <span className="muted">AMP Workspaces:</span> <strong>{result.workspace_count} workspaces</strong>
          </div>
        )}
        {result.service_arns && result.service_arns.length > 0 && (
          <div>
            <span className="muted">ECS Services:</span> <strong>{result.service_arns.length} services</strong>
          </div>
        )}
      </div>
    );
  };

  return (
    <article
      className="card"
      style={{
        border: borderStyle,
        background: bgStyle,
        minHeight: "170px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "1rem",
        transition: "all 0.2s ease",
      }}
    >
      <div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0, fontSize: "0.95rem", color: "#f8fafc" }}>{label}</h3>
          <span className={statusColorClass} style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}>
            <span style={{ marginRight: "0.25rem" }}>{statusIcon}</span> {statusText}
          </span>
        </div>
        <div style={{ overflow: "hidden" }}>{renderDetails()}</div>
      </div>
    </article>
  );
}

export function ProbesScreen() {
  const [probes, setProbes] = useState<ProbesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = () => {
    setLoading(true);
    setError("");
    api
      .probes()
      .then(setProbes)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  // Run probes on mount
  useEffect(() => {
    run();
  }, []);

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
          <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Permission Probes Health</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            AWS IAM policy verification checks run safely from the backend.
          </p>
        </div>
        <button className="primary" type="button" onClick={run} disabled={loading} style={{ minWidth: "140px" }}>
          {loading ? "Probing..." : "Run Probes Scan"}
        </button>
      </div>

      {error ? (
        <div className="banner error" style={{ fontSize: "0.9rem" }}>
          <strong>Scan Failure:</strong> {error}
        </div>
      ) : null}

      <div className="grid three">
        {probeKeys.map(({ key, label }) => (
          <ProbeCard
            key={key}
            label={label}
            result={probes?.[key]}
            loading={loading}
          />
        ))}
      </div>
    </section>
  );
}
