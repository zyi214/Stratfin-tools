import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { makevsBuyAnalysis, calculateCosts, fmt, defaultConfig, defaultInputs } from "@/lib/formulas";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
  Area,
  ComposedChart,
} from "recharts";
import { ArrowRightLeft, AlertTriangle, CheckCircle2, TrendingDown, DollarSign, Clock, Zap } from "lucide-react";

const BUY_COLOR = "hsl(38,90%,52%)";
const MAKE_COLOR = "hsl(210,90%,56%)";

function ScenarioPicker({
  label,
  sublabel,
  color,
  scenarioId,
  scenarios,
  onChange,
  onCreateNew,
}: {
  label: string;
  sublabel: string;
  color: string;
  scenarioId: string | null;
  scenarios: { id: string; name: string; config: any; inputs: any }[];
  onChange: (id: string) => void;
  onCreateNew: () => void;
}) {
  const selected = scenarios.find((s) => s.id === scenarioId);
  const bd = selected ? calculateCosts(selected.config, selected.inputs) : null;

  return (
    <div className="bg-card border border-card-border rounded-lg p-5 flex-1">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">{sublabel}</div>
        </div>
      </div>

      <select
        value={scenarioId ?? ""}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="w-full bg-input/20 border border-border rounded px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring mb-3"
      >
        <option value="" disabled className="bg-card">— Select a scenario —</option>
        {scenarios.map((s) => (
          <option key={s.id} value={s.id} className="bg-card text-foreground">
            {s.name}
          </option>
        ))}
      </select>

      {selected && bd ? (
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Product</span>
            <span className="text-foreground font-medium">{selected.config.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">CPU</span>
            <span className="font-bold stat-value" style={{ color }}>${fmt(bd.totalCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gross margin</span>
            <span className="text-foreground stat-value">{(bd.grossMarginPercent * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Volume</span>
            <span className="text-foreground stat-value">{selected.config.annualVolume.toLocaleString()} units/yr</span>
          </div>
          {label === "Make" && selected.inputs.toolingCost > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tooling capex</span>
              <span className="text-foreground stat-value">${selected.inputs.toolingCost.toLocaleString()}</span>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={onCreateNew}
          className="text-xs text-primary hover:underline"
        >
          + Create new scenario for {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

function InsightCard({
  icon: Icon,
  label,
  value,
  sub,
  valueColor = "text-foreground",
  warn,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  warn?: boolean;
}) {
  return (
    <div className={`bg-card border rounded-lg p-4 ${warn ? "border-yellow-500/30" : "border-card-border"}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-3.5 h-3.5 ${warn ? "text-yellow-400" : "text-muted-foreground"}`} />
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold stat-value ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function fmtV(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString();
}

function fmtM(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${fmt(abs)}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-muted-foreground mb-1.5">{Number(label).toLocaleString()} units</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold stat-value" style={{ color: p.color }}>${fmt(p.value)}</span>
        </div>
      ))}
      {payload.length === 2 && (
        <div className="mt-1.5 pt-1.5 border-t border-border/50 text-muted-foreground">
          Delta: <span className={`font-semibold stat-value ${payload[0].value < payload[1].value ? "text-blue-400" : "text-yellow-400"}`}>
            ${fmt(Math.abs(payload[0].value - payload[1].value))}
          </span>
        </div>
      )}
    </div>
  );
};

export default function MakeVsBuyPage() {
  const { scenarios, addScenario, setActiveScenarioId } = useStore();

  const [buyId, setBuyId] = useState<string | null>(scenarios[0]?.id ?? null);
  const [makeId, setMakeId] = useState<string | null>(
    scenarios.length > 1 ? scenarios[1].id : null
  );

  const buyScenario = scenarios.find((s) => s.id === buyId) ?? null;
  const makeScenario = scenarios.find((s) => s.id === makeId) ?? null;

  const analysis = useMemo(() => {
    if (!buyScenario || !makeScenario) return null;
    return makevsBuyAnalysis(
      buyScenario.config,
      buyScenario.inputs,
      makeScenario.config,
      makeScenario.inputs
    );
  }, [buyScenario, makeScenario]);

  const createAndSelect = (role: "buy" | "make") => {
    const id = addScenario({
      name: role === "buy" ? "Buy (Supplier)" : "Make (In-house)",
      config: {
        ...defaultConfig,
        granularity: "standard",
        name: role === "buy" ? "Purchased Part" : "In-house Part",
      },
      inputs: {
        ...defaultInputs,
        toolingCost: role === "buy" ? 0 : 100000,
      },
    });
    setActiveScenarioId(id);
    if (role === "buy") setBuyId(id);
    else setMakeId(id);
  };

  const makeWinsAtCurrentVol =
    analysis && analysis.annualSavingsAtCurrentVolume > 0;

  // Chart annotation for crossover line label
  const crossoverLabel =
    analysis?.crossoverVolume != null
      ? `${fmtV(analysis.crossoverVolume)} units`
      : null;

  // Volume table: show CPU at 5 milestone volumes
  const tableVolumes = useMemo(() => {
    if (!analysis) return [];
    const ref = Math.max(
      buyScenario?.config.annualVolume ?? 10000,
      makeScenario?.config.annualVolume ?? 10000
    );
    const pts = [
      Math.round(ref * 0.25),
      Math.round(ref * 0.5),
      ref,
      Math.round(ref * 2),
      Math.round(ref * 4),
    ];
    if (analysis.crossoverVolume && !pts.includes(analysis.crossoverVolume)) {
      pts.push(analysis.crossoverVolume);
      pts.sort((a, b) => a - b);
    }
    return pts.map((v) => {
      const bc = calculateCosts({ ...buyScenario!.config, annualVolume: v }, buyScenario!.inputs).totalCost;
      const mc = calculateCosts({ ...makeScenario!.config, annualVolume: v }, makeScenario!.inputs).totalCost;
      return { volume: v, buyCPU: bc, makeCPU: mc, delta: bc - mc, isCrossover: v === analysis.crossoverVolume };
    });
  }, [analysis, buyScenario, makeScenario]);

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <ArrowRightLeft className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Make vs. Buy</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Pick two existing scenarios — one representing the <span className="text-yellow-400 font-medium">Buy</span> option (supplier price) and one for the{" "}
          <span className="text-blue-400 font-medium">Make</span> option (in-house production). The analysis solves for the crossover volume and payback automatically.
        </p>
      </div>

      {/* Scenario selectors */}
      <div className="flex gap-4 mb-6">
        <ScenarioPicker
          label="Buy"
          sublabel="Supplier / outsourced cost"
          color={BUY_COLOR}
          scenarioId={buyId}
          scenarios={scenarios}
          onChange={setBuyId}
          onCreateNew={() => createAndSelect("buy")}
        />
        <div className="flex items-center justify-center text-muted-foreground/40">
          <ArrowRightLeft className="w-5 h-5" />
        </div>
        <ScenarioPicker
          label="Make"
          sublabel="In-house production cost"
          color={MAKE_COLOR}
          scenarioId={makeId}
          scenarios={scenarios}
          onChange={setMakeId}
          onCreateNew={() => createAndSelect("make")}
        />
      </div>

      {buyId === makeId && buyId !== null && (
        <div className="mb-4 flex items-center gap-2 text-sm text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Buy and Make are set to the same scenario — select two different scenarios to compare.
        </div>
      )}

      {analysis && buyId !== makeId ? (
        <>
          {/* Verdict banner */}
          <div
            className={`rounded-lg border p-4 mb-6 flex items-center gap-4 ${
              makeWinsAtCurrentVol
                ? "border-blue-500/30 bg-blue-500/5"
                : "border-yellow-500/30 bg-yellow-500/5"
            }`}
          >
            <div>
              {makeWinsAtCurrentVol ? (
                <CheckCircle2 className="w-6 h-6 text-blue-400" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-yellow-400" />
              )}
            </div>
            <div className="flex-1">
              <div className={`font-semibold text-sm ${makeWinsAtCurrentVol ? "text-blue-400" : "text-yellow-400"}`}>
                {makeWinsAtCurrentVol
                  ? "Make is cheaper at current volume"
                  : "Buy is cheaper at current volume"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {makeWinsAtCurrentVol ? (
                  <>
                    Making in-house saves{" "}
                    <span className="text-foreground font-semibold">
                      ${fmt(analysis.buyCPU - analysis.makeCPUAtConfigVolume)}/unit
                    </span>{" "}
                    ({fmtM(analysis.annualSavingsAtCurrentVolume)}/yr) at{" "}
                    {makeScenario?.config.annualVolume.toLocaleString()} units.
                    {analysis.toolingPaybackMonths !== null &&
                      ` Tooling pays back in ${analysis.toolingPaybackMonths.toFixed(1)} months.`}
                  </>
                ) : (
                  <>
                    Make is ${fmt(analysis.makeCPUAtConfigVolume - analysis.buyCPU)}/unit more expensive at{" "}
                    {makeScenario?.config.annualVolume.toLocaleString()} units — primarily due to tooling amortization.
                    {analysis.crossoverVolume !== null
                      ? ` Make becomes competitive above ${fmtV(analysis.crossoverVolume)} units/yr.`
                      : " Make never becomes cheaper with current inputs — revisit tooling cost or material savings."}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <InsightCard
              icon={TrendingDown}
              label="Crossover Volume"
              value={analysis.crossoverVolume !== null ? fmtV(analysis.crossoverVolume) + " units" : "Never"}
              sub={
                analysis.crossoverVolume !== null
                  ? "units/yr where Make ≤ Buy CPU"
                  : "Make never beats Buy with these inputs"
              }
              valueColor={analysis.crossoverVolume !== null ? "text-primary" : "text-muted-foreground"}
              warn={analysis.crossoverVolume === null}
            />
            <InsightCard
              icon={DollarSign}
              label="CPU Delta (current vol)"
              value={`${fmtM(Math.abs(analysis.buyCPU - analysis.makeCPUAtConfigVolume))}/unit`}
              sub={
                makeWinsAtCurrentVol
                  ? `Make saves $${fmt(analysis.buyCPU - analysis.makeCPUAtConfigVolume)}/unit`
                  : `Buy saves $${fmt(analysis.makeCPUAtConfigVolume - analysis.buyCPU)}/unit`
              }
              valueColor={makeWinsAtCurrentVol ? "text-blue-400" : "text-yellow-400"}
            />
            <InsightCard
              icon={Zap}
              label="Annual Savings (current vol)"
              value={fmtM(Math.abs(analysis.annualSavingsAtCurrentVolume))}
              sub={makeWinsAtCurrentVol ? "in favour of Make" : "in favour of Buy"}
              valueColor={makeWinsAtCurrentVol ? "text-green-400" : "text-yellow-400"}
            />
            <InsightCard
              icon={Clock}
              label="Tooling Payback"
              value={
                analysis.toolingPaybackMonths !== null
                  ? `${analysis.toolingPaybackMonths.toFixed(1)} mo`
                  : "N/A"
              }
              sub={
                analysis.toolingPaybackMonths !== null
                  ? `on $${(makeScenario?.inputs.toolingCost ?? 0).toLocaleString()} capex`
                  : makeWinsAtCurrentVol
                  ? "No tooling cost in Make scenario"
                  : "Make loses money — payback undefined"
              }
              valueColor={
                analysis.toolingPaybackMonths !== null && analysis.toolingPaybackMonths <= 24
                  ? "text-green-400"
                  : analysis.toolingPaybackMonths !== null && analysis.toolingPaybackMonths <= 48
                  ? "text-yellow-400"
                  : "text-muted-foreground"
              }
              warn={analysis.toolingPaybackMonths !== null && analysis.toolingPaybackMonths > 36}
            />
          </div>

          {/* Crossover chart */}
          <div className="bg-card border border-card-border rounded-lg p-5 mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              CPU vs. Annual Volume
            </h3>
            <p className="text-xs text-muted-foreground mb-5">
              Make CPU falls as volume increases (tooling amortizes over more units). The intersection is your crossover point.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={analysis.curvePoints} margin={{ left: 10, right: 20, top: 10, bottom: 5 }}>
                  <XAxis
                    dataKey="volume"
                    tickFormatter={(v) => fmtV(v)}
                    tick={{ fontSize: 11, fill: "hsl(210,14%,52%)" }}
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    scale="log"
                  />
                  <YAxis
                    tickFormatter={(v) => `$${fmt(v, 0)}`}
                    tick={{ fontSize: 11, fill: "hsl(210,14%,52%)" }}
                    width={60}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => (
                      <span style={{ color: value === "buyCPU" ? BUY_COLOR : MAKE_COLOR }}>
                        {value === "buyCPU" ? `Buy — ${buyScenario?.name}` : `Make — ${makeScenario?.name}`}
                      </span>
                    )}
                  />

                  {/* Shade the "Make wins" region */}
                  <Area
                    key="area-buyCPU"
                    type="monotone"
                    dataKey="buyCPU"
                    fill={MAKE_COLOR}
                    fillOpacity={0.04}
                    stroke="none"
                  />

                  {analysis.crossoverVolume !== null && (
                    <ReferenceLine
                      x={analysis.crossoverVolume}
                      stroke="hsl(142,70%,42%)"
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                      label={{
                        value: `Crossover: ${fmtV(analysis.crossoverVolume)}`,
                        position: "top",
                        fill: "hsl(142,70%,42%)",
                        fontSize: 11,
                      }}
                    />
                  )}

                  {/* Current Make volume */}
                  <ReferenceLine
                    x={makeScenario?.config.annualVolume}
                    stroke="hsl(210,90%,56%)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{
                      value: "Current vol",
                      position: "insideTopRight",
                      fill: "hsl(210,90%,56%)",
                      fontSize: 10,
                    }}
                  />

                  <Line
                    type="monotone"
                    dataKey="buyCPU"
                    stroke={BUY_COLOR}
                    strokeWidth={2.5}
                    dot={false}
                    name="buyCPU"
                  />
                  <Line
                    type="monotone"
                    dataKey="makeCPU"
                    stroke={MAKE_COLOR}
                    strokeWidth={2.5}
                    dot={false}
                    name="makeCPU"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-green-500" style={{ borderTop: "2px dashed hsl(142,70%,42%)" }} />
                <span>Crossover point</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0.5 bg-primary" style={{ borderTop: "2px dashed hsl(210,90%,56%)" }} />
                <span>Current volume</span>
              </div>
            </div>
          </div>

          {/* Volume sensitivity table */}
          <div className="bg-card border border-card-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                CPU at Key Volumes
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                  <th className="text-left px-5 py-2.5 text-xs text-muted-foreground font-medium">Annual Volume</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium" style={{ color: BUY_COLOR }}>
                    Buy CPU
                  </th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium" style={{ color: MAKE_COLOR }}>
                    Make CPU
                  </th>
                  <th className="text-right px-5 py-2.5 text-xs text-muted-foreground font-medium">Delta (Buy−Make)</th>
                  <th className="text-right px-5 py-2.5 text-xs text-muted-foreground font-medium">Annual Impact</th>
                  <th className="text-right px-5 py-2.5 text-xs text-muted-foreground font-medium">Decision</th>
                </tr>
              </thead>
              <tbody>
                {tableVolumes.map((row) => {
                  const makeWins = row.delta > 0;
                  const isCurrent =
                    row.volume === makeScenario?.config.annualVolume ||
                    row.volume === buyScenario?.config.annualVolume;
                  return (
                    <tr
                      key={row.volume}
                      className={`border-b border-border/50 last:border-0 transition-colors ${
                        row.isCrossover
                          ? "bg-green-500/5 border-green-500/20"
                          : isCurrent
                          ? "bg-primary/5"
                          : "hover:bg-muted/10"
                      }`}
                    >
                      <td className="px-5 py-3 font-medium stat-value text-foreground">
                        {row.volume.toLocaleString()}
                        {row.isCrossover && (
                          <span className="ml-2 text-xs text-green-400 font-normal">← crossover</span>
                        )}
                        {isCurrent && !row.isCrossover && (
                          <span className="ml-2 text-xs text-primary font-normal">← current</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right stat-value" style={{ color: BUY_COLOR }}>
                        ${fmt(row.buyCPU)}
                      </td>
                      <td className="px-5 py-3 text-right stat-value" style={{ color: MAKE_COLOR }}>
                        ${fmt(row.makeCPU)}
                      </td>
                      <td className={`px-5 py-3 text-right font-semibold stat-value ${makeWins ? "text-green-400" : "text-red-400"}`}>
                        {makeWins ? "+" : ""}${fmt(row.delta)}
                      </td>
                      <td className={`px-5 py-3 text-right stat-value ${makeWins ? "text-green-400" : "text-red-400"}`}>
                        {fmtM(row.delta * row.volume)}/yr
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            makeWins
                              ? "bg-blue-500/15 text-blue-400"
                              : "bg-yellow-500/15 text-yellow-400"
                          }`}
                        >
                          {makeWins ? "Make" : "Buy"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cost decomposition comparison */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            {[
              { label: `Buy — ${buyScenario?.name}`, scenario: buyScenario!, color: BUY_COLOR },
              { label: `Make — ${makeScenario?.name}`, scenario: makeScenario!, color: MAKE_COLOR },
            ].map(({ label, scenario, color }) => {
              const bd = calculateCosts(scenario.config, scenario.inputs);
              const lines = [
                { name: "Materials", v: bd.materials },
                { name: "Labor", v: bd.labor },
                { name: "Overhead", v: bd.overhead },
                { name: "Tooling", v: bd.tooling },
                { name: "Yield Loss", v: bd.yieldLoss + bd.scrapDisposal },
                { name: "Packaging", v: bd.packaging },
                { name: "Logistics", v: bd.logistics },
                { name: "Warranty", v: bd.warranty },
              ].filter((l) => l.v > 0);
              return (
                <div key={label} className="bg-card border border-card-border rounded-lg p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
                  </div>
                  <div className="space-y-2">
                    {lines.map(({ name, v }) => (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-24 shrink-0">{name}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (v / bd.totalCost) * 100)}%`,
                              background: color,
                              opacity: 0.8,
                            }}
                          />
                        </div>
                        <span className="text-xs stat-value text-foreground w-14 text-right">
                          ${fmt(v)}
                        </span>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {((v / bd.totalCost) * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-border flex justify-between text-sm">
                    <span className="text-muted-foreground font-medium">Total CPU</span>
                    <span className="font-bold stat-value" style={{ color }}>${fmt(bd.totalCost)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        !analysis && buyId && makeId && buyId !== makeId ? (
          <div className="bg-card border border-card-border rounded-lg p-10 text-center text-muted-foreground text-sm">
            Loading analysis…
          </div>
        ) : !buyId || !makeId ? (
          <div className="bg-card border border-card-border rounded-lg p-10 text-center">
            <ArrowRightLeft className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              Select a <span className="text-yellow-400">Buy</span> scenario and a{" "}
              <span className="text-blue-400">Make</span> scenario above to run the analysis.
            </p>
            <p className="text-muted-foreground/60 text-xs mt-2">
              Use any two existing scenarios, or create dedicated ones using the links above.
            </p>
          </div>
        ) : null
      )}
    </div>
  );
}
