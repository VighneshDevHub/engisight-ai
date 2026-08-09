"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { fetchCurrentUser, logoutUser, type User } from "@/lib/auth";
import {
  LayoutDashboard, FolderKanban, FileText, GitCompare, Workflow,
  ShieldCheck, Calculator, Bot, FileSpreadsheet, BarChart3,
  Bell, Settings, Search, LogOut, ChevronLeft, ChevronRight,
  Plus, Moon, Sun, Shield
} from "lucide-react";
import { GlobalSearchModal } from "./GlobalSearchModal";
import { NotificationsModal } from "./NotificationsModal";
import { ProjectFlowFooter } from "./ProjectFlowFooter";

const NAV_GROUPS = [
  {
    group: "MAIN",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/drawings", label: "Documents", icon: FileText },
    ],
  },
  {
    group: "AI TOOLS",
    items: [
      { href: "/comparisons", label: "AI Analysis", icon: GitCompare },
      { href: "/pid-intelligence", label: "P&ID Intelligence", icon: Workflow },
      { href: "/requirements", label: "Requirements", icon: ShieldCheck },
      { href: "/assistant", label: "AI Assistant", icon: Bot },
    ],
  },
  {
    group: "SYSTEM",
    items: [
      { href: "/reports", label: "Reports", icon: FileSpreadsheet },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/reviews", label: "Reviews", icon: ShieldCheck },
      { href: "/admin", label: "Admin Panel", icon: Shield },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => {
        // Allow public access to login/register pages without redirecting infinitely
        if (pathname !== "/login" && pathname !== "/register") {
          router.push("/login");
        }
      });
  }, [pathname, router]);

  function handleLogout() {
    logoutUser();
    router.push("/login");
  }

  function toggleTheme() {
    setIsDark(!isDark);
    if (!isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  // Hide shell layout on standalone auth screens if requested
  const isAuthPage = pathname === "/login" || pathname === "/register";
  if (isAuthPage) {
    return <div className="min-h-screen bg-navy-900 text-steel-100">{children}</div>;
  }

  const currentPageLabel =
    NAV_GROUPS.flatMap((g) => g.items).find(
      (n) => pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href + "/"))
    )?.label ?? "EngiSight AI";

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${isDark ? "dark bg-navy-950 text-steel-100" : "bg-steel-50 text-navy-800"}`}>

      {/* ── Sidebar ── */}
      <aside
        className={`flex flex-col bg-navy-950 border-r border-navy-800 text-steel-300 transition-all duration-300 shrink-0 z-30 ${
          collapsed ? "w-16" : "w-60"
        }`}
      >
        {/* Brand Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-navy-800/80">
          {!collapsed ? (
            <Link href="/dashboard" className="flex items-center gap-2 text-decoration-none">
              <div className="w-8 h-8 rounded-lg bg-cyan-550 flex items-center justify-center font-bold text-white shadow-md shadow-cyan-550/20">
                E
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-white text-base leading-none tracking-tight">
                  EngiSight<span className="text-cyan-450">.AI</span>
                </span>
                <span className="text-[10px] text-steel-400 font-medium tracking-wide mt-0.5">
                  Engineering Intelligence
                </span>
              </div>
            </Link>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-cyan-550 flex items-center justify-center font-bold text-white mx-auto">
              E
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-md hover:bg-navy-800 text-steel-400 hover:text-steel-200 transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Item Groups */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.group}>
              {!collapsed && (
                <div className="px-3 text-[10px] font-bold text-steel-500 tracking-wider mb-1 uppercase">
                  {group.group}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                        active
                          ? "bg-cyan-550 text-white shadow-sm shadow-cyan-550/30"
                          : "text-steel-400 hover:text-steel-100 hover:bg-navy-800/60"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Card & Logout */}
        {user && !collapsed && (
          <div className="p-3 border-t border-navy-800/80 bg-navy-900/40">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-navy-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {user.full_name?.charAt(0) || "U"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">{user.full_name}</div>
                  <div className="text-[10px] text-steel-400 truncate">{user.email}</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-1 pt-1 border-t border-navy-800/50">
              <span className="text-[10px] font-semibold bg-navy-800 text-steel-300 px-2 py-0.5 rounded capitalize">
                {user.role.replace(/_/g, " ")}
              </span>
              <button
                onClick={handleLogout}
                className="text-[11px] text-steel-400 hover:text-rose-400 flex items-center gap-1 transition-colors"
              >
                <LogOut className="w-3 h-3" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main Layout Area ── */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">

        {/* Topbar */}
        <header className="h-14 px-6 border-b border-steel-200 dark:border-navy-800 bg-white dark:bg-navy-900 flex items-center justify-between shrink-0 z-20 shadow-xs">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-bold text-navy-800 dark:text-steel-100">{currentPageLabel}</h1>
            <span className="hidden sm:inline-block text-xs px-2 py-0.5 rounded bg-cyan-soft text-cyan-550 font-semibold border border-cyan-100 dark:bg-navy-800 dark:text-cyan-450 dark:border-navy-700">
              EngiSight AI Platform · Phase 1
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Search Button Trigger */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Search drawings, equipment, specs...</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-[10px]">
                Ctrl K
              </kbd>
            </button>

            {/* Quick Create Project Button */}
            <Link
              href="/projects"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors text-decoration-none"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Project</span>
            </Link>

            {/* Notifications Trigger */}
            <button
              onClick={() => setIsNotificationsOpen(true)}
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            </button>

            {/* Dark/Light Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Toggle dark/light mode"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 overflow-y-auto p-6 bg-steel-50 dark:bg-navy-950">
          {children}
        </main>

        {/* Project Flow Stepper Footer */}
        <ProjectFlowFooter />
      </div>

      {/* Modals */}
      <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      <NotificationsModal isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} />
    </div>
  );
}
