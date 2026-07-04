import { useLocation } from "wouter";
import { useActiveScenario } from "@/lib/store";
import { Granularity, defaultInputs } from "@/lib/formulas";
import { Calculator, ChevronRight, Layers, Layers2, Layers3 } from "lucide-react";

const GRANULARITY_OPTIONS: {
  value: Granularity;
  label: string;
  description: string;
  detail: string;
  icon: typeof Layers;
}[] = [
  {
    value: "simple",
    label: "Simple",
    description: "3 line items",
    detail: "Materials · Labor · Overhead — best for quick estimates or early-stage products.",
    icon: Layers,
  },
  {
    value: "standard",
    label: "Standard",
    description: "7 line items",
    detail: "Adds Tooling amortization, Yield/Scrap, Packaging, and Logistics — typical for production products.",
    icon: Layers2,
  },
  {
    value: "detailed",
    label: "Detailed",
    description: "Full BOM + operations",
    detail: "Individual BOM items, labor by operation step, overhead sub-categories — full cost accounting.",
    icon: Layers3,
  },
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function NumericInput({
  value,
  onChange,
  prefix,
  suffix,
  step = "1",
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <div className="flex items-center border border-border rounded-md bg-input/30 focus-within:ring-1 focus-within:ring-ring overflow-hidden">
      {prefix && (
        <span className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-r border-border select-none">
          {prefix}
        </span>
      )}
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none stat-value min-w-0"
      />
      {suffix && (
        <span className="px-3 py-2 text-sm text-muted-foreground bg-muted/50 border-l border-border select-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

export default function SetupPage() {
  const { scenario, update } = useActiveScenario();
  const [, navigate] = useLocation();

  const updateConfig = (updates: Partial<typeof scenario.config>) => {
    update({ config: { ...scenario.config, ...updates } });
  };

  const selectGranularity = (g: Granularity) => {
    update({
      config: { ...scenario.config, granularity: g },
      inputs: { ...defaultInputs, ...scenario.inputs },
    });
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Product Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your product and choose how granular your cost model should be.
        </p>
      </div>

      {/* Product Details */}
      <div className="bg-card border border-card-border rounded-lg p-6 mb-6 space-y-5">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Product Details
        </h2>

        <Field label="Product Name">
          <input
            type="text"
            value={scenario.config.name}
            onChange={(e) => updateConfig({ name: e.target.value })}
            placeholder="e.g. Industrial Sensor Rev B"
            className="w-full border border-border rounded-md bg-input/30 px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Selling Price / Unit" hint="Revenue per unit shipped">
            <NumericInput
              prefix="$"
              value={scenario.config.sellingPrice}
              onChange={(v) => updateConfig({ sellingPrice: v })}
              step="0.01"
            />
          </Field>

          <Field label="Annual Production Volume" hint="Units produced per year">
            <NumericInput
              suffix="units"
              value={scenario.config.annualVolume}
              onChange={(v) => updateConfig({ annualVolume: Math.round(v) })}
              step="100"
            />
          </Field>
        </div>
      </div>

      {/* Granularity */}
      <div className="bg-card border border-card-border rounded-lg p-6 mb-8">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
          Model Granularity
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Choose how detailed your cost breakdown should be. You can change this at any time.
        </p>

        <div className="space-y-2">
          {GRANULARITY_OPTIONS.map(({ value, label, description, detail, icon: Icon }) => {
            const isSelected = scenario.config.granularity === value;
            return (
              <button
                key={value}
                onClick={() => selectGranularity(value)}
                className={`w-full text-left rounded-md border transition-colors px-4 py-4 flex items-start gap-4 ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <div className={`mt-0.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        isSelected ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {label}
                    </span>
                    <span className="text-xs text-muted-foreground">{description}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{detail}</p>
                </div>
                {isSelected && (
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate("/calculator")}
        className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        <Calculator className="w-4 h-4" />
        Go to Cost Model
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
