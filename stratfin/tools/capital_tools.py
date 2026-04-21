from __future__ import annotations

import math

import numpy as np
import numpy_financial as npf
import pandas as pd

from stratfin.core.tool_registry import ToolSpec

_df: pd.DataFrame | None = None


def set_dataframe(df: pd.DataFrame) -> None:
    global _df
    _df = df


def _get_df() -> pd.DataFrame:
    if _df is None:
        raise RuntimeError("No project data loaded. Use --file to load a CSV/Excel file.")
    return _df


# ── tool handlers ────────────────────────────────────────────────────────────

def compute_npv(
    initial_investment: float,
    cash_flows: list,
    discount_rate_pct: float,
    terminal_growth_rate_pct: float = 0.0,
) -> dict:
    inv = float(initial_investment)
    cfs = [float(x) for x in cash_flows]
    r = float(discount_rate_pct) / 100
    g = float(terminal_growth_rate_pct) / 100

    all_cfs = [-inv] + cfs
    if g > 0 and r > g and cfs:
        terminal_value = cfs[-1] * (1 + g) / (r - g)
        all_cfs[-1] += terminal_value

    npv_val = float(npf.npv(r, all_cfs))
    total_undiscounted = sum(cfs)
    return {
        "npv": round(npv_val, 2),
        "npv_formatted": f"${npv_val:,.0f}" if npv_val >= 0 else f"(${abs(npv_val):,.0f})",
        "discount_rate_pct": discount_rate_pct,
        "terminal_growth_rate_pct": terminal_growth_rate_pct,
        "total_undiscounted_cf": round(total_undiscounted, 2),
        "num_periods": len(cfs),
        "recommendation": "INVEST" if npv_val >= 0 else "PASS",
    }


def compute_irr_and_payback(
    initial_investment: float,
    cash_flows: list,
    hurdle_rate_pct: float,
) -> dict:
    inv = float(initial_investment)
    cfs = [float(x) for x in cash_flows]
    hurdle = float(hurdle_rate_pct)

    all_cfs = [-inv] + cfs
    irr_pct = None
    try:
        irr_raw = npf.irr(all_cfs)
        if not math.isnan(irr_raw) and not math.isinf(irr_raw):
            irr_pct = round(float(irr_raw) * 100, 2)
    except Exception:
        pass

    # Simple payback (undiscounted)
    cumulative = 0.0
    payback_years = None
    for i, cf in enumerate(cfs):
        prev = cumulative
        cumulative += cf
        if cumulative >= inv:
            fraction = (inv - prev) / cf if cf != 0 else 0
            payback_years = round(i + fraction, 2)
            break

    moic = round(sum(cfs) / inv, 2) if inv > 0 else None
    passes = (irr_pct >= hurdle) if irr_pct is not None else None

    return {
        "irr_pct": irr_pct,
        "irr_note": None if irr_pct is not None else "IRR cannot be computed (no sign change in cash flows)",
        "payback_years": payback_years,
        "moic": moic,
        "hurdle_rate_pct": hurdle,
        "passes_hurdle": passes,
        "recommendation": "INVEST" if passes else ("PASS" if passes is not None else "EVALUATE ON NPV"),
    }


def run_sensitivity_analysis(
    initial_investment: float,
    base_cash_flows: list,
    discount_rate_pct: float,
    sensitivity_variable: str,
    low_value: float,
    high_value: float,
    steps: int = 6,
) -> dict:
    inv = float(initial_investment)
    base_cfs = [float(x) for x in base_cash_flows]
    base_r = float(discount_rate_pct) / 100
    steps = max(2, int(steps))

    values = [
        low_value + (high_value - low_value) * i / (steps - 1) for i in range(steps)
    ]

    base_npv = float(npf.npv(base_r, [-inv] + base_cfs))
    rows = []
    for v in values:
        if sensitivity_variable == "discount_rate":
            r = v / 100
            cfs_iter = base_cfs
        elif sensitivity_variable == "initial_investment":
            r = base_r
            inv = v
            cfs_iter = base_cfs
        else:  # cf_scaling
            r = base_r
            inv = float(initial_investment)
            scale = v / base_cfs[0] if base_cfs[0] != 0 else 1
            cfs_iter = [cf * scale for cf in base_cfs]

        npv_val = float(npf.npv(r, [-inv] + cfs_iter))
        delta_pct = ((npv_val - base_npv) / abs(base_npv) * 100) if base_npv != 0 else None
        rows.append({
            "value": round(v, 4),
            "npv": round(npv_val, 2),
            "npv_formatted": f"${npv_val:,.0f}" if npv_val >= 0 else f"(${abs(npv_val):,.0f})",
            "delta_pct": round(delta_pct, 1) if delta_pct is not None else None,
            "decision": "INVEST" if npv_val >= 0 else "PASS",
        })
    return {
        "sensitivity_variable": sensitivity_variable,
        "base_npv": round(base_npv, 2),
        "scenarios": rows,
    }


