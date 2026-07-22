import { apiClient } from "./api-client";

export type Drawing = {
  id: string;
  project_code: string;
  drawing_number: string;
  drawing_type: "baseline" | "revision";
  original_filename: string;
  content_type: string;
  file_size_bytes: number;
  status: string;
  uploaded_by: string;
  created_at: string;
};

export async function uploadDrawing(
  projectCode: string,
  drawingNumber: string,
  drawingType: "baseline" | "revision",
  file: File
) {
  const formData = new FormData();
  formData.append("project_code", projectCode);
  formData.append("drawing_number", drawingNumber);
  formData.append("drawing_type", drawingType);
  formData.append("file", file);

  const { data } = await apiClient.post<Drawing>("/drawings/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listDrawings(projectCode?: string) {
  const { data } = await apiClient.get<Drawing[]>("/drawings", {
    params: projectCode ? { project_code: projectCode } : {},
  });
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
