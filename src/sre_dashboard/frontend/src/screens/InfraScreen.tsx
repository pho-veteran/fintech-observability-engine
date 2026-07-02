import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { CloudWatchAlarm, EcsService, QueueInfo } from "../api/types";

type Tab = "alarms" | "queue" | "ecs";
type SortOrder = "asc" | "desc";

export function InfraScreen() {
  const [tab, setTab] = useState<Tab>("alarms");
  const [alarms, setAlarms] = useState<CloudWatchAlarm[]>([]);
  const [queues, setQueues] = useState<QueueInfo[]>([]);
  const [ecsServices, setEcsServices] = useState<EcsService[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters & Sorting state
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const loadData = () => {
    setLoading(true);
    setError("");
    setSearch("");
    setSortBy("");

    if (tab === "alarms") {
      api
        .alarms()
        .then((response) => {
          setAlarms(response.alarms || []);
        })
        .catch((err: Error) => {
          const isAccessDenied = err.message.toLowerCase().includes("access denied") || err.message.toLowerCase().includes("denied");
          setError(isAccessDenied ? "Access denied to CloudWatch alarms API." : err.message);
        })
        .finally(() => setLoading(false));
    } else if (tab === "queue") {
      api
        .queue()
        .then((response) => {
          setQueues(response.queues || []);
        })
        .catch((err: Error) => {
          const isAccessDenied = err.message.toLowerCase().includes("access denied") || err.message.toLowerCase().includes("denied");
          setError(isAccessDenied ? "Access denied to SQS Queue Attributes API." : err.message);
        })
        .finally(() => setLoading(false));
    } else if (tab === "ecs") {
      api
        .ecs()
        .then((response) => {
          setEcsServices(response.ecs_services || []);
        })
        .catch((err: Error) => {
          const isAccessDenied = err.message.toLowerCase().includes("access denied") || err.message.toLowerCase().includes("denied");
          setError(isAccessDenied ? "Access denied to ECS Cluster Services API." : err.message);
        })
        .finally(() => setLoading(false));
    }
  };

  useEffect(() => {
    loadData();
  }, [tab]);

  // Handle table column header sorting
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return "↕";
    return sortOrder === "asc" ? "▲" : "▼";
  };

  // Filter & Sort Logic
  const getFilteredAndSortedData = () => {
    if (tab === "alarms") {
      let filtered = alarms.filter((item) =>
        (item.alarm_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (item.metric_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (item.state_value ?? "").toLowerCase().includes(search.toLowerCase())
      );
      if (sortBy) {
        filtered.sort((a: any, b: any) => {
          const valA = a[sortBy] ?? "";
          const valB = b[sortBy] ?? "";
          return typeof valA === "number"
            ? (valA - valB) * (sortOrder === "asc" ? 1 : -1)
            : String(valA).localeCompare(String(valB)) * (sortOrder === "asc" ? 1 : -1);
        });
      }
      return filtered;
    } else if (tab === "queue") {
      let filtered = queues.filter((item) =>
        (item.queue_name ?? item.queue_url ?? item.detail ?? "").toLowerCase().includes(search.toLowerCase())
      );
      if (sortBy) {
        filtered.sort((a: any, b: any) => {
          const valA = a[sortBy] ?? "";
          const valB = b[sortBy] ?? "";
          return typeof valA === "number"
            ? (valA - valB) * (sortOrder === "asc" ? 1 : -1)
            : String(valA).localeCompare(String(valB)) * (sortOrder === "asc" ? 1 : -1);
        });
      }
      return filtered;
    } else {
      let filtered = ecsServices.filter((item) =>
        (item.service_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (item.status ?? "").toLowerCase().includes(search.toLowerCase())
      );
      if (sortBy) {
        filtered.sort((a: any, b: any) => {
          const valA = a[sortBy] ?? "";
          const valB = b[sortBy] ?? "";
          return typeof valA === "number"
            ? (valA - valB) * (sortOrder === "asc" ? 1 : -1)
            : String(valA).localeCompare(String(valB)) * (sortOrder === "asc" ? 1 : -1);
        });
      }
      return filtered;
    }
  };

  const currentData = getFilteredAndSortedData();

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
          <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Infrastructure State Browser</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            Inspect active AWS CloudWatch alarms, SQS queues, and running ECS cluster containers.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {(["alarms", "queue", "ecs"] as Tab[]).map((item) => (
            <button
              className={tab === item ? "primary" : "secondary"}
              key={item}
              type="button"
              onClick={() => setTab(item)}
              style={{
                fontSize: "0.8rem",
                padding: "0.45rem 1rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontWeight: tab === item ? "bold" : "normal",
              }}
            >
              {item === "ecs" ? "ECS Services" : item === "queue" ? "SQS Queues" : "CW Alarms"}
            </button>
          ))}
        </div>
      </div>

      {/* Search Filter and Refresh Bar */}
      <div className="row" style={{ justifyContent: "space-between", gap: "1rem" }}>
        <input
          type="text"
          placeholder={`Filter ${tab === "ecs" ? "ECS services" : tab === "queue" ? "queues" : "alarms"} by keyword...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: "400px", fontSize: "0.85rem", padding: "0.5rem 0.75rem" }}
        />
        <button
          className="secondary"
          type="button"
          onClick={loadData}
          disabled={loading}
          style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}
        >
          🔄 Refresh
        </button>
      </div>

      {error ? (
        <div className="banner error" style={{ fontSize: "0.9rem" }}>
          <strong>State Error:</strong> {error}
        </div>
      ) : null}

      {/* Main Table Content */}
      <section className="panel table-wrap" style={{ background: "rgba(15, 23, 42, 0.4)", padding: "1rem" }}>
        {loading ? (
          // Skeleton Table rows
          <table style={{ fontSize: "0.85rem" }}>
            <thead>
              <tr>
                {tab === "alarms" && (
                  <>
                    <th>Alarm Name</th>
                    <th>State</th>
                    <th>Metric</th>
                    <th>Threshold</th>
                    <th>Reason</th>
                  </>
                )}
                {tab === "queue" && (
                  <>
                    <th>Queue Name</th>
                    <th>Visible Messages</th>
                    <th>In-Flight Messages</th>
                    <th>Status</th>
                  </>
                )}
                {tab === "ecs" && (
                  <>
                    <th>Service Name</th>
                    <th>Status</th>
                    <th>Running Replicas</th>
                    <th>Pending</th>
                    <th>Launch Type</th>
                    <th>Task Definition</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4].map((i) => (
                <tr key={`skel-row-${i}`}>
                  {tab === "alarms" && (
                    <>
                      <td><div className="shimmer" style={{ height: "16px", width: "160px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "70px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "110px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "50px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "250px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                    </>
                  )}
                  {tab === "queue" && (
                    <>
                      <td><div className="shimmer" style={{ height: "16px", width: "200px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "80px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "80px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "60px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                    </>
                  )}
                  {tab === "ecs" && (
                    <>
                      <td><div className="shimmer" style={{ height: "16px", width: "140px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "60px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "80px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "50px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "70px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                      <td><div className="shimmer" style={{ height: "16px", width: "180px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : currentData.length === 0 ? (
          <div className="muted" style={{ textAlign: "center", padding: "4rem 1rem" }}>
            {tab === "alarms" && "No alarms configured."}
            {tab === "queue" && "No queues found."}
            {tab === "ecs" && "No ECS services."}
          </div>
        ) : (
          <table style={{ fontSize: "0.85rem" }}>
            <thead>
              {tab === "alarms" && (
                <tr>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("alarm_name")}>Alarm Name {getSortIcon("alarm_name")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("state_value")}>State {getSortIcon("state_value")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("metric_name")}>Metric Name {getSortIcon("metric_name")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("threshold")}>Threshold {getSortIcon("threshold")}</th>
                  <th>State Reason</th>
                </tr>
              )}
              {tab === "queue" && (
                <tr>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("queue_name")}>Queue Name {getSortIcon("queue_name")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("approximate_number_of_messages")}>Visible Msg {getSortIcon("approximate_number_of_messages")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("approximate_number_of_messages_not_visible")}>In-Flight Msg {getSortIcon("approximate_number_of_messages_not_visible")}</th>
                  <th>Status</th>
                </tr>
              )}
              {tab === "ecs" && (
                <tr>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("service_name")}>Service Name {getSortIcon("service_name")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("status")}>Status {getSortIcon("status")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("running_count")}>Replicas (Run/Des) {getSortIcon("running_count")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("pending_count")}>Pending {getSortIcon("pending_count")}</th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("launch_type")}>Launch Type {getSortIcon("launch_type")}</th>
                  <th>Task Definition</th>
                </tr>
              )}
            </thead>
            <tbody>
              {tab === "alarms" &&
                (currentData as CloudWatchAlarm[]).map((alarm) => {
                  const isCwAlarm = (alarm.state_value ?? "").toLowerCase() === "alarm";
                  return (
                    <tr key={alarm.alarm_name} style={{ background: isCwAlarm ? "rgba(239, 68, 68, 0.03)" : undefined }}>
                      <td style={{ fontWeight: "600", color: isCwAlarm ? "#f87171" : "#f8fafc" }}>{alarm.alarm_name}</td>
                      <td>
                        <span className={`status ${isCwAlarm ? "error" : "ok"}`} style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}>
                          {alarm.state_value}
                        </span>
                      </td>
                      <td>{alarm.metric_name}</td>
                      <td style={{ fontWeight: "600" }}>{alarm.threshold}</td>
                      <td style={{ color: "#94a3b8", fontSize: "0.8rem", maxWidth: "350px", lineHeight: "1.4" }}>{alarm.state_reason}</td>
                    </tr>
                  );
                })}
              {tab === "queue" &&
                (currentData as QueueInfo[]).map((item) => {
                  const qName = item.queue_name ?? item.queue_url?.split("/").pop() ?? item.detail ?? "unknown queue";
                  const visibleMessages = item.approximate_number_of_messages ?? 0;
                  const inFlightMessages = item.approximate_number_of_messages_not_visible ?? 0;
                  const isWarning = visibleMessages > 100;
                  const statusVal = item.status ?? "ok";
                  let statusColor = "status ok";
                  if (statusVal === "error") statusColor = "status error";
                  else if (statusVal === "denied") statusColor = "status denied";

                  return (
                    <tr key={item.queue_url ?? item.detail ?? qName} style={{ background: isWarning ? "rgba(251, 146, 60, 0.03)" : undefined }}>
                      <td style={{ fontWeight: "600", color: "#f8fafc" }}>
                        <code style={{ fontSize: "0.85rem" }}>{qName}</code>
                      </td>
                      <td style={{ fontWeight: "bold", color: isWarning ? "#fb923c" : "#cbd5e1" }}>
                        {visibleMessages.toLocaleString()}
                      </td>
                      <td style={{ color: "#94a3b8" }}>
                        {inFlightMessages.toLocaleString()}
                      </td>
                      <td>
                        <span className={statusColor} style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}>
                          {statusVal}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              {tab === "ecs" &&
                (currentData as EcsService[]).map((service) => {
                  const runningCount = service.running_count ?? 0;
                  const desiredCount = service.desired_count ?? 0;
                  const pendingCount = service.pending_count ?? 0;
                  const status = service.status ?? "unknown";
                  const isDeficient = runningCount < desiredCount;
                  const isInactive = status !== "ACTIVE" && status !== "PRIMARY";
                  
                  return (
                    <tr
                      key={service.service_name ?? service.task_definition ?? "unknown-service"}
                      style={{
                        background: isDeficient ? "rgba(251, 146, 60, 0.03)" : isInactive ? "rgba(239, 68, 68, 0.03)" : undefined,
                      }}
                    >
                      <td style={{ fontWeight: "600", color: "#f8fafc" }}>{service.service_name ?? "unknown-service"}</td>
                      <td>
                        <span className={`status ${isInactive ? "error" : "ok"}`} style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem" }}>
                          {status}
                        </span>
                      </td>
                      <td style={{ fontWeight: "bold" }}>
                        <span style={{ color: isDeficient ? "#fb923c" : "#34d399" }}>{runningCount}</span>
                        <span className="muted"> / </span>
                        <span>{desiredCount}</span>
                        {isDeficient && <span style={{ marginLeft: "0.5rem", color: "#fb923c", fontSize: "0.75rem" }}>⚠️ Scaling lag</span>}
                      </td>
                      <td style={{ color: pendingCount > 0 ? "#fb923c" : "#94a3b8" }}>{pendingCount}</td>
                      <td style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{service.launch_type ?? "unknown"}</td>
                      <td style={{ fontSize: "0.75rem", color: "#cbd5e1" }}>
                        <code style={{ wordBreak: "break-all" }}>{service.task_definition?.split("/").pop() ?? "unknown"}</code>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
