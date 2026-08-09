"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser, type User } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { apiClient } from "@/lib/api-client";
import {
  Settings, User as UserIcon, Lock, Bell, Palette,
  Shield, CheckCircle2, Save, Eye, EyeOff,
} from "lucide-react";

type SettingsTab = "profile" | "security" | "notifications" | "appearance";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState({
    processingComplete: true,
    reviewRequired: true,
    newUpload: false,
    deadlineReminder: true,
    complianceWarning: true,
    systemAlerts: true,
  });
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  useEffect(() => {
    fetchCurrentUser()
      .then((u) => { setUser(u); setFullName(u.full_name); })
      .catch(() => router.push("/login"));
  }, [router]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(null);
    if (newPassword.length < 8) { setPwdError("New password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPwdError("Passwords do not match."); return; }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setTimeout(() => setSaved(false), 3000);
  }

  const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: "profile", label: "Profile", icon: UserIcon },
    { id: "security", label: "Security", icon: Lock },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "appearance", label: "Appearance", icon: Palette },
  ];

  if (!user) return null;

  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-[900px] animate-fade-in">

        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Settings</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage your account, security and platform preferences.</p>
        </div>

        <div className="flex gap-6">
          {/* Sidebar Nav */}
          <div className="w-48 shrink-0">
            <nav className="space-y-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    tab === id
                      ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">

            {/* Profile */}
            {tab === "profile" && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-blue-600" />
                  Profile Information
                </h3>

                {/* Avatar */}
                <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white font-extrabold text-2xl flex items-center justify-center shadow-md">
                    {user.full_name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">{user.full_name}</div>
                    <div className="text-sm text-slate-500">{user.email}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 font-semibold capitalize">
                        {user.role.replace(/_/g, " ")}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
                      <input
                        type="email"
                        disabled
                        value={user.email}
                        className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-500 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Role (read-only)</label>
                    <div className="px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-500 capitalize">
                      {user.role.replace(/_/g, " ")} — Contact your admin to change role.
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-60"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                    {saved && (
                      <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-semibold">
                        <CheckCircle2 className="w-4 h-4" /> Saved!
                      </span>
                    )}
                  </div>
                </form>
              </div>
            )}

            {/* Security */}
            {tab === "security" && (
              <div className="space-y-5">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-600" />
                    Change Password
                  </h3>
                  {pwdError && (
                    <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 rounded-lg mb-4">{pwdError}</div>
                  )}
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    {[
                      { label: "Current Password", value: currentPassword, setter: setCurrentPassword },
                      { label: "New Password", value: newPassword, setter: setNewPassword },
                      { label: "Confirm New Password", value: confirmPassword, setter: setConfirmPassword },
                    ].map(({ label, value, setter }) => (
                      <div key={label}>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
                        <div className="relative">
                          <input
                            type={showPwd ? "text" : "password"}
                            required
                            minLength={8}
                            value={value}
                            onChange={(e) => setter(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500 pr-10"
                          />
                          <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-3 text-slate-400">
                            {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-3 pt-2">
                      <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-60">
                        <Lock className="w-4 h-4" />
                        {saving ? "Updating..." : "Update Password"}
                      </button>
                      {saved && <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-semibold"><CheckCircle2 className="w-4 h-4" /> Updated!</span>}
                    </div>
                  </form>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-violet-600" />
                    Security Overview
                  </h3>
                  <div className="space-y-3">
                    {[
                      { label: "JWT Authentication", status: "active", desc: "60-minute token expiry with auto-refresh" },
                      { label: "Password Hashing", status: "active", desc: "bcrypt with salt rounds" },
                      { label: "HTTPS", status: "active", desc: "TLS encryption on all traffic" },
                      { label: "Rate Limiting", status: "active", desc: "API endpoints protected against abuse" },
                      { label: "Multi-Factor Authentication", status: "coming_soon", desc: "TOTP/SMS — planned for next release" },
                    ].map(({ label, status, desc }) => (
                      <div key={label} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <div>
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{desc}</div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          status === "active"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                        }`}>
                          {status === "active" ? "Active" : "Coming Soon"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Notifications */}
            {tab === "notifications" && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-600" />
                  Notification Preferences
                </h3>
                <div className="space-y-1">
                  {[
                    { key: "processingComplete" as const, label: "AI Processing Complete", desc: "When document extraction or comparison finishes" },
                    { key: "reviewRequired" as const, label: "Review Required", desc: "When a parameter or BoM item needs engineering review" },
                    { key: "newUpload" as const, label: "New Document Upload", desc: "When a team member uploads a drawing" },
                    { key: "deadlineReminder" as const, label: "Project Deadline Reminder", desc: "48-hour and 24-hour reminders before deadlines" },
                    { key: "complianceWarning" as const, label: "Compliance Warning", desc: "EEDI/deviation threshold alerts" },
                    { key: "systemAlerts" as const, label: "System Alerts", desc: "Platform downtime, maintenance windows" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between py-3.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <div>
                        <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                      </div>
                      <button
                        onClick={() => setNotifications((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${notifications[key] ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${notifications[key] ? "translate-x-4.5 ml-0.5" : "ml-0.5"}`} />
                      </button>
                    </div>
                  ))}
                </div>
                <button className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                  <Save className="w-4 h-4" />
                  Save Preferences
                </button>
              </div>
            )}

            {/* Appearance */}
            {tab === "appearance" && (
              <div className="space-y-5">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
                    <Palette className="w-4 h-4 text-violet-600" />
                    Theme
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {(["light", "dark", "system"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setTheme(t);
                          if (t === "dark") document.documentElement.classList.add("dark");
                          else if (t === "light") document.documentElement.classList.remove("dark");
                        }}
                        className={`p-4 rounded-xl border-2 transition-all capitalize text-sm font-semibold ${
                          theme === t
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"
                            : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                        }`}
                      >
                        <div className="text-2xl mb-1.5">{t === "light" ? "☀️" : t === "dark" ? "🌙" : "⚙️"}</div>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">Display Density</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {(["comfortable", "compact"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDensity(d)}
                        className={`p-4 rounded-xl border-2 transition-all capitalize text-sm font-semibold ${
                          density === d
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400"
                            : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        <div className="text-xl mb-1.5">{d === "comfortable" ? "📐" : "🗜️"}</div>
                        {d}
                        <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                          {d === "comfortable" ? "More spacing, easier to read" : "Denser rows, more data visible"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
