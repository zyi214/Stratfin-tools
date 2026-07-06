import { useState } from "react";
import { useActiveScenario, useStore } from "@/lib/store";
import {
  calculateCosts,
  fmt,
  BomItem,
  LaborStep,
} from "@/lib/formulas";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Plus, Trash2, Info, Upload } from "lucide-react";
import { FormulaTooltip } from "@/components/formula-tooltip";
import * as XLSX from "xlsx";

const CHART_COLORS = [
  "hsl(210,90%,56%)",
  "hsl(38,90%,52%)",
  "hsl(142,70%,42%)",
  "hsl(262,52%,62%)",
  "hsl(4,78%,58%)",
  "hsl(180,60%,45%)",
  "hsl(300,50%,55%)",
  "hsl(50,80%,52%)",
];

function SectionHeader({ title, formula }: { title: string; formula: string }) {
  const [showFormula, setShowFormula] = useState(false);
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <button
        title={formula}
        onClick={() => setShowFormula((s) => !s)}
        className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {showFormula && (
        <span className="text-xs text-muted-foreground font-mono bg-muted/40 px-2 py-0.5 rounded border border-border">
          {formula}
        </span>
      )}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  prefix,
  suffix,
  step = "0.01",
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center border border-border rounded bg-input/20 focus-within:ring-1 focus-within:ring-ring overflow-hidden ${className}`}>
      {prefix && (
        <span className="px-2 py-1.5 text-xs text-muted-foreground bg-muted/40 border-r border-border">
          {prefix}
        </span>
      )}
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 bg-transparent px-2 py-1.5 text-sm text-foreground outline-none stat-value min-w-0 w-24"
      />
      {suffix && (
        <span className="px-2 py-1.5 text-xs text-muted-foreground bg-muted/40 border-l border-border">
          {suffix}
        </span>
      )}
    </div>
  );
}

function LineRow({
  label,
  formula,
  value,
  children,
}: {
  label: string;
  formula?: string;
  value: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0 gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground">{label}</div>
        {formula && <div className="text-xs text-muted-foreground font-mono mt-0.5">{formula}</div>}
      </div>
      <div className="flex items-center gap-3">
        {children}
        <div className="w-20 text-right text-sm font-semibold stat-value text-foreground">
          ${fmt(value)}
        </div>
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  const { scenario, update } = useActiveScenario();
  const { addScenario } = useStore();
  const { config, inputs } = scenario;
  const breakdown = calculateCosts(config, inputs);

  const updateInputs = (updates: Partial<typeof inputs>) => {
    update({ inputs: { ...inputs, ...updates } });
  };

  // BOM helpers
  const updateBomItem = (id: string, updates: Partial<BomItem>) => {
    updateInputs({
      bomItems: inputs.bomItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    });
  };
  const addBomItem = () => {
    updateInputs({
      bomItems: [
        ...inputs.bomItems,
        { id: Date.now().toString(), name: "New Part", quantity: 1, unitCost: 0 },
      ],
    });
  };
  const removeBomItem = (id: string) => {
    updateInputs({ bomItems: inputs.bomItems.filter((i) => i.id !== id) });
  };

  const handleBomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any>(worksheet);

        if (!Array.isArray(json) || json.length === 0) {
          alert("Empty sheet or invalid format");
          return;
        }

        const importedItems: BomItem[] = [];
        json.forEach((row, idx) => {
          let name = "";
          let quantity = 1;
          let unitCost = 0;

          for (const key of Object.keys(row)) {
            const k = key.toLowerCase().trim();
            if (k.includes("name") || k.includes("part") || k.includes("component") || k.includes("description") || k === "item") {
              name = String(row[key]);
            } else if (k.includes("qty") || k.includes("quantity") || k.includes("amount") || k.includes("count")) {
              quantity = parseFloat(row[key]) || 1;
            } else if (k.includes("cost") || k.includes("price") || k.includes("unitcost") || k === "rate" || k === "val") {
              unitCost = parseFloat(row[key]) || 0;
            }
          }

          if (name) {
            importedItems.push({
              id: `imported_${Date.now()}_${idx}`,
              name,
              quantity,
              unitCost,
            });
          }
        });

        if (importedItems.length === 0) {
          alert("Could not find valid columns. Please ensure you have headers like 'Part Name', 'Qty', and 'Unit Cost'.");
          return;
        }

        const overwrite = window.confirm(
          `Found ${importedItems.length} parts. Would you like to OVERWRITE the existing BOM? (Cancel to APPEND instead)`
        );

        if (overwrite) {
          updateInputs({ bomItems: importedItems });
        } else {
          updateInputs({ bomItems: [...inputs.bomItems, ...importedItems] });
        }
      } catch (err) {
        console.error("Failed to parse file", err);
        alert("Failed to parse Excel/CSV file. Please check structure.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  // Labor step helpers
  const updateLaborStep = (id: string, updates: Partial<LaborStep>) => {
    updateInputs({
      laborSteps: inputs.laborSteps.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    });
  };
  const addLaborStep = () => {
    updateInputs({
      laborSteps: [
        ...inputs.laborSteps,
        { id: Date.now().toString(), name: "New Step", hours: 0, rate: 0 },
      ],
    });
  };
  const removeLaborStep = (id: string) => {
    updateInputs({ laborSteps: inputs.laborSteps.filter((s) => s.id !== id) });
  };

  const cloneAsScenario = () => {
    addScenario({
      name: `${scenario.name} (copy)`,
      config: { ...config },
      inputs: { ...inputs },
    });
  };

  // Chart data
  const chartData = [
    { name: "Materials", value: breakdown.materials },
    { name: "Labor", value: breakdown.labor },
    { name: "Overhead", value: breakdown.overhead },
    ...(config.granularity !== "simple"
      ? [
          { name: "Tooling", value: breakdown.tooling },
          { name: "Yield Loss", value: breakdown.yieldLoss + breakdown.scrapDisposal },
          { name: "Packaging", value: breakdown.packaging },
          { name: "Logistics", value: breakdown.logistics },
          { name: "Warranty", value: breakdown.warranty },
        ]
      : []),
  ].filter((d) => d.value > 0);

  const marginColor =
    breakdown.grossMarginPercent >= 0.4
      ? "text-green-400"
      : breakdown.grossMarginPercent >= 0.2
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Cost Model</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {config.name} · {config.granularity.charAt(0).toUpperCase() + config.granularity.slice(1)} mode
          </p>
        </div>
        <button
          onClick={cloneAsScenario}
          className="text-xs border border-border px-3 py-1.5 rounded text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
        >
          Clone as Scenario
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiCard
          label="Cost Per Unit"
          value={`$${fmt(breakdown.totalCost)}`}
          formula="Materials + Labor + Overhead + Tooling + Yield Loss + Packaging + Logistics + Warranty"
        />
        <KpiCard
          label="Gross Margin"
          value={`${(breakdown.grossMarginPercent * 100).toFixed(1)}%`}
          valueClass={marginColor}
          sub={`$${fmt(breakdown.grossMargin)} / unit`}
          formula="(ASP − CPU) ÷ ASP × 100%"
        />
        <KpiCard
          label="Annual Cost"
          value={`$${fmtM(breakdown.totalCost * config.annualVolume)}`}
          sub={`${config.annualVolume.toLocaleString()} units`}
          formula="CPU × Annual Volume"
        />
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Left: Inputs */}
        <div className="col-span-3 space-y-4">
          {/* MATERIALS */}
          <div className="bg-card border border-card-border rounded-lg p-5">
            <SectionHeader
              title="Materials"
              formula={
                config.granularity === "detailed"
                  ? "SUM(qty × unit_cost) for each BOM item"
                  : "Direct material cost per unit"
              }
            />

            {config.granularity === "simple" && (
              <LineRow label="Materials / Unit" value={inputs.materialsSimple}>
                <NumInput
                  prefix="$"
                  value={inputs.materialsSimple}
                  onChange={(v) => updateInputs({ materialsSimple: v })}
                />
              </LineRow>
            )}

            {config.granularity === "standard" && (
              <LineRow label="Material Cost / Unit" formula="direct input" value={inputs.materialsStandard}>
                <NumInput
                  prefix="$"
                  value={inputs.materialsStandard}
                  onChange={(v) => updateInputs({ materialsStandard: v })}
                />
              </LineRow>
            )}

            {config.granularity === "detailed" && (
              <div>
                <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground mb-2 px-1">
                  <span className="col-span-5">Part Name</span>
                  <span className="col-span-2 text-center">Qty</span>
                  <span className="col-span-2 text-center">Unit Cost</span>
                  <span className="col-span-2 text-right">Extended</span>
                  <span className="col-span-1" />
                </div>
                {inputs.bomItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center mb-2">
                    <input
                      className="col-span-5 bg-input/20 border border-border rounded px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                      value={item.name}
                      onChange={(e) => updateBomItem(item.id, { name: e.target.value })}
                    />
                    <NumInput
                      className="col-span-2"
                      value={item.quantity}
                      step="1"
                      onChange={(v) => updateBomItem(item.id, { quantity: v })}
                    />
                    <NumInput
                      prefix="$"
                      className="col-span-2"
                      value={item.unitCost}
                      onChange={(v) => updateBomItem(item.id, { unitCost: v })}
                    />
                    <div className="col-span-2 text-right text-sm stat-value text-muted-foreground">
                      ${fmt(item.quantity * item.unitCost)}
                    </div>
                    <button
                      onClick={() => removeBomItem(item.id)}
                      className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={addBomItem}
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add BOM Item
                  </button>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors border border-border/60 hover:border-border px-2.5 py-1 rounded">
                    <Upload className="w-3.5 h-3.5" />
                    Import BOM (Excel/CSV)
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleBomUpload}
                    />
                  </label>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Materials</span>
                  <span className="font-bold stat-value">${fmt(breakdown.materials)}</span>
                </div>
              </div>
            )}
          </div>

          {/* LABOR */}
          <div className="bg-card border border-card-border rounded-lg p-5">
            <SectionHeader
              title="Labor"
              formula={
                config.granularity === "detailed"
                  ? "SUM(hours × rate) per operation"
                  : "Hours/Unit × Rate/Hour"
              }
            />

            {config.granularity === "simple" && (
              <LineRow label="Labor / Unit" value={inputs.laborSimple}>
                <NumInput
                  prefix="$"
                  value={inputs.laborSimple}
                  onChange={(v) => updateInputs({ laborSimple: v })}
                />
              </LineRow>
            )}

            {config.granularity === "standard" && (
              <>
                <LineRow
                  label="Labor Hours / Unit"
                  formula="hrs/unit"
                  value={inputs.laborHoursStandard * inputs.laborRateStandard}
                >
                  <NumInput
                    suffix="hrs"
                    value={inputs.laborHoursStandard}
                    step="0.1"
                    onChange={(v) => updateInputs({ laborHoursStandard: v })}
                  />
                  <span className="text-muted-foreground text-xs">×</span>
                  <NumInput
                    prefix="$"
                    suffix="/hr"
                    value={inputs.laborRateStandard}
                    onChange={(v) => updateInputs({ laborRateStandard: v })}
                  />
                </LineRow>
              </>
            )}

            {config.granularity === "detailed" && (
              <div>
                <div className="grid grid-cols-11 gap-2 text-xs text-muted-foreground mb-2 px-1">
                  <span className="col-span-4">Operation</span>
                  <span className="col-span-2 text-center">Hours</span>
                  <span className="col-span-2 text-center">Rate/hr</span>
                  <span className="col-span-2 text-right">Cost</span>
                  <span className="col-span-1" />
                </div>
                {inputs.laborSteps.map((step) => (
                  <div key={step.id} className="grid grid-cols-11 gap-2 items-center mb-2">
                    <input
                      className="col-span-4 bg-input/20 border border-border rounded px-2 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                      value={step.name}
                      onChange={(e) => updateLaborStep(step.id, { name: e.target.value })}
                    />
                    <NumInput
                      suffix="hr"
                      className="col-span-2"
                      value={step.hours}
                      step="0.1"
                      onChange={(v) => updateLaborStep(step.id, { hours: v })}
                    />
                    <NumInput
                      prefix="$"
                      className="col-span-2"
                      value={step.rate}
                      onChange={(v) => updateLaborStep(step.id, { rate: v })}
                    />
                    <div className="col-span-2 text-right text-sm stat-value text-muted-foreground">
                      ${fmt(step.hours * step.rate)}
                    </div>
                    <button
                      onClick={() => removeLaborStep(step.id)}
                      className="col-span-1 flex justify-center text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addLaborStep}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mt-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Operation
                </button>
                <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Labor</span>
                  <span className="font-bold stat-value">${fmt(breakdown.labor)}</span>
                </div>
              </div>
            )}
          </div>

          {/* OVERHEAD */}
          <div className="bg-card border border-card-border rounded-lg p-5">
            <SectionHeader
              title="Overhead"
              formula={
                config.granularity === "detailed"
                  ? "Machine Hrs × Rate + Facility + Utilities"
                  : "Overhead rate per unit"
              }
            />

            {config.granularity === "simple" && (
              <LineRow label="Overhead / Unit" value={inputs.overheadSimple}>
                <NumInput
                  prefix="$"
                  value={inputs.overheadSimple}
                  onChange={(v) => updateInputs({ overheadSimple: v })}
                />
              </LineRow>
            )}

            {config.granularity === "standard" && (
              <LineRow label="Overhead Rate / Unit" formula="burden rate" value={inputs.overheadRateStandard}>
                <NumInput
                  prefix="$"
                  value={inputs.overheadRateStandard}
                  onChange={(v) => updateInputs({ overheadRateStandard: v })}
                />
              </LineRow>
            )}

            {config.granularity === "detailed" && (
              <>
                <LineRow
                  label="Machine Time"
                  formula="Machine Hrs/Unit × $/hr"
                  value={inputs.overheadMachineHours * inputs.overheadMachineRate}
                >
                  <NumInput
                    suffix="hrs"
                    value={inputs.overheadMachineHours}
                    step="0.1"
                    onChange={(v) => updateInputs({ overheadMachineHours: v })}
                  />
                  <span className="text-muted-foreground text-xs">×</span>
                  <NumInput
                    prefix="$"
                    suffix="/hr"
                    value={inputs.overheadMachineRate}
                    onChange={(v) => updateInputs({ overheadMachineRate: v })}
                  />
                </LineRow>
                <LineRow
                  label="Facility Allocation / Unit"
                  formula="fixed floor space ÷ volume"
                  value={inputs.overheadFacilityAllocation}
                >
                  <NumInput
                    prefix="$"
                    value={inputs.overheadFacilityAllocation}
                    onChange={(v) => updateInputs({ overheadFacilityAllocation: v })}
                  />
                </LineRow>
                <LineRow
                  label="Utilities / Unit"
                  formula="energy + consumables"
                  value={inputs.overheadUtilitiesPerUnit}
                >
                  <NumInput
                    prefix="$"
                    value={inputs.overheadUtilitiesPerUnit}
                    onChange={(v) => updateInputs({ overheadUtilitiesPerUnit: v })}
                  />
                </LineRow>
              </>
            )}
          </div>

          {/* ADVANCED: Standard & Detailed only */}
          {config.granularity !== "simple" && (
            <>
              <div className="bg-card border border-card-border rounded-lg p-5">
                <SectionHeader
                  title="Tooling / Capex Amortization"
                  formula="Tooling Cost ÷ (Amort. Years × Annual Volume)"
                />
                <LineRow
                  label="Tooling Investment"
                  formula="total capex for tooling"
                  value={breakdown.tooling}
                >
                  <NumInput
                    prefix="$"
                    value={inputs.toolingCost}
                    step="1000"
                    onChange={(v) => updateInputs({ toolingCost: v })}
                  />
                </LineRow>
                <LineRow
                  label="Amortization Period"
                  formula="years over which to amortize"
                  value={0}
                >
                  <NumInput
                    suffix="yrs"
                    value={inputs.toolingAmortizationYears}
                    step="1"
                    onChange={(v) => updateInputs({ toolingAmortizationYears: v })}
                  />
                  <span className="text-xs text-muted-foreground">= ${fmt(breakdown.tooling)}/unit</span>
                </LineRow>
              </div>

              <div className="bg-card border border-card-border rounded-lg p-5">
                <SectionHeader
                  title="Yield / Scrap"
                  formula="Yield Loss = Materials × (1/Yield - 1)"
                />
                <LineRow
                  label="First-Pass Yield Rate"
                  formula="% of units that pass on first attempt"
                  value={breakdown.yieldLoss}
                >
                  <NumInput
                    suffix="%"
                    value={inputs.yieldRate * 100}
                    step="0.1"
                    onChange={(v) => updateInputs({ yieldRate: Math.min(1, v / 100) })}
                  />
                </LineRow>
                <LineRow
                  label="Scrap Disposal Cost / Unit"
                  formula="cost to dispose defective units"
                  value={breakdown.scrapDisposal}
                >
                  <NumInput
                    prefix="$"
                    value={inputs.scrapDisposalCostPerUnit}
                    onChange={(v) => updateInputs({ scrapDisposalCostPerUnit: v })}
                  />
                </LineRow>
              </div>

              <div className="bg-card border border-card-border rounded-lg p-5">
                <SectionHeader
                  title="Packaging, Logistics & Warranty"
                  formula="Warranty = Selling Price × Warranty %"
                />
                <LineRow label="Packaging / Unit" value={breakdown.packaging}>
                  <NumInput
                    prefix="$"
                    value={inputs.packagingCost}
                    onChange={(v) => updateInputs({ packagingCost: v })}
                  />
                </LineRow>
                <LineRow
                  label="Inbound Freight / Unit"
                  formula="inbound logistics"
                  value={inputs.logisticsInbound}
                >
                  <NumInput
                    prefix="$"
                    value={inputs.logisticsInbound}
                    onChange={(v) => updateInputs({ logisticsInbound: v })}
                  />
                </LineRow>
                <LineRow
                  label="Outbound Freight / Unit"
                  formula="fulfillment & outbound"
                  value={inputs.logisticsOutbound}
                >
                  <NumInput
                    prefix="$"
                    value={inputs.logisticsOutbound}
                    onChange={(v) => updateInputs({ logisticsOutbound: v })}
                  />
                </LineRow>
                <LineRow
                  label="Warranty Provision"
                  formula="Selling Price × Warranty %"
                  value={breakdown.warranty}
                >
                  <NumInput
                    suffix="% of ASP"
                    value={inputs.warrantyProvisionPercent * 100}
                    step="0.1"
                    onChange={(v) => updateInputs({ warrantyProvisionPercent: v / 100 })}
                  />
                </LineRow>
              </div>
            </>
          )}
        </div>

        {/* Right: Summary + Chart */}
        <div className="col-span-2 space-y-4">
          {/* Total breakdown */}
          <div className="bg-card border border-card-border rounded-lg p-5 sticky top-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Cost Build-Up
            </h3>
            <div className="space-y-2 text-sm">
              <CostRow
                label="Materials" value={breakdown.materials} total={breakdown.totalCost} color={CHART_COLORS[0]}
                formula={config.granularity === "detailed" ? "Σ (Qty × Unit Cost) per BOM line" : "Direct input — Material Cost/Unit"}
              />
              <CostRow
                label="Labor" value={breakdown.labor} total={breakdown.totalCost} color={CHART_COLORS[1]}
                formula={
                  config.granularity === "standard" ? "Labor Hrs/Unit × Labor Rate ($/hr)"
                  : config.granularity === "detailed" ? "Σ (Hours × Rate) per labor step"
                  : "Direct input — Labor/Unit"
                }
              />
              <CostRow
                label="Overhead" value={breakdown.overhead} total={breakdown.totalCost} color={CHART_COLORS[2]}
                formula={
                  config.granularity === "detailed"
                    ? "(Machine Hrs × Rate) + Facility Alloc. + Utilities/Unit"
                    : "Direct input — Overhead Rate/Unit"
                }
              />
              {config.granularity !== "simple" && (
                <>
                  <CostRow
                    label="Tooling" value={breakdown.tooling} total={breakdown.totalCost} color={CHART_COLORS[3]}
                    formula="Tooling Cost ÷ (Amort. Years × Annual Volume)"
                  />
                  <CostRow
                    label="Yield Loss" value={breakdown.yieldLoss + breakdown.scrapDisposal} total={breakdown.totalCost} color={CHART_COLORS[4]}
                    formula="Materials × (1 ÷ Yield Rate − 1)"
                  />
                  <CostRow
                    label="Packaging" value={breakdown.packaging} total={breakdown.totalCost} color={CHART_COLORS[5]}
                    formula="Direct input — Packaging Cost/Unit"
                  />
                  <CostRow
                    label="Logistics" value={breakdown.logistics} total={breakdown.totalCost} color={CHART_COLORS[6]}
                    formula="Inbound Freight/Unit + Outbound Freight/Unit"
                  />
                  <CostRow
                    label="Warranty" value={breakdown.warranty} total={breakdown.totalCost} color={CHART_COLORS[7]}
                    formula="ASP × Warranty Provision %"
                  />
                </>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
              <span className="text-sm font-bold text-foreground flex items-center">
                Total CPU
                <FormulaTooltip formula="Σ (Materials + Labor + Overhead + Tooling + Yield Loss + Packaging + Logistics + Warranty)" />
              </span>
              <span className="text-lg font-bold stat-value text-primary">${fmt(breakdown.totalCost)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>ASP</span>
              <span className="stat-value">${fmt(config.sellingPrice)}</span>
            </div>
            <div className={`mt-1 flex items-center justify-between text-xs font-semibold ${marginColor}`}>
              <span className="flex items-center">
                Gross Margin
                <FormulaTooltip formula="(ASP − CPU) ÷ ASP × 100% · dollar: ASP − CPU" />
              </span>
              <span className="stat-value">
                {(breakdown.grossMarginPercent * 100).toFixed(1)}% (${fmt(breakdown.grossMargin)})
              </span>
            </div>

            {/* Chart */}
            {chartData.length > 0 && (
              <div className="mt-5 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={70}
                      tick={{ fontSize: 11, fill: "hsl(210,14%,52%)" }}
                    />
                    <Tooltip
                      formatter={(v: number) => [`$${fmt(v)}`, "Cost"]}
                      contentStyle={{
                        background: "hsl(222,26%,12%)",
                        border: "1px solid hsl(222,20%,18%)",
                        borderRadius: 4,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                      {chartData.map((_, idx) => (
                        <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
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

function CostRow({
  label,
  value,
  total,
  color,
  formula,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  formula?: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1 text-xs text-muted-foreground flex items-center min-w-0">
        <span className="truncate">{label}</span>
        {formula && <FormulaTooltip formula={formula} />}
      </span>
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{pct.toFixed(0)}%</span>
      <span className="text-xs stat-value text-foreground w-16 text-right shrink-0">${fmt(value)}</span>
    </div>
  );
}

function fmtM(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return fmt(v);
}
