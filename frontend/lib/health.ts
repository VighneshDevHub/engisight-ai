import { apiClient } from "./api-client";

export interface HealthLiveness {
  status: "ok";
  app: string;
  env: string;
}

export interface HealthReadiness {
  status: "ok" | "degraded";
  checks: {
    database: string;
    redis: string;
    storage: string;
    qdrant: string;
  };
}

export async function fetchHealthLiveness(): Promise<HealthLiveness> {
  const res = await apiClient.get<HealthLiveness>("/api/v1/health");
  return res.data;
}

export async function fetchHealthReadiness(): Promise<HealthReadiness> {
  const res = await apiClient.get<HealthReadiness>("/api/v1/health/ready");
  return res.data;
}
