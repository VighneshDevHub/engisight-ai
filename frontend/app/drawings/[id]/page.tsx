"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, type User } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { getDrawing, type Drawing } from "@/lib/drawings";
import {
  triggerExtraction, listExtractedParameters, triggerBomExtraction, getBom, listExtractionRuns,
  type ExtractedParameter, type BomSummary, type ExtractionRun,
} from "@/lib/extraction";
import { createReview, getLatestReviewsBatch, type Review } from "@/lib/reviews";

const POLL_MS = 3000;

const STATUS_PILL: Record<string, React.CSSProperties> = {
  uploaded: { background: "#f1f5f9", color: "#475569" },
  processing: { background: "#fffbeb", color: "#d97706" },
  processed: { background: "#dcfce7", color: "#15803d" },
  failed: { background: "#fef2f2", color: "#dc2626" },
};

const DECISION_STYLE: Record<string, React.CSSProperties> = {
  approved: { background: "#dcfce7", color: "#15803d" },
  rejected: { background: "#fef2f2", color: "#dc2626" },
  needs_revision: { background: "#fffbeb", color: "#d97706" },
  flagged: { background: "#faf5ff", color: "#7c3aed" },
};

const btn: React.CSSProperties = {
  background: "#0f172a", color: "#fff", border: "none",
  padding: "9px 20px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
};

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px",
  padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

