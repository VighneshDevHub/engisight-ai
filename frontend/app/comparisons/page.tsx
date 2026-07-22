"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser } from "@/lib/auth";
import { listDrawings, type Drawing } from "@/lib/drawings";
import { createComparison, listComparisons, type Comparison } from "@/lib/comparisons";

export default function ComparisonsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [baselineId, setBaselineId] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then(() => setAuthChecked(true))
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    listDrawings().then(setDrawings);
    listComparisons().then(setComparisons);
  }, [authChecked]);

  const baselineOptions = drawings.filter((d) => d.drawing_type === "baseline");
  const revisionOptions = drawings.filter((d) => d.drawing_type === "revision");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const comparison = await createComparison(baselineId, revisionId);
      router.push(`/comparisons/${comparison.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create comparison");
    } finally {
      setCreating(false);
    }
  }

  if (!authChecked) return null;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Comparisons</h1>
        <Link href="/drawings" className="text-sm text-slate-500 underline">
          Back to drawings
        </Link>
      </div>

      <form onSubmit={handleCreate} className="mb-8 space-y-3 rounded-lg bg-white p-6 shadow">
        <p className="text-sm text-slate-500">
          Both drawings must have status <span className="font-mono">processed</span> (i.e.
          extraction already run — see the drawing detail page) before they can be compared.
        </p>
        <div>
          <label className="block text-sm font-medium text-slate-700">Baseline drawing</label>
          <select
            required
            value={baselineId}
            onChange={(e) => setBaselineId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select a baseline...</option>
            {baselineOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.project_code} · {d.drawing_number} · {d.original_filename} ({d.status})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Revision drawing</label>
          <select
            required
            value={revisionId}
            onChange={(e) => setRevisionId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select a revision...</option>
            {revisionOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.project_code} · {d.drawing_number} · {d.original_filename} ({d.status})
              </option>
            ))}
          </select>
        </div>
        {error && (
          <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <button
          type="submit"
          disabled={creating || !baselineId || !revisionId}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {creating ? "Starting comparison..." : "Compare"}
        </button>
      </form>

      <h2 className="mb-3 text-lg font-medium">Past comparisons</h2>
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-4 py-2">{new Date(c.created_at).toLocaleString()}</td>
                <td className="px-4 py-2 capitalize">{c.status}</td>
                <td className="px-4 py-2">
                  <Link href={`/comparisons/${c.id}`} className="text-slate-900 underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {comparisons.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No comparisons yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
