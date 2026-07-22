"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchCurrentUser, logoutUser, type User } from "@/lib/auth";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => {
        setError("Not authenticated");
        router.push("/login");
      });
  }, [router]);

  function handleLogout() {
    logoutUser();
    router.push("/login");
  }

  if (error) return null; // redirecting

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {user ? (
        <div className="rounded-md bg-white px-6 py-4 shadow">
          <p>
            Signed in as <span className="font-medium">{user.full_name}</span>
          </p>
          <p className="text-sm text-slate-500">
            {user.email} · role: {user.role}
          </p>
          <div className="mt-4 flex gap-3">
            <Link href="/drawings" className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white">
              Go to Drawings
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm"
            >
              Log out
            </button>
          </div>
        </div>
      ) : (
        <p className="text-slate-500">Loading...</p>
      )}
    </main>
  );
}
