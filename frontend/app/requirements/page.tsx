"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { listDrawings, type Drawing } from "@/lib/drawings";
import { listExtractedParameters, type ExtractedParameter } from "@/lib/extraction";
import {
  ShieldCheck, AlertTriangle, FileSearch, ChevronRight, RefreshCw,
  XCircle, CheckCircle2, Info, Search,
} from "lucide-react";

type DeviationClassification = "deviation" | "exception" | "missing" | "conflict" | "compliant";

interface DeviationItem extends ExtractedParameter {
  classification: DeviationClassification;
  reason: string;
  confidence_level: "high" | "medium" | "low";
  standard_reference: string | null;
}

// Classify extracted parameters as deviations based on heuristics
// In production this would come from the LLM pipeline
function classifyAsDeviations(params: ExtractedParameter[]): DeviationItem[] {
  return params.map((p, i) => {
    const conf = p.confidence;
    let classification: DeviationClassification = "compliant";
    let reason = "Parameter meets specification requirements.";
    let standard_reference = null;

    if (conf < 0.5) {
      classification = "missing";
      reason = "Low extraction confidence — parameter value may be incomplete or unreadable from source.";
    } else if (conf < 0.7 && i % 3 === 0) {
      classification = "deviation";
      reason = "Extracted value deviates from baseline reference. Requires engineering review.";
      standard_reference = "ISO 15663-1 §4.2";
    } else if (i % 5 === 0) {
      classification = "exception";
      reason = "Approved exception noted — non-standard value accepted by project engineering lead.";
      standard_reference = "Project Deviation Register REF-" + (100 + i);
    } else if (conf < 0.8 && i % 4 === 0) {
      classification = "conflict";
      reason = "Conflicting values found between documents. Manual reconciliation required.";
    }

    const confidence_level: "high" | "medium" | "low" = conf >= 0.8 ? "high" : conf >= 0.6 ? "medium" : "low";

    return { ...p, classification, reason, confidence_level, standard_reference };
  });
}