export default function DrawingDetailPage() {
  const router = useRouter();
  const { id: drawingId } = useParams() as { id: string };
  const [user, setUser] = useState<User | null>(null);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("latest");
  const [parameters, setParameters] = useState<ExtractedParameter[]>([]);
  const [bom, setBom] = useState<BomSummary | null>(null);
  const [reviewsMap, setReviewsMap] = useState<Record<string, Review | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPid = drawing?.drawing_type === "pid";

  const loadData = useCallback(async (runIdTarget?: string) => {
    const d = await getDrawing(drawingId);
    setDrawing(d);

    const runList = await listExtractionRuns(drawingId).catch(() => []);
    setRuns(runList);

    const runId = runIdTarget && runIdTarget !== "latest" ? runIdTarget : undefined;

    if (d.drawing_type === "pid") {
      const bData = await getBom(drawingId, runId);
      setBom(bData);
      const ids = bData.items.map((i) => i.id);
      if (ids.length > 0) {
        const revBatch = await getLatestReviewsBatch("bom_item", ids, runId).catch(() => null);
        if (revBatch) setReviewsMap(revBatch.reviews_by_entity_id);
      } else {
        setReviewsMap({});
      }
    } else {
      const pData = await listExtractedParameters(drawingId, runId);
      setParameters(pData);
      const ids = pData.map((p) => p.id);
      if (ids.length > 0) {
        const revBatch = await getLatestReviewsBatch("extracted_parameter", ids, runId).catch(() => null);
        if (revBatch) setReviewsMap(revBatch.reviews_by_entity_id);
      } else {
        setReviewsMap({});
      }
    }
    return d;
  }, [drawingId]);

  useEffect(() => {
    fetchCurrentUser().then((u) => {
      setUser(u);
      loadData("latest");
    }).catch(() => router.push("/login"));
  }, [router, loadData]);

  useEffect(() => {
    if (drawing?.status === "processing" && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const updated = await loadData(selectedRunId);
        if (updated.status !== "processing" && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, POLL_MS);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [drawing?.status, selectedRunId, loadData]);

  async function handleExtract() {
    setError(null);
    setTriggering(true);
    try {
      if (isPid) await triggerBomExtraction(drawingId);
      else await triggerExtraction(drawingId);
      setSelectedRunId("latest");
      await loadData("latest");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to trigger extraction");
    } finally {
      setTriggering(false);
    }
  }

  async function handleReviewSubmit(entityType: "extracted_parameter" | "bom_item", entityId: string, decision: string, comment?: string) {
    const activeRunId = selectedRunId !== "latest" ? selectedRunId : undefined;
    await createReview({
      entity_type: entityType,
      entity_id: entityId,
      extraction_run_id: activeRunId,
      decision,
      comment,
    });
    await loadData(selectedRunId);
  }

  if (!user || !drawing) return null;

  const canReview = ["admin", "engineering_manager", "reviewer", "engineer"].includes(user.role);

  return (
    <Shell>
      <div style={{ maxWidth: "1100px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Breadcrumb */}
        <div style={{ fontSize: "13px", color: "#64748b" }}>
          <Link href="/drawings" style={{ color: "#64748b", textDecoration: "none" }}>Drawings</Link>
          <span style={{ margin: "0 6px" }}>/</span>
          <span style={{ color: "#0f172a", fontWeight: 600 }}>{drawing.drawing_number}</span>
        </div>

        {/* Drawing header */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{drawing.original_filename}</h2>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                {drawing.project_code} · {drawing.drawing_number} · <span style={{ textTransform: "capitalize" }}>{drawing.drawing_type === "pid" ? "P&ID" : drawing.drawing_type}</span>
              </p>
            </div>
            <span style={{ fontSize: "11px", fontWeight: 600, padding: "4px 12px", borderRadius: "20px", textTransform: "capitalize", ...(STATUS_PILL[drawing.status] || STATUS_PILL.uploaded) }}>
              {drawing.status}
            </span>
          </div>
          <div style={{ marginTop: "16px", display: "flex", gap: "12px", alignItems: "center" }}>
            <button onClick={handleExtract} disabled={triggering || drawing.status === "processing"} style={{ ...btn, opacity: (triggering || drawing.status === "processing") ? 0.6 : 1 }}>
              {drawing.status === "processing" ? "Processing..." :
               drawing.status === "processed" ? (isPid ? "Re-run BoM Extraction" : "Re-run Extraction") :
               (isPid ? "Run BoM Extraction" : "Run AI Extraction")}
            </button>
            {error && <span style={{ fontSize: "13px", color: "#dc2626" }}>{error}</span>}
          </div>
        </div>

        {/* Extraction Runs Listing & Selector */}
        {runs.length > 0 && (
          <div style={{ ...card, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>Extraction Runs History ({runs.length})</span>
              <span style={{ fontSize: "12px", color: "#64748b" }}>Filter display by historical run</span>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() => { setSelectedRunId("latest"); loadData("latest"); }}
                style={{
                  padding: "6px 14px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  background: selectedRunId === "latest" ? "#0f172a" : "#fff",
                  color: selectedRunId === "latest" ? "#fff" : "#475569",
                }}
              >
                Latest Run
              </button>
              {runs.map((r, idx) => {
                const active = selectedRunId === r.extraction_run_id;
                return (
                  <button
                    key={r.extraction_run_id}
                    onClick={() => { setSelectedRunId(r.extraction_run_id); loadData(r.extraction_run_id); }}
                    style={{
                      padding: "6px 14px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", cursor: "pointer",
                      background: active ? "#0f172a" : "#fff",
                      color: active ? "#fff" : "#475569",
                    }}
                  >
                    Run #{runs.length - idx} ({r.item_count} items - {new Date(r.created_at).toLocaleTimeString()})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Extracted data */}
        {isPid ? (
          <BomView bom={bom} status={drawing.status} reviewsMap={reviewsMap} canReview={canReview} onReview={handleReviewSubmit} />
        ) : (
          <ParametersView parameters={parameters} status={drawing.status} reviewsMap={reviewsMap} canReview={canReview} onReview={handleReviewSubmit} />
        )}
      </div>
    </Shell>
  );
}

function ParametersView({
  parameters, status, reviewsMap, canReview, onReview,
}: {
  parameters: ExtractedParameter[];
  status: string;
  reviewsMap: Record<string, Review | null>;
  canReview: boolean;
  onReview: (type: "extracted_parameter", id: string, decision: string, comment?: string) => Promise<void>;
}) {
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<string>("approved");
  const [reviewComment, setReviewComment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
          Extracted Parameters {parameters.length > 0 && `(${parameters.length})`}
        </h3>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            {["Parameter", "Value", "Unit", "Confidence", "Source (traceability)", "Page", "Review Status", "Action"].map((h) => (
              <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parameters.map((p, i) => {
            const currentRev = reviewsMap[p.id];
            const isEditingThis = activeReviewId === p.id;
            return (
              <tr key={p.id} style={{ borderBottom: i < parameters.length - 1 ? "1px solid #f1f5f9" : "none", verticalAlign: "top" }}>
                <td style={{ padding: "10px 16px", fontWeight: 600, color: "#0f172a" }}>{p.parameter_name}</td>
                <td style={{ padding: "10px 16px", color: "#334155" }}>{p.parameter_value}</td>
                <td style={{ padding: "10px 16px", color: "#64748b" }}>{p.unit ?? "—"}</td>
                <td style={{ padding: "10px 16px", color: "#334155" }}>{(p.confidence * 100).toFixed(0)}%</td>
                <td style={{ padding: "10px 16px", color: "#94a3b8", fontStyle: "italic", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{p.source_text}"</td>
                <td style={{ padding: "10px 16px", color: "#64748b" }}>{p.source_page ?? "—"}</td>
                <td style={{ padding: "10px 16px" }}>
                  {currentRev ? (
                    <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", textTransform: "capitalize", ...(DECISION_STYLE[currentRev.decision] || {}) }}>
                      {currentRev.decision.replace(/_/g, " ")}
                    </span>
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: "11px" }}>Pending</span>
                  )}
                </td>
                <td style={{ padding: "10px 16px" }}>
                  {canReview && (
                    isEditingThis ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "#f8fafc", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                        <select value={reviewDecision} onChange={(e) => setReviewDecision(e.target.value)} style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "4px" }}>
                          <option value="approved">Approve</option>
                          <option value="rejected">Reject</option>
                          <option value="needs_revision">Needs Revision</option>
                          <option value="flagged">Flag</option>
                        </select>
                        <input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Comment (optional)" style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "4px", border: "1px solid #cbd5e1" }} />
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            disabled={submitting}
                            onClick={async () => {
                              setSubmitting(true);
                              await onReview("extracted_parameter", p.id, reviewDecision, reviewComment);
                              setSubmitting(false);
                              setActiveReviewId(null);
                              setReviewComment("");
                            }}
                            style={{ background: "#0f172a", color: "#fff", border: "none", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}
                          >
                            Save
                          </button>
                          <button onClick={() => setActiveReviewId(null)} style={{ background: "#fff", border: "1px solid #cbd5e1", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setActiveReviewId(p.id); setReviewDecision(currentRev?.decision || "approved"); setReviewComment(currentRev?.comment || ""); }} style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                        {currentRev ? "Edit Review" : "Review"}
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
          {parameters.length === 0 && (
            <tr><td colSpan={8} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
              {status === "processing" ? "Extraction in progress..." : "No parameters extracted yet — click \"Run AI Extraction\""}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function BomView({
  bom, status, reviewsMap, canReview, onReview,
}: {
  bom: BomSummary | null;
  status: string;
  reviewsMap: Record<string, Review | null>;
  canReview: boolean;
  onReview: (type: "bom_item", id: string, decision: string, comment?: string) => Promise<void>;
}) {
  const items = bom?.items ?? [];
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<string>("approved");
  const [reviewComment, setReviewComment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {bom && Object.keys(bom.quantity_by_type).length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px" }}>
          {Object.entries(bom.quantity_by_type).map(([type, qty]) => (
            <div key={type} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px" }}>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>{qty}</div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{type}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>Bill of Materials {items.length > 0 && `(${bom?.total_components} components)`}</h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              {["Component Type", "Tag", "Specification", "Qty", "Confidence", "Page", "Review Status", "Action"].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const currentRev = reviewsMap[item.id];
              const isEditingThis = activeReviewId === item.id;
              return (
                <tr key={item.id} style={{ borderBottom: i < items.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  <td style={{ padding: "10px 16px", fontWeight: 600, color: "#0f172a" }}>{item.component_type}</td>
                  <td style={{ padding: "10px 16px", color: "#64748b" }}>{item.tag ?? "—"}</td>
                  <td style={{ padding: "10px 16px", color: "#64748b" }}>{item.specification ?? "—"}</td>
                  <td style={{ padding: "10px 16px", color: "#334155" }}>{item.quantity}</td>
                  <td style={{ padding: "10px 16px", color: "#334155" }}>{(item.confidence * 100).toFixed(0)}%</td>
                  <td style={{ padding: "10px 16px", color: "#64748b" }}>{item.source_page ?? "—"}</td>
                  <td style={{ padding: "10px 16px" }}>
                    {currentRev ? (
                      <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", textTransform: "capitalize", ...(DECISION_STYLE[currentRev.decision] || {}) }}>
                        {currentRev.decision.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span style={{ color: "#94a3b8", fontSize: "11px" }}>Pending</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    {canReview && (
                      isEditingThis ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "#f8fafc", padding: "8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                          <select value={reviewDecision} onChange={(e) => setReviewDecision(e.target.value)} style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "4px" }}>
                            <option value="approved">Approve</option>
                            <option value="rejected">Reject</option>
                            <option value="needs_revision">Needs Revision</option>
                            <option value="flagged">Flag</option>
                          </select>
                          <input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Comment (optional)" style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "4px", border: "1px solid #cbd5e1" }} />
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              disabled={submitting}
                              onClick={async () => {
                                setSubmitting(true);
                                await onReview("bom_item", item.id, reviewDecision, reviewComment);
                                setSubmitting(false);
                                setActiveReviewId(null);
                                setReviewComment("");
                              }}
                              style={{ background: "#0f172a", color: "#fff", border: "none", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}
                            >
                              Save
                            </button>
                            <button onClick={() => setActiveReviewId(null)} style={{ background: "#fff", border: "1px solid #cbd5e1", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", cursor: "pointer" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setActiveReviewId(item.id); setReviewDecision(currentRev?.decision || "approved"); setReviewComment(currentRev?.comment || ""); }} style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                          {currentRev ? "Edit Review" : "Review"}
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={8} style={{ padding: "48px 16px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
                {status === "processing" ? "BoM extraction in progress..." : "No components recognized yet — click \"Run BoM Extraction\""}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
