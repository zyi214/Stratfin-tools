export type Granularity = "simple" | "standard" | "detailed";

export interface BomItem {
  id: string;
  name: string;
  quantity: number;
  unitCost: number;
}

export interface LaborStep {
  id: string;
  name: string;
  hours: number;
  rate: number;
}

export interface ProductConfig {
  name: string;
  sellingPrice: number;
  annualVolume: number;
  granularity: Granularity;
}

export interface CostInputs {
  // Simple
  materialsSimple: number;
  laborSimple: number;
  overheadSimple: number;

  // Standard
  materialsStandard: number;
  laborHoursStandard: number;
  laborRateStandard: number;
  overheadRateStandard: number;

  // Detailed
  bomItems: BomItem[];
  laborSteps: LaborStep[];
  overheadMachineHours: number;
  overheadMachineRate: number;
  overheadFacilityAllocation: number;
  overheadUtilitiesPerUnit: number;

  // Advanced (Standard & Detailed)
  toolingCost: number;
  toolingAmortizationYears: number;
  toolingLifetimeUnits: number;

  yieldRate: number;
  scrapDisposalCostPerUnit: number;

  packagingCost: number;
  logisticsInbound: number;
  logisticsOutbound: number;
  warrantyProvisionPercent: number;
}

export interface Scenario {
  id: string;
  name: string;
  config: ProductConfig;
  inputs: CostInputs;
  isBaseCase?: boolean;
}

export const defaultInputs: CostInputs = {
  materialsSimple: 50,
  laborSimple: 25,
  overheadSimple: 15,

  materialsStandard: 50,
  laborHoursStandard: 1.5,
  laborRateStandard: 20,
  overheadRateStandard: 15,

  bomItems: [
    { id: "1", name: "Main PCBA", quantity: 1, unitCost: 35 },
    { id: "2", name: "Enclosure", quantity: 1, unitCost: 10 },
    { id: "3", name: "Fasteners", quantity: 10, unitCost: 0.5 },
  ],
  laborSteps: [
    { id: "1", name: "Assembly", hours: 1, rate: 18 },
    { id: "2", name: "Testing", hours: 0.5, rate: 25 },
  ],
  overheadMachineHours: 0.5,
  overheadMachineRate: 20,
  overheadFacilityAllocation: 2.5,
  overheadUtilitiesPerUnit: 0.5,

  toolingCost: 100000,
  toolingAmortizationYears: 3,
  toolingLifetimeUnits: 0,

  yieldRate: 0.98,
  scrapDisposalCostPerUnit: 0.5,

  packagingCost: 3,
  logisticsInbound: 2,
  logisticsOutbound: 5,
  warrantyProvisionPercent: 0.02,
};

export const defaultConfig: ProductConfig = {
  name: "Industrial Sensor Rev B",
  sellingPrice: 299,
  annualVolume: 10000,
  granularity: "simple",
};

export interface CostBreakdown {
  materials: number;
  labor: number;
  overhead: number;
  tooling: number;
  yieldLoss: number;
  scrapDisposal: number;
  packaging: number;
  logistics: number;
  warranty: number;
  totalCost: number;
  grossMargin: number;
  grossMarginPercent: number;
}

