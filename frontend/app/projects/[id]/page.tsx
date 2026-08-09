"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, type User } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { getProject, listProjectMembers, addProjectMember, removeProjectMember, archiveProject, type Project, type ProjectMember } from "@/lib/projects";
import { listDrawings, type Drawing } from "@/lib/drawings";

const s = {
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" } as React.CSSProperties,
  btn: { background: "#0f172a", color: "#fff", border: "none", padding: "8px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" } as React.CSSProperties,
  btnOut: { background: "#fff", color: "#475569", border: "1px solid #cbd5e1", padding: "8px 18px", borderRadius: "8px", fontSize: "13px", cursor: "pointer" } as React.CSSProperties,
  input: { width: "100%", padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px", color: "#0f172a", outline: "none", boxSizing: "border-box" as const },
  label: { display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" } as React.CSSProperties,
};

const STATUS_PILL: Record<string, React.CSSProperties> = {
  active: { background: "#dcfce7", color: "#15803d" },
  archived: { background: "#f1f5f9", color: "#475569" },
  uploaded: { background: "#f1f5f9", color: "#475569" },
  processing: { background: "#fffbeb", color: "#d97706" },
  processed: { background: "#dcfce7", color: "#15803d" },
  failed: { background: "#fef2f2", color: "#dc2626" },
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const { id: projectId } = useParams() as { id: string };
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [tab, setTab] = useState<"drawings" | "members">("drawings");
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const canManage = user?.role === "admin" || user?.role === "engineering_manager";

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => { setUser(u); return loadAll(); })
      .catch(() => router.push("/login"));
  }, [projectId]);

  async function loadAll() {
    const [proj, mbrs, drwgs] = await Promise.all([
      getProject(projectId),
      listProjectMembers(projectId).catch(() => [] as ProjectMember[]),
      listDrawings(undefined, projectId).catch(() => [] as Drawing[]),
    ]);
    setProject(proj); setMembers(mbrs); setDrawings(drwgs);
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault(); setAddError(null); setAdding(true);
    try {
      await addProjectMember(projectId, newUserId.trim(), newRole);
      setNewUserId("");
      setMembers(await listProjectMembers(projectId));
    } catch (err: any) { setAddError(err.response?.data?.detail || "Failed"); }
    finally { setAdding(false); }
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member?")) return;
    try { await removeProjectMember(projectId, userId); setMembers(members.filter((m) => m.user_id !== userId)); }
    catch (err: any) { alert(err.response?.data?.detail || "Failed"); }
  }

  async function handleArchive() {
    if (!confirm("Archive this project?")) return;
    try { setProject(await archiveProject(projectId)); } catch (err: any) { alert(err.response?.data?.detail || "Failed"); }
  }

  if (!project) return null;

  return (
    <Shell>
      <div style={{ maxWidth: "1100px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Breadcrumb */}
        <div style={{ fontSize: "13px", color: "#64748b" }}>
          <Link href="/projects" style={{ color: "#64748b", textDecoration: "none" }}>Projects</Link>
          <span style={{ margin: "0 6px" }}>/</span>
          <span style={{ color: "#0f172a", fontWeight: 600 }}>{project.code}</span>
        </div>

        {/* Project card */}
        <div style={s.card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>{project.name}</h2>
                <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", textTransform: "capitalize", ...(STATUS_PILL[project.status] || {}) }}>
                  {project.status}
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontFamily: "monospace", fontSize: "13px", color: "#94a3b8" }}>{project.code}</p>
              {project.engineering_category && <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>{project.engineering_category}</p>}
              {project.description && <p style={{ margin: "8px 0 0", fontSize: "14px", color: "#475569", maxWidth: "600px" }}>{project.description}</p>}
            </div>
            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
              <Link href={`/drawings?project_id=${project.id}`} style={{ ...s.btn, textDecoration: "none" }}>Upload Drawing</Link>
              {canManage && project.status === "active" && (
                <button style={s.btnOut} onClick={handleArchive}>Archive</button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: "32px", marginTop: "20px" }}>
            {project.deadline && (
              <div>
                <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Deadline</div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginTop: "2px" }}>{new Date(project.deadline).toLocaleDateString()}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Documents</div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginTop: "2px" }}>{drawings.length}</div>
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Team Members</div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", marginTop: "2px" }}>{members.length}</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "4px", background: "#f1f5f9", borderRadius: "8px", padding: "4px", width: "fit-content" }}>
          {(["drawings", "members"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "7px 20px", borderRadius: "6px", border: "none", fontSize: "13px", fontWeight: 500, cursor: "pointer",
              background: tab === t ? "#fff" : "transparent",
              color: tab === t ? "#0f172a" : "#64748b",
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              textTransform: "capitalize",
            }}>
              {t}
            </button>
          ))}
        </div>

        {/* Drawings tab */}
        {tab === "drawings" && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  {["Drawing #", "Type", "File", "Status", "Uploaded", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drawings.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: i < drawings.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{d.drawing_number}</td>
                    <td style={{ padding: "12px 16px", color: "#475569", textTransform: "capitalize" }}>{d.drawing_type === "pid" ? "P&ID" : d.drawing_type}</td>
                    <td style={{ padding: "12px 16px", color: "#64748b", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.original_filename}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", textTransform: "capitalize", ...(STATUS_PILL[d.status] || STATUS_PILL.uploaded) }}>
                        {d.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#94a3b8" }}>{new Date(d.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <Link href={`/drawings/${d.id}`} style={{ background: "#0f172a", color: "#fff", textDecoration: "none", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {drawings.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
                    No drawings yet. <Link href={`/drawings?project_id=${project.id}`} style={{ color: "#2563eb" }}>Upload one</Link>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Members tab */}
        {tab === "members" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {canManage && (
              <div style={s.card}>
                <h4 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Add Team Member</h4>
                {addError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", color: "#dc2626", marginBottom: "12px" }}>{addError}</div>}
                <form onSubmit={handleAddMember} style={{ display: "flex", gap: "10px" }}>
                  <input required value={newUserId} onChange={(e) => setNewUserId(e.target.value)} placeholder="User UUID" style={{ ...s.input, maxWidth: "360px" }} />
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "14px" }}>
                    <option value="member">Member</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button type="submit" style={{ ...s.btn, opacity: adding ? 0.6 : 1 }} disabled={adding}>{adding ? "Adding..." : "Add"}</button>
                </form>
                <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#94a3b8" }}>Provide the User's UUID (visible via GET /api/v1/auth/me).</p>
              </div>
            )}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {["User ID", "Role", "Added", ...(canManage ? [""] : [])].map((h) => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                    <tr key={m.user_id} style={{ borderBottom: i < members.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: "12px", color: "#64748b" }}>{m.user_id}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ background: "#f1f5f9", color: "#475569", fontSize: "11px", padding: "3px 10px", borderRadius: "20px", textTransform: "capitalize" }}>{m.role}</span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#94a3b8" }}>{new Date(m.added_at).toLocaleDateString()}</td>
                      {canManage && (
                        <td style={{ padding: "12px 16px" }}>
                          {m.role !== "owner" && (
                            <button onClick={() => handleRemove(m.user_id)} style={{ background: "none", border: "none", color: "#dc2626", fontSize: "12px", cursor: "pointer" }}>Remove</button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {members.length === 0 && (
                    <tr><td colSpan={canManage ? 4 : 3} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>No members yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
