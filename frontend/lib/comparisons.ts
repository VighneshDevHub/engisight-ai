import { apiClient } from "./api-client";

export type Comparison = {
  id: string;
  baseline_drawing_id: string;
  revision_drawing_id: string;
  status: string;
  requested_by: string;
  created_at: string;
};

export type DiffItem = {
  id: string;
  comparison_id: string;
  classification: "modified" | "missing" | "added" | "matching";
  parameter_name: string;
  baseline_parameter_id: string | null;
  revision_parameter_id: string | null;
  baseline_value: string | null;
  revision_value: string | null;
  match_confidence: number;
  explanation: string;
  created_at: string;
};

export type ComparisonSummary = {
  comparison: Comparison;
  counts: Record<string, number>;
  diff_items: DiffItem[];
};

export async function createComparison(baselineDrawingId: string, revisionDrawingId: string) {
  const { data } = await apiClient.post<Comparison>("/comparisons", {
    baseline_drawing_id: baselineDrawingId,
    revision_drawing_id: revisionDrawingId,
  });
  return data;
}

export async function getComparison(comparisonId: string) {
  const { data } = await apiClient.get<ComparisonSummary>(`/comparisons/${comparisonId}`);
  return data;
}

export async function listComparisons() {
  const { data } = await apiClient.get<Comparison[]>("/comparisons");
  return data;
}
