import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EngiSight AI – Engineering Document Analysis",
  description:
    "AI-powered engineering document analysis platform for drawing comparison, P&ID intelligence, and requirements deviation analysis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
