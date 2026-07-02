import type { ServiceOverview } from "../api/types";

interface ServiceCardProps {
  service: ServiceOverview;
  onOpen?: (serviceName: string) => void;
}

export function ServiceCard({ service, onOpen }: ServiceCardProps) {
  const isAnomaly = service.anomaly;
  const decision = service.latest_decision || "UNKNOWN";
  
  // Style for decisions
  let decisionClass = "status skipped";
  if (decision.includes("UP")) {
    decisionClass = "status ok"; // Green/Cyan
  } else if (decision.includes("DOWN")) {
    decisionClass = "status denied"; // Orange
  } else if (decision.includes("KEEP")) {
    decisionClass = "status skipped"; // Muted
  }

  return (
    <article
      className="card"
      style={{
        border: isAnomaly
          ? "1px solid rgba(239, 68, 68, 0.5)"
          : "1px solid rgba(148, 163, 184, 0.2)",
        boxShadow: isAnomaly
          ? "0 0 12px rgba(239, 68, 68, 0.15)"
          : "none",
        transition: "all 0.2s ease-in-out",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "1rem",
        background: isAnomaly
          ? "rgba(127, 29, 29, 0.15)"
          : "rgba(15, 23, 42, 0.6)",
      }}
    >
      <div className="stack" style={{ gap: "0.5rem" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#f8fafc" }}>{service.service_name}</h3>
          {isAnomaly ? (
            <span
              className="status error"
              style={{
                fontSize: "0.75rem",
                animation: "pulse 2s infinite",
              }}
            >
              ⚠️ ANOMALY
            </span>
          ) : (
            <span className="status ok" style={{ fontSize: "0.75rem" }}>
              ✓ NORMAL
            </span>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.5rem 1rem",
            fontSize: "0.85rem",
            marginTop: "0.5rem",
          }}
        >
          <div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>LATEST DECISION</div>
            <span className={decisionClass} style={{ fontSize: "0.8rem", padding: "0.15rem 0.5rem", marginTop: "0.15rem" }}>
              {decision}
            </span>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>SCORE</div>
            <strong style={{ fontSize: "1rem", color: isAnomaly ? "#f87171" : "#f8fafc" }}>
              {Number.isFinite(service.latest_score) ? service.latest_score : "N/A"}
            </strong>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>SEVERITY</div>
            <strong style={{ fontSize: "0.9rem", color: isAnomaly ? "#fca5a5" : "#94a3b8" }}>
              {Number.isFinite(service.severity) ? service.severity.toFixed(2) : "N/A"}
            </strong>
          </div>
        </div>
      </div>

      {onOpen ? (
        <button
          className="primary"
          type="button"
          onClick={() => onOpen(service.service_name)}
          style={{
            width: "100%",
            fontSize: "0.85rem",
            padding: "0.45rem",
            background: "rgba(56, 189, 248, 0.15)",
            border: "1px solid rgba(56, 189, 248, 0.3)",
            color: "#38bdf8",
            fontWeight: "normal",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(56, 189, 248, 0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(56, 189, 248, 0.15)";
          }}
        >
          View Service Metrics →
        </button>
      ) : null}
    </article>
  );
}
