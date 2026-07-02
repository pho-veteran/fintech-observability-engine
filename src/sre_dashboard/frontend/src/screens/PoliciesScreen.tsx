import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { Policy } from "../api/types";
import { ConfirmModal } from "../components/ConfirmModal";

interface EditState {
  policy: Policy;
  nextThreshold: number;
  nextEnabled: boolean;
}

interface PoliciesScreenProps {
  tenantId: string;
}

export function PoliciesScreen({ tenantId: initialTenantId }: PoliciesScreenProps) {
  const [tenants, setTenants] = useState<string[]>([]);
  const [selectedTenant, setSelectedTenant] = useState(initialTenantId);
  const [policies, setPolicies] = useState<Policy[]>([]);
  
  // Tracking which policy is locally edited (inline draft)
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ threshold: number; enabled: boolean } | null>(null);
  
  // Confirmed edit state to trigger modal
  const [confirmingEdit, setConfirmingEdit] = useState<EditState | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Load tenants list
  useEffect(() => {
    api
      .tenants()
      .then((response) => {
        setTenants(response.tenants);
        if (!selectedTenant && response.tenants[0]) {
          setSelectedTenant(response.tenants[0]);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [selectedTenant]);

  const load = () => {
    if (!selectedTenant) return;
    setLoading(true);
    setError("");
    api
      .policies(selectedTenant)
      .then((response) => {
        setPolicies(response.policies);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(load, [selectedTenant]);

  const startEdit = (policy: Policy) => {
    setEditingKey(`${policy.tenant_id}-${policy.service_name}`);
    setEditDraft({
      threshold: policy.static_threshold,
      enabled: policy.enabled,
    });
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditDraft(null);
  };

  const triggerUpdate = (policy: Policy) => {
    if (!editDraft) return;
    setConfirmingEdit({
      policy,
      nextThreshold: editDraft.threshold,
      nextEnabled: editDraft.enabled,
    });
  };

  const executeUpdate = async () => {
    if (!confirmingEdit) return;
    setBusy(true);
    setError("");
    try {
      await api.updatePolicy(
        confirmingEdit.policy.tenant_id,
        confirmingEdit.policy.service_name,
        {
          static_threshold: confirmingEdit.nextThreshold,
          enabled: confirmingEdit.nextEnabled,
          expected_old_value: confirmingEdit.policy.static_threshold,
        }
      );
      setConfirmingEdit(null);
      setEditingKey(null);
      setEditDraft(null);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Policy was modified by another session. Reload and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Update failed");
      }
      setConfirmingEdit(null);
    } finally {
      setBusy(false);
    }
  };

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
          <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>Fallback static thresholds</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            Updates use expected_old_value lock to prevent race conditions.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "0.85rem", color: "#cbd5e1", fontWeight: "600" }}>TENANT:</span>
          <select
            value={selectedTenant}
            onChange={(event) => {
              setSelectedTenant(event.target.value);
              cancelEdit();
            }}
            style={{ minWidth: "180px", fontWeight: "bold" }}
          >
            {tenants.map((tenant) => (
              <option key={tenant} value={tenant}>
                {tenant}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="banner error" style={{ fontSize: "0.9rem" }}>
          {error}
        </div>
      ) : null}

      <section className="panel table-wrap" style={{ background: "rgba(15, 23, 42, 0.4)" }}>
        <table>
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Service Name</th>
              <th>Static Threshold</th>
              <th>Status State</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              // Skeleton rows
              [1, 2, 3].map((i) => (
                <tr key={`skel-${i}`}>
                  <td><div className="shimmer" style={{ height: "16px", width: "100px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                  <td><div className="shimmer" style={{ height: "16px", width: "120px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                  <td><div className="shimmer" style={{ height: "16px", width: "50px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                  <td><div className="shimmer" style={{ height: "16px", width: "60px", background: "rgba(255,255,255,0.05)", borderRadius: "4px" }} /></td>
                  <td style={{ textAlign: "right" }}><div className="shimmer" style={{ height: "24px", width: "80px", background: "rgba(255,255,255,0.05)", borderRadius: "12px", marginLeft: "auto" }} /></td>
                </tr>
              ))
            ) : policies.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center", padding: "3rem" }}>
                  No policies configured for this tenant.
                </td>
              </tr>
            ) : (
              policies.map((policy) => {
                const key = `${policy.tenant_id}-${policy.service_name}`;
                const isEditing = editingKey === key;

                return (
                  <tr key={key} style={{ background: isEditing ? "rgba(56, 189, 248, 0.03)" : undefined }}>
                    <td style={{ fontWeight: "600", color: "#94a3b8" }}>{policy.tenant_id}</td>
                    <td style={{ fontWeight: "600", color: "#f8fafc" }}>{policy.service_name}</td>
                    <td>
                      {isEditing && editDraft ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={editDraft.threshold}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, threshold: Number(e.target.value) })
                            }
                            style={{ width: "80px", padding: "0.3rem 0.5rem", fontSize: "0.85rem" }}
                          />
                          <span className="muted">%</span>
                        </div>
                      ) : (
                        <span>{policy.static_threshold}%</span>
                      )}
                    </td>
                    <td>
                      {isEditing && editDraft ? (
                        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={editDraft.enabled}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, enabled: e.target.checked })
                            }
                          />
                          <span style={{ fontSize: "0.85rem" }}>Enabled</span>
                        </label>
                      ) : (
                        <span className={`status ${policy.enabled ? "ok" : "skipped"}`} style={{ fontSize: "0.75rem" }}>
                          {policy.enabled ? "enabled" : "disabled"}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isEditing ? (
                        <div style={{ display: "inline-flex", gap: "0.5rem" }}>
                          <button
                            className="secondary"
                            type="button"
                            onClick={cancelEdit}
                            style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
                          >
                            Cancel
                          </button>
                          <button
                            className="primary"
                            type="button"
                            onClick={() => triggerUpdate(policy)}
                            style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
                          >
                            Update
                          </button>
                        </div>
                      ) : (
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => startEdit(policy)}
                          style={{ padding: "0.35rem 0.85rem", fontSize: "0.8rem" }}
                        >
                          Edit Policy
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {/* Confirmation Modal */}
      {confirmingEdit ? (
        <ConfirmModal
          title="Update Policy Threshold"
          body={`Change ${confirmingEdit.policy.service_name} threshold from ${confirmingEdit.policy.static_threshold}% to ${confirmingEdit.nextThreshold}%?`}
          busy={busy}
          onCancel={() => setConfirmingEdit(null)}
          onConfirm={executeUpdate}
        />
      ) : null}
    </section>
  );
}