export function calculateCosts(config: ProductConfig, inputs: CostInputs): CostBreakdown {
  let materials = 0;
  let labor = 0;
  let overhead = 0;

  if (config.granularity === "simple") {
    materials = inputs.materialsSimple;
    labor = inputs.laborSimple;
    overhead = inputs.overheadSimple;
  } else if (config.granularity === "standard") {
    materials = inputs.materialsStandard;
    labor = inputs.laborHoursStandard * inputs.laborRateStandard;
    overhead = inputs.overheadRateStandard;
  } else {
    materials = inputs.bomItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    labor = inputs.laborSteps.reduce((sum, step) => sum + step.hours * step.rate, 0);
    overhead =
      inputs.overheadMachineHours * inputs.overheadMachineRate +
      inputs.overheadFacilityAllocation +
      inputs.overheadUtilitiesPerUnit;
  }

  let tooling = 0;
  let yieldLoss = 0;
  let scrapDisposal = 0;
  let packaging = 0;
  let logistics = 0;
  let warranty = 0;

  if (config.granularity !== "simple") {
    if (inputs.toolingAmortizationYears > 0 && config.annualVolume > 0) {
      tooling = inputs.toolingCost / (inputs.toolingAmortizationYears * config.annualVolume);
    } else if (inputs.toolingLifetimeUnits > 0) {
      tooling = inputs.toolingCost / inputs.toolingLifetimeUnits;
    }

    const yieldMultiplier = inputs.yieldRate > 0 && inputs.yieldRate < 1 ? (1 / inputs.yieldRate) - 1 : 0;
    yieldLoss = materials * yieldMultiplier;
    scrapDisposal = inputs.scrapDisposalCostPerUnit * yieldMultiplier;

    packaging = inputs.packagingCost;
    logistics = inputs.logisticsInbound + inputs.logisticsOutbound;
    warranty = config.sellingPrice * inputs.warrantyProvisionPercent;
  }

  const totalCost = materials + labor + overhead + tooling + yieldLoss + scrapDisposal + packaging + logistics + warranty;
  const grossMargin = config.sellingPrice - totalCost;
  const grossMarginPercent = config.sellingPrice > 0 ? grossMargin / config.sellingPrice : 0;

  return {
    materials,
    labor,
    overhead,
    tooling,
    yieldLoss,
    scrapDisposal,
    packaging,
    logistics,
    warranty,
    totalCost,
    grossMargin,
    grossMarginPercent,
  };
}

export type SolveGoalType = "target_cpu" | "target_margin" | "investment_payback";
export type SolveVariable =
  | "materialsSimple" | "laborSimple" | "overheadSimple"
  | "materialsStandard" | "laborHoursStandard" | "laborRateStandard" | "overheadRateStandard"
  | "toolingCost" | "annualVolume" | "yieldRate"
  | "packagingCost" | "logisticsInbound" | "logisticsOutbound" | "warrantyProvisionPercent"
  | "sellingPrice";

export interface SolveGoal {
  type: SolveGoalType;
  targetCPU?: number;
  targetMarginPercent?: number;
  investmentAmount?: number;
  paybackYears?: number;
}

export interface SolveResult {
  solvedValue: number;
  currentValue: number;
  delta: number;
  deltaPercent: number;
  feasible: boolean;
  message: string;
  // For investment payback
  requiredCostSavingPerUnit?: number;
  annualSavings?: number;
  paybackMonths?: number;
}

