"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import {
  Calculator, Ship, Anchor, Gauge, TrendingUp, FileText,
  CheckCircle2, AlertTriangle, Info,
} from "lucide-react";

interface EEDIInputs {
  shipType: string;
  grossTonnage: number;
  dwt: number;
  mainEngineKw: number;
  serviceSpeed: number;
  sfocMainEngine: number;
  auxEngineKw: number;
  sfocAuxEngine: number;
  capacityValue: number;
}

interface EEDIResult {
  attainedEEDI: number;
  requiredEEDI: number;
  margin: number;
  compliant: boolean;
  phase: string;
}

const SHIP_TYPES = [
  { value: "bulk_carrier", label: "Bulk Carrier", refLine: (dwt: number) => 961 * Math.pow(dwt, -0.477) },
  { value: "tanker", label: "Tanker", refLine: (dwt: number) => 1218 * Math.pow(dwt, -0.488) },
  { value: "container", label: "Container Ship", refLine: (dwt: number) => 174 * Math.pow(dwt, -0.201) },
  { value: "general_cargo", label: "General Cargo", refLine: (dwt: number) => 107.48 * Math.pow(dwt, -0.216) },
  { value: "ro_ro_cargo", label: "Ro-Ro Cargo", refLine: (dwt: number) => 1405.15 * Math.pow(dwt, -0.498) },
];

const PHASES = [
  { label: "Phase 0 (2013–2014)", reductionFactor: 0.0 },
  { label: "Phase 1 (2015–2019)", reductionFactor: 0.1 },
  { label: "Phase 2 (2020–2024)", reductionFactor: 0.2 },
  { label: "Phase 3 (2025+)", reductionFactor: 0.3 },
];

function calculateEEDI(inputs: EEDIInputs): EEDIResult {
  const cfMain = 3.1144; // CO2 factor for HFO
  const cfAux = 3.1144;

  // PME × SFOCME × cfME + PAE × SFOCAE × cfAE
  const numerator =
    (inputs.mainEngineKw * 0.75 * (inputs.sfocMainEngine / 1e6) * cfMain) +
    (inputs.auxEngineKw * (inputs.sfocAuxEngine / 1e6) * cfAux);

  // Vref × Capacity
  const denominator = inputs.serviceSpeed * inputs.capacityValue;
  const attainedEEDI = denominator > 0 ? numerator / denominator : 0;

  const shipTypeDef = SHIP_TYPES.find((s) => s.value === inputs.shipType) || SHIP_TYPES[0];
  const referenceEEDI = shipTypeDef.refLine(inputs.dwt);

  // Current phase: Phase 3
  const currentReduction = 0.3;
  const requiredEEDI = referenceEEDI * (1 - currentReduction);

  const margin = requiredEEDI > 0 ? ((requiredEEDI - attainedEEDI) / requiredEEDI) * 100 : 0;
  const compliant = attainedEEDI <= requiredEEDI;

  return { attainedEEDI, requiredEEDI, margin, compliant, phase: "Phase 3 (2025+)" };
}

