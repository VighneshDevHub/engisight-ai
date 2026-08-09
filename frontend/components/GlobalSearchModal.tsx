"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, X, FileText, Folder, Tag, Cpu, ShieldAlert, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { listProjects, type Project } from "@/lib/projects";
import { listDrawings, type Drawing } from "@/lib/drawings";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SearchResult = {
  type: "project" | "drawing" | "equipment" | "requirement" | "report";
  title: string;
  category: string;
  id: string;
  href: string;
};

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const buildResults = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const [projects, drawings] = await Promise.all([
        listProjects().catch(() => [] as Project[]),
        listDrawings().catch(() => [] as Drawing[]),
      ]);

      const all: SearchResult[] = [
        ...projects.map((p): SearchResult => ({
          type: "project",
          title: p.name,
          category: `${p.code} · ${p.engineering_category || "Project"}`,
          id: p.id,
          href: `/projects/${p.id}`,
        })),
        ...drawings.map((d): SearchResult => ({
          type: "drawing",
          title: d.original_filename,
          category: `${d.project_code} · ${d.drawing_type.toUpperCase()} · ${d.status}`,
          id: d.id,
          href: `/drawings/${d.id}`,
        })),
      ];

      const filtered = q.trim()
        ? all.filter((r) =>
            r.title.toLowerCase().includes(q.toLowerCase()) ||
            r.category.toLowerCase().includes(q.toLowerCase())
          )
        : all.slice(0, 12);

      setResults(filtered);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    buildResults(query);
  }, [isOpen, query, buildResults]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredResults = activeFilter === "all"
    ? results
    : results.filter((r) => r.type === activeFilter);

  const getIcon = (type: string) => {
    switch (type) {
      case "project": return <Folder className="w-4 h-4 text-blue-500" />;
      case "drawing": return <FileText className="w-4 h-4 text-emerald-500" />;
      case "equipment": return <Cpu className="w-4 h-4 text-amber-500" />;
      case "requirement": return <ShieldAlert className="w-4 h-4 text-rose-500" />;
      case "report": return <FileSpreadsheet className="w-4 h-4 text-purple-500" />;
      default: return <Tag className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center pt-20 px-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">

        {/* Input header */}
        <div className="flex items-center px-4 border-b border-slate-200 dark:border-slate-800 py-3 gap-3">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, drawings, equipment tags, requirements..."
            className="flex-1 bg-transparent text-slate-900 dark:text-slate-100 text-sm outline-none placeholder:text-slate-400"
          />
          {loading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />}
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1 px-4 py-2 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-xs overflow-x-auto">
          {[
            { id: "all", label: "All Results" },
            { id: "project", label: "Projects" },
            { id: "drawing", label: "Drawings" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                activeFilter === tab.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredResults.length > 0 ? (
            filteredResults.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={item.href}
                onClick={onClose}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors shrink-0">
                    {getIcon(item.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{item.category}</div>
                  </div>
                </div>
                <span className="text-xs text-slate-400 group-hover:text-blue-500 font-mono shrink-0 ml-3">
                  View →
                </span>
              </Link>
            ))
          ) : (
            <div className="p-8 text-center text-slate-400 text-sm">
              {query ? `No results found for "${query}".` : "Start typing to search..."}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px]">ESC</kbd>
            <span>to close</span>
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px]">Ctrl K</kbd>
            <span>to toggle</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-blue-600 dark:text-blue-400">EngiSight AI</span>
            <span>· Global Search</span>
          </div>
        </div>

      </div>
    </div>
  );
}
