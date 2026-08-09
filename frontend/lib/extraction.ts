import { apiClient } from "./api-client";

export type ExtractedParameter = {
  id: string;
  drawing_id: string;
  extraction_run_id?: string | null;
  parameter_name: string;
  parameter_value: string;
  unit: string | null;
  confidence: number;
  source_text: string;
  source_page: number | null;
  source_bbox: unknown;
  created_at: string;
};

export type ExtractionRun = {
  extraction_run_id: string;
  drawing_id: string;
  run_type: "parameter" | "bom";
  item_count: number;
  created_at: string;
};

export async function triggerExtraction(drawingId: string) {
  const { data } = await apiClient.post<{ task_id: string; drawing_id: string; status: string }>(
    `/drawings/${drawingId}/extract`
  );
  return data;
}

export async function listExtractedParameters(drawingId: string, extractionRunId?: string) {
  const { data } = await apiClient.get<ExtractedParameter[]>(
    `/drawings/${drawingId}/parameters`,
    { params: extractionRunId ? { extraction_run_id: extractionRunId } : {} }
  );
  return data;
}

export async function listExtractionRuns(drawingId: string) {
  const { data } = await apiClient.get<ExtractionRun[]>(`/drawings/${drawingId}/runs`);
  return data;
}

export type BomItem = {
  id: string;
  drawing_id: string;
  extraction_run_id?: string | null;
  component_type: string;
  tag: string | null;
  specification: string | null;
  quantity: number;
  confidence: number;
  source_page: number | null;
  source_bbox: unknown;
  source_crop_note: string | null;
  created_at: string;
};

export type BomSummary = {
  items: BomItem[];
  quantity_by_type: Record<string, number>;
  total_components: number;
};

export async function triggerBomExtraction(drawingId: string) {
  const { data } = await apiClient.post<{ task_id: string; drawing_id: string; status: string }>(
    `/drawings/${drawingId}/extract-bom`
  );
  return data;
}

export async function getBom(drawingId: string, extractionRunId?: string) {
  const { data } = await apiClient.get<BomSummary>(
    `/drawings/${drawingId}/bom`,
    { params: extractionRunId ? { extraction_run_id: extractionRunId } : {} }
  );
  return data;
}

