import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { LoginResponse, Profile } from "../api/types";

interface LoginScreenProps {
  onLogin: (response: LoginResponse) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profile, setProfile] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api
      .profiles()
      .then((response) => {
        setProfiles(response.profiles);
        if (response.profiles.length > 0) {
          setProfile(response.profiles[0].name);
        }
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load AWS profiles.");
      })
      .finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await api.login({ profile: profile || undefined, region });
      if (response.status !== "ok") {
        throw new Error(response.detail ?? response.error ?? "SSO login failed. Run `aws sso login`.");
      }
      onLogin(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "SSO login failed. Run `aws sso login`.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="shell"
      style={{
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        minHeight: "100vh",
        background: "radial-gradient(circle at center, rgba(30, 41, 59, 0.6) 0%, #0b1120 100%)",
      }}
    >
      <section
        className="panel"
        style={{
          width: "min(480px, 100%)",
          padding: "2.5rem 2rem",
          borderRadius: "16px",
          border: "1px solid rgba(148, 163, 184, 0.15)",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5), 0 10px 10px -5px rgba(0,0,0,0.5)",
          background: "rgba(15, 23, 42, 0.9)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "rgba(56, 189, 248, 0.1)",
              border: "1px solid rgba(56, 189, 248, 0.3)",
              color: "#38bdf8",
              fontSize: "1.5rem",
              marginBottom: "1rem",
            }}
          >
            🛡️
          </div>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.6rem", color: "#f8fafc" }}>CDO SRE Control</h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            AWS SSO Profile Authenticator. Local credentials only.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem 0" }}>
            <div className="spinner" style={{ display: "inline-block", width: "24px", height: "24px", border: "3px solid rgba(56, 189, 248, 0.2)", borderTopColor: "#38bdf8", borderRadius: "50%", animation: "spin 1s linear infinite" }}></div>
            <p className="muted" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>Loading AWS profiles...</p>
          </div>
        ) : (
          <div className="stack" style={{ gap: "1.25rem" }}>
            {error ? (
              <div
                className="banner error"
                style={{
                  fontSize: "0.85rem",
                  lineHeight: "1.4",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  background: "rgba(127, 29, 29, 0.2)",
                  color: "#fecaca",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                }}
              >
                {error}
              </div>
            ) : null}

            {profiles.length === 0 ? (
              <div
                className="banner error"
                style={{
                  fontSize: "0.85rem",
                  lineHeight: "1.4",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  background: "rgba(127, 29, 29, 0.2)",
                  color: "#fecaca",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                }}
              >
                No AWS profiles found. Run <code>aws configure</code> or setup your config.
              </div>
            ) : (
              <>
                <div className="stack" style={{ gap: "0.5rem" }}>
                  <label htmlFor="aws-profile-select" style={{ fontSize: "0.85rem", fontWeight: "600", color: "#cbd5e1" }}>
                    AWS SSO Profile
                  </label>
                  <select
                    id="aws-profile-select"
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "8px" }}
                  >
                    {profiles.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name} ({item.source})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="stack" style={{ gap: "0.5rem" }}>
                  <label htmlFor="aws-region-input" style={{ fontSize: "0.85rem", fontWeight: "600", color: "#cbd5e1" }}>
                    Region
                  </label>
                  <input
                    id="aws-region-input"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="us-east-1"
                    style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "8px" }}
                  />
                </div>

                <button
                  className="primary"
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    fontWeight: "600",
                    marginTop: "0.5rem",
                    background: "#38bdf8",
                    color: "#082f49",
                    fontSize: "0.95rem",
                    boxShadow: "0 4px 6px -1px rgba(56, 189, 248, 0.2)",
                    transition: "all 0.2s",
                  }}
                >
                  {busy ? "Authenticating SSO..." : "Login Session"}
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
