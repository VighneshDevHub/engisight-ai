"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LogIn, FolderPlus, FileUp, Cpu, GitCompare, ShieldCheck, Calculator, FileSpreadsheet, Archive, Search
} from "lucide-react";

const FLOW_STEPS = [
  { id: 1, name: "1. Login", route: "/login", icon: LogIn },
  { id: 2, name: "2. Create Project", route: "/projects", icon: FolderPlus },
  { id: 3, name: "3. Upload Documents", route: "/drawings", icon: FileUp },
  { id: 4, name: "4. AI Processing", route: "/drawings", icon: Cpu },
  { id: 5, name: "5. Engineering Analysis", route: "/comparisons", icon: GitCompare },
  { id: 6, name: "6. Review & Validate", route: "/reviews", icon: ShieldCheck },
  { id: 7, name: "7. Maritime Suite", route: "/maritime", icon: Calculator },
  { id: 8, name: "8. Generate Reports", route: "/reports", icon: FileSpreadsheet },
  { id: 9, name: "9. Approve & Archive", route: "/projects", icon: Archive },
  { id: 10, name: "10. Traceability", route: "/requirements", icon: Search },
];

export function ProjectFlowFooter() {
  const pathname = usePathname();

  return (
    <div className="bg-slate-900 text-slate-300 border-t border-slate-800 py-2.5 px-4 shrink-0 overflow-x-auto select-none">
      <div className="flex items-center justify-between min-w-max gap-4 text-xs max-w-[1400px] mx-auto">
        <div className="flex items-center gap-1.5 font-semibold text-blue-400 shrink-0 pr-2 border-r border-slate-800">
          <span className="uppercase tracking-wider text-[10px]">PROJECT FLOW</span>
        </div>
        <div className="flex items-center gap-2 flex-1 justify-between">
          {FLOW_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = pathname === step.route || (step.route !== "/" && pathname.startsWith(step.route));
            return (
              <div key={step.id} className="flex items-center gap-2">
                <Link
                  href={step.route}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-[11px] font-medium ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm font-semibold"
                      : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{step.name}</span>
                </Link>
                {idx < FLOW_STEPS.length - 1 && (
                  <span className="text-slate-700 text-xs font-mono">→</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
