// ─── Types ────────────────────────────────────────────────────────────────────

export interface FacilityInputs {
  // Investment
  capEx: number;
  usefulLifeYears: number;
  discountRatePct: number;
  salvageValue: number;

  // Capacity
  currentCapacity: number;
  newCapacity: number;
  targetUtilizationPct: number;

  // Unit economics
  asp: number;
  variableCpuPerUnit: number;

  // Cost structure
  currentFixedOverheadPerYear: number;
  additionalAnnualOverhead: number;

  // Baseline
  currentVolume: number;
}

export interface CpuPoint {
  volume: number;
  before: number | null;
  after: number;
}

export interface CashFlowRow {
  year: number;
  incremental: number;
  cumulative: number;
  npvCumulative: number;
}

export interface SensitivityRow {
  utilPct: number;
  volume: number;
  annualCashFlow: number;
  paybackMonths: number;
  npv: number;
}

export interface FacilityBreakdown {
  // Derived
  targetVolume: number;
  incrementalVolume: number;
  contributionMarginPerUnit: number;
  annualDepreciation: number;
  annualIncrementalCashFlow: number;

  // KPIs
  paybackMonths: number;
  npv: number;
  irr: number;
  capacityGainPct: number;

  // Break-even
  breakEvenIncrementalVolume: number;
  breakEvenUtilizationPct: number;

  // CPU at key volumes
  cpuBefore: number;
  cpuAfter: number;

