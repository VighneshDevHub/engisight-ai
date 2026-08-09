"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerUser, loginUser } from "@/lib/auth";
import { CheckCircle2, ArrowRight, Mail, Lock, User, AlertTriangle } from "lucide-react";

const PASSWORD_RULES = [
  { rx: /[A-Z]/, label: "Uppercase letter (A–Z)" },
  { rx: /[a-z]/, label: "Lowercase letter (a–z)" },
  { rx: /\d/, label: "Digit (0–9)" },
  { rx: /[^A-Za-z0-9]/, label: "Symbol (e.g. !@#$%^&*)" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const progress = PASSWORD_RULES.filter((r) => r.rx.test(password)).length;
  const meetsComplexity = progress >= 3;
  const meetsLength = password.length >= 8 && password.length <= 128;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!meetsLength || !meetsComplexity) {
      setError(
        "Password must be 8+ characters and contain 3 of the 4 classes: uppercase, lowercase, digit, symbol."
      );
      return;
    }

    setLoading(true);
    try {
      await registerUser(email, fullName, password);
      await loginUser(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-navy-950 text-steel-100 font-sans">
      {/* Left branding panel */}
      <div className="hidden lg:flex w-[480px] shrink-0 bg-navy-900 border-r border-navy-800 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-navy-600/20 rounded-full blur-3xl pointer-events-none" />
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
            Join the Engineering Intelligence Platform
          </h1>
          <p className="text-steel-400 text-sm leading-relaxed mb-8">
            Create your account to access AI-powered drawing comparison,
            P&amp;ID component extraction, and engineering deviation analysis
            with full source traceability.
          </p>

          <div className="space-y-4">
            {[
              "Baseline vs revision parameter comparison (diff engine)",
              "P&ID intelligence: BoM + quantity / spec comparison",
              "Requirements analysis with explainable deviation reasoning",
              "Project-based RBAC + full audit trail",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-sm text-steel-300">
                <CheckCircle2 className="w-4 h-4 text-cyan-450 shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 pt-8 border-t border-navy-800 text-xs text-steel-500 flex items-center justify-between">
          <span>Phase 1 · User Registration</span>
          <span className="text-cyan-450 font-semibold">JWT Secured</span>
        </div>
      </div>

      {/* Right register form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-navy-950">
        <div className="w-full max-w-md bg-navy-900/60 border border-navy-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-1">Create Account</h2>
            <p className="text-sm text-steel-400">
              Set up your engineering workspace in seconds.
            </p>
          </div>

          {error && (
            <div className="bg-rose-950/50 border border-rose-800/70 text-rose-300 text-xs rounded-xl p-3.5 mb-6 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">Registration error</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-steel-300 mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-steel-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full bg-navy-900 border border-navy-700 text-steel-100 placeholder:text-steel-500 text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-cyan-550 focus:ring-1 focus:ring-cyan-550 transition-all"
                />
              </div>
            </div>

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
                <span className="text-[11px] text-steel-400">
                  {progress}/4 classes · {meetsLength ? "length OK" : "8–128 chars"}
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-steel-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full bg-navy-900 border border-navy-700 text-steel-100 placeholder:text-steel-500 text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-cyan-550 focus:ring-1 focus:ring-cyan-550 transition-all"
                />
              </div>

              {/* Complexity checklist — matches backend `validate_password_complexity` */}
              <ul className="mt-2.5 grid grid-cols-2 gap-y-1 gap-x-3">
                {PASSWORD_RULES.map(({ rx, label }) => {
                  const ok = rx.test(password);
                  return (
                    <li
                      key={label}
                      className={`flex items-center gap-1.5 text-[11px] ${
                        ok ? "text-cyan-450" : "text-steel-500"
                      }`}
                    >
                      {ok ? (
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                      ) : (
                        <span className="w-3 h-3 rounded-full border border-current shrink-0" />
                      )}
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ul>

              {/* Progress bar — 3 of 4 = passing (meetsComplexity) */}
              <div className="mt-2.5 h-1.5 w-full rounded-full bg-navy-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    meetsComplexity && meetsLength ? "bg-cyan-550" : "bg-navy-500"
                  }`}
                  style={{ width: `${Math.min(100, (progress / 3) * 100)}%` }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-cyan-550 hover:bg-cyan-450 text-navy-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-cyan-550/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span>Creating account...</span>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-steel-400">
            Already have an account?{" "}
            <Link href="/login" className="text-cyan-450 font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
