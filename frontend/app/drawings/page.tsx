"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser } from "@/lib/auth";
import { uploadDrawing, listDrawings, getDownloadUrl, type Drawing } from "@/lib/drawings";

export default function DrawingsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [projectCode, setProjectCode] = useState("");
  const [drawingNumber, setDrawingNumber] = useState("");
  const [drawingType, setDrawingType] = useState<"baseline" | "revision">("baseline");
  const [file, setFile] = useState<File | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then(() => setAuthChecked(true))
      .catch(() => router.push("/login"));
  }, [router]);

  async function refresh() {
    const data = await listDrawings(projectCode || undefined);
    setDrawings(data);
  }

  useEffect(() => {
    if (authChecked) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await uploadDrawing(projectCode, drawingNumber, drawingType, file);
      setFile(null);
      await refresh();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(id: string) {
    const { url } = await getDownloadUrl(id);
    window.open(url, "_blank");
  }

  if (!authChecked) return null;

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Drawings</h1>
        <div className="flex gap-4">
          <Link href="/comparisons" className="text-sm text-slate-500 underline">
            Comparisons
          </Link>
          <Link href="/dashboard" className="text-sm text-slate-500 underline">
            Back to dashboard
          </Link>
        </div>
      </div>

      <form onSubmit={handleUpload} className="mb-8 space-y-3 rounded-lg bg-white p-6 shadow">
        <div>
          <label className="block text-sm font-medium text-slate-700">Project code</label>
          <input
            required
            value={projectCode}
            onChange={(e) => setProjectCode(e.target.value)}
            placeholder="e.g. PROJ-001"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Drawing number</label>
          <input
            required
            value={drawingNumber}
            onChange={(e) => setDrawingNumber(e.target.value)}
            placeholder="e.g. DWG-100-A"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Type</label>
          <select
            value={drawingType}
            onChange={(e) => setDrawingType(e.target.value as "baseline" | "revision")}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="baseline">Baseline (approved reference)</option>
            <option value="revision">Revision (new, to be compared)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">
            File (PDF, PNG, JPEG, TIFF — max 50MB)
          </label>
          <input
            type="file"
            required
            accept=".pdf,.png,.jpg,.jpeg,.tiff"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
        </div>
        {error && (
          <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <button
          type="submit"
          disabled={uploading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Project</th>
              <th className="px-4 py-2">Drawing #</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">File</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {drawings.map((d) => (
              <tr key={d.id} className="border-b last:border-0">
                <td className="px-4 py-2">{d.project_code}</td>
                <td className="px-4 py-2">{d.drawing_number}</td>
                <td className="px-4 py-2 capitalize">{d.drawing_type}</td>
                <td className="px-4 py-2">{d.status}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => handleDownload(d.id)}
                    className="text-slate-900 underline"
                  >
                    {d.original_filename}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <Link href={`/drawings/${d.id}`} className="text-slate-900 underline">
                    View / Extract
                  </Link>
                </td>
              </tr>
            ))}
            {drawings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No drawings uploaded yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
