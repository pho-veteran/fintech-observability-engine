import { useState, useRef, useEffect } from "react";
import type { MetricQueryResult, MetricValue } from "../api/types";

interface MetricChartProps {
  title: string;
  label: string;
  result?: MetricQueryResult;
  threshold?: number;
  fillPolicy?: "forward_fill" | "zero_fill";
}

const metricColors: Record<string, string> = {
  cpu_usage_percent: "#38bdf8", // Cyan
  memory_usage_percent: "#a78bfa", // Purple
  active_connections: "#34d399", // Emerald
  db_connection_pool_pct: "#fbbf24", // Amber
  queue_depth: "#f87171", // Rose
  cache_hit_rate_pct: "#fb7185", // Pink
  api_latency_ms: "#60a5fa", // Blue
};

export function MetricChart({
  title,
  label,
  result,
  threshold,
  fillPolicy = "forward_fill",
}: MetricChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<MetricValue | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const height = 220;

  // Handle responsiveness
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width || 400);
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const color = metricColors[title] || "#38bdf8";

  // Check error state
  const isError = result?.status === "error";
  const errorMessage = isError ? result?.detail ?? "Failed to query metric" : "";

  // 1. Process values according to fill policy
  let values: MetricValue[] = [];
  let queryRange = result?.query_range;

  if (result?.series && result.series.length > 0) {
    const rawValues = result.series.flatMap((s) => s.values);
    if (queryRange) {
      const start = queryRange.start;
      const end = queryRange.end;
      const step = queryRange.step || 60;
      
      const sorted = [...rawValues].sort((a, b) => a.timestamp - b.timestamp);
      let lastVal = 0;
      let hasLast = false;
      
      for (let t = start; t <= end; t += step) {
        const match = sorted.find((v) => Math.abs(v.timestamp - t) < step / 2);
        if (match !== undefined) {
          lastVal = match.value;
          hasLast = true;
          values.push({ timestamp: t, value: lastVal });
        } else {
          // Find the predecessor value in sorted if it exists
          const pred = [...sorted].reverse().find((v) => v.timestamp <= t);
          if (pred !== undefined) {
            lastVal = pred.value;
            hasLast = true;
          }
          
          if (fillPolicy === "forward_fill" && hasLast) {
            values.push({ timestamp: t, value: lastVal });
          } else {
            values.push({ timestamp: t, value: 0 });
          }
        }
      }
    } else {
      values = [...rawValues].sort((a, b) => a.timestamp - b.timestamp);
    }
  }

  // 2. Set coordinate limits
  const isPct = title.includes("percent") || title.includes("pct") || title.includes("rate");
  const yMin = 0;
  const maxVal = values.length > 0 ? Math.max(...values.map((v) => v.value)) : 0;
  const yMax = isPct ? 100 : Math.max(threshold ?? 0, maxVal * 1.15, 10);

  // Margins inside SVG
  const paddingLeft = 45;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const getX = (ts: number) => {
    if (!queryRange || queryRange.end === queryRange.start) {
      if (values.length <= 1) return paddingLeft + chartWidth / 2;
      const first = values[0].timestamp;
      const last = values[values.length - 1].timestamp;
      return paddingLeft + ((ts - first) / (last - first)) * chartWidth;
    }
    return paddingLeft + ((ts - queryRange.start) / (queryRange.end - queryRange.start)) * chartWidth;
  };

  const getY = (val: number) => {
    const ratio = (val - yMin) / (yMax - yMin);
    return height - paddingBottom - ratio * chartHeight;
  };

  // 3. Create SVG path and area string
  let pathD = "";
  let areaD = "";
  if (values.length > 0) {
    const points = values.map((v) => ({ x: getX(v.timestamp), y: getY(v.value) }));
    pathD = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
    
    // Closed area path
    areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;
  }

  // 4. Handle hover calculations
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (values.length === 0 || !containerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Find the data point closest to mouseX
    let closestPt = values[0];
    let closestXDiff = Math.abs(getX(values[0].timestamp) - mouseX);

    for (let i = 1; i < values.length; i++) {
      const ptX = getX(values[i].timestamp);
      const diff = Math.abs(ptX - mouseX);
      if (diff < closestXDiff) {
        closestXDiff = diff;
        closestPt = values[i];
      }
    }

    const ptX = getX(closestPt.timestamp);
    const ptY = getY(closestPt.value);

    setHoveredPoint(closestPt);
    setHoverPos({ x: ptX, y: ptY });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setHoverPos(null);
  };

  // Helper to format time
  const formatTime = (ts: number, seconds = false) => {
    const date = new Date(ts * 1000);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      ...(seconds ? { second: "2-digit" } : {}),
      hour12: false,
    });
  };

  // Helper to format date label
  const formatDate = (ts: number) => {
    const date = new Date(ts * 1000);
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  // Draw y ticks
  const yTicks = [yMin, yMin + (yMax - yMin) * 0.25, yMin + (yMax - yMin) * 0.5, yMin + (yMax - yMin) * 0.75, yMax];

  // Draw x ticks (start, middle, end)
  let xTicks: number[] = [];
  if (queryRange) {
    xTicks = [queryRange.start, queryRange.start + (queryRange.end - queryRange.start) / 2, queryRange.end];
  } else if (values.length > 1) {
    xTicks = [values[0].timestamp, values[Math.floor(values.length / 2)].timestamp, values[values.length - 1].timestamp];
  }

  // Current metric value display
  const currentVal = values.length > 0 ? values[values.length - 1].value : null;

  return (
    <article className="card" ref={containerRef} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "1rem", color: "#f8fafc" }}>
            {title.replace(/_/g, " ").toUpperCase()}
          </h3>
          <span className="muted" style={{ fontSize: "0.8rem" }}>{label}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          {currentVal !== null ? (
            <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: color }}>
              {isPct ? `${currentVal.toFixed(1)}%` : currentVal.toLocaleString([], { maximumFractionDigits: 1 })}
            </div>
          ) : (
            <span className="muted" style={{ fontSize: "0.8rem" }}>No Data</span>
          )}
          {result?.status && (
            <span className={`status ${isError ? "error" : result.status}`} style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem", marginTop: "0.2rem" }}>
              {isError ? "amp error" : result.status}
            </span>
          )}
        </div>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: height, background: "rgba(10, 15, 30, 0.4)", borderRadius: "6px", overflow: "hidden", border: "1px solid rgba(148, 163, 184, 0.08)" }}>
        {isError ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem", textAlign: "center" }}>
            <span style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>⚠️</span>
            <div style={{ color: "#fb923c", fontWeight: "600", fontSize: "0.85rem", marginBottom: "0.25rem" }}>AMP Query Error</div>
            <div className="muted" style={{ fontSize: "0.75rem", maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
              {errorMessage}
            </div>
          </div>
        ) : values.length === 0 ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="muted" style={{ fontSize: "0.85rem" }}>No metric data available for this time range.</span>
          </div>
        ) : (
          <svg
            width={width}
            height={height}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ display: "block", overflow: "visible" }}
          >
            {/* Gradients */}
            <defs>
              <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0.0} />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            {yTicks.map((val) => (
              <line
                key={`grid-y-${val}`}
                x1={paddingLeft}
                y1={getY(val)}
                x2={width - paddingRight}
                y2={getY(val)}
                stroke="rgba(148, 163, 184, 0.08)"
                strokeDasharray="2,2"
              />
            ))}

            {/* Y Axis labels */}
            {yTicks.map((val, idx) => (
              <text
                key={`label-y-${val}`}
                x={paddingLeft - 8}
                y={getY(val) + 4}
                textAnchor="end"
                fill="#64748b"
                fontSize="9"
                fontFamily="monospace"
              >
                {isPct ? `${val.toFixed(0)}%` : val.toLocaleString([], { notation: "compact", compactDisplay: "short" })}
              </text>
            ))}

            {/* X Axis ticks & labels */}
            {xTicks.map((ts, idx) => {
              const x = getX(ts);
              return (
                <g key={`tick-x-${ts}`}>
                  <line
                    x1={x}
                    y1={height - paddingBottom}
                    x2={x}
                    y2={height - paddingBottom + 4}
                    stroke="rgba(148, 163, 184, 0.25)"
                  />
                  <text
                    x={x}
                    y={height - paddingBottom + 16}
                    textAnchor={idx === 0 ? "start" : idx === xTicks.length - 1 ? "end" : "middle"}
                    fill="#64748b"
                    fontSize="9"
                  >
                    {formatTime(ts)}
                  </text>
                  {idx === 0 && (
                    <text
                      x={x}
                      y={height - paddingBottom + 26}
                      textAnchor="start"
                      fill="#475569"
                      fontSize="8"
                    >
                      {formatDate(ts)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Policy Threshold line */}
            {threshold !== undefined && threshold <= yMax && (
              <g>
                <line
                  x1={paddingLeft}
                  y1={getY(threshold)}
                  x2={width - paddingRight}
                  y2={getY(threshold)}
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="4,4"
                  opacity="0.8"
                />
                <text
                  x={width - paddingRight - 4}
                  y={getY(threshold) - 4}
                  textAnchor="end"
                  fill="#fca5a5"
                  fontSize="8"
                  fontWeight="bold"
                >
                  THRESHOLD: {threshold}%
                </text>
              </g>
            )}

            {/* Area Path */}
            <path d={areaD} fill={`url(#grad-${title})`} />

            {/* Line Path */}
            <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />

            {/* Hover vertical line and tooltip */}
            {hoveredPoint && hoverPos && (
              <g>
                <line
                  x1={hoverPos.x}
                  y1={paddingTop}
                  x2={hoverPos.x}
                  y2={height - paddingBottom}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <circle
                  cx={hoverPos.x}
                  cy={hoverPos.y}
                  r="4"
                  fill={color}
                  stroke="#0b1120"
                  strokeWidth="2"
                />
              </g>
            )}
          </svg>
        )}

        {/* HTML overlay tooltip for better rendering & alignment */}
        {hoveredPoint && hoverPos && !isError && (
          <div
            style={{
              position: "absolute",
              top: Math.max(10, hoverPos.y - 65),
              left: hoverPos.x + 10 + 130 > width ? hoverPos.x - 140 : hoverPos.x + 10,
              background: "rgba(15, 23, 42, 0.95)",
              border: `1px solid ${color}`,
              borderRadius: "4px",
              padding: "6px 10px",
              pointerEvents: "none",
              fontSize: "0.75rem",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            <div style={{ color: "#94a3b8", fontSize: "0.65rem" }}>
              {formatTime(hoveredPoint.timestamp, true)}
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "space-between", alignItems: "center" }}>
              <span className="muted">Value:</span>
              <strong style={{ color: color }}>
                {isPct ? `${hoveredPoint.value.toFixed(2)}%` : hoveredPoint.value.toLocaleString([], { maximumFractionDigits: 2 })}
              </strong>
            </div>
            {threshold !== undefined && (
              <div style={{ display: "flex", gap: "8px", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "2px", marginTop: "2px" }}>
                <span style={{ color: "#ef4444", fontSize: "0.65rem" }}>Threshold:</span>
                <strong style={{ color: "#ef4444", fontSize: "0.65rem" }}>{threshold}%</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {threshold !== undefined && !isError && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginTop: "0.5rem" }} className="muted">
          <span>Policy threshold: {threshold}%</span>
          {currentVal !== null && currentVal > threshold && (
            <span style={{ color: "#f87171", fontWeight: "bold" }}>⚠️ Exceeds Threshold</span>
          )}
        </div>
      )}
    </article>
  );
}