def compare_projects(
    projects: list,
    discount_rate_pct: float,
    hurdle_rate_pct: float,
    capital_constraint: float | None = None,
) -> dict:
    r = float(discount_rate_pct) / 100
    hurdle = float(hurdle_rate_pct)
    results = []
    for p in projects:
        inv = float(p["initial_investment"])
        cfs = [float(x) for x in p["cash_flows"]]
        all_cfs = [-inv] + cfs
        npv_val = float(npf.npv(r, all_cfs))

        irr_pct = None
        try:
            irr_raw = npf.irr(all_cfs)
            if not math.isnan(irr_raw):
                irr_pct = round(float(irr_raw) * 100, 2)
        except Exception:
            pass

        cumulative = 0.0
        payback = None
        for i, cf in enumerate(cfs):
            prev = cumulative
            cumulative += cf
            if cumulative >= inv:
                fraction = (inv - prev) / cf if cf != 0 else 0
                payback = round(i + fraction, 2)
                break

        pi = round(npv_val / inv, 3) if inv > 0 else None
        results.append({
            "project": p["name"],
            "initial_investment": inv,
            "npv": round(npv_val, 2),
            "irr_pct": irr_pct,
            "payback_years": payback,
            "profitability_index": pi,
            "passes_hurdle": (irr_pct >= hurdle) if irr_pct is not None else None,
        })

    results.sort(key=lambda x: (x["profitability_index"] or -999), reverse=True)

    recommendation = None
    if capital_constraint:
        budget = float(capital_constraint)
        selected, spent = [], 0.0
        for r_item in results:
            if r_item["passes_hurdle"] and spent + r_item["initial_investment"] <= budget:
                selected.append(r_item["project"])
                spent += r_item["initial_investment"]
        recommendation = {
            "capital_constraint": budget,
            "selected_projects": selected,
            "total_deployed": spent,
        }

    return {"projects": results, "recommendation": recommendation}


# ── tool definitions ─────────────────────────────────────────────────────────

def get_tools() -> list[ToolSpec]:
    return [
        ToolSpec(
            name="compute_npv",
            description="Compute the Net Present Value (NPV) of a project given an initial investment, projected annual cash flows, and discount rate. Optionally applies a Gordon Growth terminal value.",
            input_schema={
                "type": "object",
                "properties": {
                    "initial_investment": {"type": "number", "description": "Upfront capital outlay in dollars (positive number)"},
                    "cash_flows": {"type": "array", "items": {"type": "number"}, "description": "Projected annual free cash flows for years 1..N (positive = inflow, negative = outflow)"},
                    "discount_rate_pct": {"type": "number", "description": "WACC or hurdle rate as a percentage (e.g., 12.0 for 12%)"},
                    "terminal_growth_rate_pct": {"type": "number", "description": "Optional: Gordon Growth terminal value growth rate %. Default 0.", "default": 0},
                },
                "required": ["initial_investment", "cash_flows", "discount_rate_pct"],
            },
            handler=compute_npv,
        ),
        ToolSpec(
            name="compute_irr_and_payback",
            description="Compute IRR, simple payback period, and MOIC for a project. Compares IRR against a hurdle rate and returns a pass/fail recommendation.",
            input_schema={
                "type": "object",
                "properties": {
                    "initial_investment": {"type": "number"},
                    "cash_flows": {"type": "array", "items": {"type": "number"}},
                    "hurdle_rate_pct": {"type": "number", "description": "Minimum acceptable IRR as a percentage"},
                },
                "required": ["initial_investment", "cash_flows", "hurdle_rate_pct"],
            },
            handler=compute_irr_and_payback,
        ),
        ToolSpec(
            name="run_sensitivity_analysis",
            description="Run a one-way sensitivity analysis on NPV by varying discount_rate, initial_investment, or cash flow scaling across a range. Returns a table of scenarios.",
            input_schema={
                "type": "object",
                "properties": {
                    "initial_investment": {"type": "number"},
                    "base_cash_flows": {"type": "array", "items": {"type": "number"}},
                    "discount_rate_pct": {"type": "number"},
                    "sensitivity_variable": {"type": "string", "enum": ["discount_rate", "initial_investment", "cf_scaling"]},
                    "low_value": {"type": "number"},
                    "high_value": {"type": "number"},
                    "steps": {"type": "integer", "default": 6},
                },
                "required": ["initial_investment", "base_cash_flows", "discount_rate_pct", "sensitivity_variable", "low_value", "high_value"],
            },
            handler=run_sensitivity_analysis,
        ),
        ToolSpec(
            name="compare_projects",
            description="Compare multiple projects on NPV, IRR, payback period, and profitability index. If a capital_constraint is given, selects the optimal project mix by profitability index ranking.",
            input_schema={
                "type": "object",
                "properties": {
                    "projects": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "initial_investment": {"type": "number"},
                                "cash_flows": {"type": "array", "items": {"type": "number"}},
                            },
                            "required": ["name", "initial_investment", "cash_flows"],
                        },
                    },
                    "discount_rate_pct": {"type": "number"},
                    "hurdle_rate_pct": {"type": "number"},
                    "capital_constraint": {"type": "number", "description": "Total available capital budget. Optional."},
                },
                "required": ["projects", "discount_rate_pct", "hurdle_rate_pct"],
            },
            handler=compare_projects,
        ),
    ]
