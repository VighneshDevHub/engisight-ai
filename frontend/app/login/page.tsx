"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginUser } from "@/lib/auth";
import { Shield, CheckCircle2, Lock, Mail, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginUser(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-navy-950 text-steel-100 font-sans">

      {/* Left branding panel */}
      <div className="hidden lg:flex w-[480px] shrink-0 bg-navy-900 border-r border-navy-800 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-550/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-cyan-550 flex items-center justify-center font-extrabold text-white text-xl shadow-lg shadow-cyan-550/25">
              E
            </div>
            <div>
              <span className="text-xl font-extrabold text-white tracking-tight">
                EngiSight<span className="text-cyan-450">.AI</span>
              </span>
              <div className="text-[11px] text-steel-400 font-medium">
                Engineering Intelligence Platform
              </div>
            </div>
          </div>

          <h1 className="text-3xl font-extrabold text-white leading-tight mb-4">
            Engineering Document Analysis, Powered by AI
          </h1>
          <p className="text-steel-400 text-sm leading-relaxed mb-8">
            Baseline vs revision drawing comparison, P&amp;ID automated BoM
            generation, and requirement deviation detection — every finding
            fully traceable to its exact source location.
          </p>

          <div className="space-y-4">
            {[
              "Drawing comparison: modified / missing / added parameters",
              "P&ID intelligence: BoM + connectivity / flow validation",
              "Requirements deviation analysis with explainable reasoning",
              "Full audit trail: page / bounding box / clause references",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-sm text-steel-300">
                <CheckCircle2 className="w-4 h-4 text-cyan-450 shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 pt-8 border-t border-navy-800 text-xs text-steel-500 flex items-center justify-between">
          <span>Phase 1 · Authentication</span>
          <span className="text-cyan-450 font-semibold">EngiSight AI Platform</span>
        </div>
      </div>

      {/* Right login form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-navy-950">
        <div className="w-full max-w-md bg-navy-900/60 border border-navy-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">

          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-white">Welcome Back</h2>
              <span className="text-xs bg-navy-800 text-cyan-450 border border-navy-700 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                <Shield className="w-3 h-3" /> JWT Auth
              </span>
            </div>
            <p className="text-sm text-steel-400">
              Sign in to your engineering workspace to continue.
            </p>
          </div>

          {error && (
            <div className="bg-rose-950/50 border border-rose-800/70 text-rose-300 text-xs rounded-xl p-3.5 mb-6 flex items-start gap-2">
              <span className="font-bold">Error:</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-steel-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-steel-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-navy-900 border border-navy-700 text-steel-100 placeholder:text-steel-500 text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-cyan-550 focus:ring-1 focus:ring-cyan-550 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-steel-300">Password</label>
                <Link href="#" className="text-xs text-cyan-450 hover:text-cyan-400 transition-colors">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-steel-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-navy-900 border border-navy-700 text-steel-100 placeholder:text-steel-500 text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-cyan-550 focus:ring-1 focus:ring-cyan-550 transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-steel-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-navy-700 bg-navy-900 text-cyan-550 focus:ring-0"
                />
                <span>Remember me for 30 days</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-cyan-550 hover:bg-cyan-450 text-navy-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-cyan-550/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-navy-800 text-center">
            <p className="text-xs text-steel-400 mb-4">
              Enterprise SSO — Google Workspace / Microsoft Entra ID — available on request
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-steel-400">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-cyan-450 font-semibold hover:underline">
              Create an account
            </Link>
          </p>

        </div>
      </div>

    </div>
  );
}
