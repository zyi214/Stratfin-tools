import { useState, useMemo, useCallback, useRef } from "react";
import { useActiveScenario } from "@/lib/store";
import {
  calculateCosts,
  solveForVariable,
  sensitivityAnalysis,
  fmt,
  SolveGoalType,
  SolveVariable,
  SOLVE_VARIABLE_LABELS,
  SOLVE_VARIABLES_BY_GRANULARITY,
  overrideVariable,
} from "@/lib/formulas";
import {
  runMonteCarlo,
  buildDefaultUncertainties,
  UncertaintyInput,
  MonteCarloResult,
} from "@/lib/montecarlo";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { AlertTriangle, CheckCircle2, Target, Dices, Play, RotateCcw, Grid3X3 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Shared / Breakeven Solver (existing)
// ─────────────────────────────────────────────────────────────────────────────

const GOAL_OPTIONS: { value: SolveGoalType; label: string; description: string }[] = [
  { value: "target_cpu", label: "Target Cost Per Unit", description: "What value does a driver need to reach a specific CPU?" },
  { value: "target_margin", label: "Target Gross Margin %", description: "What value gets you to a desired margin?" },
  { value: "investment_payback", label: "Investment Payback Analysis", description: "Evaluate a cost reduction project with an upfront investment." },
];

function StatCard({ label, value, highlight, valueClass = "" }: { label: string; value: string; highlight?: boolean; valueClass?: string }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-base font-bold stat-value ${valueClass || "text-foreground"}`}>{value}</p>
    </div>
  );
}

function getCurrentValue(variable: SolveVariable, config: any, inputs: any): number {
  switch (variable) {
    case "materialsSimple": return inputs.materialsSimple;
    case "laborSimple": return inputs.laborSimple;
    case "overheadSimple": return inputs.overheadSimple;
    case "materialsStandard": return inputs.materialsStandard;
    case "laborHoursStandard": return inputs.laborHoursStandard;
    case "laborRateStandard": return inputs.laborRateStandard;
    case "overheadRateStandard": return inputs.overheadRateStandard;
    case "toolingCost": return inputs.toolingCost;
    case "annualVolume": return config.annualVolume;
    case "yieldRate": return inputs.yieldRate * 100;
    case "packagingCost": return inputs.packagingCost;
    case "logisticsInbound": return inputs.logisticsInbound;
    case "logisticsOutbound": return inputs.logisticsOutbound;
    case "warrantyProvisionPercent": return inputs.warrantyProvisionPercent * 100;
    case "sellingPrice": return config.sellingPrice;
    default: return 0;
  }
}

function formatCurrentValue(variable: SolveVariable, config: any, inputs: any): string {
  return formatSolvedValue(variable, getCurrentValue(variable, config, inputs));
}

function formatSolvedValue(variable: SolveVariable, val: number): string {
  if (variable === "annualVolume") return `${Math.round(val).toLocaleString()} units`;
  if (variable === "yieldRate" || variable === "warrantyProvisionPercent") return `${val.toFixed(2)}%`;
  if (variable === "toolingCost") return `$${Math.round(val).toLocaleString()}`;
  if (variable === "laborHoursStandard") return `${val.toFixed(3)} hrs`;
  return `$${fmt(val)}`;
}

function fmtM(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${fmt(v)}`;
}

const SolverTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded px-2 py-1.5 text-xs shadow">
      <div className="text-muted-foreground mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex gap-2">
          <span className="text-muted-foreground">{p.name === "value" ? "Required" : "Current"}:</span>
          <span className="font-bold stat-value" style={{ color: p.color }}>{p.value != null ? formatSolvedValue("materialsSimple" as any, p.value) : "—"}</span>
        </div>
      ))}
    </div>
  );
};

