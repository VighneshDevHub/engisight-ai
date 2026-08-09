"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser, type User } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { apiClient } from "@/lib/api-client";
import {
  Shield, Users, Key, Settings, Database, Activity,
  AlertTriangle, CheckCircle2, RefreshCw, Search, ChevronDown,
} from "lucide-react";

type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

const ROLES = ["admin", "engineering_manager", "engineer", "reviewer", "viewer"];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
  engineering_manager: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  engineer: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  reviewer: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  viewer: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

type AdminTab = "users" | "roles" | "api_keys" | "system" | "audit";

export default function AdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [tab, setTab] = useState<AdminTab>("users");
  const [search, setSearch] = useState("");
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        setCurrentUser(u);
        if (u.role !== "admin") {
          router.push("/dashboard");
        }
      })
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (tab === "users") loadUsers();
  }, [tab]);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      // Use the auth/me endpoint as proxy to list - in prod this would be GET /admin/users
      // For now we show the current user as a demo
      const me = await fetchCurrentUser();
      setUsers([me as AdminUser]);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setUpdatingRole(userId);
    setRoleError(null);
    try {
      // PATCH /admin/users/{userId}/role — not yet implemented in backend
      // Shows the UI pattern
      await new Promise((r) => setTimeout(r, 500));
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      setRoleError(err.response?.data?.detail || "Failed to update role");
    } finally {
      setUpdatingRole(null);
    }
  }

  const filteredUsers = users.filter(
    (u) => !search || u.email.toLowerCase().includes(search.toLowerCase()) || u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <Shell>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Shield className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold">Admin access required</p>
          </div>
        </div>
      </Shell>
    );
  }

  const TABS: { id: AdminTab; label: string; icon: React.ElementType }[] = [
    { id: "users", label: "Users", icon: Users },
    { id: "roles", label: "Roles & Permissions", icon: Shield },
    { id: "api_keys", label: "API Keys", icon: Key },
    { id: "system", label: "System Settings", icon: Settings },
    { id: "audit", label: "Audit Logs", icon: Activity },
  ];

  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-[1200px] animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Admin Panel</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Platform administration — users, roles, API keys, system settings and audit logs.
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
            <Shield className="w-3 h-3" /> Admin Mode
          </span>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Users", value: users.length, icon: Users, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
            { label: "Active Sessions", value: 1, icon: Activity, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: "API Keys Active", value: 3, icon: Key, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
            { label: "System Alerts", value: 0, icon: AlertTriangle, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950/30" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`${bg} border border-slate-200 dark:border-slate-700/60 rounded-xl p-4`}>
              <Icon className={`w-5 h-5 ${color} mb-2`} />
              <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{value}</div>
              <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
            </div>
          ))}
        </div>

        {/* Tab Nav */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1 w-fit">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === id
                  ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Users Tab */}
        {tab === "users" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                User Management
              </h3>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none focus:border-blue-500 w-48"
                />
              </div>
              <button onClick={loadUsers} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? "animate-spin" : ""}`} />
              </button>
            </div>
            {roleError && (
              <div className="mx-5 mt-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 rounded-lg">{roleError}</div>
            )}
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                  {["User", "Email", "Role", "Status", "Joined", "Actions"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                          {u.full_name.charAt(0)}
                        </div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{u.full_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{u.email}</td>
                    <td className="px-5 py-3.5">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        disabled={updatingRole === u.id || u.id === currentUser.id}
                        className={`text-xs font-semibold px-2 py-1 rounded-lg border-0 cursor-pointer outline-none ${ROLE_COLORS[u.role] || ROLE_COLORS.viewer}`}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`flex items-center gap-1 text-[11px] font-semibold w-fit ${u.is_active ? "text-emerald-600" : "text-slate-400"}`}>
                        {u.is_active ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <button className="text-[11px] px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold">
                          Edit
                        </button>
                        {u.id !== currentUser.id && (
                          <button className="text-[11px] px-2.5 py-1 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 hover:bg-rose-200 font-semibold">
                            Deactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Roles Tab */}
        {tab === "roles" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
              <Shield className="w-4 h-4 text-violet-600" />
              Role-Based Access Control (RBAC)
            </h3>
            <div className="space-y-4">
              {[
                { role: "admin", permissions: ["All system permissions", "User management", "Role assignment", "API key management", "All project access"] },
                { role: "engineering_manager", permissions: ["Create/edit/archive projects", "Add/remove team members", "Approve reviews", "Generate reports", "All project drawings"] },
                { role: "engineer", permissions: ["Upload drawings", "Trigger AI extraction", "Create reviews", "View all project resources", "Create comparisons"] },
                { role: "reviewer", permissions: ["Review extracted parameters", "Review BoM items", "Review diff items", "View all resources", "Read-only project access"] },
                { role: "viewer", permissions: ["Read-only access to assigned projects", "View drawings and reports", "View comparison results"] },
              ].map(({ role, permissions }) => (
                <div key={role} className="flex gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <div className="w-36 shrink-0">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${ROLE_COLORS[role] || ROLE_COLORS.viewer}`}>
                      {role.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {permissions.map((p) => (
                      <span key={p} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium">
                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Keys Tab */}
        {tab === "api_keys" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-600" />
                API Keys & Integrations
              </h3>
              <button className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors">
                + New API Key
              </button>
            </div>
            <div className="space-y-3">
              {[
                { name: "Groq LLM API", key: "gsk_...xxxxx", status: "active", lastUsed: "2 mins ago", provider: "Groq" },
                { name: "OpenAI GPT-4.1", key: "sk-...yyyyy", status: "active", lastUsed: "1 hour ago", provider: "OpenAI" },
                { name: "Google Gemini 3", key: "AIza...zzzzz", status: "inactive", lastUsed: "1 week ago", provider: "Google" },
              ].map(({ name, key, status, lastUsed, provider }) => (
                <div key={name} className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}>
                        {status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="font-mono">{key}</span>
                      <span>·</span>
                      <span>Last used: {lastUsed}</span>
                      <span>·</span>
                      <span>{provider}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="text-[11px] px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold">
                      Rotate
                    </button>
                    <button className="text-[11px] px-2.5 py-1 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 font-semibold">
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System Settings Tab */}
        {tab === "system" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-600" />
              System Configuration
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                { section: "AI Engine", settings: [
                  { key: "LLM Provider", value: "Groq (openai/gpt-oss-120b)" },
                  { key: "OCR Engine", value: "PaddleOCR" },
                  { key: "Vision Model", value: "qwen/qwen3.6-27b" },
                  { key: "Embedding Model", value: "sentence-transformers/all-MiniLM-L6-v2" },
                ]},
                { section: "Storage", settings: [
                  { key: "Object Storage", value: "MinIO (S3-compatible)" },
                  { key: "Drawings Bucket", value: "drawings" },
                  { key: "Max File Size", value: "50 MB" },
                  { key: "Allowed Formats", value: "PDF, PNG, JPEG, TIFF" },
                ]},
                { section: "Database", settings: [
                  { key: "Primary DB", value: "PostgreSQL (async)" },
                  { key: "Vector DB", value: "Qdrant" },
                  { key: "Cache / Broker", value: "Redis" },
                  { key: "Migrations", value: "Alembic (7 migrations)" },
                ]},
                { section: "Task Queue", settings: [
                  { key: "Queue", value: "Celery + Redis" },
                  { key: "Workers", value: "3 tasks registered" },
                  { key: "Rate Limiting", value: "Enabled" },
                  { key: "JWT Expiry", value: "60 minutes" },
                ]},
              ].map(({ section, settings }) => (
                <div key={section} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3">{section}</div>
                  <div className="space-y-2">
                    {settings.map(({ key, value }) => (
                      <div key={key} className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">{key}</span>
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Logs Tab */}
        {tab === "audit" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" />
                Audit Logs
              </h3>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                  {["Timestamp", "User", "Action", "Resource", "IP Address"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {[
                  { time: "2026-08-04 09:14:22", user: "admin@engisight.ai", action: "login", resource: "auth", ip: "10.0.0.1" },
                  { time: "2026-08-04 09:12:10", user: "engineer@co.com", action: "upload_drawing", resource: "drawing:uuid-abc", ip: "10.0.0.5" },
                  { time: "2026-08-04 09:10:05", user: "reviewer@co.com", action: "create_review", resource: "review:uuid-def", ip: "10.0.0.8" },
                  { time: "2026-08-03 17:45:32", user: "admin@engisight.ai", action: "create_project", resource: "project:PROJ-001", ip: "10.0.0.1" },
                  { time: "2026-08-03 16:30:11", user: "manager@co.com", action: "add_member", resource: "project:PROJ-001", ip: "10.0.0.3" },
                ].map(({ time, user, action, resource, ip }, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-400">{time}</td>
                    <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-400">{user}</td>
                    <td className="px-5 py-3">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-mono">
                        {action}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-500">{resource}</td>
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-400">{ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
