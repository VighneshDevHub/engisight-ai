"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { getComparison, type ComparisonSummary, type DiffItem } from "@/lib/comparisons";

const POLL_MS = 3000;

const CLS_STYLE: Record<string, React.CSSProperties> = {
  modified: { background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" },
  missing:  { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" },
  added:    { background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe" },
  matching: { background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" },
};

const STATUS_PILL: Record<string, React.CSSProperties> = {
  pending:    { background: "#f1f5f9", color: "#475569" },
  processing: { background: "#fffbeb", color: "#d97706" },
  completed:  { background: "#dcfce7", color: "#15803d" },
  failed:     { background: "#fef2f2", color: "#dc2626" },
};

const CLS_ORDER = ["modified", "missing", "added", "matching"];

export default function ComparisonDetailPage() {
  const router = useRouter();
  const { id: comparisonId } = useParams() as { id: string };
  const [authChecked, setAuthChecked] = useState(false);
  const [summary, setSummary] = useState<ComparisonSummary | null>(null);
  const [selectedItem, setSelectedItem] = useState<DiffItem | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const data = await getComparison(comparisonId);
    setSummary(data); return data;
  }, [comparisonId]);

  useEffect(() => { fetchCurrentUser().then(() => setAuthChecked(true)).catch(() => router.push("/login")); }, [router]);
  useEffect(() => { if (authChecked) refresh(); }, [authChecked, refresh]);

  useEffect(() => {
    if (summary?.comparison.status === "processing" && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const u = await refresh();
        if (u.comparison.status !== "processing" && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }, POLL_MS);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [summary?.comparison.status, refresh]);

  if (!authChecked || !summary) return null;
  const { comparison, counts, diff_items } = summary;
  const filtered = activeFilter ? diff_items.filter((i) => i.classification === activeFilter) : diff_items;

  return (
    <Shell>
      <div style={{ maxWidth: "1200px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Breadcrumb */}
        <div style={{ fontSize: "13px", color: "#64748b" }}>
          <Link href="/comparisons" style={{ color: "#64748b", textDecoration: "none" }}>Comparisons</Link>
          <span style={{ margin: "0 6px" }}>/</span>
          <span style={{ color: "#0f172a", fontWeight: 600 }}>Report</span>
        </div>

        {/* Header card */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Comparison Report</h2>
            <span style={{ fontSize: "11px", fontWeight: 600, padding: "4px 12px", borderRadius: "20px", textTransform: "capitalize", ...(STATUS_PILL[comparison.status] || STATUS_PILL.pending) }}>
              {comparison.status}
            </span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
            Created {new Date(comparison.created_at).toLocaleString()}
          </p>
          {comparison.status === "processing" && (
            <p style={{ marginTop: "12px", fontSize: "13px", color: "#d97706" }}>
              Diff engine running (Qdrant fuzzy matching + classification)… page auto-refreshes.
            </p>
          )}
          {comparison.status === "failed" && (
            <p style={{ marginTop: "12px", fontSize: "13px", color: "#dc2626" }}>Comparison failed — check worker logs.</p>
          )}

          {/* Classification summary tiles */}
          {comparison.status === "completed" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginTop: "20px" }}>
              {CLS_ORDER.map((cls) => (
                <button key={cls} onClick={() => setActiveFilter(activeFilter === cls ? null : cls)} style={{
                  ...CLS_STYLE[cls], borderRadius: "10px", padding: "16px", textAlign: "left", cursor: "pointer",
                  outline: activeFilter === cls ? "2px solid #0f172a" : "none", outlineOffset: "2px",
                }}>
                  <div style={{ fontSize: "28px", fontWeight: 800 }}>{counts[cls] || 0}</div>
                  <div style={{ fontSize: "12px", fontWeight: 600, marginTop: "4px", textTransform: "capitalize" }}>{cls}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Diff table + traceability panel */}
        {comparison.status === "completed" && (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
            {/* Table */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {["Parameter", "Baseline", "Revision", "Status"].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, i) => (
                    <tr key={item.id} onClick={() => setSelectedItem(item)} style={{
                      borderBottom: i < filtered.length - 1 ? "1px solid #f1f5f9" : "none",
                      cursor: "pointer",
                      background: selectedItem?.id === item.id ? "#f8fafc" : "#fff",
                    }}>
                      <td style={{ padding: "10px 16px", fontWeight: 600, color: "#0f172a" }}>{item.parameter_name}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b" }}>{item.baseline_value ?? "—"}</td>
                      <td style={{ padding: "10px 16px", color: "#64748b" }}>{item.revision_value ?? "—"}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", textTransform: "capitalize", ...CLS_STYLE[item.classification] }}>
                          {item.classification}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>No items in this category.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Traceability panel */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", alignSelf: "start" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Traceability</h3>
              {selectedItem ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "13px" }}>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Explanation</div>
                    <p style={{ margin: 0, color: "#334155", lineHeight: 1.5 }}>{selectedItem.explanation}</p>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Match Confidence</div>
                    <p style={{ margin: 0, color: "#334155", fontWeight: 600 }}>{(selectedItem.match_confidence * 100).toFixed(0)}%</p>
                  </div>
                  {selectedItem.baseline_parameter_id && (
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Baseline Source</div>
                      <p style={{ margin: 0, fontFamily: "monospace", fontSize: "11px", color: "#64748b" }}>{selectedItem.baseline_parameter_id}</p>
                    </div>
                  )}
                  {selectedItem.revision_parameter_id && (
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Revision Source</div>
                      <p style={{ margin: 0, fontFamily: "monospace", fontSize: "11px", color: "#64748b" }}>{selectedItem.revision_parameter_id}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: "#94a3b8", fontSize: "13px" }}>Click a row to see its explanation and source traceability.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
