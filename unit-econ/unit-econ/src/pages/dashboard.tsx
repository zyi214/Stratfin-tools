import { useMemo } from "react";
import { useStore, useActiveScenario } from "@/lib/store";
import { calculateCosts, makevsBuyAnalysis, fmt, ProductConfig, CostInputs } from "@/lib/formulas";
import { calculateFacility, defaultFacilityInputs, type FacilityInputs } from "@/lib/facility";
import { Link, useLocation } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  ArrowRightLeft,
  Building2,
  Settings,
  ChevronRight,
  TrendingDown,
  Clock,
  Layers,
} from "lucide-react";

const STORAGE_KEY = "unit-econ-facility";

function getFacilityInputs(): FacilityInputs {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...defaultFacilityInputs(), ...JSON.parse(saved) };
  } catch (_) {
    /* ignore */
  }
  return defaultFacilityInputs();
}

function fmtM(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${fmt(abs)}`;
}

export default function DashboardPage() {
  const { scenarios, activeScenarioId } = useStore();
  const { scenario } = useActiveScenario();
  const [, navigate] = useLocation();

  const activeBreakdown = useMemo(() => {
    return calculateCosts(scenario.config, scenario.inputs);
  }, [scenario]);

  const activeColor = "hsl(210,90%,56%)";

  // Chart data
  const chartData = [
    { name: "Materials", value: activeBreakdown.materials, color: "hsl(210,90%,56%)" },
    { name: "Labor", value: activeBreakdown.labor, color: "hsl(38,90%,52%)" },
    { name: "Overhead", value: activeBreakdown.overhead, color: "hsl(142,70%,42%)" },
    ...(scenario.config.granularity !== "simple"
      ? [
          { name: "Tooling", value: activeBreakdown.tooling, color: "hsl(262,52%,62%)" },
          { name: "Yield Loss", value: activeBreakdown.yieldLoss + activeBreakdown.scrapDisposal, color: "hsl(4,78%,58%)" },
          { name: "Logistics", value: activeBreakdown.logistics, color: "hsl(180,60%,45%)" },
          { name: "Warranty", value: activeBreakdown.warranty, color: "hsl(300,50%,55%)" },
        ]
      : []),
  ].filter((d) => d.value > 0);

  // Make vs Buy summary
  const makeVsBuySummary = useMemo(() => {
    // Look for scenarios explicitly labeled Buy/Make or take first two
    let buy = scenarios.find((s) => s.name.toLowerCase().includes("buy") || s.name.toLowerCase().includes("outsource") || s.id === "ultrasound_probe_buy");
    let make = scenarios.find((s) => s.name.toLowerCase().includes("make") || s.name.toLowerCase().includes("base") || s.name.toLowerCase().includes("in-house") || s.id === "base");

    if (!buy || !make) {
      if (scenarios.length >= 2) {
        buy = scenarios[0];
        make = scenarios[1];
      } else {
        return null;
      }
    }

    const analysis = makevsBuyAnalysis(buy.config, buy.inputs, make.config, make.inputs);
    return {
      buyName: buy.name,
      makeName: make.name,
      makeWins: analysis.annualSavingsAtCurrentVolume > 0,
      annualSavings: Math.abs(analysis.annualSavingsAtCurrentVolume),
      crossoverVolume: analysis.crossoverVolume,
      paybackMonths: analysis.toolingPaybackMonths,
    };
  }, [scenarios]);

  // Facility summary
  const facilitySummary = useMemo(() => {
    const inputs = getFacilityInputs();
    const results = calculateFacility(inputs);
    return {
      paybackMonths: results.paybackMonths,
      npv: results.npv,
      irr: results.irr,
      capacityGainPct: results.capacityGainPct,
    };
  }, []);

  const marginColor =
    activeBreakdown.grossMarginPercent >= 0.4
      ? "text-green-400"
      : activeBreakdown.grossMarginPercent >= 0.2
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of product economics for <span className="font-semibold text-primary">{scenario.config.name}</span> ({scenario.name})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/setup">
            <button className="flex items-center gap-1.5 text-xs border border-border px-3 py-2 rounded text-muted-foreground hover:text-foreground hover:border-foreground transition-colors cursor-pointer">
              <Settings className="w-3.5 h-3.5" /> Configure Product
            </button>
          </Link>
          <Link href="/calculator">
            <button className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-4 py-2 rounded hover:opacity-90 transition-opacity cursor-pointer font-semibold">
              Edit Cost Model <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </Link>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-card-border rounded-lg p-5 flex flex-col justify-between hover:border-border transition-all">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Cost Per Unit</div>
            <div className="text-2xl font-bold stat-value text-foreground">${fmt(activeBreakdown.totalCost)}</div>
          </div>
          <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/40">
            Based on {scenario.config.granularity} model
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-5 flex flex-col justify-between hover:border-border transition-all">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Gross Margin</div>
            <div className={`text-2xl font-bold stat-value ${marginColor}`}>
              {(activeBreakdown.grossMarginPercent * 100).toFixed(1)}%
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/40 flex justify-between">
            <span>Per unit:</span>
            <span className="font-semibold text-foreground stat-value">${fmt(activeBreakdown.grossMargin)}</span>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-5 flex flex-col justify-between hover:border-border transition-all">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Annualized Profit</div>
            <div className="text-2xl font-bold stat-value text-green-400">
              {fmtM(activeBreakdown.grossMargin * scenario.config.annualVolume)}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/40 flex justify-between">
            <span>ASP:</span>
            <span className="font-semibold text-foreground stat-value">${fmt(scenario.config.sellingPrice)}</span>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-5 flex flex-col justify-between hover:border-border transition-all">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Annual Volume</div>
            <div className="text-2xl font-bold stat-value text-foreground">
              {scenario.config.annualVolume.toLocaleString()}
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/40">
            Units produced/year
          </div>
        </div>
      </div>

      {/* Main Grid: Cost breakdown & Strategic summaries */}
      <div className="grid grid-cols-5 gap-6">
        {/* Left: Cost Build-up Chart */}
        <div className="col-span-3 bg-card border border-card-border rounded-lg p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Cost Components Breakdown
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 10, right: 20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(210,14%,52%)" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(210,14%,52%)" }} tickFormatter={(v) => `$${v}`} width={45} />
                <Tooltip
                  formatter={(v: number) => [`$${fmt(v)}`, "Cost"]}
                  contentStyle={{
                    background: "hsl(222,26%,12%)",
                    border: "1px solid hsl(222,20%,18%)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, idx) => (
                    <Cell key={idx} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/40 text-xs text-muted-foreground">
            {chartData.slice(0, 3).map((item, idx) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span>{item.name}: ${fmt(item.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Specialized Modules Summary */}
        <div className="col-span-2 space-y-4">
          {/* Make vs Buy Summary Card */}
          <div className="bg-card border border-card-border rounded-lg p-5 flex flex-col justify-between hover:border-border transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <ArrowRightLeft className="w-4 h-4 text-primary" /> Make vs. Buy
                </div>
                <Link href="/make-vs-buy" className="text-xs text-primary hover:underline flex items-center">
                  Analyze <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {makeVsBuySummary ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-foreground">
                    Comparing <span className="font-semibold text-yellow-400">{makeVsBuySummary.buyName}</span> vs{" "}
                    <span className="font-semibold text-blue-400">{makeVsBuySummary.makeName}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs border-t border-border/40 pt-3">
                    <div>
                      <div className="text-muted-foreground mb-0.5">Cheaper Option</div>
                      <div className={`font-bold stat-value text-sm ${makeVsBuySummary.makeWins ? "text-blue-400" : "text-yellow-400"}`}>
                        {makeVsBuySummary.makeWins ? "In-house (Make)" : "Outsourced (Buy)"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-0.5">Annual Impact</div>
                      <div className="font-bold stat-value text-sm text-green-400">
                        {fmtM(makeVsBuySummary.annualSavings)}/yr
                      </div>
                    </div>
                    {makeVsBuySummary.crossoverVolume !== null && (
                      <div className="col-span-2">
                        <div className="text-muted-foreground mb-0.5">Crossover Volume</div>
                        <div className="font-medium text-foreground text-xs">
                          Make is preferred above <span className="font-bold stat-value text-primary">{makeVsBuySummary.crossoverVolume.toLocaleString()}</span> units/yr
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground py-2">
                  Please create at least two scenarios (one representing Buy/Supplier and one for Make/In-house) to compare outsourcing vs production.
                </div>
              )}
            </div>
          </div>

          {/* Facility Summary Card */}
          <div className="bg-card border border-card-border rounded-lg p-5 flex flex-col justify-between hover:border-border transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Building2 className="w-4 h-4 text-primary" /> Facility Investment
                </div>
                <Link href="/facility" className="text-xs text-primary hover:underline flex items-center">
                  Analyze <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs border-t border-border/40 pt-3">
                  <div>
                    <div className="text-muted-foreground mb-0.5">Payback</div>
                    <div className="font-bold stat-value text-sm text-foreground">
                      {isFinite(facilitySummary.paybackMonths) ? `${(facilitySummary.paybackMonths / 12).toFixed(1)} yrs` : "Never"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">NPV</div>
                    <div className={`font-bold stat-value text-sm ${facilitySummary.npv >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {fmtM(facilitySummary.npv)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-0.5">IRR</div>
                    <div className="font-bold stat-value text-sm text-foreground">
                      {isFinite(facilitySummary.irr) && !isNaN(facilitySummary.irr) ? `${(facilitySummary.irr * 100).toFixed(1)}%` : "N/A"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick navigation to other solvers */}
      <div className="bg-card border border-card-border rounded-lg p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Financial & Analysis Solvers
        </h3>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <Link href="/solver">
            <div className="p-4 border border-border/60 hover:border-primary rounded-md cursor-pointer transition-colors hover:bg-primary/5 flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-md text-primary mt-0.5"><Clock className="w-4 h-4" /></div>
              <div>
                <div className="font-semibold text-foreground text-sm">Breakeven & Solver</div>
                <div className="text-muted-foreground mt-1">Determine variables needed to hit target cost, profit margins, or payback thresholds.</div>
              </div>
            </div>
          </Link>
          <Link href="/scenarios">
            <div className="p-4 border border-border/60 hover:border-primary rounded-md cursor-pointer transition-colors hover:bg-primary/5 flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-md text-primary mt-0.5"><Layers className="w-4 h-4" /></div>
              <div>
                <div className="font-semibold text-foreground text-sm">Scenario Comparisons</div>
                <div className="text-muted-foreground mt-1">Compare up to 4 costing cases side-by-side with detailed component tables.</div>
              </div>
            </div>
          </Link>
          <Link href="/solver">
            <div className="p-4 border border-border/60 hover:border-primary rounded-md cursor-pointer transition-colors hover:bg-primary/5 flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-md text-primary mt-0.5"><TrendingUp className="w-4 h-4" /></div>
              <div>
                <div className="font-semibold text-foreground text-sm">Monte Carlo Risk</div>
                <div className="text-muted-foreground mt-1">Run 5,000+ simulated runs of your cost model across your uncertainty bounds.</div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
