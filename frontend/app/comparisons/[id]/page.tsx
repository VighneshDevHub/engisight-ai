"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser } from "@/lib/auth";
import { getComparison, type ComparisonSummary, type DiffItem } from "@/lib/comparisons";

const POLL_INTERVAL_MS = 3000;

const CLASSIFICATION_STYLES: Record<string, { label: string; color: string }> = {
  modified: { label: "Modified", color: "bg-amber-100 text-amber-800 border-amber-300" },
  missing: { label: "Missing", color: "bg-red-100 text-red-800 border-red-300" },
  added: { label: "Added", color: "bg-blue-100 text-blue-800 border-blue-300" },
  matching: { label: "Matching", color: "bg-green-100 text-green-800 border-green-300" },
};

const CLASSIFICATION_ORDER = ["modified", "missing", "added", "matching"];

export default function ComparisonDetailPage() {
  const router = useRouter();
  const params = useParams();
  const comparisonId = params.id as string;

  const [authChecked, setAuthChecked] = useState(false);
  const [summary, setSummary] = useState<ComparisonSummary | null>(null);
  const [selectedItem, setSelectedItem] = useState<DiffItem | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const data = await getComparison(comparisonId);
    setSummary(data);
    return data;
  }, [comparisonId]);

  useEffect(() => {
    fetchCurrentUser()
      .then(() => setAuthChecked(true))
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (authChecked) refresh();
  }, [authChecked, refresh]);

  useEffect(() => {
    if (summary?.comparison.status === "processing" && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const updated = await refresh();
        if (updated.comparison.status !== "processing" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [summary?.comparison.status, refresh]);

  if (!authChecked || !summary) return null;

  const { comparison, counts, diff_items } = summary;
  const filteredItems = activeFilter
    ? diff_items.filter((i) => i.classification === activeFilter)
    : diff_items;

  return (
    <main className="mx-auto max-w-6xl p-8">
      <Link href="/comparisons" className="text-sm text-slate-500 underline">
        Back to comparisons
      </Link>

      <div className="mt-4 mb-6 rounded-lg bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Comparison Report</h1>
          <StatusBadge status={comparison.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Created {new Date(comparison.created_at).toLocaleString()}
        </p>

        {comparison.status === "processing" && (
          <p className="mt-3 text-sm text-amber-600">
            Diff engine running (Qdrant fuzzy matching + classification)... this page will
            update automatically.
          </p>
        )}
        {comparison.status === "failed" && (
          <p className="mt-3 text-sm text-red-600">
            Comparison failed — check worker logs for details.
          </p>
        )}

        {comparison.status === "completed" && (
          <div className="mt-4 grid grid-cols-4 gap-3">
            {CLASSIFICATION_ORDER.map((cls) => (
              <button
                key={cls}
                onClick={() => setActiveFilter(activeFilter === cls ? null : cls)}
                className={`rounded-md border px-4 py-3 text-left transition ${
                  CLASSIFICATION_STYLES[cls].color
                } ${activeFilter === cls ? "ring-2 ring-slate-900" : ""}`}
              >
                <div className="text-2xl font-semibold">{counts[cls] || 0}</div>
                <div className="text-xs font-medium">{CLASSIFICATION_STYLES[cls].label}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {comparison.status === "completed" && (
        <div className="grid grid-cols-3 gap-6">
          {/* DiffViewer */}
          <div className="col-span-2 overflow-hidden rounded-lg bg-white shadow">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">Parameter</th>
                  <th className="px-4 py-2">Baseline</th>
                  <th className="px-4 py-2">Revision</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`cursor-pointer border-b last:border-0 hover:bg-slate-50 ${
                      selectedItem?.id === item.id ? "bg-slate-100" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-medium">{item.parameter_name}</td>
                    <td className="px-4 py-2 text-slate-600">{item.baseline_value ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{item.revision_value ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          CLASSIFICATION_STYLES[item.classification].color
                        }`}
                      >
                        {CLASSIFICATION_STYLES[item.classification].label}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                      No items in this category
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* TraceabilityPanel */}
          <div className="rounded-lg bg-white p-5 shadow">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Traceability</h3>
            {selectedItem ? (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-xs uppercase text-slate-400">Explanation</span>
                  <p className="mt-1 text-slate-700">{selectedItem.explanation}</p>
                </div>
                <div>
                  <span className="text-xs uppercase text-slate-400">Match confidence</span>
                  <p className="mt-1 text-slate-700">
                    {(selectedItem.match_confidence * 100).toFixed(0)}%
                  </p>
                </div>
                {selectedItem.baseline_parameter_id && (
                  <div>
                    <span className="text-xs uppercase text-slate-400">Baseline source</span>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      parameter id: {selectedItem.baseline_parameter_id}
                    </p>
                  </div>
                )}
                {selectedItem.revision_parameter_id && (
                  <div>
                    <span className="text-xs uppercase text-slate-400">Revision source</span>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      parameter id: {selectedItem.revision_parameter_id}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Click a row in the diff table to see its full explanation and source
                traceability.
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-slate-200 text-slate-700",
    processing: "bg-amber-100 text-amber-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}
