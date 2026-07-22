"use client";

import { useEffect, useState } from "react";
import axios from "axios";

type HealthStatus = {
  status: string;
  checks?: Record<string, string>;
};

export default function HomePage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
    axios
      .get(`${apiBase}/health/ready`)
      .then((res) => setHealth(res.data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Engineering Document AI</h1>
      <p className="text-slate-500">Phase 1 · Step 1 — Scaffolding verification</p>

      {error && (
        <div className="rounded-md bg-red-100 px-4 py-2 text-red-700">
          Backend unreachable: {error}
        </div>
      )}

      {health && (
        <div className="rounded-md bg-white px-6 py-4 shadow">
          <p className="font-medium">
            Overall status:{" "}
            <span className={health.status === "ok" ? "text-green-600" : "text-amber-600"}>
              {health.status}
            </span>
          </p>
          <ul className="mt-2 text-sm text-slate-600">
            {health.checks &&
              Object.entries(health.checks).map(([service, status]) => (
                <li key={service}>
                  {service}: <span className="font-mono">{status}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </main>
  );
}