export function solveForVariable(
  config: ProductConfig,
  inputs: CostInputs,
  variable: SolveVariable,
  goal: SolveGoal
): SolveResult | null {
  const current = calculateCosts(config, inputs);

  let targetCPU = 0;
  if (goal.type === "target_cpu" && goal.targetCPU !== undefined) {
    targetCPU = goal.targetCPU;
  } else if (goal.type === "target_margin" && goal.targetMarginPercent !== undefined) {
    targetCPU = config.sellingPrice * (1 - goal.targetMarginPercent / 100);
  } else if (goal.type === "investment_payback" && goal.investmentAmount !== undefined) {
    // For investment payback, we calculate what savings per unit are needed
    const annualVolume = config.annualVolume;
    if (annualVolume <= 0) return null;
    // We'll show the result differently
    // First solve: what CPU reduction gets payback in X years?
    // We need user to specify payback target — we show the breakeven analysis
    const investmentAmount = goal.investmentAmount;
    const paybackYears = goal.paybackYears ?? 3;
    const requiredCostSavingPerUnit = investmentAmount / (annualVolume * paybackYears);
    targetCPU = current.totalCost - requiredCostSavingPerUnit;
  }

  const requiredReduction = current.totalCost - targetCPU;

  let solvedValue = 0;
  let currentValue = 0;
  let feasible = true;
  let message = "";

  switch (variable) {
    case "materialsSimple":
      currentValue = inputs.materialsSimple;
      solvedValue = inputs.materialsSimple - requiredReduction;
      break;
    case "laborSimple":
      currentValue = inputs.laborSimple;
      solvedValue = inputs.laborSimple - requiredReduction;
      break;
    case "overheadSimple":
      currentValue = inputs.overheadSimple;
      solvedValue = inputs.overheadSimple - requiredReduction;
      break;
    case "materialsStandard":
      currentValue = inputs.materialsStandard;
      solvedValue = inputs.materialsStandard - requiredReduction;
      break;
    case "laborHoursStandard": {
      currentValue = inputs.laborHoursStandard;
      const currentLaborCost = inputs.laborHoursStandard * inputs.laborRateStandard;
      const targetLaborCost = currentLaborCost - requiredReduction;
      solvedValue = inputs.laborRateStandard > 0 ? targetLaborCost / inputs.laborRateStandard : 0;
      break;
    }
    case "laborRateStandard": {
      currentValue = inputs.laborRateStandard;
      const currentLaborCost2 = inputs.laborHoursStandard * inputs.laborRateStandard;
      const targetLaborCost2 = currentLaborCost2 - requiredReduction;
      solvedValue = inputs.laborHoursStandard > 0 ? targetLaborCost2 / inputs.laborHoursStandard : 0;
      break;
    }
    case "overheadRateStandard":
      currentValue = inputs.overheadRateStandard;
      solvedValue = inputs.overheadRateStandard - requiredReduction;
      break;
    case "toolingCost": {
      currentValue = inputs.toolingCost;
      const targetToolingAmortized = current.tooling - requiredReduction;
      if (inputs.toolingAmortizationYears > 0 && config.annualVolume > 0) {
        solvedValue = targetToolingAmortized * inputs.toolingAmortizationYears * config.annualVolume;
      } else if (inputs.toolingLifetimeUnits > 0) {
        solvedValue = targetToolingAmortized * inputs.toolingLifetimeUnits;
      } else {
        solvedValue = 0;
      }
      break;
    }
    case "annualVolume": {
      currentValue = config.annualVolume;
      if (inputs.toolingAmortizationYears > 0 && inputs.toolingCost > 0) {
        // Only tooling changes with volume in this model
        const toolingNeeded = current.tooling - requiredReduction;
        if (toolingNeeded <= 0) {
          solvedValue = Infinity;
          message = "Volume increase alone cannot achieve this target (tooling is the only volume-dependent cost here).";
          feasible = false;
        } else {
          solvedValue = inputs.toolingCost / (inputs.toolingAmortizationYears * toolingNeeded);
        }
      } else {
        feasible = false;
        message = "Annual volume only affects tooling amortization. No tooling cost is configured.";
        solvedValue = config.annualVolume;
      }
      break;
    }
    case "yieldRate": {
      currentValue = inputs.yieldRate * 100;
      // yieldLoss = materials * (1/yieldRate - 1)
      // targetYieldLoss = yieldLoss - requiredReduction
      // but yield also affects scrapDisposal
      const targetYieldLoss = current.yieldLoss - requiredReduction;
      const matBase = current.materials;
      if (matBase > 0 && targetYieldLoss >= 0) {
        const newYieldMultiplier = targetYieldLoss / matBase;
        solvedValue = (1 / (newYieldMultiplier + 1)) * 100;
      } else if (targetYieldLoss < 0) {
        solvedValue = 100;
        message = "Yield improvement cannot alone achieve this target.";
        feasible = false;
      } else {
        solvedValue = inputs.yieldRate * 100;
        feasible = false;
        message = "Cannot solve for yield rate with zero materials cost.";
      }
      break;
    }
    case "packagingCost":
      currentValue = inputs.packagingCost;
      solvedValue = inputs.packagingCost - requiredReduction;
      break;
    case "logisticsInbound":
      currentValue = inputs.logisticsInbound;
      solvedValue = inputs.logisticsInbound - requiredReduction;
      break;
    case "logisticsOutbound":
      currentValue = inputs.logisticsOutbound;
      solvedValue = inputs.logisticsOutbound - requiredReduction;
      break;
    case "warrantyProvisionPercent": {
      currentValue = inputs.warrantyProvisionPercent * 100;
      const targetWarranty = current.warranty - requiredReduction;
      solvedValue = config.sellingPrice > 0 ? (targetWarranty / config.sellingPrice) * 100 : 0;
      break;
    }
    case "sellingPrice": {
      currentValue = config.sellingPrice;
      // CPU stays same, margin changes
      if (goal.type === "target_margin" && goal.targetMarginPercent !== undefined) {
        const margin = goal.targetMarginPercent / 100;
        solvedValue = margin < 1 ? current.totalCost / (1 - margin) : 0;
      } else {
        // Can't solve price for a CPU target (price doesn't affect CPU directly except warranty)
        solvedValue = current.totalCost + (goal.targetCPU ? goal.targetCPU - current.totalCost : 0);
        message = "Selling price affects warranty provision but not most cost line items.";
      }
      break;
    }
    default:
      return null;
  }

  if (solvedValue < 0) {
    feasible = false;
    message = message || "The required value is negative — this target cannot be achieved by adjusting this variable alone.";
  }

  if (!message && feasible) {
    const deltaAbs = solvedValue - currentValue;
    const pct = currentValue !== 0 ? (deltaAbs / Math.abs(currentValue)) * 100 : 0;
    if (Math.abs(pct) < 0.01) {
      message = "Already at target — no change needed.";
    } else if (pct < 0) {
      message = `Requires a ${Math.abs(pct).toFixed(1)}% reduction (${formatDelta(deltaAbs)}).`;
    } else {
      message = `Requires a ${Math.abs(pct).toFixed(1)}% increase (+${formatDelta(deltaAbs)}).`;
    }
  }

  const delta = solvedValue - currentValue;
  const deltaPercent = currentValue !== 0 ? (delta / Math.abs(currentValue)) * 100 : 0;

  let result: SolveResult = { solvedValue, currentValue, delta, deltaPercent, feasible, message };

  if (goal.type === "investment_payback" && goal.investmentAmount !== undefined) {
    const annualSavings = (current.totalCost - targetCPU) * config.annualVolume;
    const paybackMonths = annualSavings > 0 ? (goal.investmentAmount / annualSavings) * 12 : Infinity;
    result.requiredCostSavingPerUnit = current.totalCost - targetCPU;
    result.annualSavings = annualSavings;
    result.paybackMonths = paybackMonths;
  }

  return result;
}

