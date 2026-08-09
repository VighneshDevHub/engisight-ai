"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { listDrawings, type Drawing } from "@/lib/drawings";
import { createComparison, listComparisons, type Comparison } from "@/lib/comparisons";

const s = {
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" } as React.CSSProperties,
  label: { display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" } as React.CSSProperties,
  select: { width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", color: "#0f172a", outline: "none" } as React.CSSProperties,
  btn: { background: "#0f172a", color: "#fff", border: "none", padding: "10px 22px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" } as React.CSSProperties,
};

const STATUS_PILL: Record<string, React.CSSProperties> = {
  pending: { background: "#f1f5f9", color: "#475569" },
  processing: { background: "#fffbeb", color: "#d97706" },
  completed: { background: "#dcfce7", color: "#15803d" },
  failed: { background: "#fef2f2", color: "#dc2626" },
};

export default function ComparisonsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [baselineId, setBaselineId] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then(() => setAuthChecked(true))
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    Promise.all([listDrawings(), listComparisons()]).then(([d, c]) => { setDrawings(d); setComparisons(c); });
  }, [authChecked]);

  const baselineOptions = drawings.filter((d) => d.drawing_type === "baseline");
  const revisionOptions = drawings.filter((d) => d.drawing_type === "revision");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const c = await createComparison(baselineId, revisionId);
      router.push(`/comparisons/${c.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create comparison");
    } finally { setCreating(false); }
  }

  if (!authChecked) return null;

  return (
    <Shell>
      <div style={{ maxWidth: "900px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Comparisons</h2>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>AI-powered engineering drawing comparison and deviation detection.</p>
          </div>
          <button style={s.btn} onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "+ New Comparison"}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div style={s.card}>
            <h3 style={{ margin: "0 0 8px", fontSize: "15px", fontWeight: 700 }}>New Comparison</h3>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#64748b" }}>
              Both drawings must have status <code style={{ background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px" }}>processed</code> before comparison.
            </p>
            {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#dc2626", marginBottom: "16px" }}>{error}</div>}
            <form onSubmit={handleCreate}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={s.label}>Baseline Drawing</label>
                  <select required style={s.select} value={baselineId} onChange={(e) => setBaselineId(e.target.value)}>
                    <option value="">Select baseline...</option>
                    {baselineOptions.map((d) => <option key={d.id} value={d.id}>{d.project_code} · {d.drawing_number} ({d.status})</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Revision Drawing</label>
                  <select required style={s.select} value={revisionId} onChange={(e) => setRevisionId(e.target.value)}>
                    <option value="">Select revision...</option>
                    {revisionOptions.map((d) => <option key={d.id} value={d.id}>{d.project_code} · {d.drawing_number} ({d.status})</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" style={{ ...s.btn, opacity: creating || !baselineId || !revisionId ? 0.6 : 1 }} disabled={creating || !baselineId || !revisionId}>
                {creating ? "Starting comparison..." : "Start Comparison"}
              </button>
            </form>
          </div>
        )}

        {/* Comparisons table */}
        <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>All Comparisons</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["Created", "Status", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < comparisons.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  <td style={{ padding: "12px 16px", color: "#475569" }}>{new Date(c.created_at).toLocaleString()}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", textTransform: "capitalize", ...(STATUS_PILL[c.status] || STATUS_PILL.pending) }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Link href={`/comparisons/${c.id}`} style={{ background: "#0f172a", color: "#fff", textDecoration: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                      View Report
                    </Link>
                  </td>
                </tr>
              ))}
              {comparisons.length === 0 && (
                <tr><td colSpan={3} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>No comparisons yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
