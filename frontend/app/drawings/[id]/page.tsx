"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser } from "@/lib/auth";
import { getDrawing, type Drawing } from "@/lib/drawings";
import { triggerExtraction, listExtractedParameters, type ExtractedParameter } from "@/lib/extraction";

const POLL_INTERVAL_MS = 3000;

export default function DrawingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const drawingId = params.id as string;

  const [authChecked, setAuthChecked] = useState(false);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [parameters, setParameters] = useState<ExtractedParameter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const [d, params_] = await Promise.all([
      getDrawing(drawingId),
      listExtractedParameters(drawingId),
    ]);
    setDrawing(d);
    setParameters(params_);
    return d;
  }, [drawingId]);

  useEffect(() => {
    fetchCurrentUser()
      .then(() => setAuthChecked(true))
      .catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    refresh();
  }, [authChecked, refresh]);

  // Poll while processing, so the page updates automatically once the
  // Celery worker finishes without the user needing to refresh manually.
  useEffect(() => {
    if (drawing?.status === "processing" && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const updated = await refresh();
        if (updated.status !== "processing" && pollRef.current) {
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
  }, [drawing?.status, refresh]);

  async function handleExtract() {
    setError(null);
    setTriggering(true);
    try {
      await triggerExtraction(drawingId);
      await refresh();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to trigger extraction");
    } finally {
      setTriggering(false);
    }
  }

  if (!authChecked || !drawing) return null;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href="/drawings" className="text-sm text-slate-500 underline">
        Back to drawings
      </Link>

      <div className="mt-4 mb-6 rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">{drawing.original_filename}</h1>
        <p className="text-sm text-slate-500">
          {drawing.project_code} · {drawing.drawing_number} ·{" "}
          <span className="capitalize">{drawing.drawing_type}</span>
        </p>
        <div className="mt-3 flex items-center gap-3">
          <StatusBadge status={drawing.status} />
          <button
            onClick={handleExtract}
            disabled={triggering || drawing.status === "processing"}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {drawing.status === "processing"
              ? "Processing..."
              : drawing.status === "processed"
              ? "Re-run extraction"
              : "Run extraction"}
          </button>
        </div>
        {error && (
          <div className="mt-3 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
      </div>

      <h2 className="mb-3 text-lg font-medium">
        Extracted parameters {parameters.length > 0 && `(${parameters.length})`}
      </h2>
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Parameter</th>
              <th className="px-4 py-2">Value</th>
              <th className="px-4 py-2">Unit</th>
              <th className="px-4 py-2">Confidence</th>
              <th className="px-4 py-2">Source (traceability)</th>
              <th className="px-4 py-2">Page</th>
            </tr>
          </thead>
          <tbody>
            {parameters.map((p) => (
              <tr key={p.id} className="border-b align-top last:border-0">
                <td className="px-4 py-2 font-medium">{p.parameter_name}</td>
                <td className="px-4 py-2">{p.parameter_value}</td>
                <td className="px-4 py-2">{p.unit ?? "—"}</td>
                <td className="px-4 py-2">{(p.confidence * 100).toFixed(0)}%</td>
                <td className="px-4 py-2 text-slate-500">"{p.source_text}"</td>
                <td className="px-4 py-2">{p.source_page ?? "—"}</td>
              </tr>
            ))}
            {parameters.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {drawing.status === "processing"
                    ? "Extraction in progress..."
                    : "No parameters extracted yet — click \"Run extraction\""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    uploaded: "bg-slate-200 text-slate-700",
    processing: "bg-amber-100 text-amber-700",
    processed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${colors[status] || colors.uploaded}`}>
      {status}
    </span>
  );
}
