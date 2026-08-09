"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, type User } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { listProjects } from "@/lib/projects";
import { listDrawings } from "@/lib/drawings";
import { listComparisons } from "@/lib/comparisons";
import { listReviews } from "@/lib/reviews";
import {
  FolderKanban, FileText, GitCompare, ShieldCheck, Clock, CheckCircle2,
  TrendingUp, Cpu, ArrowRight, Activity, AlertTriangle, CircleDot,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState({
    projects: 0, drawings: 0, comparisons: 0, processed: 0,
    reviews: 0, pendingReviews: 0, processing: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser()
      .then(async (u) => {
        setUser(u);
        const [projects, drawings, comparisons, reviews] = await Promise.all([
          listProjects().catch(() => []),
          listDrawings().catch(() => []),
          listComparisons().catch(() => []),
          listReviews().catch(() => []),
        ]);
        setStats({
          projects: projects.length,
          drawings: drawings.length,
          comparisons: comparisons.length,
          processed: drawings.filter((d) => d.status === "processed").length,
          reviews: reviews.length,
          pendingReviews: 0,
          processing: drawings.filter((d) => d.status === "processing").length,
        });
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  const topStats = [
    { label: "Total Projects", value: stats.projects, icon: FolderKanban, color: "blue", href: "/projects" },
    { label: "Total Documents", value: stats.drawings, icon: FileText, color: "violet", href: "/drawings" },
    { label: "AI Comparisons", value: stats.comparisons, icon: GitCompare, color: "amber", href: "/comparisons" },
    { label: "Processed Files", value: stats.processed, icon: CheckCircle2, color: "emerald", href: "/drawings" },
    { label: "Reviews Created", value: stats.reviews, icon: ShieldCheck, color: "rose", href: "/reviews" },
    { label: "Active Processing", value: stats.processing, icon: Cpu, color: "orange", href: "/drawings" },
  ];

  const colorMap: Record<string, { bg: string; text: string; icon: string; border: string }> = {
    blue:    { bg: "bg-blue-50 dark:bg-blue-950/30",   text: "text-blue-700 dark:text-blue-400",   icon: "text-blue-600",   border: "border-t-blue-500" },
    violet:  { bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-400", icon: "text-violet-600", border: "border-t-violet-500" },
    amber:   { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", icon: "text-amber-600",   border: "border-t-amber-500" },
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", icon: "text-emerald-600", border: "border-t-emerald-500" },
    rose:    { bg: "bg-rose-50 dark:bg-rose-950/30",   text: "text-rose-700 dark:text-rose-400",   icon: "text-rose-600",   border: "border-t-rose-500" },
    orange:  { bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-400", icon: "text-orange-600", border: "border-t-orange-500" },
  };

  const quickActions = [
    { href: "/projects", label: "New Project", desc: "Create & manage engineering projects", icon: FolderKanban, color: "bg-blue-600" },
    { href: "/drawings", label: "Upload Document", desc: "Add drawings for AI analysis", icon: FileText, color: "bg-violet-600" },
    { href: "/comparisons", label: "Compare Drawings", desc: "AI-powered deviation detection", icon: GitCompare, color: "bg-amber-600" },
    { href: "/pid-intelligence", label: "P&ID Intelligence", desc: "Extract components & BoM", icon: Activity, color: "bg-emerald-600" },
    { href: "/requirements", label: "Deviation Analysis", desc: "Requirements & exception detection", icon: AlertTriangle, color: "bg-rose-600" },
    { href: "/reviews", label: "Engineering Reviews", desc: "Review and approve AI findings", icon: ShieldCheck, color: "bg-indigo-600" },
  ];

  const workflow = [
    { n: "01", title: "Create Project", desc: "Organize documents by project, assign team & deadlines." },
    { n: "02", title: "Upload Documents", desc: "Upload PDFs/images as Baseline, Revision or P&ID." },
    { n: "03", title: "Run AI Extraction", desc: "OCR + YOLO + LLM pipeline extracts engineering parameters." },
    { n: "04", title: "Compare & Detect", desc: "Automated diff engine flags modified, missing, added items." },
    { n: "05", title: "Review & Approve", desc: "Engineers review AI findings with traceability to source." },
    { n: "06", title: "Generate Reports", desc: "Export structured PDF/Excel engineering reports." },
  ];

  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-[1200px] animate-fade-in">

        {/* Welcome Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-navy-700 dark:text-steel-100">
              {loading ? "Loading..." : `Welcome back${user ? `, ${user.full_name.split(" ")[0]}` : ""}`}
            </h2>
            <p className="text-sm text-steel-500 mt-0.5">
              EngiSight AI — engineering document analysis: drawing comparison, P&ID intelligence & deviation detection.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <CircleDot className="w-3 h-3 text-emerald-500" />
            <span>System Online</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="capitalize text-blue-600 dark:text-blue-400 font-semibold">{user?.role?.replace(/_/g, " ")}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {topStats.map(({ label, value, icon: Icon, color, href }) => {
            const c = colorMap[color];
            return (
              <Link
                key={label}
                href={href}
                className={`${c.bg} border border-t-4 ${c.border} border-slate-200 dark:border-slate-700/50 rounded-xl p-4 hover:shadow-md transition-all group`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-5 h-5 ${c.icon}`} />
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
                <div className={`text-2xl font-extrabold ${c.text}`}>{loading ? "—" : value}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{label}</div>
              </Link>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Quick Actions</h3>
            <span className="text-xs text-slate-400">Start a workflow</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {quickActions.map(({ href, label, desc, icon: Icon, color }) => (
              <Link
                key={href}
                href={href}
                className="flex flex-col gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition-all group"
              >
                <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center`}>
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">{label}</span>
                <span className="text-[11px] text-slate-400 leading-tight">{desc}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Two-column row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Workflow Steps */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Engineering Workflow</h3>
            </div>
            <div className="space-y-3">
              {workflow.map(({ n, title, desc }) => (
                <div key={n} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center">
                    {n}
                  </span>
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{title}</span>
                    <span className="text-[11px] text-slate-400 ml-2">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Modules Overview */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-violet-600" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">AI Engine Modules</h3>
            </div>
            <div className="space-y-2.5">
              {[
                { name: "OCR Engine", desc: "PaddleOCR multi-modal text extraction with bounding boxes", status: "active" },
                { name: "Region Proposal", desc: "OpenCV heuristic pre-filtering (solidity/aspect/fill ratio)", status: "active" },
                { name: "LLM Parameter Extraction", desc: "Groq Llama 3.3 70B — structured output with traceability", status: "active" },
                { name: "Diff Engine", desc: "Qdrant fuzzy matching + classification per extraction_run_id", status: "active" },
                { name: "P&ID Vision Recognition", desc: "Groq Qwen 3.6 27B vision, reasoning_effort=none for classification", status: "active" },
                { name: "Requirements Deviation", desc: "Sentence-Transformer embeddings + explainable reasoning", status: "active" },
              ].map(({ name, desc, status }) => (
                <div key={name} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{desc}</div>
                  </div>
                  <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 capitalize">
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Use Case Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: "Engineering Drawing Comparison",
              description: "Upload baseline + revision drawings. AI detects modified dimensions, missing components, symbol changes and text differences with full traceability.",
              href: "/comparisons",
              gradient: "from-blue-600 to-blue-800",
              icon: GitCompare,
            },
            {
              title: "P&ID Intelligence & BoM",
              description: "AI extracts pumps, valves, tanks, instruments and more. Auto-generates Bills of Materials with quantity comparison and connectivity validation.",
              href: "/pid-intelligence",
              gradient: "from-violet-600 to-violet-800",
              icon: Activity,
            },
            {
              title: "Requirements & Deviation",
              description: "Extracts specifications and standards from documents. Identifies deviations, exceptions and conflicts with explainable AI reasoning.",
              href: "/requirements",
              gradient: "from-rose-600 to-rose-800",
              icon: AlertTriangle,
            },
          ].map(({ title, description, href, gradient, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`bg-gradient-to-br ${gradient} text-white rounded-xl p-5 hover:shadow-lg transition-all group`}
            >
              <Icon className="w-6 h-6 mb-3 opacity-90" />
              <h4 className="font-bold text-sm mb-1.5">{title}</h4>
              <p className="text-xs opacity-80 leading-relaxed mb-3">{description}</p>
              <div className="flex items-center gap-1 text-xs font-semibold opacity-90 group-hover:opacity-100">
                <span>Open Module</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>

      </div>
    </Shell>
  );
}
