import { apiClient } from "./api-client";

export type Project = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "archived" | string;
  engineering_category: string | null;
  deadline: string | null;
  created_by: string;
  created_at: string;
};

export type ProjectMember = {
  project_id: string;
  user_id: string;
  role: string;
  added_by: string;
  added_at: string;
};

export type ProjectCreate = {
  code: string;
  name: string;
  description?: string;
  engineering_category?: string;
  deadline?: string;
};

export type ProjectUpdate = Partial<{
  name: string;
  description: string;
  engineering_category: string;
  deadline: string;
  status: string;
}>;

export async function listProjects() {
  const { data } = await apiClient.get<Project[]>("/projects");
  return data;
}

export async function createProject(payload: ProjectCreate) {
  const { data } = await apiClient.post<Project>("/projects", payload);
  return data;
}

export async function getProject(projectId: string) {
  const { data } = await apiClient.get<Project>(`/projects/${projectId}`);
  return data;
}

export async function updateProject(projectId: string, payload: ProjectUpdate) {
  const { data } = await apiClient.patch<Project>(`/projects/${projectId}`, payload);
  return data;
}

export async function archiveProject(projectId: string) {
  const { data } = await apiClient.post<Project>(`/projects/${projectId}/archive`);
  return data;
}

export async function listProjectMembers(projectId: string) {
  const { data } = await apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`);
  return data;
}

export async function addProjectMember(projectId: string, userId: string, role = "member") {
  const { data } = await apiClient.post<ProjectMember>(`/projects/${projectId}/members`, {
    user_id: userId,
    role,
  });
  return data;
}

export async function removeProjectMember(projectId: string, userId: string) {
  await apiClient.delete(`/projects/${projectId}/members/${userId}`);
}