function formatDelta(val: number): string {
  return val >= 0 ? `+$${val.toFixed(2)}` : `-$${Math.abs(val).toFixed(2)}`;
}

export function sensitivityAnalysis(
  config: ProductConfig,
  inputs: CostInputs,
  variable: SolveVariable,
  goal: SolveGoal,
  volumeMultipliers: number[]
): { volumeMultiplier: number; annualVolume: number; solvedValue: number | null }[] {
  return volumeMultipliers.map((mult) => {
    const testConfig = { ...config, annualVolume: Math.round(config.annualVolume * mult) };
    const result = solveForVariable(testConfig, inputs, variable, goal);
    return {
      volumeMultiplier: mult,
      annualVolume: testConfig.annualVolume,
      solvedValue: result?.feasible ? result.solvedValue : null,
    };
  });
}

/**
 * Compute CPU for a scenario at an arbitrary volume — used for crossover curves.
 * Only the tooling amortization line changes with volume; everything else is fixed.
 */
export function calculateCostsAtVolume(
  config: ProductConfig,
  inputs: CostInputs,
  volume: number
): CostBreakdown {
  return calculateCosts({ ...config, annualVolume: volume }, inputs);
}

/**
 * Make vs. Buy crossover analysis.
 *
 * The Make scenario has fixed per-unit costs (materials, labor, overhead, yield, pkg, etc.)
 * PLUS a volume-dependent tooling term: toolingCost / (years × V).
 *
 * The Buy scenario is assumed to be essentially fixed-cost (supplier absorbs tooling).
 *
 * Crossover: make_fixed + tooling/(years×V) = buy_cpu
 *   → V = toolingCost / (years × (buy_cpu − make_fixed))
 *
 * Returns null if crossover does not exist (Make is always cheaper, or always more expensive).
 */
