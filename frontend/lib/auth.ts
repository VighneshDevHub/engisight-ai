import { apiClient } from "./api-client";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

export async function registerUser(email: string, fullName: string, password: string) {
  const { data } = await apiClient.post<User>("/auth/register", {
    email,
    full_name: fullName,
    password,
  });
  return data;
}

export async function loginUser(email: string, password: string) {
  const { data } = await apiClient.post<{ access_token: string; token_type: string }>(
    "/auth/login",
    { email, password }
  );
  window.localStorage.setItem("access_token", data.access_token);
  return data;
}

export async function fetchCurrentUser() {
  const { data } = await apiClient.get<User>("/auth/me");
  return data;
}

export function logoutUser() {
  window.localStorage.removeItem("access_token");
}