function BreakevenSolverTab() {
  const { scenario } = useActiveScenario();
  const { config, inputs } = scenario;
  const current = calculateCosts(config, inputs);

  const [goalType, setGoalType] = useState<SolveGoalType>("target_cpu");
  const [targetCPU, setTargetCPU] = useState(current.totalCost * 0.9);
  const [targetMargin, setTargetMargin] = useState(40);
  const [investmentAmount, setInvestmentAmount] = useState(500000);
  const [paybackYears, setPaybackYears] = useState(3);
  const [selectedVar, setSelectedVar] = useState<SolveVariable>(SOLVE_VARIABLES_BY_GRANULARITY[config.granularity][0]);

  const availableVars = SOLVE_VARIABLES_BY_GRANULARITY[config.granularity];
  const goal = {
    type: goalType,
    targetCPU: goalType === "target_cpu" ? targetCPU : undefined,
    targetMarginPercent: goalType === "target_margin" ? targetMargin : undefined,
    investmentAmount: goalType === "investment_payback" ? investmentAmount : undefined,
    paybackYears: goalType === "investment_payback" ? paybackYears : undefined,
  };

  const result = solveForVariable(config, inputs, selectedVar, goal);
  const volumeMultipliers = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
  const sensitivityData = sensitivityAnalysis(config, inputs, selectedVar, goal, volumeMultipliers);
  const chartData = sensitivityData.map((d) => ({
    volume: `${(d.volumeMultiplier * 100).toFixed(0)}%`,
    value: d.solvedValue !== null ? parseFloat(d.solvedValue.toFixed(4)) : null,
    current: parseFloat(getCurrentValue(selectedVar, config, inputs).toFixed(4)),
  }));

  return (
    <div className="grid grid-cols-5 gap-6">
      {/* Config Panel */}
      <div className="col-span-2 space-y-4">
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Goal</h3>
          <div className="space-y-2">
            {GOAL_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setGoalType(opt.value)}
                className={`w-full text-left rounded border px-3 py-3 transition-colors ${goalType === opt.value ? "border-primary bg-primary/10" : "border-border hover:bg-muted/30"}`}>
                <div className={`text-sm font-medium ${goalType === opt.value ? "text-primary" : "text-foreground"}`}>{opt.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            {goalType === "target_cpu" && (
              <label className="block">
                <span className="text-xs text-muted-foreground mb-1 block">Target CPU — current: ${fmt(current.totalCost)}</span>
                <div className="flex items-center border border-border rounded bg-input/20 focus-within:ring-1 focus-within:ring-ring overflow-hidden">
                  <span className="px-2 py-2 text-xs text-muted-foreground bg-muted/40 border-r border-border">$</span>
                  <input type="number" value={targetCPU} step="0.01" onChange={(e) => setTargetCPU(parseFloat(e.target.value) || 0)}
                    className="flex-1 bg-transparent px-2 py-2 text-sm text-foreground outline-none stat-value" />
                </div>
                {config.sellingPrice > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Implied margin: {(((config.sellingPrice - targetCPU) / config.sellingPrice) * 100).toFixed(1)}%</p>
                )}
              </label>
            )}
            {goalType === "target_margin" && (
              <label className="block">
                <span className="text-xs text-muted-foreground mb-1 block">Target Gross Margin — current: {(current.grossMarginPercent * 100).toFixed(1)}%</span>
                <div className="flex items-center border border-border rounded bg-input/20 focus-within:ring-1 focus-within:ring-ring overflow-hidden">
                  <input type="number" value={targetMargin} step="0.5" min="0" max="99" onChange={(e) => setTargetMargin(parseFloat(e.target.value) || 0)}
                    className="flex-1 bg-transparent px-2 py-2 text-sm text-foreground outline-none stat-value" />
                  <span className="px-2 py-2 text-xs text-muted-foreground bg-muted/40 border-l border-border">%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Implied CPU: ${fmt(config.sellingPrice * (1 - targetMargin / 100))}</p>
              </label>
            )}
            {goalType === "investment_payback" && (
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs text-muted-foreground mb-1 block">Investment Amount (upfront capex)</span>
                  <div className="flex items-center border border-border rounded bg-input/20 focus-within:ring-1 focus-within:ring-ring overflow-hidden">
                    <span className="px-2 py-2 text-xs text-muted-foreground bg-muted/40 border-r border-border">$</span>
                    <input type="number" value={investmentAmount} step="10000" onChange={(e) => setInvestmentAmount(parseFloat(e.target.value) || 0)}
                      className="flex-1 bg-transparent px-2 py-2 text-sm text-foreground outline-none stat-value" />
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground mb-1 block">Target Payback Period</span>
                  <div className="flex items-center border border-border rounded bg-input/20 focus-within:ring-1 focus-within:ring-ring overflow-hidden">
                    <input type="number" value={paybackYears} step="0.5" min="0.5" max="20" onChange={(e) => setPaybackYears(parseFloat(e.target.value) || 3)}
                      className="flex-1 bg-transparent px-2 py-2 text-sm text-foreground outline-none stat-value" />
                    <span className="px-2 py-2 text-xs text-muted-foreground bg-muted/40 border-l border-border">years</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Savings needed for {paybackYears}-yr payback: ${fmt(investmentAmount / (config.annualVolume * paybackYears))} / unit</p>
                </label>
              </div>
            )}
          </div>
        </div>
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Variable to Solve For</h3>
          <select value={selectedVar} onChange={(e) => setSelectedVar(e.target.value as SolveVariable)}
            className="w-full bg-input/20 border border-border rounded px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring">
            {availableVars.map((v) => (
              <option key={v} value={v} className="bg-card text-foreground">{SOLVE_VARIABLE_LABELS[v]}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-2">Current value: <span className="font-mono text-foreground stat-value">{formatCurrentValue(selectedVar, config, inputs)}</span></p>
        </div>
      </div>

      {/* Result Panel */}
      <div className="col-span-3 space-y-4">
        {result ? (
          <>
            <div className={`rounded-lg border p-5 ${result.feasible ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {result.feasible ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <AlertTriangle className="w-5 h-5 text-destructive" />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-foreground mb-1">{SOLVE_VARIABLE_LABELS[selectedVar]}</div>
                  {result.feasible ? (
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-bold stat-value text-primary">{formatSolvedValue(selectedVar, result.solvedValue)}</span>
                      <span className={`text-sm font-medium ${result.delta < 0 ? "text-green-400" : "text-red-400"}`}>
                        {result.delta < 0 ? "▼" : "▲"} {Math.abs(result.deltaPercent).toFixed(1)}%
                      </span>
                    </div>
                  ) : (
                    <div className="text-2xl font-bold text-destructive">Not feasible</div>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">{result.message}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Current Value" value={formatCurrentValue(selectedVar, config, inputs)} />
              <StatCard label="Required Value" value={result.feasible ? formatSolvedValue(selectedVar, result.solvedValue) : "—"} highlight={result.feasible} />
              <StatCard label="Change Needed" value={result.feasible ? `${result.deltaPercent > 0 ? "+" : ""}${result.deltaPercent.toFixed(1)}%` : "—"} highlight={result.feasible}
                valueClass={result.feasible ? (result.delta < 0 ? "text-green-400" : "text-red-400") : ""} />
            </div>
            {goalType === "investment_payback" && result.paybackMonths !== undefined && (
              <div className="bg-card border border-card-border rounded-lg p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                  <Target className="w-3.5 h-3.5" /> Payback Analysis
                </h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><div className="text-muted-foreground text-xs mb-1">Savings / Unit</div><div className="font-bold stat-value text-foreground">${fmt(result.requiredCostSavingPerUnit ?? 0)}</div></div>
                  <div><div className="text-muted-foreground text-xs mb-1">Annual Savings</div><div className="font-bold stat-value text-foreground">{fmtM(result.annualSavings ?? 0)}</div></div>
                  <div><div className="text-muted-foreground text-xs mb-1">Payback Period</div>
                    <div className={`font-bold stat-value ${(result.paybackMonths ?? Infinity) <= (paybackYears * 12) ? "text-green-400" : "text-yellow-400"}`}>
                      {isFinite(result.paybackMonths ?? Infinity) ? `${(result.paybackMonths ?? 0).toFixed(1)} mo` : "Never"}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-card border border-card-border rounded-lg p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Volume Sensitivity</h3>
              <p className="text-xs text-muted-foreground mb-4">How the required value changes from 50% to 200% of current ({config.annualVolume.toLocaleString()} units).</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                    <XAxis dataKey="volume" tick={{ fontSize: 11, fill: "hsl(210,14%,52%)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(210,14%,52%)" }} width={50} />
                    <Tooltip content={<SolverTooltip />} />
                    <ReferenceLine y={getCurrentValue(selectedVar, config, inputs)} stroke="hsl(38,90%,52%)" strokeDasharray="4 2" strokeWidth={1.5} />
                    <Line type="monotone" dataKey="value" stroke="hsl(210,90%,56%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(210,90%,56%)" }} connectNulls={false} name="value" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-primary" /><span>Required value at volume</span></div>
                <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 bg-yellow-400" style={{ borderTop: "2px dashed" }} /><span>Current value</span></div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-card border border-card-border rounded-lg p-10 text-center">
            <p className="text-muted-foreground text-sm">Select a goal and variable to see the solve result.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Monte Carlo Tab
// ─────────────────────────────────────────────────────────────────────────────

const MC_RUNS_OPTIONS = [1000, 5000, 10000, 25000];

function PctRange({
  label,
  low,
  high,
  onLow,
  onHigh,
}: {
  label: string;
  low: number;
  high: number;
  onLow: (v: number) => void;
  onHigh: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-muted-foreground w-4 text-right">-</span>
      <input
        type="number"
        value={low}
        min={0}
        max={99}
        step={1}
        onChange={(e) => onLow(Math.max(0, Math.min(99, parseFloat(e.target.value) || 0)))}
        className="w-12 bg-input/20 border border-border rounded px-1.5 py-1 text-center text-foreground outline-none focus:ring-1 focus:ring-ring stat-value"
      />
      <span className="text-muted-foreground">%</span>
      <span className="text-muted-foreground mx-0.5">/</span>
      <span className="text-muted-foreground">+</span>
      <input
        type="number"
        value={high}
        min={0}
        max={200}
        step={1}
        onChange={(e) => onHigh(Math.max(0, Math.min(200, parseFloat(e.target.value) || 0)))}
        className="w-12 bg-input/20 border border-border rounded px-1.5 py-1 text-center text-foreground outline-none focus:ring-1 focus:ring-ring stat-value"
      />
      <span className="text-muted-foreground">%</span>
    </div>
  );
}

const MCTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-muted-foreground mb-1">CPU range: ${fmt(d.cpuLow)} – ${fmt(d.cpuHigh)}</div>
      <div className="text-foreground font-bold">{(d.pct * 100).toFixed(1)}% of runs</div>
      <div className="text-muted-foreground mt-0.5">Cumulative: {(d.cumulative * 100).toFixed(1)}%</div>
    </div>
  );
};

function MonteCarloTab() {
  const { scenario } = useActiveScenario();
  const { config, inputs } = scenario;
  const current = calculateCosts(config, inputs);

  const [uncertainties, setUncertainties] = useState<UncertaintyInput[]>(() =>
    buildDefaultUncertainties(config, inputs)
  );
  const [runs, setRuns] = useState(5000);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [running, setRunning] = useState(false);
  const [targetCPU, setTargetCPU] = useState<number>(current.totalCost * 0.9);
  const [useTarget, setUseTarget] = useState(false);

  const enabledCount = uncertainties.filter((u) => u.enabled).length;

  const toggleEnabled = (key: string) =>
    setUncertainties((prev) => prev.map((u) => (u.key === key ? { ...u, enabled: !u.enabled } : u)));

  const updateLow = (key: string, v: number) =>
    setUncertainties((prev) => prev.map((u) => (u.key === key ? { ...u, lowPct: v } : u)));

  const updateHigh = (key: string, v: number) =>
    setUncertainties((prev) => prev.map((u) => (u.key === key ? { ...u, highPct: v } : u)));

  const resetUncertainties = () => setUncertainties(buildDefaultUncertainties(config, inputs));

  const runSimulation = useCallback(() => {
    if (enabledCount === 0) return;
    setRunning(true);
    // Defer to next tick so the UI can update the button state first
    setTimeout(() => {
      const res = runMonteCarlo(config, inputs, uncertainties, runs, useTarget ? targetCPU : null);
      setResult(res);
      setRunning(false);
    }, 16);
  }, [config, inputs, uncertainties, runs, useTarget, targetCPU]);

  // Color bins: blue below target, steel for rest
  const histData = useMemo(() => result?.histogramBins ?? [], [result]);

  const percentileRows = result
    ? [
        { label: "P5 (optimistic tail)", value: result.p5, pct: result.p5, color: "text-green-400" },
        { label: "P10", value: result.p10, color: "text-green-300" },
        { label: "P25", value: result.p25, color: "text-blue-300" },
        { label: "P50 (median)", value: result.p50, color: "text-primary" },
        { label: "P75", value: result.p75, color: "text-yellow-300" },
        { label: "P90", value: result.p90, color: "text-orange-300" },
        { label: "P95 (pessimistic tail)", value: result.p95, color: "text-red-400" },
      ]
    : [];

  return (
    <div className="grid grid-cols-5 gap-6">
      {/* Left: config */}
      <div className="col-span-2 space-y-4">
        <div className="bg-card border border-card-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Input Uncertainty Ranges
            </h3>
            <button onClick={resetUncertainties} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Enable inputs to vary, then set how far below/above the current value each can swing. Uniform distribution.
          </p>
          <div className="space-y-2">
            {uncertainties.map((u) => (
              <div key={u.key} className={`rounded border px-3 py-2.5 transition-colors ${u.enabled ? "border-primary/40 bg-primary/5" : "border-border/50 bg-muted/10"}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <button
                    onClick={() => toggleEnabled(u.key)}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                      u.enabled ? "bg-primary border-primary" : "border-border"
                    }`}
                  >
                    {u.enabled && <span className="text-white text-xs leading-none">✓</span>}
                  </button>
                  <span className={`text-xs font-medium flex-1 ${u.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                    {u.label}
                  </span>
                  <span className="text-xs text-muted-foreground stat-value shrink-0">
                    {u.unit === "×" ? `×${u.currentValue.toFixed(2)}` : u.unit === "%×" ? `${(u.currentValue * 100).toFixed(1)}%` : `${u.unit}${fmt(u.currentValue)}`}
                  </span>
                </div>
                {u.enabled && (
                  <div className="pl-6">
                    <PctRange label={u.label} low={u.lowPct} high={u.highPct} onLow={(v) => updateLow(u.key, v)} onHigh={(v) => updateHigh(u.key, v)} />
                    <div className="mt-1 text-xs text-muted-foreground">
                      Range: {u.unit === "×" ? `×${(u.currentValue * (1 - u.lowPct / 100)).toFixed(2)}` : u.unit === "%×" ? `${((u.currentValue * (1 - u.lowPct / 100)) * 100).toFixed(1)}%` : `${u.unit}${fmt(u.currentValue * (1 - u.lowPct / 100))}`}
                      {" – "}
                      {u.unit === "×" ? `×${(u.currentValue * (1 + u.highPct / 100)).toFixed(2)}` : u.unit === "%×" ? `${((u.currentValue * (1 + u.highPct / 100)) * 100).toFixed(1)}%` : `${u.unit}${fmt(u.currentValue * (1 + u.highPct / 100))}`}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Run config */}
        <div className="bg-card border border-card-border rounded-lg p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Simulation Settings</h3>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Number of runs</label>
            <div className="flex gap-2">
              {MC_RUNS_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setRuns(n)}
                  className={`flex-1 text-xs py-1.5 rounded border transition-colors ${runs === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"}`}
                >
                  {n >= 1000 ? `${n / 1000}K` : n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <button
                onClick={() => setUseTarget((t) => !t)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${useTarget ? "bg-primary border-primary" : "border-border"}`}
              >
                {useTarget && <span className="text-white text-xs leading-none">✓</span>}
              </button>
              <label className="text-xs text-muted-foreground">Show probability of achieving target CPU</label>
            </div>
            {useTarget && (
              <div className="flex items-center border border-border rounded bg-input/20 focus-within:ring-1 focus-within:ring-ring overflow-hidden">
                <span className="px-2 py-1.5 text-xs text-muted-foreground bg-muted/40 border-r border-border">$</span>
                <input
                  type="number"
                  value={targetCPU}
                  step="0.01"
                  onChange={(e) => setTargetCPU(parseFloat(e.target.value) || 0)}
                  className="flex-1 bg-transparent px-2 py-1.5 text-sm text-foreground outline-none stat-value"
                />
              </div>
            )}
          </div>
          <button
            onClick={runSimulation}
            disabled={running || enabledCount === 0}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? (
              <><span className="animate-spin">⟳</span> Running…</>
            ) : (
              <><Play className="w-4 h-4" /> Run {runs >= 1000 ? `${runs / 1000}K` : runs} Simulations</>
            )}
          </button>
          {enabledCount === 0 && (
            <p className="text-xs text-yellow-400 text-center">Enable at least one input above.</p>
          )}
        </div>
      </div>

      {/* Right: results */}
      <div className="col-span-3 space-y-4">
        {result ? (
          <>
            {/* Key stat cards */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-card border border-card-border rounded-lg p-3 col-span-1">
                <p className="text-xs text-muted-foreground mb-1">Median (P50)</p>
                <p className="text-lg font-bold stat-value text-primary">${fmt(result.p50)}</p>
                <p className="text-xs text-muted-foreground">CPU</p>
              </div>
              <div className="bg-card border border-card-border rounded-lg p-3 col-span-1">
                <p className="text-xs text-muted-foreground mb-1">Std Deviation</p>
                <p className="text-lg font-bold stat-value text-foreground">${fmt(result.stdDev)}</p>
                <p className="text-xs text-muted-foreground">±1σ</p>
              </div>
              <div className="bg-card border border-card-border rounded-lg p-3 col-span-1">
                <p className="text-xs text-muted-foreground mb-1">P10 – P90 range</p>
                <p className="text-sm font-bold stat-value text-foreground">${fmt(result.p10)} – ${fmt(result.p90)}</p>
                <p className="text-xs text-muted-foreground">80% of outcomes</p>
              </div>
              <div className="bg-card border border-card-border rounded-lg p-3 col-span-1">
                <p className="text-xs text-muted-foreground mb-1">vs. Point Estimate</p>
                <p className={`text-lg font-bold stat-value ${result.p50 > current.totalCost ? "text-red-400" : "text-green-400"}`}>
                  {result.p50 > current.totalCost ? "+" : ""}{fmt(result.p50 - current.totalCost)}
                </p>
                <p className="text-xs text-muted-foreground">P50 delta</p>
              </div>
            </div>

            {/* Target probability banner */}
            {useTarget && result.probabilityBelowTarget !== null && (
              <div className={`rounded-lg border p-4 flex items-center gap-3 ${result.probabilityBelowTarget >= 0.5 ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                <Dices className={`w-5 h-5 shrink-0 ${result.probabilityBelowTarget >= 0.5 ? "text-green-400" : "text-red-400"}`} />
                <div>
                  <div className={`text-sm font-semibold ${result.probabilityBelowTarget >= 0.5 ? "text-green-400" : "text-red-400"}`}>
                    {(result.probabilityBelowTarget * 100).toFixed(1)}% probability of achieving CPU ≤ ${fmt(targetCPU)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Based on {result.runs.toLocaleString()} Monte Carlo runs with your configured uncertainty ranges.
                    {result.probabilityBelowTarget < 0.5 ? " Consider reducing cost drivers or widening the target." : " Your cost model is on track to hit this target."}
                  </div>
                </div>
              </div>
            )}

            {/* Histogram */}
            <div className="bg-card border border-card-border rounded-lg p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">CPU Distribution</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Distribution of cost-per-unit across {result.runs.toLocaleString()} simulated scenarios. Each run samples all enabled inputs within their uncertainty ranges.
              </p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histData} margin={{ left: 10, right: 10, top: 10, bottom: 0 }} barCategoryGap={1}>
                    <XAxis
                      dataKey="cpuMid"
                      tickFormatter={(v) => `$${fmt(v, 0)}`}
                      tick={{ fontSize: 10, fill: "hsl(210,14%,52%)" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      tick={{ fontSize: 10, fill: "hsl(210,14%,52%)" }}
                      width={36}
                    />
                    <Tooltip content={<MCTooltip />} />
                    {/* P10 / P50 / P90 reference lines */}
                    <ReferenceLine x={result.p10} stroke="hsl(142,70%,42%)" strokeDasharray="3 2" strokeWidth={1.5}
                      label={{ value: "P10", position: "top", fill: "hsl(142,70%,42%)", fontSize: 10 }} />
                    <ReferenceLine x={result.p50} stroke="hsl(210,90%,56%)" strokeDasharray="3 2" strokeWidth={2}
                      label={{ value: "P50", position: "top", fill: "hsl(210,90%,56%)", fontSize: 10 }} />
                    <ReferenceLine x={result.p90} stroke="hsl(4,78%,58%)" strokeDasharray="3 2" strokeWidth={1.5}
                      label={{ value: "P90", position: "top", fill: "hsl(4,78%,58%)", fontSize: 10 }} />
                    {useTarget && (
                      <ReferenceLine x={targetCPU} stroke="hsl(38,90%,52%)" strokeWidth={2}
                        label={{ value: `Target $${fmt(targetCPU, 0)}`, position: "insideTopRight", fill: "hsl(38,90%,52%)", fontSize: 10 }} />
                    )}
                    <Bar dataKey="pct" radius={[2, 2, 0, 0]}>
                      {histData.map((bin, idx) => {
                        const isTarget = useTarget && bin.cpuMid <= targetCPU;
                        const isP50 = Math.abs(bin.cpuMid - result.p50) < (histData[1]?.cpuMid ?? 1) - (histData[0]?.cpuMid ?? 0);
                        return (
                          <Cell
                            key={`mc-bin-${idx}`}
                            fill={isTarget ? "hsl(142,70%,42%)" : isP50 ? "hsl(210,90%,56%)" : "hsl(210,50%,40%)"}
                            fillOpacity={isTarget || isP50 ? 0.9 : 0.55}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-5 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="w-3 h-0.5" style={{ borderTop: "1.5px dashed hsl(142,70%,42%)" }} /><span>P10</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-0.5" style={{ borderTop: "2px dashed hsl(210,90%,56%)" }} /><span>P50 median</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-0.5" style={{ borderTop: "1.5px dashed hsl(4,78%,58%)" }} /><span>P90</span></div>
                {useTarget && <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-yellow-400" /><span>Target CPU</span></div>}
              </div>
            </div>

            {/* Percentile table */}
            <div className="bg-card border border-card-border rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Percentile Summary</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="text-left px-5 py-2 text-xs text-muted-foreground font-medium">Percentile</th>
                    <th className="text-right px-5 py-2 text-xs text-muted-foreground font-medium">CPU</th>
                    <th className="text-right px-5 py-2 text-xs text-muted-foreground font-medium">Gross Margin</th>
                    <th className="text-right px-5 py-2 text-xs text-muted-foreground font-medium">vs. Point Est.</th>
                  </tr>
                </thead>
                <tbody>
                  {percentileRows.map((row) => {
                    const margin = config.sellingPrice > 0 ? ((config.sellingPrice - row.value) / config.sellingPrice) * 100 : 0;
                    const delta = row.value - current.totalCost;
                    return (
                      <tr key={row.label} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                        <td className="px-5 py-2.5 text-xs text-muted-foreground">{row.label}</td>
                        <td className={`px-5 py-2.5 text-right font-bold stat-value ${row.color}`}>${fmt(row.value)}</td>
                        <td className="px-5 py-2.5 text-right text-xs stat-value text-muted-foreground">{margin.toFixed(1)}%</td>
                        <td className={`px-5 py-2.5 text-right text-xs stat-value font-medium ${delta > 0 ? "text-red-400" : "text-green-400"}`}>
                          {delta > 0 ? "+" : ""}{fmt(delta)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted/20">
                    <td className="px-5 py-2.5 text-xs font-semibold text-foreground">Point estimate (no uncertainty)</td>
                    <td className="px-5 py-2.5 text-right font-bold stat-value text-foreground">${fmt(current.totalCost)}</td>
                    <td className="px-5 py-2.5 text-right text-xs stat-value text-muted-foreground">{(current.grossMarginPercent * 100).toFixed(1)}%</td>
                    <td className="px-5 py-2.5 text-right text-xs stat-value text-muted-foreground">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="bg-card border border-card-border rounded-lg p-12 text-center flex flex-col items-center gap-4">
            <Dices className="w-10 h-10 text-muted-foreground/20" />
            <div>
              <p className="text-foreground text-sm font-medium mb-1">No simulation run yet</p>
              <p className="text-muted-foreground text-xs max-w-xs">
                Configure which inputs are uncertain, set their uncertainty ranges (±%), and click Run Simulations. The engine will sample {runs.toLocaleString()} scenarios and plot the CPU distribution.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sensitivity Grid Heatmap Tab
// ─────────────────────────────────────────────────────────────────────────────

function SensitivityGridTab() {
  const { scenario } = useActiveScenario();
  const { config, inputs } = scenario;
  const current = calculateCosts(config, inputs);

  const availableVars = SOLVE_VARIABLES_BY_GRANULARITY[config.granularity];

  // State
  const [rowVar, setRowVar] = useState<SolveVariable>(availableVars[availableVars.length - 1]); // default: sellingPrice
  const [colVar, setColVar] = useState<SolveVariable>(availableVars[0]); // default: first available variable
  const [metric, setMetric] = useState<"grossMarginPercent" | "grossMargin" | "totalCost" | "annualProfit">("grossMarginPercent");
  const [rangePct, setRangePct] = useState<number>(20); // Default sweep +/- 20%

  // Make sure row and col variables are different
  useEffect(() => {
    if (rowVar === colVar) {
      const other = availableVars.find(v => v !== rowVar);
      if (other) setColVar(other);
    }
  }, [rowVar, colVar, availableVars]);

  const rowBaseVal = getCurrentValue(rowVar, config, inputs);
  const colBaseVal = getCurrentValue(colVar, config, inputs);

  // Generate steps: 7 steps from -rangePct to +rangePct
  const steps = [-3, -2, -1, 0, 1, 2, 3].map(step => (step * rangePct) / 3);

  // Compute grid data
  const grid = useMemo(() => {
    return steps.map(rPct => {
      const rMultiplier = 1 + rPct / 100;
      let rowVal = rowBaseVal * rMultiplier;
      // Clamping and adjustments
      if (rowVar === "yieldRate") {
        rowVal = Math.min(100, Math.max(1, rowVal));
      } else if (rowVar === "warrantyProvisionPercent") {
        rowVal = Math.min(100, Math.max(0, rowVal));
      } else if (rowVar === "annualVolume") {
        rowVal = Math.max(1, Math.round(rowVal));
      } else {
        rowVal = Math.max(0, rowVal);
      }

      const cols = steps.map(cPct => {
        const cMultiplier = 1 + cPct / 100;
        let colVal = colBaseVal * cMultiplier;
        if (colVar === "yieldRate") {
          colVal = Math.min(100, Math.max(1, colVal));
        } else if (colVar === "warrantyProvisionPercent") {
          colVal = Math.min(100, Math.max(0, colVal));
        } else if (colVar === "annualVolume") {
          colVal = Math.max(1, Math.round(colVal));
        } else {
          colVal = Math.max(0, colVal);
        }

        // Apply overrides
        const step1 = overrideVariable(config, inputs, rowVar, rowVal);
        const step2 = overrideVariable(step1.config, step1.inputs, colVar, colVal);
        const bd = calculateCosts(step2.config, step2.inputs);

        let value = 0;
        if (metric === "grossMarginPercent") {
          value = bd.grossMarginPercent * 100;
        } else if (metric === "grossMargin") {
          value = bd.grossMargin;
        } else if (metric === "totalCost") {
          value = bd.totalCost;
        } else if (metric === "annualProfit") {
          value = bd.grossMargin * step2.config.annualVolume;
        }

        return {
          cPct,
          colVal,
          value,
        };
      });

      return {
        rPct,
        rowVal,
        cols,
      };
    });
  }, [rowVar, colVar, metric, rangePct, rowBaseVal, colBaseVal, config, inputs]);

  // Helper for background color styling based on metric and value
  const getCellBg = (value: number) => {
    if (metric === "totalCost") {
      // For CPU, lower is green (better), higher is red (worse)
      const baseVal = current.totalCost;
      const diffPct = ((value - baseVal) / (baseVal || 1)) * 100;
      if (diffPct < -0.1) {
        const alpha = Math.min(0.8, Math.abs(diffPct) / 25);
        return `rgba(74, 222, 128, ${alpha})`; // green
      } else if (diffPct > 0.1) {
        const alpha = Math.min(0.8, diffPct / 25);
        return `rgba(248, 113, 113, ${alpha})`; // red
      }
      return "transparent";
    } else {
      // For Margins and Profit, higher is green (better), lower is red (worse)
      let baseVal = 0;
      if (metric === "grossMarginPercent") baseVal = current.grossMarginPercent * 100;
      else if (metric === "grossMargin") baseVal = current.grossMargin;
      else if (metric === "annualProfit") baseVal = current.grossMargin * config.annualVolume;

      if (value < 0) {
        const magnitude = Math.min(0.9, Math.abs(value) / (Math.abs(baseVal) || 100));
        return `rgba(248, 113, 113, ${0.3 + magnitude * 0.6})`;
      }

      const diff = value - baseVal;
      const denominator = Math.abs(baseVal) || 1;
      const diffPct = (diff / denominator) * 100;

      if (diffPct > 0.1) {
        const alpha = Math.min(0.8, diffPct / 30);
        return `rgba(74, 222, 128, ${alpha})`; // green
      } else if (diffPct < -0.1) {
        const alpha = Math.min(0.8, Math.abs(diffPct) / 30);
        return `rgba(248, 113, 113, ${alpha})`; // red
      }
      return "transparent";
    }
  };

  const formatCellValue = (val: number) => {
    if (metric === "grossMarginPercent") return `${val.toFixed(1)}%`;
    if (metric === "annualProfit") return fmtM(val);
    return `$${fmt(val)}`;
  };

  return (
    <div className="space-y-6">
      {/* Selectors Panel */}
      <div className="bg-card border border-card-border rounded-lg p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Sensitivity Matrix Configuration
        </h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Row Driver (Y-Axis)</label>
            <select value={rowVar} onChange={(e) => setRowVar(e.target.value as SolveVariable)}
              className="w-full bg-input/20 border border-border rounded px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring">
              {availableVars.map((v) => (
                <option key={v} value={v} className="bg-card text-foreground">{SOLVE_VARIABLE_LABELS[v]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Column Driver (X-Axis)</label>
            <select value={colVar} onChange={(e) => setColVar(e.target.value as SolveVariable)}
              className="w-full bg-input/20 border border-border rounded px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring">
              {availableVars.map((v) => (
                <option key={v} value={v} className="bg-card text-foreground">{SOLVE_VARIABLE_LABELS[v]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Output Metric</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value as any)}
              className="w-full bg-input/20 border border-border rounded px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring">
              <option value="grossMarginPercent" className="bg-card text-foreground">Gross Margin %</option>
              <option value="grossMargin" className="bg-card text-foreground">Gross Margin ($/unit)</option>
              <option value="totalCost" className="bg-card text-foreground">Total Cost (CPU)</option>
              <option value="annualProfit" className="bg-card text-foreground">Annual Profit ($)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Step Range (±%)</label>
            <select value={rangePct} onChange={(e) => setRangePct(parseInt(e.target.value) || 20)}
              className="w-full bg-input/20 border border-border rounded px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring">
              <option value={5} className="bg-card text-foreground">± 5%</option>
              <option value={10} className="bg-card text-foreground">± 10%</option>
              <option value={15} className="bg-card text-foreground">± 15%</option>
              <option value={20} className="bg-card text-foreground">± 20%</option>
              <option value={30} className="bg-card text-foreground">± 30%</option>
              <option value={50} className="bg-card text-foreground">± 50%</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Baseline: <span className="text-foreground font-semibold">{SOLVE_VARIABLE_LABELS[rowVar]}</span> = {formatSolvedValue(rowVar, rowBaseVal)} |{" "}
          <span className="text-foreground font-semibold">{SOLVE_VARIABLE_LABELS[colVar]}</span> = {formatSolvedValue(colVar, colBaseVal)}
        </p>
      </div>

      {/* Grid Display */}
      <div className="bg-card border border-card-border rounded-lg p-5 overflow-auto">
        <div className="min-w-[800px]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Cross-Variable Heatmap Table
          </h3>
          <table className="w-full border-collapse text-xs text-center">
            <thead>
              <tr>
                <th className="border-0 bg-transparent" />
                <th colSpan={7} className="text-xs font-bold text-primary uppercase pb-2 tracking-wider">
                  {SOLVE_VARIABLE_LABELS[colVar]} (Columns)
                </th>
              </tr>
              <tr className="border-b border-border/60 bg-muted/10">
                <th className="text-left py-2 px-3 text-muted-foreground font-medium w-40">
                  {SOLVE_VARIABLE_LABELS[rowVar]}
                </th>
                {steps.map((cPct) => (
                  <th key={`col-header-${cPct}`} className="py-2 px-1 font-semibold text-foreground">
                    <div>{cPct > 0 ? "+" : ""}{cPct.toFixed(1)}%</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {formatSolvedValue(colVar, colBaseVal * (1 + cPct / 100))}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map(({ rPct, rowVal, cols }) => (
                <tr key={`row-${rPct}`} className="border-b border-border/40 hover:bg-muted/5 transition-colors">
                  <td className="text-left py-3 px-3 font-semibold text-foreground">
                    <span className="text-muted-foreground w-12 inline-block">
                      {rPct > 0 ? "+" : ""}{rPct.toFixed(1)}%
                    </span>
                    <span className="ml-1 text-foreground">
                      {formatSolvedValue(rowVar, rowVal)}
                    </span>
                  </td>
                  {cols.map(({ cPct, value }) => {
                    const isCenter = Math.abs(rPct) < 0.01 && Math.abs(cPct) < 0.01;
                    const bg = getCellBg(value);

                    return (
                      <td
                        key={`cell-${rPct}-${cPct}`}
                        style={{ backgroundColor: bg }}
                        className={`py-3 px-1 stat-value font-bold text-foreground/90 transition-all ${
                          isCenter ? "outline outline-2 outline-primary outline-offset-[-2px] bg-primary/10 shadow-lg font-extrabold scale-[1.02]" : ""
                        }`}
                        title={`${SOLVE_VARIABLE_LABELS[rowVar]} (${rPct > 0 ? "+" : ""}${rPct.toFixed(1)}%): ${formatSolvedValue(rowVar, rowVal)}\n${SOLVE_VARIABLE_LABELS[colVar]} (${cPct > 0 ? "+" : ""}${cPct.toFixed(1)}%): ${formatSolvedValue(colVar, colBaseVal * (1 + cPct / 100))}\nResult: ${formatCellValue(value)}`}
                      >
                        {formatCellValue(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 outline outline-2 outline-primary bg-primary/10" />
              <span>Center cell represents current baseline model</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-400 opacity-60 rounded-sm" />
                <span>Lower / Worse than baseline</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-400 opacity-60 rounded-sm" />
                <span>Higher / Better than baseline</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Solver Page (tabs)
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "breakeven" | "montecarlo" | "sensitivity";

export default function SolverPage() {
  const [tab, setTab] = useState<Tab>("breakeven");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Solver</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Algebraically solve for any cost driver, run a probabilistic Monte Carlo simulation, or view a 2D cross-variable sensitivity matrix.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {([
          { id: "breakeven", label: "Breakeven Solver", icon: Target },
          { id: "montecarlo", label: "Monte Carlo", icon: Dices },
          { id: "sensitivity", label: "Sensitivity Matrix", icon: Grid3X3 },
        ] as { id: Tab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "breakeven" ? <BreakevenSolverTab /> : tab === "montecarlo" ? <MonteCarloTab /> : <SensitivityGridTab />}
    </div>
  );
}