export interface MakeVsBuyAnalysis {
  crossoverVolume: number | null;  // units at which Make becomes cheaper than Buy
  makeFixedCPU: number;            // Make CPU excluding tooling (at infinite volume)
  buyCPU: number;                  // Buy CPU at the configured volume
  makeToolingPerUnit: number;      // tooling amortization component at configured volume
  makeCPUAtConfigVolume: number;   // full Make CPU at its configured annual volume
  annualSavingsAtCrossover: number | null;
  annualSavingsAtCurrentVolume: number; // positive = Make saves money vs Buy
  toolingPaybackMonths: number | null;  // months to recoup Make tooling investment
  curvePoints: { volume: number; makeCPU: number; buyCPU: number }[];
}

export function makevsBuyAnalysis(
  buyConfig: ProductConfig,
  buyInputs: CostInputs,
  makeConfig: ProductConfig,
  makeInputs: CostInputs
): MakeVsBuyAnalysis {
  const buyCPU = calculateCosts(buyConfig, buyInputs).totalCost;

  // Make's fixed costs at effectively infinite volume (tooling → 0)
  const makeAtInfinity = calculateCosts(
    { ...makeConfig, annualVolume: 999_999_999 },
    makeInputs
  ).totalCost;

  const makeToolingTotal = makeInputs.toolingCost;
  const makeToolingYears = makeInputs.toolingAmortizationYears || 1;

  // Make's configured-volume CPU
  const makeFull = calculateCosts(makeConfig, makeInputs);
  const makeCPUAtConfigVolume = makeFull.totalCost;
  const makeFixedCPU = makeAtInfinity; // ≈ CPU without tooling amortization

  // Crossover: makeFixed + tooling/(years×V) = buyCPU
  // V = tooling / (years × (buyCPU − makeFixed))
  const denominator = buyCPU - makeFixedCPU;
  let crossoverVolume: number | null = null;
  if (denominator > 0 && makeToolingTotal > 0 && makeToolingYears > 0) {
    crossoverVolume = Math.ceil(makeToolingTotal / (makeToolingYears * denominator));
  }

  // Annual savings at the Make scenario's configured volume
  const refVolume = makeConfig.annualVolume;
  const annualSavingsAtCurrentVolume = (buyCPU - makeCPUAtConfigVolume) * refVolume;

  // Annual savings at crossover
  const annualSavingsAtCrossover =
    crossoverVolume !== null ? (buyCPU - buyCPU) * crossoverVolume : null; // = 0 by definition

  // Tooling payback: how many months until cumulative savings cover the tooling spend?
  // Savings per month = annualSavingsAtCurrentVolume / 12
  let toolingPaybackMonths: number | null = null;
  if (annualSavingsAtCurrentVolume > 0 && makeToolingTotal > 0) {
    toolingPaybackMonths = (makeToolingTotal / annualSavingsAtCurrentVolume) * 12;
  }

  // Build curve data — sweep volume from ~10% of crossover (or configured volume) to 3×
  const refPoint = crossoverVolume ?? refVolume;
  const minV = Math.max(100, Math.round(refPoint * 0.2));
  const maxV = Math.round(Math.max(refPoint, refVolume) * 3.5);
  const steps = 40;
  const step = Math.max(1, Math.round((maxV - minV) / steps));

  const curvePoints: { volume: number; makeCPU: number; buyCPU: number }[] = [];
  for (let v = minV; v <= maxV; v += step) {
    const mc = calculateCostsAtVolume(makeConfig, makeInputs, v).totalCost;
    const bc = calculateCostsAtVolume(buyConfig, buyInputs, v).totalCost;
    curvePoints.push({ volume: v, makeCPU: +mc.toFixed(4), buyCPU: +bc.toFixed(4) });
  }
  // Ensure configured volumes appear in the curve
  [refVolume, makeConfig.annualVolume, crossoverVolume]
    .filter((v): v is number => v !== null && v > 0)
    .forEach((v) => {
      if (!curvePoints.find((p) => p.volume === v)) {
        const mc = calculateCostsAtVolume(makeConfig, makeInputs, v).totalCost;
        const bc = calculateCostsAtVolume(buyConfig, buyInputs, v).totalCost;
        curvePoints.push({ volume: v, makeCPU: +mc.toFixed(4), buyCPU: +bc.toFixed(4) });
      }
    });
  curvePoints.sort((a, b) => a.volume - b.volume);

  return {
    crossoverVolume,
    makeFixedCPU,
    buyCPU,
    makeToolingPerUnit: makeFull.tooling,
    makeCPUAtConfigVolume,
    annualSavingsAtCrossover,
    annualSavingsAtCurrentVolume,
    toolingPaybackMonths,
    curvePoints,
  };
}

