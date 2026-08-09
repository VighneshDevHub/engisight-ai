"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { uploadDrawing, listDrawings, getDownloadUrl, deleteDrawing, type Drawing } from "@/lib/drawings";
import { listProjects, type Project } from "@/lib/projects";
import { apiClient } from "@/lib/api-client";

const s = {
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" } as React.CSSProperties,
  label: { display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" } as React.CSSProperties,
  input: { width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", color: "#0f172a", outline: "none", boxSizing: "border-box" as const },
  btnPrimary: { background: "#0f172a", color: "#fff", border: "none", padding: "8px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" } as React.CSSProperties,
  btnSecondary: { background: "#fff", color: "#475569", border: "1px solid #cbd5e1", padding: "8px 18px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" } as React.CSSProperties,
};

const STATUS_PILL: Record<string, React.CSSProperties> = {
  uploaded: { background: "#f1f5f9", color: "#475569" },
  processing: { background: "#fffbeb", color: "#d97706" },
  processed: { background: "#dcfce7", color: "#15803d" },
  failed: { background: "#fef2f2", color: "#dc2626" },
};

function DrawingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authChecked, setAuthChecked] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selProject, setSelProject] = useState(searchParams.get("project_id") || "");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [filterType, setFilterType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [drawingNumber, setDrawingNumber] = useState("");
  const [drawingType, setDrawingType] = useState<"baseline" | "revision" | "pid" | "requirements">("baseline");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then(() => setAuthChecked(true))
      .catch(() => router.push("/login"));
  }, [router]);

  async function reload() {
    const [drwgs, projs] = await Promise.all([
      listDrawings(undefined, selProject || undefined),
      listProjects().catch(() => [] as Project[]),
    ]);
    setDrawings(drwgs);
    setProjects(projs);
  }

  useEffect(() => { if (authChecked) reload(); }, [authChecked, selProject]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      if (selProject) {
        const fd = new FormData();
        fd.append("project_id", selProject);
        fd.append("drawing_number", drawingNumber);
        fd.append("drawing_type", drawingType);
        fd.append("file", file);
        await apiClient.post("/drawings/upload", fd);
      } else {
        const proj = projects[0];
        if (!proj) { setError("Select a project first"); setUploading(false); return; }
        await uploadDrawing(proj.code, drawingNumber, drawingType, file);
      }
      setFile(null); setDrawingNumber(""); setShowForm(false);
      await reload();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed");
    } finally { setUploading(false); }
  }

  async function handleDelete(drawingId: string, drawingNumber: string) {
    if (!window.confirm(`Delete drawing "${drawingNumber}"? The file and any associated extraction results will be removed. This cannot be undone.`)) return;
    try {
      await deleteDrawing(drawingId);
      await reload();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Delete failed");
    }
  }

  const visible = drawings.filter((d) => filterType === "all" || d.drawing_type === filterType);

  if (!authChecked) return null;

  return (
    <Shell>
      <div style={{ maxWidth: "1200px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Drawings</h2>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>Upload and manage engineering drawings for AI analysis.</p>
          </div>
          <button style={s.btnPrimary} onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "+ Upload Drawing"}
          </button>
        </div>

        {/* Upload form */}
        {showForm && (
          <div style={s.card}>
            <h3 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>Upload Engineering Drawing</h3>
            {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#dc2626", marginBottom: "16px" }}>{error}</div>}
            <form onSubmit={handleUpload}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={s.label}>Project <span style={{ color: "#ef4444" }}>*</span></label>
                  <select style={s.input} required value={selProject} onChange={(e) => setSelProject(e.target.value)}>
                    <option value="">Select project...</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={s.label}>Drawing Number <span style={{ color: "#ef4444" }}>*</span></label>
                  <input required style={s.input} placeholder="e.g. DWG-100-A" value={drawingNumber} onChange={(e) => setDrawingNumber(e.target.value)} />
                </div>
                <div>
                  <label style={s.label}>Drawing Type</label>
                  <select style={s.input} value={drawingType} onChange={(e) => setDrawingType(e.target.value as any)}>
                    <option value="baseline">Baseline (approved reference)</option>
                    <option value="revision">Revision (to be compared)</option>
                    <option value="pid">P&amp;ID (component recognition &amp; BoM)</option>
                    <option value="requirements">Requirements Spec (deviation analysis)</option>
                  </select>
                </div>
                <div>
                  <label style={s.label}>File (PDF, PNG, JPEG, TIFF — max 50MB)</label>
                  <input type="file" required accept=".pdf,.png,.jpg,.jpeg,.tiff" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ fontSize: "13px", color: "#475569" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button type="submit" style={{ ...s.btnPrimary, opacity: uploading ? 0.6 : 1 }} disabled={uploading}>{uploading ? "Uploading..." : "Upload"}</button>
                <button type="button" style={s.btnSecondary} onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Filters row */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <select style={{ padding: "7px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "13px", color: "#0f172a" }} value={selProject} onChange={(e) => setSelProject(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
          <div style={{ display: "flex", gap: "4px", background: "#f1f5f9", borderRadius: "8px", padding: "4px", flexWrap: "wrap" }}>
            {["all", "baseline", "revision", "pid", "requirements"].map((t) => (
              <button key={t} onClick={() => setFilterType(t)} style={{ padding: "5px 14px", borderRadius: "6px", border: "none", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: filterType === t ? "#fff" : "transparent", color: filterType === t ? "#0f172a" : "#64748b", boxShadow: filterType === t ? "0 1px 2px rgba(0,0,0,0.1)" : "none", textTransform: "capitalize" }}>
                {t === "pid" ? "P&ID" : t}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ ...s.card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["Project", "Drawing #", "Type", "File", "Status", "Uploaded", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((d, i) => (
                <tr key={d.id} style={{ borderBottom: i < visible.length - 1 ? "1px solid #f1f5f9" : "none", background: "#fff" }}>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: "12px", color: "#94a3b8" }}>{d.project_code}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{d.drawing_number}</td>
                  <td style={{ padding: "12px 16px", color: "#475569", textTransform: "capitalize" }}>{d.drawing_type === "pid" ? "P&ID" : d.drawing_type}</td>
                  <td style={{ padding: "12px 16px", maxWidth: "200px" }}>
                    <button onClick={async () => { const { url } = await getDownloadUrl(d.id); window.open(url, "_blank"); }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", textDecoration: "underline", fontSize: "13px", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>
                      {d.original_filename}
                    </button>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", textTransform: "capitalize", ...(STATUS_PILL[d.status] || STATUS_PILL.uploaded) }}>
                      {d.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "13px" }}>{new Date(d.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <Link href={`/drawings/${d.id}`} style={{ ...s.btnPrimary, textDecoration: "none", padding: "6px 14px", fontSize: "12px" }}>
                        View / Extract
                      </Link>
                      <button
                        onClick={() => handleDelete(d.id, d.drawing_number)}
                        title="Delete drawing"
                        style={{ background: "#fff", color: "#dc2626", border: "1px solid #fecaca", padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
                    No drawings found. Upload your first engineering drawing to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}

export default function DrawingsPage() {
  return (
    <Suspense>
      <DrawingsContent />
    </Suspense>
  );
}
