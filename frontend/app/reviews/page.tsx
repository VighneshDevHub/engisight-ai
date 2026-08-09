"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser, type User } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { listReviews, createReview, type Review } from "@/lib/reviews";

const s = {
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" } as React.CSSProperties,
  label: { display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" } as React.CSSProperties,
  input: { width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", color: "#0f172a", outline: "none", boxSizing: "border-box" as const },
  btn: { background: "#0f172a", color: "#fff", border: "none", padding: "9px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" } as React.CSSProperties,
};

const DECISION_PILL: Record<string, React.CSSProperties> = {
  approved: { background: "#dcfce7", color: "#15803d" },
  rejected: { background: "#fef2f2", color: "#dc2626" },
  needs_revision: { background: "#fffbeb", color: "#d97706" },
  flagged: { background: "#faf5ff", color: "#7c3aed" },
};

const ENTITY_TYPES = ["extracted_parameter", "bom_item", "diff_item"] as const;
const DECISIONS = ["approved", "rejected", "needs_revision", "flagged"] as const;

export default function ReviewsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filterType, setFilterType] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entity_type: "extracted_parameter" as typeof ENTITY_TYPES[number], entity_id: "", decision: "approved" as typeof DECISIONS[number], comment: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => { setUser(u); return reload(); })
      .catch(() => router.push("/login"));
  }, [router]);

  async function reload(entityType?: string) {
    const data = await listReviews(entityType ? { entity_type: entityType } : {});
    setReviews(data);
  }

  useEffect(() => {
    if (user) reload(filterType || undefined);
  }, [filterType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createReview({ entity_type: form.entity_type, entity_id: form.entity_id, decision: form.decision, comment: form.comment || undefined });
      setShowForm(false);
      setForm({ entity_type: "extracted_parameter", entity_id: "", decision: "approved", comment: "" });
      await reload(filterType || undefined);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create review");
    } finally { setSubmitting(false); }
  }

  const canReview = user?.role && ["admin", "engineering_manager", "reviewer", "engineer"].includes(user.role);

  return (
    <Shell>
      <div style={{ maxWidth: "1100px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Reviews</h2>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
              Engineering team review decisions for AI-extracted parameters, BoM items and diff items.
            </p>
          </div>
          {canReview && (
            <button style={s.btn} onClick={() => setShowForm(!showForm)}>
              {showForm ? "Cancel" : "+ Add Review"}
            </button>
          )}
        </div>

        {/* Create form */}
        {showForm && (
          <div style={s.card}>
            <h3 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>New Review Decision</h3>
            {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#dc2626", marginBottom: "16px" }}>{error}</div>}
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={s.label}>Entity Type</label>
                  <select style={s.input} value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value as any })}>
                    {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Entity ID (UUID) <span style={{ color: "#ef4444" }}>*</span></label>
                  <input required style={s.input} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.entity_id} onChange={(e) => setForm({ ...form, entity_id: e.target.value })} />
                </div>
                <div>
                  <label style={s.label}>Decision</label>
                  <select style={s.input} value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value as any })}>
                    {DECISIONS.map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Comment</label>
                  <input style={s.input} placeholder="Optional review comment..." value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button type="submit" style={{ ...s.btn, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>{submitting ? "Saving..." : "Save Review"}</button>
                <button type="button" style={{ background: "#fff", color: "#475569", border: "1px solid #cbd5e1", padding: "9px 20px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" }} onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "4px", background: "#f1f5f9", borderRadius: "8px", padding: "4px", width: "fit-content" }}>
          {[{ value: "", label: "All" }, ...ENTITY_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))].map(({ value, label }) => (
            <button key={value} onClick={() => setFilterType(value)} style={{
              padding: "6px 16px", borderRadius: "6px", border: "none", fontSize: "12px", fontWeight: 500, cursor: "pointer",
              background: filterType === value ? "#fff" : "transparent",
              color: filterType === value ? "#0f172a" : "#64748b",
              boxShadow: filterType === value ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              textTransform: "capitalize",
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* Reviews table */}
        <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["Entity Type", "Entity ID", "Decision", "Comment", "Reviewer", "Date"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviews.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: i < reviews.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ background: "#f1f5f9", color: "#475569", fontSize: "11px", padding: "3px 8px", borderRadius: "4px", fontFamily: "monospace" }}>{r.entity_type}</span>
                  </td>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: "11px", color: "#64748b" }}>{r.entity_id.substring(0, 8)}…</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", textTransform: "capitalize", ...(DECISION_PILL[r.decision] || {}) }}>
                      {r.decision.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#64748b", fontSize: "13px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.comment || "—"}</td>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: "11px", color: "#94a3b8" }}>{r.reviewer_id.substring(0, 8)}…</td>
                  <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "13px" }}>{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {reviews.length === 0 && (
                <tr><td colSpan={6} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>No reviews yet. Reviews are created from the drawing detail or comparison report pages.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