export function fmt(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPct(value: number, decimals = 1): string {
  return (value * 100).toFixed(decimals) + "%";
}

export const SOLVE_VARIABLE_LABELS: Record<SolveVariable, string> = {
  materialsSimple: "Materials Cost/Unit",
  laborSimple: "Labor Cost/Unit",
  overheadSimple: "Overhead Cost/Unit",
  materialsStandard: "Material Cost/Unit",
  laborHoursStandard: "Labor Hours/Unit",
  laborRateStandard: "Labor Rate ($/hr)",
  overheadRateStandard: "Overhead Rate/Unit",
  toolingCost: "Tooling Investment ($)",
  annualVolume: "Annual Volume (units)",
  yieldRate: "Yield Rate (%)",
  packagingCost: "Packaging Cost/Unit",
  logisticsInbound: "Inbound Logistics/Unit",
  logisticsOutbound: "Outbound Logistics/Unit",
  warrantyProvisionPercent: "Warranty Provision (%)",
  sellingPrice: "Selling Price",
};

export const SOLVE_VARIABLES_BY_GRANULARITY: Record<Granularity, SolveVariable[]> = {
  simple: ["materialsSimple", "laborSimple", "overheadSimple", "sellingPrice"],
  standard: [
    "materialsStandard", "laborHoursStandard", "laborRateStandard", "overheadRateStandard",
    "toolingCost", "annualVolume", "yieldRate",
    "packagingCost", "logisticsInbound", "logisticsOutbound", "warrantyProvisionPercent", "sellingPrice"
  ],
  detailed: [
    "laborHoursStandard", "laborRateStandard",
    "toolingCost", "annualVolume", "yieldRate",
    "packagingCost", "logisticsInbound", "logisticsOutbound", "warrantyProvisionPercent", "sellingPrice"
  ],
};

export function overrideVariable(
  config: ProductConfig,
  inputs: CostInputs,
  variable: SolveVariable,
  value: number
): { config: ProductConfig; inputs: CostInputs } {
  const nextConfig = { ...config };
  const nextInputs = { ...inputs };

  switch (variable) {
    case "materialsSimple":
      nextInputs.materialsSimple = value;
      break;
    case "laborSimple":
      nextInputs.laborSimple = value;
      break;
    case "overheadSimple":
      nextInputs.overheadSimple = value;
      break;
    case "materialsStandard":
      nextInputs.materialsStandard = value;
      break;
    case "laborHoursStandard":
      nextInputs.laborHoursStandard = value;
      break;
    case "laborRateStandard":
      nextInputs.laborRateStandard = value;
      break;
    case "overheadRateStandard":
      nextInputs.overheadRateStandard = value;
      break;
    case "toolingCost":
      nextInputs.toolingCost = value;
      break;
    case "annualVolume":
      nextConfig.annualVolume = value;
      break;
    case "yieldRate":
      nextInputs.yieldRate = value / 100;
      break;
    case "packagingCost":
      nextInputs.packagingCost = value;
      break;
    case "logisticsInbound":
      nextInputs.logisticsInbound = value;
      break;
    case "logisticsOutbound":
      nextInputs.logisticsOutbound = value;
      break;
    case "warrantyProvisionPercent":
      nextInputs.warrantyProvisionPercent = value / 100;
      break;
    case "sellingPrice":
      nextConfig.sellingPrice = value;
      break;
  }

  return { config: nextConfig, inputs: nextInputs };
}