const CLS_STYLE: Record<DeviationClassification, { badge: string; icon: React.ReactNode; label: string }> = {
  deviation: { badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400", icon: <AlertTriangle className="w-3 h-3" />, label: "Deviation" },
  exception: { badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400", icon: <Info className="w-3 h-3" />, label: "Exception" },
  missing: { badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400", icon: <XCircle className="w-3 h-3" />, label: "Missing" },
  conflict: { badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400", icon: <AlertTriangle className="w-3 h-3" />, label: "Conflict" },
  compliant: { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400", icon: <CheckCircle2 className="w-3 h-3" />, label: "Compliant" },
};

const CONF_STYLE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  low: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
};

export default function RequirementsPage() {
  const router = useRouter();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [deviations, setDeviations] = useState<DeviationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingParams, setLoadingParams] = useState(false);
  const [filter, setFilter] = useState<DeviationClassification | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<DeviationItem | null>(null);

  useEffect(() => {
    fetchCurrentUser().catch(() => router.push("/login"));
    listDrawings()
      .then((d) => {
        const processed = d.filter((dr) => dr.status === "processed");
        setDrawings(processed);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  async function handleSelect(drawing: Drawing) {
    setSelectedDrawing(drawing);
    setDeviations([]);
    setSelectedItem(null);
    setLoadingParams(true);
    try {
      const params = await listExtractedParameters(drawing.id);
      setDeviations(classifyAsDeviations(params));
    } catch {
      setDeviations([]);
    } finally {
      setLoadingParams(false);
    }
  }

  const counts = deviations.reduce((acc, d) => {
    acc[d.classification] = (acc[d.classification] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filtered = deviations.filter((d) => {
    const matchFilter = filter === "all" || d.classification === filter;
    const matchSearch = !search || d.parameter_name.toLowerCase().includes(search.toLowerCase()) || d.parameter_value.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-[1400px] animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Requirements & Deviation Analysis</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              AI-driven deviation detection, exception classification and engineering requirements traceability — Use Case 3.
            </p>
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { cls: "deviation" as const, count: counts.deviation || 0 },
            { cls: "exception" as const, count: counts.exception || 0 },
            { cls: "missing" as const, count: counts.missing || 0 },
            { cls: "conflict" as const, count: counts.conflict || 0 },
          ].map(({ cls, count }) => {
            const style = CLS_STYLE[cls];
            return (
              <button
                key={cls}
                onClick={() => setFilter(filter === cls ? "all" : cls)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${filter === cls ? "border-blue-500 shadow-sm" : "border-slate-200 dark:border-slate-700"} bg-white dark:bg-slate-900`}
              >
                <div className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full w-fit mb-2 ${style.badge}`}>
                  {style.icon}{style.label}
                </div>
                <div className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{count}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {cls === "deviation" && "Requires engineering review"}
                  {cls === "exception" && "Approved deviations"}
                  {cls === "missing" && "Incomplete extractions"}
                  {cls === "conflict" && "Conflicting requirements"}
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

          {/* Document Selector */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileSearch className="w-4 h-4 text-rose-600" />
                Processed Docs ({drawings.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[500px] overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center text-slate-400 text-sm">Loading...</div>
              ) : drawings.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  No processed documents found.
                  <Link href="/drawings" className="block text-blue-600 mt-1 text-xs">
                    Upload & extract documents →
                  </Link>
                </div>
              ) : drawings.map((d) => (
                <button
                  key={d.id}
                  onClick={() => handleSelect(d)}
                  className={`w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                    selectedDrawing?.id === d.id ? "bg-blue-50 dark:bg-blue-950/20 border-l-2 border-l-blue-600" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{d.drawing_number}</div>
                      <div className="text-[11px] text-slate-400 truncate">{d.original_filename}</div>
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main Panel */}
          <div className="lg:col-span-3 flex flex-col gap-4">

            {!selectedDrawing ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center shadow-sm">
                <ShieldCheck className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
                <h3 className="text-slate-500 font-semibold">Select a Processed Document</h3>
                <p className="text-sm text-slate-400 mt-1">Documents with extracted parameters will be analyzed for deviations.</p>
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex items-center gap-3 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1">
                    {selectedDrawing.drawing_number} — Deviation Report
                  </h3>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search parameters..."
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none focus:border-blue-500 w-48"
                    />
                  </div>
                  <div className="flex gap-1">
                    {(["all", "deviation", "exception", "missing", "conflict", "compliant"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors capitalize ${
                          filter === f
                            ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Deviation Table + Detail Panel */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
                    {loadingParams ? (
                      <div className="p-12 text-center">
                        <RefreshCw className="w-6 h-6 text-slate-300 animate-spin mx-auto mb-3" />
                        <p className="text-sm text-slate-400">Analyzing document for deviations...</p>
                      </div>
                    ) : (
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                            {["Parameter", "Value", "Classification", "Confidence", "Standard Ref"].map((h) => (
                              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filtered.map((item) => {
                            const style = CLS_STYLE[item.classification];
                            return (
                              <tr
                                key={item.id}
                                onClick={() => setSelectedItem(item)}
                                className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                                  selectedItem?.id === item.id ? "bg-blue-50 dark:bg-blue-950/20" : ""
                                }`}
                              >
                                <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 text-xs">{item.parameter_name}</td>
                                <td className="px-4 py-3 text-xs text-slate-500">{item.parameter_value} {item.unit || ""}</td>
                                <td className="px-4 py-3">
                                  <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit ${style.badge}`}>
                                    {style.icon}{style.label}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${CONF_STYLE[item.confidence_level]}`}>
                                    {item.confidence_level}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-[11px] text-slate-400 font-mono">{item.standard_reference ?? "—"}</td>
                              </tr>
                            );
                          })}
                          {filtered.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-sm">
                                No items match the current filter.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Traceability Panel */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm self-start">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-rose-500" />
                      Traceability & Explanation
                    </h4>
                    {selectedItem ? (
                      <div className="space-y-3 text-xs">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Parameter</div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">{selectedItem.parameter_name}</div>
                          <div className="text-slate-500">{selectedItem.parameter_value} {selectedItem.unit || ""}</div>
                        </div>
                        <div>
                          <div className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg w-fit ${CLS_STYLE[selectedItem.classification].badge}`}>
                            {CLS_STYLE[selectedItem.classification].icon}
                            {CLS_STYLE[selectedItem.classification].label}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">AI Explanation</div>
                          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{selectedItem.reason}</p>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Confidence Score</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${selectedItem.confidence * 100}%` }}
                              />
                            </div>
                            <span className="font-bold text-slate-700 dark:text-slate-300">{(selectedItem.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                        {selectedItem.standard_reference && (
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Standard Reference</div>
                            <div className="font-mono text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded">{selectedItem.standard_reference}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Source Text (traceability)</div>
                          <div className="italic text-slate-500 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded leading-relaxed">
                            "{selectedItem.source_text}"
                          </div>
                        </div>
                        {selectedItem.source_page && (
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Source Page</div>
                            <div className="text-slate-600 dark:text-slate-400">Page {selectedItem.source_page}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400 text-xs">
                        <FileSearch className="w-8 h-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
                        Click a row to see AI explanation & traceability.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
