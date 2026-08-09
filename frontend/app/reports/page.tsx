"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { listComparisons, type Comparison } from "@/lib/comparisons";
import { listDrawings, type Drawing } from "@/lib/drawings";
import {
  FileSpreadsheet, FileText, Download, GitCompare, Activity,
  ShieldCheck, BarChart3, CheckCircle2, Clock,
} from "lucide-react";

type ReportType = "comparison" | "bom" | "compliance" | "review" | "ai_summary";

interface ReportTemplate {
  type: ReportType;
  title: string;
  description: string;
  icon: React.ElementType;
  formats: string[];
  color: string;
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    type: "comparison",
    title: "Engineering Comparison Report",
    description: "Detailed diff report with modified, missing and added parameters. Includes confidence scores and source traceability.",
    icon: GitCompare,
    formats: ["PDF", "Excel", "Word"],
    color: "text-blue-600",
  },
  {
    type: "bom",
    title: "Bill of Materials Report",
    description: "Structured BoM with component quantities, specifications, and P&ID tag numbers extracted by AI.",
    icon: Activity,
    formats: ["PDF", "Excel", "CSV"],
    color: "text-violet-600",
  },
  {
    type: "compliance",
    title: "Compliance & Deviation Report",
    description: "Engineering requirements vs. deviations report with exception classifications and standard references.",
    icon: ShieldCheck,
    formats: ["PDF", "Word"],
    color: "text-rose-600",
  },
  {
    type: "review",
    title: "Engineering Review Report",
    description: "Reviewer decisions, comments and approval status for all AI-extracted parameters and BoM items.",
    icon: CheckCircle2,
    formats: ["PDF", "Excel"],
    color: "text-emerald-600",
  },
  {
    type: "ai_summary",
    title: "AI Extraction Summary",
    description: "OCR accuracy metrics, extraction run statistics, processing time and confidence distribution.",
    icon: BarChart3,
    formats: ["PDF", "Excel"],
    color: "text-amber-600",
  },
];

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  failed: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export default function ReportsPage() {
  const router = useRouter();
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [selectedComparison, setSelectedComparison] = useState("");
  const [selectedDrawing, setSelectedDrawing] = useState("");
  const [generating, setGenerating] = useState(false);
  const [format, setFormat] = useState("PDF");
  const [generated, setGenerated] = useState<{ name: string; format: string; time: Date } | null>(null);

  useEffect(() => {
    fetchCurrentUser().catch(() => router.push("/login"));
    Promise.all([listComparisons().catch(() => []), listDrawings().catch(() => [])]).then(([c, d]) => {
      setComparisons(c);
      setDrawings(d.filter((dr) => dr.status === "processed"));
    });
  }, [router]);

  async function handleGenerate() {
    if (!selectedTemplate) return;
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 2000));
    setGenerated({
      name: `${selectedTemplate.title}_${new Date().toISOString().slice(0, 10)}.${format.toLowerCase()}`,
      format,
      time: new Date(),
    });
    setGenerating(false);
  }

  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-[1200px] animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">AI Reports</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Generate structured engineering reports in PDF, Excel and Word formats.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Report Templates */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Report Templates</h3>
            <div className="space-y-3">
              {REPORT_TEMPLATES.map((template) => {
                const Icon = template.icon;
                const selected = selectedTemplate?.type === template.type;
                return (
                  <button
                    key={template.type}
                    onClick={() => { setSelectedTemplate(template); setFormat(template.formats[0]); setGenerated(null); }}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 shadow-sm"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-2.5 rounded-xl ${selected ? "bg-blue-100 dark:bg-blue-900/40" : "bg-slate-100 dark:bg-slate-800"}`}>
                        <Icon className={`w-5 h-5 ${selected ? "text-blue-600" : template.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{template.title}</span>
                          <div className="flex gap-1 shrink-0">
                            {template.formats.map((f) => (
                              <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">{f}</span>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{template.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuration & Generate */}
          <div className="flex flex-col gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                Configure Report
              </h3>

              {!selectedTemplate ? (
                <p className="text-xs text-slate-400 text-center py-6">Select a report template to configure.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Report Type</label>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      {selectedTemplate.title}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Output Format</label>
                    <div className="flex gap-2">
                      {selectedTemplate.formats.map((f) => (
                        <button
                          key={f}
                          onClick={() => setFormat(f)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-colors ${
                            format === f
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"
                              : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(selectedTemplate.type === "comparison") && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Comparison</label>
                      <select
                        value={selectedComparison}
                        onChange={(e) => setSelectedComparison(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none"
                      >
                        <option value="">Select comparison...</option>
                        {comparisons.map((c) => (
                          <option key={c.id} value={c.id}>
                            {new Date(c.created_at).toLocaleDateString()} — {c.status}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(selectedTemplate.type === "bom" || selectedTemplate.type === "review" || selectedTemplate.type === "ai_summary") && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Drawing</label>
                      <select
                        value={selectedDrawing}
                        onChange={(e) => setSelectedDrawing(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none"
                      >
                        <option value="">Select drawing...</option>
                        {drawings.map((d) => (
                          <option key={d.id} value={d.id}>{d.drawing_number} — {d.project_code}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {generating ? (
                      <><Clock className="w-4 h-4 animate-spin" /> Generating Report...</>
                    ) : (
                      <><FileSpreadsheet className="w-4 h-4" /> Generate {format} Report</>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Generated Report */}
            {generated && (
              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Report Generated</span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 font-mono mb-3 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 break-all">
                  {generated.name}
                </div>
                <button className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors">
                  <Download className="w-3.5 h-3.5" />
                  Download {generated.format}
                </button>
                <p className="text-[10px] text-slate-400 text-center mt-2">
                  Generated at {generated.time.toLocaleTimeString()}
                </p>
              </div>
            )}

            {/* Recent Reports */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">Recent Reports</h4>
              <div className="space-y-2">
                {[
                  { name: "Comparison_Report_2026-08-01.pdf", size: "1.2 MB", ago: "3 days ago" },
                  { name: "BoM_Report_FPSO_2026-07-28.xlsx", size: "456 KB", ago: "1 week ago" },
                  { name: "Compliance_Deviation_RevA.pdf", size: "892 KB", ago: "2 weeks ago" },
                ].map(({ name, size, ago }) => (
                  <div key={name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 group cursor-pointer">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{name}</div>
                      <div className="text-[10px] text-slate-400">{size} · {ago}</div>
                    </div>
                    <Download className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
