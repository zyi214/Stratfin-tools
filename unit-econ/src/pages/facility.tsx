import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, Building2 } from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  Legend,
} from "recharts";
import { useActiveScenario } from "@/lib/store";
import { calculateCosts } from "@/lib/formulas";
import {
  calculateFacility,
  defaultFacilityInputs,
  type FacilityInputs,
} from "@/lib/facility";
import { FormulaTooltip } from "@/components/formula-tooltip";

const STORAGE_KEY = "unit-econ-facility";

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(v: number, dp = 2): string {
  if (!isFinite(v) || isNaN(v)) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function fmtK(v: number): string {
  if (!isFinite(v) || isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return fmt(v, 0);
}

function fmtPct(v: number): string {
  if (!isFinite(v) || isNaN(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtPayback(months: number): string {
  if (!isFinite(months) || months <= 0) return "Never";
  if (months < 12) return `${months.toFixed(1)} mo`;
  const yrs = months / 12;
  return `${yrs.toFixed(1)} yr`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function InputRow({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  step = 1,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[32px]">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground leading-tight">{label}</div>
        {hint && (
          <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {prefix && (
          <span className="text-xs text-muted-foreground w-4 text-right">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(n);
          }}
          className="w-28 h-8 bg-background border border-input rounded-md px-2 
                     text-sm text-right text-foreground tabular-nums
                     focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {suffix && (
          <span className="text-xs text-muted-foreground w-8">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  valueClass = "text-foreground",
  formula,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  formula?: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
        {label}
        {formula && <FormulaTooltip formula={formula} side="bottom" />}
      </p>
      <p className={`text-xl font-bold stat-value ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(222,28%,11%)",
  border: "1px solid hsl(222,20%,20%)",
  borderRadius: "8px",
  color: "hsl(210,14%,80%)",
  fontSize: 12,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FacilityPage() {
  const { scenario } = useActiveScenario();

  const [inputs, setInputs] = useState<FacilityInputs>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...defaultFacilityInputs(), ...JSON.parse(saved) };
    } catch (_) {
      /* ignore */
    }
    return defaultFacilityInputs();
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  }, [inputs]);

  const set = useCallback(
    <K extends keyof FacilityInputs>(key: K, value: FacilityInputs[K]) => {
      setInputs((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  function syncFromScenario() {
    const breakdown = calculateCosts(scenario.config, scenario.inputs);
    setInputs((prev) => ({
      ...prev,
      asp: scenario.config.sellingPrice,
      variableCpuPerUnit: +(breakdown.totalCost.toFixed(2)),
      currentVolume: scenario.config.annualVolume,
    }));
  }

  const results = useMemo(() => calculateFacility(inputs), [inputs]);

  // Payback crossover point for chart annotation
  const paybackYearIdx = results.cashFlowByYear.findIndex(
    (r, i) => i > 0 && r.cumulative >= 0
  );
  const paybackAnnotationYear =
    paybackYearIdx >= 0
      ? results.cashFlowByYear[paybackYearIdx].year
      : null;

  const paybackColor =
    results.paybackMonths <= 36
      ? "text-[hsl(142,70%,50%)]"
      : results.paybackMonths <= 72
      ? "text-[hsl(38,90%,52%)]"
      : results.paybackMonths === Infinity
      ? "text-destructive"
      : "text-[hsl(38,90%,52%)]";

  const npvColor =
    results.npv > 0
      ? "text-[hsl(142,70%,50%)]"
      : "text-destructive";

  const irrColor =
    !isFinite(results.irr) || isNaN(results.irr)
      ? "text-muted-foreground"
      : results.irr * 100 > inputs.discountRatePct
      ? "text-[hsl(142,70%,50%)]"
      : "text-destructive";

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            Facility Investment
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Evaluate CapEx against capacity gains and throughput targets
          </p>
        </div>
        <button
          onClick={syncFromScenario}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground 
                     border border-border rounded-md px-3 py-2 transition-colors"
          title="Pull ASP, CPU, and volume from the active scenario"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Sync from "{scenario.name}"
        </button>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-5 gap-6">
        {/* ── Left: Inputs ────────────────────────────────────────────────── */}
        <div className="col-span-2 space-y-4">
          <SectionCard title="Investment">
            <InputRow
              label="Total CapEx"
              hint="Equipment, installation, commissioning"
              value={inputs.capEx}
              onChange={(v) => set("capEx", v)}
              prefix="$"
              step={10000}
            />
            <InputRow
              label="Useful Life"
              value={inputs.usefulLifeYears}
              onChange={(v) => set("usefulLifeYears", Math.max(1, v))}
              suffix="yr"
              min={1}
            />
            <InputRow
              label="Discount Rate"
              hint="Hurdle rate / WACC"
              value={inputs.discountRatePct}
              onChange={(v) => set("discountRatePct", v)}
              suffix="%"
              step={0.5}
            />
            <InputRow
              label="Salvage Value"
              hint="Residual value at end of useful life"
              value={inputs.salvageValue}
              onChange={(v) => set("salvageValue", v)}
              prefix="$"
              step={1000}
            />
          </SectionCard>

          <SectionCard title="Capacity">
            <InputRow
              label="Current Capacity"
              hint="Max throughput before investment"
              value={inputs.currentCapacity}
              onChange={(v) => set("currentCapacity", v)}
              suffix="u/yr"
              step={1000}
            />
            <InputRow
              label="New Capacity"
              hint="Max throughput after investment"
              value={inputs.newCapacity}
              onChange={(v) => set("newCapacity", v)}
              suffix="u/yr"
              step={1000}
            />
            <InputRow
              label="Target Utilization"
              hint="Expected steady-state fill rate of new capacity"
              value={inputs.targetUtilizationPct}
              onChange={(v) => set("targetUtilizationPct", Math.min(100, Math.max(1, v)))}
              suffix="%"
              step={5}
            />
            <div className="pt-1 border-t border-border">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Target Volume</span>
                <span className="text-foreground stat-value font-medium">
                  {Math.round(results.targetVolume).toLocaleString()} u/yr
                </span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-muted-foreground">Incremental Volume</span>
                <span className="text-primary stat-value font-medium">
                  +{Math.round(results.incrementalVolume).toLocaleString()} u/yr
                </span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Unit Economics">
            <p className="text-xs text-muted-foreground -mt-1">
              Use{" "}
              <button
                onClick={syncFromScenario}
                className="underline hover:text-foreground transition-colors"
              >
                Sync from scenario
              </button>{" "}
              or enter values manually.
            </p>
            <InputRow
              label="Selling Price (ASP)"
              value={inputs.asp}
              onChange={(v) => set("asp", v)}
              prefix="$"
              step={1}
            />
            <InputRow
              label="Variable CPU"
              hint="Per-unit variable cost (excl. fixed overhead)"
              value={inputs.variableCpuPerUnit}
              onChange={(v) => set("variableCpuPerUnit", v)}
              prefix="$"
              step={1}
            />
            <div className="pt-1 border-t border-border">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Contribution Margin / Unit</span>
                <span
                  className={`stat-value font-medium ${
                    results.contributionMarginPerUnit > 0
                      ? "text-[hsl(142,70%,50%)]"
                      : "text-destructive"
                  }`}
                >
                  ${fmt(results.contributionMarginPerUnit)}
                </span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Cost Structure">
            <InputRow
              label="Current Fixed Overhead"
              hint="Annual fixed costs before the investment"
              value={inputs.currentFixedOverheadPerYear}
              onChange={(v) => set("currentFixedOverheadPerYear", v)}
              prefix="$"
              suffix="/yr"
              step={10000}
            />
            <InputRow
              label="Additional Annual O&M"
              hint="New maintenance, insurance, staffing from investment"
              value={inputs.additionalAnnualOverhead}
              onChange={(v) => set("additionalAnnualOverhead", v)}
              prefix="$"
              suffix="/yr"
              step={5000}
            />
            <InputRow
              label="Current Volume"
              hint="Today's production volume (baseline)"
              value={inputs.currentVolume}
              onChange={(v) => set("currentVolume", v)}
              suffix="u/yr"
              step={500}
            />
            <div className="pt-1 border-t border-border space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  Annual Depreciation
                  <FormulaTooltip formula="(CapEx − Salvage) ÷ Useful Life" />
                </span>
                <span className="stat-value text-foreground">
                  ${fmtK(results.annualDepreciation)}/yr
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  Break-even Utilization
                  <FormulaTooltip formula="Volume needed to cover added O&M + depreciation ÷ new capacity" />
                </span>
                <span
                  className={`stat-value font-medium ${
                    results.breakEvenUtilizationPct <= 75
                      ? "text-[hsl(142,70%,50%)]"
                      : results.breakEvenUtilizationPct <= 90
                      ? "text-[hsl(38,90%,52%)]"
                      : "text-destructive"
                  }`}
                >
                  {isFinite(results.breakEvenUtilizationPct)
                    ? fmtPct(results.breakEvenUtilizationPct)
                    : "Never"}
                </span>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Right: Results ───────────────────────────────────────────────── */}
        <div className="col-span-3 space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-3">
            <KpiCard
              label="Payback"
              value={fmtPayback(results.paybackMonths)}
              sub={isFinite(results.paybackMonths) ? `${results.paybackMonths.toFixed(1)} months` : undefined}
              valueClass={paybackColor}
              formula="CapEx ÷ Annual Incremental Cash Flow × 12"
            />
            <KpiCard
              label="NPV"
              value={`$${fmtK(results.npv)}`}
              sub={`@ ${inputs.discountRatePct}% discount`}
              valueClass={npvColor}
              formula="−CapEx + Σ (Annual CF ÷ (1+r)^t) + Salvage/(1+r)^N"
            />
            <KpiCard
              label="IRR"
              value={
                isFinite(results.irr) && !isNaN(results.irr)
                  ? fmtPct(results.irr * 100)
                  : "N/A"
              }
              sub={
                isFinite(results.irr) && !isNaN(results.irr)
                  ? `Hurdle: ${inputs.discountRatePct}%`
                  : undefined
              }
              valueClass={irrColor}
              formula="Rate r where NPV = 0 (Newton-Raphson)"
            />
            <KpiCard
              label="Capacity Gain"
              value={fmtPct(results.capacityGainPct)}
              sub={`${Math.round(inputs.currentCapacity).toLocaleString()} → ${Math.round(inputs.newCapacity).toLocaleString()} u/yr`}
              formula="(New Capacity − Current Capacity) ÷ Current Capacity × 100%"
            />
          </div>

          {/* CPU Absorption Chart */}
          <div className="bg-card border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cost Per Unit vs. Volume
              </h3>
              <span className="text-xs text-muted-foreground">
                Fixed cost absorption at different throughput levels
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              "Before" series ends at current capacity constraint. "After" shows
              the new facility's absorption curve.
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={results.cpuCurve}
                margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(222,20%,18%)"
                />
                <XAxis
                  dataKey="volume"
                  tickFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v
                  }
                  tick={{ fontSize: 11, fill: "hsl(210,14%,55%)" }}
                  stroke="hsl(222,20%,22%)"
                  label={{
                    value: "Volume (units/yr)",
                    position: "insideBottomRight",
                    offset: -4,
                    fontSize: 10,
                    fill: "hsl(210,14%,45%)",
                  }}
                />
                <YAxis
                  tickFormatter={(v) => `$${v}`}
                  tick={{ fontSize: 11, fill: "hsl(210,14%,55%)" }}
                  stroke="hsl(222,20%,22%)"
                  width={52}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number, name: string) => [
                    `$${fmt(v)}`,
                    name === "before" ? "Before (current)" : "After (new facility)",
                  ]}
                  labelFormatter={(v) =>
                    `Volume: ${Number(v).toLocaleString()} u/yr`
                  }
                />
                <Legend
                  formatter={(v) =>
                    v === "before" ? "Before" : "After (new facility)"
                  }
                  wrapperStyle={{ fontSize: 11, color: "hsl(210,14%,60%)" }}
                />
                {/* Current volume marker */}
                <ReferenceLine
                  x={inputs.currentVolume}
                  stroke="hsl(210,14%,45%)"
                  strokeDasharray="4 3"
                  label={{
                    value: "Current",
                    position: "top",
                    fontSize: 10,
                    fill: "hsl(210,14%,50%)",
                  }}
                />
                {/* Target volume marker */}
                <ReferenceLine
                  x={Math.round(results.targetVolume)}
                  stroke="hsl(210,90%,56%)"
                  strokeDasharray="4 3"
                  label={{
                    value: "Target",
                    position: "top",
                    fontSize: 10,
                    fill: "hsl(210,90%,56%)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="before"
                  stroke="hsl(38,90%,52%)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="after"
                  stroke="hsl(210,90%,56%)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Cash Flow Chart */}
          <div className="bg-card border border-card-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cumulative Cash Flow
              </h3>
              {paybackAnnotationYear && (
                <span className="text-xs text-[hsl(142,70%,50%)]">
                  Payback in Year {paybackAnnotationYear}
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={results.cashFlowByYear}
                margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
              >
                <defs>
                  <linearGradient
                    id="facilityGradPos"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(142,70%,50%)"
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(142,70%,50%)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="facilityGradNeg"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(0,70%,50%)"
                      stopOpacity={0}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(0,70%,50%)"
                      stopOpacity={0.2}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(222,20%,18%)"
                />
                <XAxis
                  dataKey="year"
                  tickFormatter={(v) => `Yr ${v}`}
                  tick={{ fontSize: 11, fill: "hsl(210,14%,55%)" }}
                  stroke="hsl(222,20%,22%)"
                />
                <YAxis
                  tickFormatter={(v) => `$${fmtK(v)}`}
                  tick={{ fontSize: 11, fill: "hsl(210,14%,55%)" }}
                  stroke="hsl(222,20%,22%)"
                  width={60}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number, name: string) => [
                    `$${fmtK(v)}`,
                    name === "cumulative"
                      ? "Cumulative (simple)"
                      : "Cumulative (NPV)",
                  ]}
                  labelFormatter={(v) => `Year ${v}`}
                />
                <ReferenceLine
                  y={0}
                  stroke="hsl(210,14%,40%)"
                  strokeWidth={1.5}
                />
                {paybackAnnotationYear && (
                  <ReferenceDot
                    x={paybackAnnotationYear}
                    y={0}
                    r={5}
                    fill="hsl(142,70%,50%)"
                    stroke="hsl(222,28%,11%)"
                    strokeWidth={2}
                    label={{
                      value: "Payback",
                      position: "top",
                      fontSize: 10,
                      fill: "hsl(142,70%,50%)",
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="npvCumulative"
                  stroke="hsl(210,90%,56%)"
                  strokeWidth={1.5}
                  fill="url(#facilityGradPos)"
                  strokeDasharray="5 3"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="hsl(142,70%,50%)"
                  strokeWidth={2}
                  fill="url(#facilityGradPos)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-[hsl(142,70%,50%)] inline-block" />
                Simple cumulative
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-4 h-0.5 inline-block"
                  style={{
                    background: "hsl(210,90%,56%)",
                    borderTop: "1.5px dashed hsl(210,90%,56%)",
                  }}
                />
                NPV cumulative (discounted)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom: Year Table + Sensitivity ──────────────────────────────── */}
      <div className="mt-6 grid grid-cols-5 gap-6">
        {/* Year-by-Year Table */}
        <div className="col-span-3 bg-card border border-card-border rounded-lg p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Year-by-Year Cash Flow
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-muted-foreground font-medium pb-2 pr-3">
                    Year
                  </th>
                  <th className="text-right text-muted-foreground font-medium pb-2 px-3">
                    Incremental CF
                  </th>
                  <th className="text-right text-muted-foreground font-medium pb-2 px-3">
                    Cumulative
                  </th>
                  <th className="text-right text-muted-foreground font-medium pb-2 pl-3">
                    NPV Cumulative
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.cashFlowByYear.map((row) => {
                  const isPayback =
                    row.cumulative >= 0 &&
                    row.year > 0 &&
                    (results.cashFlowByYear[row.year - 1]?.cumulative ?? -1) < 0;
                  return (
                    <tr
                      key={row.year}
                      className={`border-b border-border/40 ${
                        isPayback ? "bg-[hsl(142,70%,50%,0.06)]" : ""
                      }`}
                    >
                      <td className="py-2 pr-3 text-muted-foreground">
                        {row.year === 0 ? "0 (invest)" : `${row.year}`}
                        {isPayback && (
                          <span className="ml-1.5 text-[hsl(142,70%,50%)] text-[10px] font-semibold">
                            ★ Payback
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-2 px-3 text-right stat-value ${
                          row.incremental >= 0
                            ? "text-foreground"
                            : "text-destructive"
                        }`}
                      >
                        {row.incremental >= 0 ? "+" : ""}$
                        {fmtK(row.incremental)}
                      </td>
                      <td
                        className={`py-2 px-3 text-right stat-value ${
                          row.cumulative >= 0
                            ? "text-[hsl(142,70%,50%)]"
                            : "text-muted-foreground"
                        }`}
                      >
                        {row.cumulative >= 0 ? "+" : ""}${fmtK(row.cumulative)}
                      </td>
                      <td
                        className={`py-2 pl-3 text-right stat-value ${
                          row.npvCumulative >= 0
                            ? "text-[hsl(142,70%,50%)]"
                            : "text-muted-foreground"
                        }`}
                      >
                        {row.npvCumulative >= 0 ? "+" : ""}$
                        {fmtK(row.npvCumulative)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sensitivity Table */}
        <div className="col-span-2 bg-card border border-card-border rounded-lg p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Sensitivity: Utilization vs. Payback
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            How payback period and NPV shift if you hit different utilization
            targets on the new capacity.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-muted-foreground font-medium pb-2 pr-3">
                  Util %
                </th>
                <th className="text-right text-muted-foreground font-medium pb-2 px-3">
                  Volume
                </th>
                <th className="text-right text-muted-foreground font-medium pb-2 px-3">
                  Payback
                </th>
                <th className="text-right text-muted-foreground font-medium pb-2 pl-3">
                  NPV
                </th>
              </tr>
            </thead>
            <tbody>
              {results.sensitivityByUtilization.map((row) => {
                const isTarget =
                  Math.abs(row.utilPct - inputs.targetUtilizationPct) < 5;
                return (
                  <tr
                    key={row.utilPct}
                    className={`border-b border-border/40 ${
                      isTarget ? "bg-primary/5" : ""
                    }`}
                  >
                    <td
                      className={`py-2 pr-3 font-medium ${
                        isTarget ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {row.utilPct.toFixed(0)}%
                      {isTarget && (
                        <span className="ml-1 text-[10px]">◀ target</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground stat-value">
                      {Math.round(row.volume).toLocaleString()}
                    </td>
                    <td
                      className={`py-2 px-3 text-right stat-value ${
                        row.paybackMonths <= 36
                          ? "text-[hsl(142,70%,50%)]"
                          : row.paybackMonths <= 72
                          ? "text-[hsl(38,90%,52%)]"
                          : "text-destructive"
                      }`}
                    >
                      {fmtPayback(row.paybackMonths)}
                    </td>
                    <td
                      className={`py-2 pl-3 text-right stat-value ${
                        row.npv > 0
                          ? "text-[hsl(142,70%,50%)]"
                          : "text-destructive"
                      }`}
                    >
                      {row.npv > 0 ? "+" : ""}${fmtK(row.npv)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Quick summary */}
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                Annual Incremental CF (target)
                <FormulaTooltip formula="Incremental Volume × CM/Unit − Additional Annual Overhead" />
              </span>
              <span
                className={`stat-value font-medium ${
                  results.annualIncrementalCashFlow > 0
                    ? "text-[hsl(142,70%,50%)]"
                    : "text-destructive"
                }`}
              >
                {results.annualIncrementalCashFlow > 0 ? "+" : ""}$
                {fmtK(results.annualIncrementalCashFlow)}/yr
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                CPU Before → After
                <FormulaTooltip formula="Variable CPU + Fixed Overhead ÷ Volume" />
              </span>
              <span className="stat-value text-foreground">
                ${fmt(results.cpuBefore)} → ${fmt(results.cpuAfter)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
