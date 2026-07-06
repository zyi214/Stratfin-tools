import { useState } from "react";
import { useStore, useActiveScenario } from "@/lib/store";
import { calculateCosts, fmt, defaultInputs } from "@/lib/formulas";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Plus, Trash2, Copy, Check } from "lucide-react";

const SCENARIO_COLORS = [
  "hsl(210,90%,56%)",
  "hsl(38,90%,52%)",
  "hsl(142,70%,42%)",
  "hsl(262,52%,62%)",
];

const METRICS = [
  { key: "materials", label: "Materials" },
  { key: "labor", label: "Labor" },
  { key: "overhead", label: "Overhead" },
  { key: "tooling", label: "Tooling" },
  { key: "yieldLoss", label: "Yield Loss" },
  { key: "packaging", label: "Packaging" },
  { key: "logistics", label: "Logistics" },
  { key: "warranty", label: "Warranty" },
  { key: "totalCost", label: "Total CPU" },
  { key: "grossMargin", label: "Gross Margin $" },
  { key: "grossMarginPercent", label: "Gross Margin %" },
] as const;

type MetricKey = typeof METRICS[number]["key"];

export default function ScenariosPage() {
  const { scenarios, addScenario, deleteScenario, activeScenarioId, setActiveScenarioId, exportScenarios, importScenarios } = useStore();
  const { scenario: activeScenario } = useActiveScenario();
  const [copied, setCopied] = useState<string | null>(null);

  const maxScenarios = 4;

  const cloneScenario = (id: string) => {
    const source = scenarios.find((s) => s.id === id);
    if (!source || scenarios.length >= maxScenarios) return;
    const newId = addScenario({
      name: `${source.name} (copy)`,
      config: { ...source.config },
      inputs: { ...source.inputs },
    });
    setActiveScenarioId(newId);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const addBlankScenario = () => {
    if (scenarios.length >= maxScenarios) return;
    const newId = addScenario({
      name: `Scenario ${scenarios.length + 1}`,
      config: { ...activeScenario.config },
      inputs: { ...defaultInputs },
    });
    setActiveScenarioId(newId);
  };

  const breakdowns = scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    breakdown: calculateCosts(s.config, s.inputs),
    config: s.config,
  }));

  // Chart data: one data point per metric for the bar chart
  const cpuChartData = [
    {
      metric: "CPU",
      ...Object.fromEntries(
        breakdowns.map((b) => [b.name, parseFloat(b.breakdown.totalCost.toFixed(2))])
      ),
    },
  ];

  const marginChartData = [
    {
      metric: "Margin %",
      ...Object.fromEntries(
        breakdowns.map((b) => [
          b.name,
          parseFloat((b.breakdown.grossMarginPercent * 100).toFixed(2)),
        ])
      ),
    },
  ];

  const componentChartData = ["Materials", "Labor", "Overhead", "Tooling", "Yield Loss", "Packaging", "Logistics", "Warranty"].map((component) => {
    const keyMap: Record<string, MetricKey> = {
      Materials: "materials", Labor: "labor", Overhead: "overhead",
      Tooling: "tooling", "Yield Loss": "yieldLoss", Packaging: "packaging",
      Logistics: "logistics", Warranty: "warranty",
    };
    const k = keyMap[component];
    return {
      component,
      ...Object.fromEntries(breakdowns.map((b) => [b.name, parseFloat((b.breakdown[k] as number).toFixed(2))])),
    };
  });

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        importScenarios(data);
      } catch {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Scenarios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Compare up to {maxScenarios} scenarios side by side.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportScenarios}
            className="text-xs border border-border px-3 py-1.5 rounded text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            Export JSON
          </button>
          <label className="text-xs border border-border px-3 py-1.5 rounded text-muted-foreground hover:text-foreground hover:border-foreground transition-colors cursor-pointer">
            Import JSON
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
          {scenarios.length < maxScenarios && (
            <button
              onClick={addBlankScenario}
              className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Scenario
            </button>
          )}
        </div>
      </div>

      {/* Scenario Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6 xl:grid-cols-4">
        {scenarios.map((s, idx) => {
          const bd = breakdowns.find((b) => b.id === s.id)!;
          const isActive = s.id === activeScenarioId;
          const marginColor =
            bd.breakdown.grossMarginPercent >= 0.4
              ? "text-green-400"
              : bd.breakdown.grossMarginPercent >= 0.2
              ? "text-yellow-400"
              : "text-red-400";

          return (
            <div
              key={s.id}
              className={`bg-card border rounded-lg p-4 cursor-pointer transition-colors ${
                isActive ? "border-primary" : "border-card-border hover:border-border"
              }`}
              onClick={() => setActiveScenarioId(s.id)}
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: SCENARIO_COLORS[idx % SCENARIO_COLORS.length] }}
                />
                <div className="flex items-center gap-1">
                  <button
                    title="Clone scenario"
                    onClick={(e) => { e.stopPropagation(); cloneScenario(s.id); }}
                    className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                  >
                    {copied === s.id ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {!s.isBaseCase && (
                    <button
                      title="Delete scenario"
                      onClick={(e) => { e.stopPropagation(); deleteScenario(s.id); }}
                      className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="text-sm font-semibold text-foreground truncate">{s.name}</div>
              <div className="text-xs text-muted-foreground mb-3">{s.config.name}</div>
              <div className="text-xl font-bold stat-value text-foreground">${fmt(bd.breakdown.totalCost)}</div>
              <div className={`text-xs font-medium stat-value ${marginColor}`}>
                {(bd.breakdown.grossMarginPercent * 100).toFixed(1)}% margin
              </div>
              {isActive && (
                <div className="mt-2 text-xs text-primary font-medium">Active (editing)</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-card border border-card-border rounded-lg p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Cost Per Unit
          </h3>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cpuChartData} margin={{ left: 10, right: 10 }}>
                <XAxis dataKey="metric" hide />
                <YAxis tick={{ fontSize: 11, fill: "hsl(210,14%,52%)" }} width={50} />
                <Tooltip
                  formatter={(v: number, name: string) => [`$${fmt(v)}`, name]}
                  contentStyle={{ background: "hsl(222,26%,12%)", border: "1px solid hsl(222,20%,18%)", borderRadius: 4, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {scenarios.map((s, idx) => (
                  <Bar key={s.id} dataKey={s.name} fill={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Gross Margin %
          </h3>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={marginChartData} margin={{ left: 10, right: 10 }}>
                <XAxis dataKey="metric" hide />
                <YAxis tick={{ fontSize: 11, fill: "hsl(210,14%,52%)" }} width={50} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]}
                  contentStyle={{ background: "hsl(222,26%,12%)", border: "1px solid hsl(222,20%,18%)", borderRadius: 4, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {scenarios.map((s, idx) => (
                  <Bar key={s.id} dataKey={s.name} fill={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Component breakdown chart */}
      <div className="bg-card border border-card-border rounded-lg p-5 mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Cost Component Breakdown
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={componentChartData} margin={{ left: 10, right: 20 }}>
              <XAxis dataKey="component" tick={{ fontSize: 11, fill: "hsl(210,14%,52%)" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(210,14%,52%)" }} width={50} />
              <Tooltip
                formatter={(v: number, name: string) => [`$${fmt(v)}`, name]}
                contentStyle={{ background: "hsl(222,26%,12%)", border: "1px solid hsl(222,20%,18%)", borderRadius: 4, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {scenarios.map((s, idx) => (
                <Bar key={s.id} dataKey={s.name} fill={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-40">
                Metric
              </th>
              {breakdowns.map((b, idx) => (
                <th key={b.id} className="text-right px-5 py-3 text-xs font-semibold text-foreground">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5"
                    style={{ background: SCENARIO_COLORS[idx % SCENARIO_COLORS.length] }}
                  />
                  {b.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map(({ key, label }) => {
              const values = breakdowns.map((b) => b.breakdown[key] as number);
              const min = Math.min(...values);
              const max = Math.max(...values);
              return (
                <tr key={key} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="px-5 py-3 text-xs text-muted-foreground">{label}</td>
                  {values.map((v, idx) => {
                    const isMin = v === min && min !== max && key !== "grossMarginPercent" && key !== "grossMargin";
                    const isMax = v === max && min !== max && (key === "grossMarginPercent" || key === "grossMargin");
                    const isBest = isMin || isMax;
                    return (
                      <td
                        key={idx}
                        className={`px-5 py-3 text-right font-semibold stat-value text-sm ${
                          isBest ? "text-green-400" : "text-foreground"
                        }`}
                      >
                        {key === "grossMarginPercent"
                          ? `${(v * 100).toFixed(1)}%`
                          : `$${fmt(v)}`}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
