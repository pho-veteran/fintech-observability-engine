interface ConfirmModalProps {
  title: string;
  body: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({ title, body, busy, onCancel, onConfirm }: ConfirmModalProps) {
  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "grid",
        placeItems: "center",
        backgroundColor: "rgba(2, 6, 23, 0.85)",
        backdropFilter: "blur(4px)",
        padding: "1rem",
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        style={{
          width: "min(440px, 100%)",
          background: "#0f172a",
          border: "1px solid rgba(148, 163, 184, 0.3)",
          borderRadius: "12px",
          padding: "1.5rem",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <h3 id="confirm-title" style={{ margin: 0, fontSize: "1.2rem", color: "#f8fafc", fontWeight: "600" }}>
          {title}
        </h3>
        
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem", color: "#cbd5e1", lineHeight: "1.5" }}>
          {body}
        </p>

        <div className="row" style={{ justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button
            className="secondary"
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              fontSize: "0.85rem",
              background: "rgba(30, 41, 59, 0.8)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              color: "#e2e8f0",
            }}
          >
            Cancel
          </button>
          <button
            className="primary"
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              fontSize: "0.85rem",
              background: "#ef4444", // red highlight since it's a mutation confirm
              color: "#ffffff",
              border: "none",
              fontWeight: "600",
            }}
          >
            {busy ? "Updating..." : "Confirm Update"}
          </button>
        </div>
      </section>
    </div>
  );
}
