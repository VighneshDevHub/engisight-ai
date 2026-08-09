"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { listDrawings, type Drawing } from "@/lib/drawings";
import { getBom, triggerBomExtraction, type BomItem, type BomSummary } from "@/lib/extraction";
import {
  Activity, Cpu, Layers, CheckCircle2, AlertTriangle, Zap,
  RefreshCw, ChevronRight, BarChart2,
} from "lucide-react";

const COMPONENT_ICONS: Record<string, string> = {
  Pump: "🔄",
  Valve: "🔧",
  Tank: "🛢️",
  Pipe: "〰️",
  Instrument: "📊",
  "Heat Exchanger": "♨️",
  Compressor: "💨",
  Motor: "⚡",
  Generator: "🔌",
  Vessel: "⚙️",
};

const STATUS_STYLE: Record<string, string> = {
  uploaded: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  processed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  failed: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
};

export default function PidIntelligencePage() {
  const router = useRouter();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [bom, setBom] = useState<BomSummary | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  useEffect(() => {
    fetchCurrentUser()
      .catch(() => router.push("/login"));
    listDrawings()
      .then((d) => {
        const pids = d.filter((dr) => dr.drawing_type === "pid");
        setDrawings(pids);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  async function selectDrawing(drawing: Drawing) {
    setSelectedDrawing(drawing);
    setBom(null);
    setError(null);
    if (drawing.status === "processed") {
      try {
        const data = await getBom(drawing.id);
        setBom(data);
      } catch {
        // no bom yet
      }
    }
  }

  async function handleExtract() {
    if (!selectedDrawing) return;
    setTriggering(true);
    setError(null);
    try {
      await triggerBomExtraction(selectedDrawing.id);
      setSelectedDrawing({ ...selectedDrawing, status: "processing" });
      // Poll for completion
      const poll = setInterval(async () => {
        const updated = await listDrawings();
        const found = updated.find((d) => d.id === selectedDrawing.id);
        if (found && found.status !== "processing") {
          clearInterval(poll);
          setSelectedDrawing(found);
          if (found.status === "processed") {
            const data = await getBom(found.id);
            setBom(data);
          }
          setTriggering(false);
        }
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Extraction failed");
      setTriggering(false);
    }
  }

  const allTypes = bom ? Object.keys(bom.quantity_by_type) : [];
  const filteredItems = bom?.items.filter((i) =>
    activeFilter === "all" || i.component_type === activeFilter
  ) ?? [];

  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-[1400px] animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">P&ID Intelligence</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              AI-powered P&ID component extraction, BoM generation and connectivity validation — Use Case 2.
            </p>
          </div>
          <Link
            href="/drawings"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Cpu className="w-3.5 h-3.5" />
            Upload P&ID
          </Link>
        </div>

        {/* AI Capability Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: "🔄", label: "Pumps & Compressors", desc: "Centrifugal, reciprocating, rotating" },
            { icon: "🔧", label: "Valves & Controls", desc: "Gate, ball, check, control valves" },
            { icon: "🛢️", label: "Tanks & Vessels", desc: "Storage, pressure vessels, reactors" },
            { icon: "📊", label: "Instruments & Sensors", desc: "FT, PT, TT, flow meters, analyzers" },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-2xl mb-2">{icon}</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Drawing Selector */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-600" />
                P&ID Drawings ({drawings.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-slate-400 text-sm">Loading drawings...</div>
              ) : drawings.length === 0 ? (
                <div className="p-8 text-center">
                  <Activity className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No P&ID drawings found.</p>
                  <Link href="/drawings" className="text-xs text-blue-600 mt-2 block">
                    Upload a P&ID drawing →
                  </Link>
                </div>
              ) : drawings.map((d) => (
                <button
                  key={d.id}
                  onClick={() => selectDrawing(d)}
                  className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                    selectedDrawing?.id === d.id ? "bg-blue-50 dark:bg-blue-950/20 border-l-2 border-l-blue-600" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{d.drawing_number}</div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">{d.original_filename}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{d.project_code}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[d.status] || STATUS_STYLE.uploaded}`}>
                        {d.status}
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-300" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main Analysis Panel */}
          <div className="lg:col-span-2 flex flex-col gap-5">

            {!selectedDrawing ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center shadow-sm">
                <Activity className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
                <h3 className="text-slate-500 font-semibold">Select a P&ID Drawing</h3>
                <p className="text-sm text-slate-400 mt-1">Choose a drawing from the list to run component extraction.</p>
              </div>
            ) : (
              <>
                {/* Drawing Header */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100">{selectedDrawing.original_filename}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{selectedDrawing.project_code} · {selectedDrawing.drawing_number}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${STATUS_STYLE[selectedDrawing.status]}`}>
                        {selectedDrawing.status}
                      </span>
                      <button
                        onClick={handleExtract}
                        disabled={triggering || selectedDrawing.status === "processing"}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {triggering ? (
                          <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Processing...</>
                        ) : (
                          <><Zap className="w-3.5 h-3.5" /> {selectedDrawing.status === "processed" ? "Re-run Extraction" : "Run BoM Extraction"}</>
                        )}
                      </button>
                    </div>
                  </div>
                  {error && (
                    <div className="mt-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 rounded-lg">{error}</div>
                  )}
                  {selectedDrawing.status === "processing" && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      AI extraction pipeline running... page auto-refreshes every 3 seconds.
                    </div>
                  )}
                </div>

                {/* BoM Summary Cards */}
                {bom && bom.total_components > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(bom.quantity_by_type).slice(0, 8).map(([type, qty]) => (
                      <button
                        key={type}
                        onClick={() => setActiveFilter(activeFilter === type ? "all" : type)}
                        className={`p-3 rounded-xl border-2 transition-all text-left ${
                          activeFilter === type
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300"
                        }`}
                      >
                        <div className="text-2xl mb-1">{COMPONENT_ICONS[type] || "⚙️"}</div>
                        <div className="text-xl font-extrabold text-slate-900 dark:text-slate-100">{qty}</div>
                        <div className="text-[11px] text-slate-500 font-medium">{type}</div>
                      </button>
                    ))}
                    <div className="p-3 rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 flex flex-col justify-center items-center">
                      <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400">{bom.total_components}</div>
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-500 font-semibold">Total Components</div>
                    </div>
                  </div>
                )}

                {/* BoM Table */}
                {bom && bom.items.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-violet-600" />
                        Bill of Materials
                        <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded-full font-semibold">
                          {filteredItems.length} items
                        </span>
                      </h4>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Filter:</span>
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => setActiveFilter("all")}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${activeFilter === "all" ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
                          >All</button>
                          {allTypes.map((t) => (
                            <button
                              key={t}
                              onClick={() => setActiveFilter(t)}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${activeFilter === t ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
                            >{t}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                            {["Type", "Tag", "Specification", "Qty", "Confidence", "Page", "Status"].map((h) => (
                              <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredItems.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span>{COMPONENT_ICONS[item.component_type] || "⚙️"}</span>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{item.component_type}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">{item.tag ?? "—"}</td>
                              <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">{item.specification ?? "—"}</td>
                              <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200 text-xs">{item.quantity}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-emerald-500"
                                      style={{ width: `${item.confidence * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] text-slate-500">{(item.confidence * 100).toFixed(0)}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-400">{item.source_page ?? "—"}</td>
                              <td className="px-4 py-3">
                                <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="w-3 h-3" /> Extracted
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {bom && bom.items.length === 0 && selectedDrawing.status === "processed" && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center shadow-sm">
                    <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No components extracted yet</p>
                    <p className="text-xs text-slate-400 mt-1">Click "Run BoM Extraction" to start the AI pipeline.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
