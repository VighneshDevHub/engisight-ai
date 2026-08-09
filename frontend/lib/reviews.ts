import { apiClient } from "./api-client";

export type Review = {
  id: string;
  entity_type: "extracted_parameter" | "bom_item" | "diff_item";
  entity_id: string;
  extraction_run_id: string | null;
  decision: string;
  comment: string | null;
  reviewer_id: string;
  created_at: string;
};

export type ReviewCreate = {
  entity_type: "extracted_parameter" | "bom_item" | "diff_item";
  entity_id: string;
  extraction_run_id?: string;
  decision: string;
  comment?: string;
};

export type LatestReviewBatchResponse = {
  entity_type: string;
  reviews_by_entity_id: Record<string, Review | null>;
};

export async function createReview(payload: ReviewCreate) {
  const { data } = await apiClient.post<Review>("/reviews", payload);
  return data;
}

export async function listReviews(params?: {
  entity_type?: string;
  entity_id?: string;
  extraction_run_id?: string;
  limit?: number;
}) {
  const { data } = await apiClient.get<Review[]>("/reviews", { params });
  return data;
}

export async function getLatestReviewsBatch(
  entityType: string,
  entityIds: string[],
  extractionRunId?: string
) {
  const { data } = await apiClient.post<LatestReviewBatchResponse>("/reviews/latest", {
    entity_type: entityType,
    entity_ids: entityIds,
    extraction_run_id: extractionRunId,
  });
  return data;
}