  // Charts
  cpuCurve: CpuPoint[];
  cashFlowByYear: CashFlowRow[];
  sensitivityByUtilization: SensitivityRow[];
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export function defaultFacilityInputs(): FacilityInputs {
  return {
    capEx: 500_000,
    usefulLifeYears: 7,
    discountRatePct: 12,
    salvageValue: 25_000,
    currentCapacity: 10_000,
    newCapacity: 25_000,
    targetUtilizationPct: 80,
    asp: 299,
    variableCpuPerUnit: 90,
    currentFixedOverheadPerYear: 200_000,
    additionalAnnualOverhead: 40_000,
    currentVolume: 8_000,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function npvCalc(cashFlows: number[], rate: number): number {
  return cashFlows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

function calcIRR(cashFlows: number[]): number {
  const hasPositive = cashFlows.some((cf) => cf > 0);
  const hasNegative = cashFlows.some((cf) => cf < 0);
  if (!hasPositive || !hasNegative) return NaN;

  let lo = -0.9999,
    hi = 10.0;
  if (npvCalc(cashFlows, lo) < 0) return NaN;

  for (let i = 0; i < 400; i++) {
    const mid = (lo + hi) / 2;
    const v = npvCalc(cashFlows, mid);
    if (Math.abs(v) < 0.01) return mid;
    if (v > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ─── Core calculation ─────────────────────────────────────────────────────────

export function calculateFacility(inp: FacilityInputs): FacilityBreakdown {
  const r = inp.discountRatePct / 100;
  const targetVolume = inp.newCapacity * (inp.targetUtilizationPct / 100);
  const incrementalVolume = Math.max(0, targetVolume - inp.currentVolume);
  const CM = inp.asp - inp.variableCpuPerUnit;
  const annualDepreciation =
    (inp.capEx - inp.salvageValue) / Math.max(1, inp.usefulLifeYears);

  // Annual operating cash flow from incremental production
  const annualCashFlow = incrementalVolume * CM - inp.additionalAnnualOverhead;

  // Cash flow stream: [-capEx, cf1, cf2, ..., cfN + salvage]
  const cashFlows = [-inp.capEx];
  for (let y = 1; y <= inp.usefulLifeYears; y++) {
    cashFlows.push(annualCashFlow + (y === inp.usefulLifeYears ? inp.salvageValue : 0));
  }

  const npv = npvCalc(cashFlows, r);
  const irr = calcIRR(cashFlows);

  const paybackMonths =
    annualCashFlow > 0 ? (inp.capEx / annualCashFlow) * 12 : Infinity;

  const capacityGainPct =
    inp.currentCapacity > 0
      ? ((inp.newCapacity - inp.currentCapacity) / inp.currentCapacity) * 100
      : 0;

  // Break-even: what incremental volume must be hit to cover the full
  // additional annual cost (overhead + depreciation)?
  const totalAdditionalAnnualCost = inp.additionalAnnualOverhead + annualDepreciation;
  const breakEvenIncrementalVolume =
    CM > 0 ? totalAdditionalAnnualCost / CM : Infinity;
  const breakEvenUtilizationPct =
    inp.newCapacity > 0
      ? ((inp.currentVolume + breakEvenIncrementalVolume) / inp.newCapacity) * 100
      : 100;

  // Fixed-cost overhead for before/after CPU curves
  const fixedBefore = inp.currentFixedOverheadPerYear;
  const fixedAfter =
    inp.currentFixedOverheadPerYear + inp.additionalAnnualOverhead + annualDepreciation;

  const cpuAt = (vol: number, fixed: number) =>
    vol > 0 ? inp.variableCpuPerUnit + fixed / vol : Infinity;

  const cpuBefore = cpuAt(inp.currentVolume, fixedBefore);
  const cpuAfter = cpuAt(targetVolume > 0 ? targetVolume : inp.newCapacity, fixedAfter);

  // CPU curve across the range 5% → 100% of newCapacity
  const PTS = 50;
  const cpuCurve: CpuPoint[] = Array.from({ length: PTS }, (_, i) => {
    const pct = 0.05 + (i / (PTS - 1)) * 0.95;
    const volume = Math.round(inp.newCapacity * pct);
    const canProduceBefore = volume <= inp.currentCapacity;
    return {
      volume,
      before: canProduceBefore ? cpuAt(volume, fixedBefore) : null,
      after: cpuAt(volume, fixedAfter),
    };
  });

  // Cash flow by year
  let cumCF = -inp.capEx;
  let cumDisc = -inp.capEx;
  const cashFlowByYear: CashFlowRow[] = [
    { year: 0, incremental: -inp.capEx, cumulative: cumCF, npvCumulative: cumDisc },
  ];
  for (let y = 1; y <= inp.usefulLifeYears; y++) {
    const annual = cashFlows[y];
    cumCF += annual;
    cumDisc += annual / Math.pow(1 + r, y);
    cashFlowByYear.push({
      year: y,
      incremental: annual,
      cumulative: cumCF,
      npvCumulative: cumDisc,
    });
  }

  // Sensitivity: payback at different utilization levels
  const UTIL_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const sensitivityByUtilization: SensitivityRow[] = UTIL_LEVELS.map((pct) => {
    const vol = inp.newCapacity * pct;
    const incVol = Math.max(0, vol - inp.currentVolume);
    const acf = incVol * CM - inp.additionalAnnualOverhead;
    const pb = acf > 0 ? (inp.capEx / acf) * 12 : Infinity;
    const cfs = [
      -inp.capEx,
      ...Array.from({ length: inp.usefulLifeYears }, (_, i) =>
        acf + (i === inp.usefulLifeYears - 1 ? inp.salvageValue : 0)
      ),
    ];
    return {
      utilPct: pct * 100,
      volume: vol,
      annualCashFlow: acf,
      paybackMonths: pb,
      npv: npvCalc(cfs, r),
    };
  });

  return {
    targetVolume,
    incrementalVolume,
    contributionMarginPerUnit: CM,
    annualDepreciation,
    annualIncrementalCashFlow: annualCashFlow,
    paybackMonths,
    npv,
    irr,
    capacityGainPct,
    breakEvenIncrementalVolume,
    breakEvenUtilizationPct,
    cpuBefore,
    cpuAfter,
    cpuCurve,
    cashFlowByYear,
    sensitivityByUtilization,
  };
}
