"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, type User } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import {
  listProjects,
  createProject,
  archiveProject,
  type Project,
} from "@/lib/projects";
import {
  Plus,
  FolderClosed,
  ArchiveRestore,
  Filter,
  Calendar,
  AlertTriangle,
  ArrowRight,
  FileText,
  X,
} from "lucide-react";

const CATEGORIES = [
  "Mechanical",
  "Electrical",
  "Instrumentation",
  "Piping",
  "Civil",
  "Process",
  "HVAC",
  "Structural",
  "Marine",
  "Other",
];

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    engineering_category: "",
    deadline: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] =
    useState<"all" | "active" | "archived">("all");

  const canManage =
    user?.role === "admin" || user?.role === "engineering_manager";

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => {
        setUser(u);
        return reload();
      })
      .catch(() => router.push("/login"));
  }, [router]);

  async function reload() {
    const data = await listProjects();
    setProjects(data);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createProject({
        code: form.code,
        name: form.name,
        description: form.description || undefined,
        engineering_category: form.engineering_category || undefined,
        deadline: form.deadline || undefined,
      });
      setShowForm(false);
      setForm({
        code: "",
        name: "",
        description: "",
        engineering_category: "",
        deadline: "",
      });
      await reload();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this project?")) return;
    try {
      await archiveProject(id);
      await reload();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed");
    }
  }

  const visible = projects.filter(
    (p) => filterStatus === "all" || p.status === filterStatus
  );

  return (
    <Shell>
      <div className="mx-auto w-full max-w-6xl flex flex-col gap-6">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-navy-700 dark:text-steel-100">
              Projects
            </h2>
            <p className="mt-1 text-sm text-steel-500 dark:text-steel-400">
              Manage engineering projects, teams and document workflows.
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-550 px-4 py-2.5 text-sm font-bold text-navy-950 shadow-md shadow-cyan-550/20 transition hover:bg-cyan-450 disabled:opacity-50"
            >
              {showForm ? (
                <>
                  <X className="w-4 h-4" /> Cancel
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> New Project
                </>
              )}
            </button>
          )}
        </div>

        {/* Create form */}
        {showForm && (
          <div className="rounded-2xl border border-steel-200 dark:border-navy-800 bg-white dark:bg-navy-900 p-6 shadow-xs">
            <h3 className="mb-4 text-base font-bold text-navy-800 dark:text-steel-100">
              New Project
            </h3>
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/50 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-navy-700 dark:text-steel-300 mb-1.5">
                    Project Code{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    placeholder="e.g. PROJ-001"
                    value={form.code}
                    onChange={(e) =>
                      setForm({ ...form, code: e.target.value })
                    }
                    className="w-full rounded-xl border border-steel-200 bg-white px-3 py-2.5 text-sm text-navy-800 outline-none transition focus:border-cyan-550 focus:ring-1 focus:ring-cyan-550 dark:border-navy-700 dark:bg-navy-900 dark:text-steel-100 placeholder:text-steel-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-navy-700 dark:text-steel-300 mb-1.5">
                    Project Name{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    placeholder="e.g. Offshore Platform Alpha"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    className="w-full rounded-xl border border-steel-200 bg-white px-3 py-2.5 text-sm text-navy-800 outline-none transition focus:border-cyan-550 focus:ring-1 focus:ring-cyan-550 dark:border-navy-700 dark:bg-navy-900 dark:text-steel-100 placeholder:text-steel-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-navy-700 dark:text-steel-300 mb-1.5">
                    Engineering Category
                  </label>
                  <select
                    value={form.engineering_category}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        engineering_category: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-steel-200 bg-white px-3 py-2.5 text-sm text-navy-800 outline-none transition focus:border-cyan-550 focus:ring-1 focus:ring-cyan-550 dark:border-navy-700 dark:bg-navy-900 dark:text-steel-100 placeholder:text-steel-400"
                  >
                    <option value="">Select category...</option>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-navy-700 dark:text-steel-300 mb-1.5">
                    Deadline
                  </label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={(e) =>
                      setForm({ ...form, deadline: e.target.value })
                    }
                    className="w-full rounded-xl border border-steel-200 bg-white px-3 py-2.5 text-sm text-navy-800 outline-none transition focus:border-cyan-550 focus:ring-1 focus:ring-cyan-550 dark:border-navy-700 dark:bg-navy-900 dark:text-steel-100 placeholder:text-steel-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-700 dark:text-steel-300 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional description..."
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="w-full resize-y rounded-xl border border-steel-200 bg-white px-3 py-2.5 text-sm text-navy-800 outline-none transition focus:border-cyan-550 focus:ring-1 focus:ring-cyan-550 dark:border-navy-700 dark:bg-navy-900 dark:text-steel-100 placeholder:text-steel-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-550 px-4 py-2.5 text-sm font-bold text-navy-950 shadow-md shadow-cyan-550/20 transition hover:bg-cyan-450 disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create Project"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-steel-200 bg-white px-4 py-2.5 text-sm font-semibold text-steel-600 transition hover:bg-steel-50 dark:border-navy-700 dark:bg-navy-900 dark:text-steel-300 dark:hover:bg-navy-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filter tabs */}
        <div className="inline-flex items-center gap-1 self-start rounded-xl bg-steel-100 dark:bg-navy-900 p-1 border border-steel-200 dark:border-navy-800">
          <Filter className="ml-2 w-3.5 h-3.5 text-steel-500" />
          {(["all", "active", "archived"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition ${
                filterStatus === st
                  ? "bg-white dark:bg-navy-800 text-navy-800 dark:text-steel-100 shadow-xs"
                  : "text-steel-500 hover:text-navy-700 dark:hover:text-steel-200"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Project cards grid */}
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-steel-200 dark:border-navy-700 bg-white dark:bg-navy-900/40 p-12 text-center">
            <FolderClosed className="mx-auto h-10 w-10 text-steel-400" />
            <p className="mt-3 text-sm text-steel-500 dark:text-steel-400">
              {filterStatus === "all"
                ? "No projects yet. Create your first project to get started."
                : `No ${filterStatus} projects.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((p) => (
              <div
                key={p.id}
                className="group flex flex-col gap-2 rounded-2xl border border-steel-200 dark:border-navy-800 bg-white dark:bg-navy-900 p-5 shadow-xs transition hover:border-cyan-550/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px] font-semibold text-steel-500">
                      {p.code}
                    </div>
                    <h3 className="mt-0.5 truncate text-base font-bold text-navy-800 dark:text-steel-100">
                      {p.name}
                    </h3>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${
                      p.status === "active"
                        ? "bg-cyan-soft text-cyan-550 dark:bg-navy-800 dark:text-cyan-450 border border-cyan-100 dark:border-navy-700"
                        : "bg-steel-100 text-steel-600 dark:bg-navy-800 dark:text-steel-400 border border-steel-200 dark:border-navy-700"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>

                {p.engineering_category && (
                  <p className="text-xs font-medium text-steel-500">
                    {p.engineering_category}
                  </p>
                )}
                {p.description && (
                  <p
                    className="line-clamp-2 text-xs text-steel-500 dark:text-steel-400"
                    title={p.description}
                  >
                    {p.description}
                  </p>
                )}
                {p.deadline && (
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-steel-500">
                    <Calendar className="w-3 h-3" />
                    Deadline: {new Date(p.deadline).toLocaleDateString()}
                  </div>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <Link
                    href={`/projects/${p.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-navy-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-navy-600 dark:bg-navy-700 dark:hover:bg-navy-600"
                  >
                    Open <ArrowRight className="w-3 h-3" />
                  </Link>
                  <Link
                    href={`/drawings?project_id=${p.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-steel-200 bg-white px-3 py-2 text-xs font-semibold text-navy-700 transition hover:bg-steel-50 dark:border-navy-700 dark:bg-navy-900 dark:text-steel-300 dark:hover:bg-navy-800"
                  >
                    <FileText className="w-3 h-3" /> Drawings
                  </Link>
                  {canManage && p.status === "active" && (
                    <button
                      onClick={() => handleArchive(p.id)}
                      title="Archive"
                      className="inline-flex items-center justify-center rounded-xl border border-steel-200 bg-white px-2.5 py-2 text-xs font-semibold text-steel-500 transition hover:bg-steel-50 hover:text-rose-500 dark:border-navy-700 dark:bg-navy-900 dark:text-steel-400 dark:hover:bg-navy-800"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
