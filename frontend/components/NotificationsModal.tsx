"use client";

import { CheckCircle2, AlertTriangle, Clock, FileText, Bell, X, ShieldAlert, Sparkles } from "lucide-react";

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NOTIFICATIONS = [
  {
    id: "1",
    type: "processing_complete",
    title: "AI Processing Complete",
    description: "P&ID_Main_RevA.pdf extracted 45 valves, 12 pumps, and 6 heat exchangers.",
    time: "5 mins ago",
    read: false,
    icon: <Sparkles className="w-4 h-4 text-emerald-500" />,
  },
  {
    id: "2",
    type: "review_required",
    title: "Review Required",
    description: "Missing Safety Relief Valve identified on Vessel V-101 requires engineering sign-off.",
    time: "1 hour ago",
    read: false,
    icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  },
  {
    id: "3",
    type: "new_upload",
    title: "New Revision Uploaded",
    description: "Vighnesh uploaded Revision B for LNG Carrier Drawing GA-Deck-RevB.dwg.",
    time: "3 hours ago",
    read: true,
    icon: <FileText className="w-4 h-4 text-blue-500" />,
  },
  {
    id: "4",
    type: "compliance_warning",
    title: "Compliance Warning",
    description: "Attained EEDI margin for Offshore Platform is below target threshold by 2.3%.",
    time: "1 day ago",
    read: true,
    icon: <ShieldAlert className="w-4 h-4 text-rose-500" />,
  },
  {
    id: "5",
    type: "deadline_reminder",
    title: "Deadline Reminder",
    description: "Engineering Review deadline for Refinery Upgrade is in 2 days.",
    time: "2 days ago",
    read: true,
    icon: <Clock className="w-4 h-4 text-purple-500" />,
  },
];

export function NotificationsModal({ isOpen, onClose }: NotificationsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-start justify-end pt-16 pr-6 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Notifications</h3>
            <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-semibold px-2 py-0.5 rounded-full">
              2 new
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {NOTIFICATIONS.map((n) => (
            <div
              key={n.id}
              className={`p-3.5 flex gap-3 transition-colors ${
                n.read ? "bg-white dark:bg-slate-900" : "bg-blue-50/40 dark:bg-blue-950/20"
              }`}
            >
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0 h-fit">
                {n.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {n.title}
                  </span>
                  <span className="text-[10px] text-slate-400">{n.time}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {n.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-center">
          <button
            onClick={onClose}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Mark all as read
          </button>
        </div>

      </div>
    </div>
  );
}