export default function MaritimePage() {
  const router = useRouter();
  const [inputs, setInputs] = useState<EEDIInputs>({
    shipType: "tanker",
    grossTonnage: 50000,
    dwt: 45000,
    mainEngineKw: 8500,
    serviceSpeed: 14.5,
    sfocMainEngine: 175,
    auxEngineKw: 1200,
    sfocAuxEngine: 200,
    capacityValue: 45000,
  });
  const [result, setResult] = useState<EEDIResult | null>(null);

  useEffect(() => {
    fetchCurrentUser().catch(() => router.push("/login"));
  }, [router]);

  function handleCalculate() {
    setResult(calculateEEDI(inputs));
  }

  function update(key: keyof EEDIInputs, value: string | number) {
    setInputs((prev) => ({ ...prev, [key]: typeof value === "string" && key !== "shipType" ? parseFloat(value) || 0 : value }));
  }

  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-[1200px] animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Maritime Suite</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              IMO EEDI / EEXI compliance calculations, energy efficiency tools and maritime engineering analysis.
            </p>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Calculator, label: "EEDI Calculator", desc: "Energy Efficiency Design Index", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
            { icon: Ship, label: "EEXI Calculator", desc: "Energy Efficiency Existing Ships", color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
            { icon: Gauge, label: "CII Rating", desc: "Carbon Intensity Indicator", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
            { icon: TrendingUp, label: "Voyage Analysis", desc: "Fuel consumption optimization", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          ].map(({ icon: Icon, label, desc, color, bg }) => (
            <div key={label} className={`${bg} border border-slate-200 dark:border-slate-700/60 rounded-xl p-4`}>
              <Icon className={`w-5 h-5 ${color} mb-2`} />
              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* EEDI Calculator */}
          <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-blue-600" />
                EEDI Attained Calculator
                <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">IMO MARPOL Annex VI</span>
              </h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Ship Type</label>
                  <select
                    value={inputs.shipType}
                    onChange={(e) => update("shipType", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500"
                  >
                    {SHIP_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                {[
                  { key: "grossTonnage", label: "Gross Tonnage (GT)", unit: "GT" },
                  { key: "dwt", label: "Deadweight Tonnage (DWT)", unit: "tonnes" },
                  { key: "mainEngineKw", label: "Main Engine Power (PME)", unit: "kW" },
                  { key: "serviceSpeed", label: "Reference Speed (Vref)", unit: "knots" },
                  { key: "sfocMainEngine", label: "Main Engine SFOC", unit: "g/kWh" },
                  { key: "auxEngineKw", label: "Aux Engine Power (PAE)", unit: "kW" },
                  { key: "sfocAuxEngine", label: "Aux Engine SFOC", unit: "g/kWh" },
                  { key: "capacityValue", label: "Capacity (DWT or GT)", unit: "tonnes" },
                ].map(({ key, label, unit }) => (
                  <div key={key}>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {label} <span className="text-slate-300 normal-case font-normal">{unit}</span>
                    </label>
                    <input
                      type="number"
                      value={inputs[key as keyof EEDIInputs]}
                      onChange={(e) => update(key as keyof EEDIInputs, e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleCalculate}
                className="mt-5 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <Calculator className="w-4 h-4" />
                Calculate EEDI
              </button>
            </div>
          </div>

          {/* Results & Phase Overview */}
          <div className="lg:col-span-2 flex flex-col gap-5">

            {/* Result Card */}
            {result ? (
              <div className={`rounded-xl border-2 p-5 shadow-sm ${result.compliant ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20" : "border-rose-400 bg-rose-50 dark:bg-rose-950/20"}`}>
                <div className="flex items-center gap-2 mb-4">
                  {result.compliant
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    : <AlertTriangle className="w-5 h-5 text-rose-600" />
                  }
                  <span className={`font-bold text-sm ${result.compliant ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                    {result.compliant ? "EEDI Compliant" : "Non-Compliant"}
                  </span>
                  <span className="text-xs text-slate-400 ml-auto">{result.phase}</span>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Attained EEDI</div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                      {result.attainedEEDI.toFixed(4)}
                    </div>
                    <div className="text-xs text-slate-400">g CO₂/t·nm</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Required EEDI</div>
                    <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                      {result.requiredEEDI.toFixed(4)}
                    </div>
                    <div className="text-xs text-slate-400">g CO₂/t·nm (30% below reference line)</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Compliance Margin</div>
                    <div className={`text-2xl font-bold ${result.margin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {result.margin >= 0 ? "+" : ""}{result.margin.toFixed(2)}%
                    </div>
                    <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${result.compliant ? "bg-emerald-500" : "bg-rose-500"}`}
                        style={{ width: `${Math.min(Math.abs(result.margin), 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center shadow-sm">
                <Gauge className="w-10 h-10 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Enter vessel parameters and click Calculate.</p>
              </div>
            )}

            {/* EEDI Phases Reference */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-blue-500" />
                IMO EEDI Phase Requirements
              </h4>
              <div className="space-y-2">
                {PHASES.map(({ label, reductionFactor }) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">{label}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{(reductionFactor * 100).toFixed(0)}% reduction</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Other Tools */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">Additional Maritime Tools</h4>
              <div className="space-y-2">
                {[
                  { label: "EEXI Calculator", desc: "For existing ships (2023+)", badge: "Coming Soon" },
                  { label: "CII Rating Tool", desc: "Annual operational efficiency", badge: "Coming Soon" },
                  { label: "Ship Stability", desc: "GM, metacenter calculations", badge: "Coming Soon" },
                  { label: "Bunker Report", desc: "Fuel consumption tracking", badge: "Coming Soon" },
                  { label: "Class Survey Report", desc: "Compliance documentation", badge: "Coming Soon" },
                ].map(({ label, desc, badge }) => (
                  <div key={label} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div>
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</div>
                      <div className="text-[11px] text-slate-400">{desc}</div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">{badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
