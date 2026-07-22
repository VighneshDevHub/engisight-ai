import { apiClient } from "./api-client";

export type ExtractedParameter = {
  id: string;
  drawing_id: string;
  parameter_name: string;
  parameter_value: string;
  unit: string | null;
  confidence: number;
  source_text: string;
  source_page: number | null;
  source_bbox: unknown;
  created_at: string;
};

export async function triggerExtraction(drawingId: string) {
  const { data } = await apiClient.post<{ task_id: string; drawing_id: string; status: string }>(
    `/drawings/${drawingId}/extract`
  );
  return data;
}

export async function listExtractedParameters(drawingId: string) {
  const { data } = await apiClient.get<ExtractedParameter[]>(
    `/drawings/${drawingId}/parameters`
  );
  return data;
}
