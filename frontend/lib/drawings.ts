import { apiClient } from "./api-client";

export type DrawingType = "baseline" | "revision" | "pid" | "requirements";
export type DrawingStatus = "uploaded" | "processing" | "processed" | "failed";

export type Drawing = {
  id: string;
  project_code: string;
  project_id: string | null;
  drawing_number: string;
  drawing_type: DrawingType;
  original_filename: string;
  content_type: string;
  file_size_bytes: number;
  sha256: string;
  status: DrawingStatus;
  uploaded_by: string;
  created_at: string;
};

export async function uploadDrawing(
  projectCode: string,
  drawingNumber: string,
  drawingType: DrawingType,
  file: File,
  opts?: { projectId?: string }
) {
  const formData = new FormData();
  if (opts?.projectId) {
    formData.append("project_id", opts.projectId);
  } else {
    formData.append("project_code", projectCode);
  }
  formData.append("drawing_number", drawingNumber);
  formData.append("drawing_type", drawingType);
  formData.append("file", file);

  const { data } = await apiClient.post<Drawing>("/drawings/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listDrawings(projectCode?: string, projectId?: string) {
  const params: Record<string, string> = {};
  if (projectCode) params.project_code = projectCode;
  if (projectId) params.project_id = projectId;
  const { data } = await apiClient.get<Drawing[]>("/drawings", { params });
  return data;
}

export async function getDrawing(drawingId: string) {
  const { data } = await apiClient.get<Drawing>(`/drawings/${drawingId}`);
  return data;
}

export async function getDownloadUrl(drawingId: string) {
  const { data } = await apiClient.get<{ url: string; expires_in_seconds: number }>(
    `/drawings/${drawingId}/download-url`
  );
  return data;
}

export async function deleteDrawing(drawingId: string) {
  await apiClient.delete(`/drawings/${drawingId}`);
}

