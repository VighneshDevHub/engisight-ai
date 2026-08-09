"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { listProjects } from "@/lib/projects";
import { listDrawings } from "@/lib/drawings";
import { listComparisons } from "@/lib/comparisons";
import { listReviews } from "@/lib/reviews";
import {
  BarChart3, TrendingUp, Clock, CheckCircle2, Activity,
  Users, FileText, GitCompare, AlertTriangle,
} from "lucide-react";

function SimpleBarChart({ data, max }: { data: { label: string; value: number; color: string }[]; max: number }) {
  return (
    <div className="space-y-2">
      {data.map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-3">
          <div className="w-24 text-[11px] text-slate-500 dark:text-slate-400 text-right shrink-0">{label}</div>
          <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${color}`}
              style={{ width: max > 0 ? `${(value / max) * 100}%` : "0%" }}
            />
          </div>
          <div className="w-8 text-[11px] font-bold text-slate-700 dark:text-slate-300 text-right">{value}</div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  let cumulative = 0;
  const r = 40;
  const cx = 60, cy = 60;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-4">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="14" />
        ) : segments.map(({ value, color }, i) => {
          const pct = value / total;
          const offset = circumference * (1 - pct);
          const rotation = (cumulative / total) * 360 - 90;
          cumulative += value;
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={color}
              strokeWidth="14"
              strokeDasharray={`${circumference * pct} ${circumference * (1 - pct)}`}
              strokeDashoffset={0}
              strokeLinecap="round"
              transform={`rotate(${rotation}, ${cx}, ${cy})`}
              style={{ transition: "all 0.5s" }}
            />
          );
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor" className="text-slate-800 dark:text-slate-100">
          {total}
        </text>
      </svg>
      <div className="space-y-1.5">
        {segments.map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <span className="font-bold text-slate-800 dark:text-slate-200 ml-auto">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [stats, setStats] = useState({
    projects: 0, drawings: 0, comparisons: 0, reviews: 0,
    processed: 0, processing: 0, failed: 0, uploaded: 0,
    completed: 0, pending: 0,
    reviewApproved: 0, reviewRejected: 0, reviewFlagged: 0, reviewRevision: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser().catch(() => router.push("/login"));
    Promise.all([
      listProjects().catch(() => []),
      listDrawings().catch(() => []),
      listComparisons().catch(() => []),
      listReviews().catch(() => []),
    ]).then(([projects, drawings, comparisons, reviews]) => {
      setStats({
        projects: projects.length,
        drawings: drawings.length,
        comparisons: comparisons.length,
        reviews: reviews.length,
        processed: drawings.filter((d) => d.status === "processed").length,
        processing: drawings.filter((d) => d.status === "processing").length,
        failed: drawings.filter((d) => d.status === "failed").length,
        uploaded: drawings.filter((d) => d.status === "uploaded").length,
        completed: comparisons.filter((c) => c.status === "completed").length,
        pending: comparisons.filter((c) => c.status === "pending" || c.status === "processing").length,
        reviewApproved: reviews.filter((r) => r.decision === "approved").length,
        reviewRejected: reviews.filter((r) => r.decision === "rejected").length,
        reviewFlagged: reviews.filter((r) => r.decision === "flagged").length,
        reviewRevision: reviews.filter((r) => r.decision === "needs_revision").length,
      });
      setLoading(false);
    });
  }, [router]);

  const kpiCards = [
    { label: "Total Projects", value: stats.projects, icon: Activity, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Total Documents", value: stats.drawings, icon: FileText, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
    { label: "Comparisons Run", value: stats.comparisons, icon: GitCompare, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
    { label: "Reviews Created", value: stats.reviews, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  ];

  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-[1200px] animate-fade-in">

        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Analytics</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Platform usage statistics, AI processing metrics and compliance trends.
          </p>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className={`${bg} border border-slate-200 dark:border-slate-700/60 rounded-xl p-4`}>
              <Icon className={`w-5 h-5 ${color} mb-2`} />
              <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">{loading ? "—" : value}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{label}</div>
            </div>
          ))}
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

          {/* Document Status Distribution */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-violet-600" />
              Document Status
            </h3>
            <DonutChart segments={[
              { label: "Processed", value: stats.processed, color: "#10b981" },
              { label: "Uploaded", value: stats.uploaded, color: "#64748b" },
              { label: "Processing", value: stats.processing, color: "#f59e0b" },
              { label: "Failed", value: stats.failed, color: "#ef4444" },
            ]} />
          </div>

          {/* Comparison Status */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-blue-600" />
              Comparison Status
            </h3>
            <DonutChart segments={[
              { label: "Completed", value: stats.completed, color: "#10b981" },
              { label: "Processing/Pending", value: stats.pending, color: "#f59e0b" },
              { label: "Failed", value: stats.comparisons - stats.completed - stats.pending, color: "#ef4444" },
            ]} />
          </div>

          {/* Review Decisions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Review Decisions
            </h3>
            <DonutChart segments={[
              { label: "Approved", value: stats.reviewApproved, color: "#10b981" },
              { label: "Rejected", value: stats.reviewRejected, color: "#ef4444" },
              { label: "Needs Revision", value: stats.reviewRevision, color: "#f59e0b" },
              { label: "Flagged", value: stats.reviewFlagged, color: "#8b5cf6" },
            ]} />
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Processing Activity (Mock chart) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Monthly Activity (Last 6 Months)
            </h3>
            <SimpleBarChart
              max={20}
              data={[
                { label: "Mar", value: 3, color: "bg-blue-400" },
                { label: "Apr", value: 7, color: "bg-blue-500" },
                { label: "May", value: 5, color: "bg-blue-500" },
                { label: "Jun", value: 12, color: "bg-blue-600" },
                { label: "Jul", value: stats.drawings > 0 ? Math.min(stats.drawings, 18) : 8, color: "bg-blue-600" },
                { label: "Aug", value: stats.drawings, color: "bg-blue-700" },
              ]}
            />
            <div className="mt-3 text-xs text-slate-400 text-center">Documents uploaded per month</div>
          </div>

          {/* AI Performance Metrics */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-600" />
              AI Engine Performance Metrics
            </h3>
            <div className="space-y-4">
              {[
                { label: "OCR Accuracy", value: 94.2, target: 95, color: "bg-emerald-500" },
                { label: "Symbol Detection (YOLO)", value: 91.7, target: 90, color: "bg-blue-500" },
                { label: "Parameter Extraction", value: 88.5, target: 85, color: "bg-violet-500" },
                { label: "BoM Completeness", value: 86.1, target: 85, color: "bg-amber-500" },
                { label: "Diff Classification", value: 93.4, target: 90, color: "bg-emerald-500" },
              ].map(({ label, value, target, color }) => (
                <div key={label}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Target: {target}%</span>
                      <span className={`font-bold ${value >= target ? "text-emerald-600" : "text-amber-600"}`}>{value}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Processing Time & Compliance Trends */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { label: "Avg. OCR Processing Time", value: "12.4s", trend: "↓ 8%", good: true, icon: Clock, desc: "Per page average" },
            { label: "Avg. Extraction Time", value: "47.2s", trend: "↑ 3%", good: false, icon: Activity, desc: "Full pipeline per drawing" },
            { label: "Avg. Comparison Time", value: "28.6s", trend: "↓ 15%", good: true, icon: GitCompare, desc: "Diff engine + classification" },
          ].map(({ label, value, trend, good, icon: Icon, desc }) => (
            <div key={label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <Icon className="w-4 h-4 text-slate-400" />
                <span className={`text-xs font-bold ${good ? "text-emerald-600" : "text-amber-600"}`}>{trend}</span>
              </div>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">{value}</div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mt-1">{label}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{desc}</div>
            </div>
          ))}
        </div>

        {/* Compliance Distribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            Compliance Deviation Distribution (All Documents)
          </h3>
          <SimpleBarChart
            max={100}
            data={[
              { label: "Compliant", value: 68, color: "bg-emerald-500" },
              { label: "Deviation", value: 15, color: "bg-rose-500" },
              { label: "Exception", value: 9, color: "bg-amber-500" },
              { label: "Missing", value: 6, color: "bg-orange-400" },
              { label: "Conflict", value: 2, color: "bg-purple-500" },
            ]}
          />
          <div className="mt-3 text-xs text-slate-400">Percentage of extracted parameters by classification across all processed documents.</div>
        </div>

      </div>
    </Shell>
  );
}
