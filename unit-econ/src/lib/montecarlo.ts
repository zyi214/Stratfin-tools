import { ProductConfig, CostInputs, calculateCosts } from "./formulas";

export interface UncertaintyInput {
  key: string;
  label: string;
  currentValue: number;
  unit: string;        // "$", "%", "hrs", "units" — for display
  enabled: boolean;
  lowPct: number;      // % below current value (0–100)
  highPct: number;     // % above current value (0–100)
}

export interface MonteCarloResult {
  runs: number;
  cpuValues: Float64Array;      // sorted ascending
  marginPctValues: Float64Array; // sorted ascending (parallel to cpuValues)
  mean: number;
  stdDev: number;
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  histogramBins: HistogramBin[];
  probabilityBelowTarget: number | null;
  targetCPU: number | null;
}

export interface HistogramBin {
  cpuLow: number;
  cpuMid: number;
  cpuHigh: number;
  count: number;
  pct: number;           // fraction of runs in this bin
  cumulative: number;    // cumulative fraction up to and including this bin
  belowTarget: boolean;  // true if cpuHigh <= targetCPU
}

function uniformSample(low: number, high: number): number {
  return low + Math.random() * (high - low);
}

function percentile(sorted: Float64Array, p: number): number {
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

function buildHistogram(
  sorted: Float64Array,
  bins: number,
  targetCPU: number | null
): HistogramBin[] {
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;
  if (range === 0) {
    return [{
      cpuLow: min,
      cpuMid: min,
      cpuHigh: min,
      count: sorted.length,
      pct: 1,
      cumulative: 1,
      belowTarget: targetCPU !== null ? min <= targetCPU : false,
    }];
  }

  const binWidth = range / bins;
  const result: HistogramBin[] = [];
  let cumCount = 0;
  let dataIdx = 0;

  for (let b = 0; b < bins; b++) {
    const lo = min + b * binWidth;
    const hi = lo + binWidth;
    let count = 0;
    // count all values in [lo, hi) — last bin is [lo, hi]
    while (dataIdx < sorted.length && (sorted[dataIdx] < hi || b === bins - 1)) {
      count++;
      dataIdx++;
    }
    cumCount += count;
    result.push({
      cpuLow: lo,
      cpuMid: lo + binWidth / 2,
      cpuHigh: hi,
      count,
      pct: count / sorted.length,
      cumulative: cumCount / sorted.length,
      belowTarget: targetCPU !== null ? hi <= targetCPU : false,
    });
  }

  return result;
}

/**
 * Apply sampled uncertainty to a value, clamped so it doesn't go negative.
 * If the current value is 0, returns 0 (can't apply ± to 0 meaningfully).
 */
function sampleValue(current: number, lowPct: number, highPct: number): number {
  if (current === 0) return 0;
  const lo = current * (1 - lowPct / 100);
  const hi = current * (1 + highPct / 100);
  return Math.max(0, uniformSample(lo, hi));
}

export function runMonteCarlo(
  config: ProductConfig,
  inputs: CostInputs,
  uncertainties: UncertaintyInput[],
  runs: number = 5000,
  targetCPU: number | null = null
): MonteCarloResult {
  const enabledKeys = new Set(uncertainties.filter((u) => u.enabled).map((u) => u.key));
  const uMap = new Map(uncertainties.map((u) => [u.key, u]));

  const cpuValues = new Float64Array(runs);
  const marginPctValues = new Float64Array(runs);

  const baseASP = config.sellingPrice;

  for (let i = 0; i < runs; i++) {
    // Sample inputs
    const sampledInputs: CostInputs = { ...inputs };
    let sampledASP = baseASP;

    for (const u of uncertainties) {
      if (!u.enabled) continue;
      const sampled = sampleValue(u.currentValue, u.lowPct, u.highPct);

      switch (u.key) {
        case "sellingPrice":
          sampledASP = Math.max(0.01, sampled);
          break;
        case "materialsSimple":
          sampledInputs.materialsSimple = sampled;
          break;
        case "laborSimple":
          sampledInputs.laborSimple = sampled;
          break;
        case "overheadSimple":
          sampledInputs.overheadSimple = sampled;
          break;
        case "materialsStandard":
          sampledInputs.materialsStandard = sampled;
          break;
        case "laborHoursStandard":
          sampledInputs.laborHoursStandard = sampled;
          break;
        case "laborRateStandard":
          sampledInputs.laborRateStandard = sampled;
          break;
        case "overheadRateStandard":
          sampledInputs.overheadRateStandard = sampled;
          break;
        case "toolingCost":
          sampledInputs.toolingCost = sampled;
          break;
        case "yieldRate":
          // yieldRate stored as 0-1; uncertainty key tracks it as 0-1
          sampledInputs.yieldRate = Math.min(0.9999, Math.max(0.0001, sampled));
          break;
        case "packagingCost":
          sampledInputs.packagingCost = sampled;
          break;
        case "logisticsInbound":
          sampledInputs.logisticsInbound = sampled;
          break;
        case "logisticsOutbound":
          sampledInputs.logisticsOutbound = sampled;
          break;
        case "warrantyProvisionPercent":
          sampledInputs.warrantyProvisionPercent = Math.min(0.5, Math.max(0, sampled));
          break;
        case "bomScaleFactor": {
          // Scale all BOM items proportionally
          sampledInputs.bomItems = inputs.bomItems.map((item) => ({
            ...item,
            unitCost: item.unitCost * sampled,
          }));
          break;
        }
        case "laborScaleFactor": {
          sampledInputs.laborSteps = inputs.laborSteps.map((step) => ({
            ...step,
            rate: step.rate * sampled,
          }));
          break;
        }
        case "overheadMachineRate":
          sampledInputs.overheadMachineRate = sampled;
          break;
      }
    }

    const sampledConfig = enabledKeys.has("sellingPrice")
      ? { ...config, sellingPrice: sampledASP }
      : config;

    const bd = calculateCosts(sampledConfig, sampledInputs);
    cpuValues[i] = bd.totalCost;
    marginPctValues[i] = bd.grossMarginPercent;
  }

  // Sort ascending
  cpuValues.sort();
  marginPctValues.sort();

  // Stats
  const mean = cpuValues.reduce((a, b) => a + b, 0) / runs;
  let variance = 0;
  for (let i = 0; i < runs; i++) variance += (cpuValues[i] - mean) ** 2;
  variance /= runs;
  const stdDev = Math.sqrt(variance);

  // Percentiles
  const p5 = percentile(cpuValues, 5);
  const p10 = percentile(cpuValues, 10);
  const p25 = percentile(cpuValues, 25);
  const p50 = percentile(cpuValues, 50);
  const p75 = percentile(cpuValues, 75);
  const p90 = percentile(cpuValues, 90);
  const p95 = percentile(cpuValues, 95);

  // Probability below target
  let probabilityBelowTarget: number | null = null;
  if (targetCPU !== null) {
    let below = 0;
    for (let i = 0; i < runs; i++) {
      if (cpuValues[i] <= targetCPU) below++;
    }
    probabilityBelowTarget = below / runs;
  }

  const histogramBins = buildHistogram(cpuValues, 28, targetCPU);

  return {
    runs,
    cpuValues,
    marginPctValues,
    mean,
    stdDev,
    p5, p10, p25, p50, p75, p90, p95,
    histogramBins,
    probabilityBelowTarget,
    targetCPU,
  };
}

/**
 * Build default uncertainty inputs based on the current scenario + granularity.
 */
export function buildDefaultUncertainties(
  config: ProductConfig,
  inputs: CostInputs
): UncertaintyInput[] {
  const { granularity } = config;

  if (granularity === "simple") {
    return [
      { key: "materialsSimple", label: "Materials/Unit", currentValue: inputs.materialsSimple, unit: "$", enabled: true, lowPct: 15, highPct: 15 },
      { key: "laborSimple", label: "Labor/Unit", currentValue: inputs.laborSimple, unit: "$", enabled: true, lowPct: 10, highPct: 10 },
      { key: "overheadSimple", label: "Overhead/Unit", currentValue: inputs.overheadSimple, unit: "$", enabled: false, lowPct: 10, highPct: 10 },
      { key: "sellingPrice", label: "Selling Price (ASP)", currentValue: config.sellingPrice, unit: "$", enabled: false, lowPct: 5, highPct: 5 },
    ];
  }

  if (granularity === "standard") {
    return [
      { key: "materialsStandard", label: "Materials/Unit", currentValue: inputs.materialsStandard, unit: "$", enabled: true, lowPct: 15, highPct: 15 },
      { key: "laborHoursStandard", label: "Labor Hours/Unit", currentValue: inputs.laborHoursStandard, unit: "hrs", enabled: true, lowPct: 10, highPct: 20 },
      { key: "laborRateStandard", label: "Labor Rate ($/hr)", currentValue: inputs.laborRateStandard, unit: "$", enabled: false, lowPct: 5, highPct: 5 },
      { key: "overheadRateStandard", label: "Overhead Rate/Unit", currentValue: inputs.overheadRateStandard, unit: "$", enabled: false, lowPct: 10, highPct: 10 },
      { key: "toolingCost", label: "Tooling Cost", currentValue: inputs.toolingCost, unit: "$", enabled: true, lowPct: 5, highPct: 30 },
      { key: "yieldRate", label: "Yield Rate", currentValue: inputs.yieldRate, unit: "%×", enabled: true, lowPct: 3, highPct: 1 },
      { key: "packagingCost", label: "Packaging/Unit", currentValue: inputs.packagingCost, unit: "$", enabled: false, lowPct: 10, highPct: 10 },
      { key: "logisticsOutbound", label: "Outbound Freight/Unit", currentValue: inputs.logisticsOutbound, unit: "$", enabled: true, lowPct: 20, highPct: 20 },
      { key: "warrantyProvisionPercent", label: "Warranty %", currentValue: inputs.warrantyProvisionPercent, unit: "%×", enabled: false, lowPct: 20, highPct: 50 },
      { key: "sellingPrice", label: "Selling Price (ASP)", currentValue: config.sellingPrice, unit: "$", enabled: false, lowPct: 5, highPct: 5 },
    ];
  }

  // Detailed
  return [
    { key: "bomScaleFactor", label: "BOM Materials (scale)", currentValue: 1.0, unit: "×", enabled: true, lowPct: 15, highPct: 15 },
    { key: "laborScaleFactor", label: "Labor Rate (scale)", currentValue: 1.0, unit: "×", enabled: true, lowPct: 10, highPct: 20 },
    { key: "overheadMachineRate", label: "Machine Rate ($/hr)", currentValue: inputs.overheadMachineRate, unit: "$", enabled: false, lowPct: 10, highPct: 10 },
    { key: "toolingCost", label: "Tooling Cost", currentValue: inputs.toolingCost, unit: "$", enabled: true, lowPct: 5, highPct: 30 },
    { key: "yieldRate", label: "Yield Rate", currentValue: inputs.yieldRate, unit: "%×", enabled: true, lowPct: 3, highPct: 1 },
    { key: "logisticsOutbound", label: "Outbound Freight/Unit", currentValue: inputs.logisticsOutbound, unit: "$", enabled: true, lowPct: 20, highPct: 20 },
    { key: "warrantyProvisionPercent", label: "Warranty %", currentValue: inputs.warrantyProvisionPercent, unit: "%×", enabled: false, lowPct: 20, highPct: 50 },
    { key: "sellingPrice", label: "Selling Price (ASP)", currentValue: config.sellingPrice, unit: "$", enabled: false, lowPct: 5, highPct: 5 },
  ];
}
