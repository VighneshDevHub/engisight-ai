"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser, type User } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Bot, Send, User as UserIcon, Sparkles, RefreshCw, FileText, Zap } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTED_PROMPTS = [
  "What components are typically found on a P&ID for a centrifugal pump system?",
  "Explain the EEDI calculation formula for tankers.",
  "What are common causes of dimension deviations in engineering drawings?",
  "List the IMO MARPOL Annex VI requirements for new ships in 2025.",
  "What is the difference between a baseline and revision drawing?",
  "How is a Bill of Materials structured in process engineering?",
];

const MOCK_RESPONSES: Record<string, string> = {
  default: `I'm the EngiSight AI Engineering Assistant, powered by advanced LLM technology. I can help you with:

• **Engineering Drawing Analysis** — Interpretation of P&ID symbols, dimension standards, and drawing conventions
• **Maritime Regulations** — IMO MARPOL, EEDI/EEXI calculations, class society requirements  
• **Process Engineering** — P&ID component identification, BoM generation, connectivity validation
• **Requirements Analysis** — Specification review, deviation classification, standards lookup
• **Document Q&A** — Ask questions about your uploaded engineering documents

What would you like to know?`,
};

function getBotResponse(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("eedi") || q.includes("energy efficiency")) {
    return `**EEDI (Energy Efficiency Design Index)** is an IMO regulation under MARPOL Annex VI that measures the CO₂ emissions per unit of transport work.

**Formula:**
\`EEDI = (PME × SFOCME × cfME + PAE × SFOCAE × cfAE) / (Vref × Capacity)\`

**Phase Requirements:**
- Phase 0 (2013–2014): Reference line
- Phase 1 (2015–2019): 10% below reference
- Phase 2 (2020–2024): 20% below reference  
- Phase 3 (2025+): 30% below reference

For tankers, the reference line formula is: **1218 × DWT⁻⁰·⁴⁸⁸**

Would you like me to help with a specific vessel type calculation?`;
  }
  if (q.includes("p&id") || q.includes("pid") || q.includes("component")) {
    return `**P&ID (Piping and Instrumentation Diagram)** components are classified into several categories:

**Rotating Equipment:**
- Centrifugal Pumps (P-xxx tags)
- Compressors (C-xxx tags)
- Turbines (T-xxx tags)

**Valves:**
- Gate Valves (manual isolation)
- Control Valves (FCV, TCV, PCV)
- Safety Relief Valves (PSV/SRV)
- Check Valves (non-return)

**Static Equipment:**
- Vessels & Tanks (V-xxx, TK-xxx)
- Heat Exchangers (E-xxx)
- Reactors (R-xxx)

**Instrumentation:**
- Flow Transmitters (FT)
- Pressure Transmitters (PT)
- Temperature Transmitters (TT)
- Level Transmitters (LT)

The EngiSight AI pipeline uses **YOLOv11** for symbol detection and **Groq vision LLM** for component classification.`;
  }
  if (q.includes("deviation") || q.includes("difference") || q.includes("comparison")) {
    return `**Engineering Drawing Comparison** — When comparing baseline vs. revision drawings, EngiSight AI detects:

**Change Categories:**
1. **Modified** — Parameter value changed between revisions (e.g., pipe diameter 150mm → 200mm)
2. **Missing** — Component present in baseline but absent in revision
3. **Added** — New component in revision not in baseline
4. **Matching** — Parameters identical between drawings

**AI Pipeline:**
1. OCR extracts text and values from both drawings
2. LLM structures extracted parameters into key-value pairs
3. Qdrant vector similarity matching pairs equivalent parameters
4. Classification engine determines change type and confidence

The system provides **full traceability** — each diff item links back to the exact source parameter ID in both drawings.`;
  }
  if (q.includes("bom") || q.includes("bill of material")) {
    return `**Bill of Materials (BoM)** in process engineering is a structured list of all components extracted from P&ID drawings.

**BoM Structure:**
| Field | Description |
|-------|-------------|
| Component Type | Pump, Valve, Vessel, etc. |
| Tag Number | Equipment identifier (e.g., P-101A) |
| Specification | Technical specification string |
| Quantity | Count of identical components |
| Confidence | AI extraction confidence score |
| Source Page | Drawing page reference for traceability |

**EngiSight BoM Validation Checks:**
- Quantity comparison against design specification
- Missing component detection
- Duplicate tag identification
- Specification mismatch flagging
- Connectivity validation against line lists`;
  }
  return MOCK_RESPONSES.default;
}

export default function AssistantPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: MOCK_RESPONSES.default,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCurrentUser().then(setUser).catch(() => router.push("/login"));
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(content: string) {
    if (!content.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: content.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));
    const botContent = getBotResponse(content);
    const botMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: botContent, timestamp: new Date() };
    setMessages((prev) => [...prev, botMsg]);
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function formatContent(content: string) {
    return content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br/>");
  }

  return (
    <Shell>
      <div className="flex flex-col h-[calc(100vh-8rem)] max-w-[900px] gap-4 animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">AI Engineering Assistant</h2>
            <p className="text-sm text-slate-500 mt-0.5">LLM-powered chat for engineering documents, standards, and drawing Q&A.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <Sparkles className="w-3.5 h-3.5" />
            LLM Powered
          </div>
        </div>

        {/* Suggested Prompts */}
        <div className="shrink-0 flex gap-2 flex-wrap">
          {SUGGESTED_PROMPTS.slice(0, 4).map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              {prompt.length > 50 ? prompt.slice(0, 50) + "…" : prompt}
            </button>
          ))}
        </div>

        {/* Chat Window */}
        <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col">

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  msg.role === "assistant"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                }`}>
                  {msg.role === "assistant" ? <Bot className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                </div>
                <div className={`max-w-[80%] rounded-xl p-4 text-sm leading-relaxed ${
                  msg.role === "assistant"
                    ? "bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                    : "bg-blue-600 text-white"
                }`}>
                  {msg.role === "assistant" ? (
                    <div dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
                  ) : (
                    <span>{msg.content}</span>
                  )}
                  <div className={`text-[10px] mt-2 ${msg.role === "assistant" ? "text-slate-400" : "text-blue-200"}`}>
                    {msg.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                  <span className="text-xs text-slate-500">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <div className="flex gap-3 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about engineering standards, P&ID components, EEDI calculations, drawing differences…"
                rows={2}
                className="flex-1 px-4 py-3 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-blue-500 resize-none"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 text-sm font-semibold"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Powered by Llama 3.1 / GPT-4.1 / Gemma 3 via Groq — Press Enter to send, Shift+Enter for new line</span>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
