from __future__ import annotations

from datetime import date

import pandas as pd

from stratfin.core.tool_registry import ToolSpec

_df: pd.DataFrame | None = None


def set_dataframe(df: pd.DataFrame) -> None:
    global _df
    _df = df


def _get_df() -> pd.DataFrame:
    if _df is None:
        raise RuntimeError("No headcount data loaded. Use --file to load a CSV/Excel file.")
    return _df


# ── tool handlers ────────────────────────────────────────────────────────────

def reconcile_headcount(
    group_by: str = "department",
    include_open_positions: bool = True,
) -> dict:
    df = _get_df()
    if not include_open_positions:
        df = df[df["status"].str.lower() == "filled"]

    required = {"status", "budget_hc", group_by}
    missing = required - set(df.columns)
    if missing:
        return {"error": f"Missing columns: {missing}"}

    def dept_stats(sub: pd.DataFrame) -> dict:
        actual = int((sub["status"].str.lower() == "filled").sum())
        budget = int(sub["budget_hc"].sum()) if "budget_hc" in sub.columns else 0
        lf = int(sub["lf_hc"].sum()) if "lf_hc" in sub.columns else budget
        open_pos = int((sub["status"].str.lower() == "open").sum())
        return {
            "actual_hc": actual,
            "budget_hc": budget,
            "lf_hc": lf,
            "vs_budget": actual - budget,
            "vs_lf": actual - lf,
            "open_positions": open_pos,
            "fill_rate_pct": round(actual / budget * 100, 1) if budget else None,
        }

    rows = []
    for grp, sub in df.groupby(group_by):
        stats = dept_stats(sub)
        stats[group_by] = grp
        rows.append(stats)

    totals = dept_stats(df)
    totals[group_by] = "TOTAL"
    rows.append(totals)

    flagged = [r[group_by] for r in rows if abs(r["vs_budget"]) >= 3 and r[group_by] != "TOTAL"]

    return {
        "group_by": group_by,
        "rows": rows,
        "flagged_groups": flagged,
        "flag_note": "Flagged where |actual - budget| >= 3 positions",
    }


def analyze_open_positions(
    min_days_open: int = 0,
    department: str | None = None,
) -> dict:
    df = _get_df()
    open_df = df[df["status"].str.lower() == "open"].copy()
    if department:
        open_df = open_df[open_df["department"].str.lower() == department.lower()]
    if open_df.empty:
        return {"open_position_count": 0, "rows": []}

    if "req_open_date" in open_df.columns:
        open_df["req_open_date"] = pd.to_datetime(open_df["req_open_date"], format="mixed", errors="coerce")
        open_df["days_open"] = (pd.Timestamp.today() - open_df["req_open_date"]).dt.days
        open_df = open_df[open_df["days_open"] >= min_days_open]

    cols = [c for c in ["department", "level", "role_type", "req_open_date", "days_open", "annual_salary"] if c in open_df.columns]
    result_rows = open_df[cols].to_dict("records")

    avg_salary = float(open_df["annual_salary"].mean()) if "annual_salary" in open_df.columns else 0
    annualized_impact = round(avg_salary * len(open_df), 2)

    return {
        "open_position_count": len(open_df),
        "avg_days_open": round(float(open_df["days_open"].mean()), 0) if "days_open" in open_df.columns else None,
        "positions_over_90_days": int((open_df["days_open"] >= 90).sum()) if "days_open" in open_df.columns else None,
        "annualized_cost_impact": annualized_impact,
        "rows": result_rows,
    }


def project_year_end_headcount(
    hiring_velocity_per_month: float | None = None,
    attrition_rate_annual_pct: float = 15.0,
) -> dict:
    df = _get_df()

    current_hc = int((df["status"].str.lower() == "filled").sum())
    budget_hc = int(df["budget_hc"].sum()) if "budget_hc" in df.columns else 0

    today = date.today()
    months_remaining = max(0, 12 - today.month)

    if hiring_velocity_per_month is None and "hire_date" in df.columns:
        filled = df[df["status"].str.lower() == "filled"].copy()
        filled["hire_date"] = pd.to_datetime(filled["hire_date"], format="mixed", errors="coerce")
        recent = filled[filled["hire_date"] >= pd.Timestamp.today() - pd.DateOffset(months=3)]
        hiring_velocity_per_month = len(recent) / 3 if len(recent) > 0 else 0

    attrition_monthly = (float(attrition_rate_annual_pct) / 100) / 12
    projected_hc = (
        current_hc
        + (float(hiring_velocity_per_month or 0) * months_remaining)
        - (current_hc * attrition_monthly * months_remaining)
    )

    return {
        "current_hc": current_hc,
        "budget_hc": budget_hc,
        "months_remaining_in_year": months_remaining,
        "assumed_hiring_velocity_per_month": round(float(hiring_velocity_per_month or 0), 1),
        "assumed_attrition_rate_annual_pct": attrition_rate_annual_pct,
        "projected_year_end_hc": round(projected_hc, 0),
        "projected_vs_budget": round(projected_hc - budget_hc, 0),
    }


def compute_headcount_cost_impact(
    hc_delta: float,
    months_remaining_in_period: int,
    avg_fully_loaded_cost: float | None = None,
) -> dict:
    df = _get_df()

    if avg_fully_loaded_cost is None:
        col = "fully_loaded_cost" if "fully_loaded_cost" in df.columns else "annual_salary"
        filled = df[df["status"].str.lower() == "filled"]
        avg_fully_loaded_cost = float(filled[col].mean()) if col in filled.columns and len(filled) else 0

    monthly_cost = float(avg_fully_loaded_cost) / 12
    total_impact = float(hc_delta) * monthly_cost * int(months_remaining_in_period)

    return {
        "hc_delta": hc_delta,
        "months_remaining_in_period": months_remaining_in_period,
        "avg_fully_loaded_annual_cost": round(float(avg_fully_loaded_cost), 2),
        "avg_monthly_cost_per_head": round(monthly_cost, 2),
        "total_period_cost_impact": round(total_impact, 2),
        "interpretation": (
            f"{'Savings' if hc_delta < 0 else 'Overage'} of ${abs(total_impact):,.0f} "
            f"vs plan for the remaining {months_remaining_in_period} months"
        ),
    }


# ── tool definitions ─────────────────────────────────────────────────────────

def get_tools() -> list[ToolSpec]:
    return [
        ToolSpec(
            name="reconcile_headcount",
            description="Reconcile actual filled headcount vs budget and latest forecast (LF) grouped by department, level, or role type. Flags groups with significant gaps.",
            input_schema={
                "type": "object",
                "properties": {
                    "group_by": {"type": "string", "enum": ["department", "level", "role_type"], "description": "Dimension to group headcount by", "default": "department"},
                    "include_open_positions": {"type": "boolean", "description": "Include open/unfilled positions in the analysis", "default": True},
                },
            },
            handler=reconcile_headcount,
        ),
        ToolSpec(
            name="analyze_open_positions",
            description="Analyze open/unfilled positions — how long they've been open, which are aged >90 days, and the annualized cost impact of vacancies.",
            input_schema={
                "type": "object",
                "properties": {
                    "min_days_open": {"type": "integer", "description": "Only include positions open at least this many days. Default 0.", "default": 0},
                    "department": {"type": "string", "description": "Filter to a specific department. Optional."},
                },
            },
            handler=analyze_open_positions,
        ),
        ToolSpec(
            name="project_year_end_headcount",
            description="Project end-of-year headcount based on current hiring velocity and attrition assumptions. Compares projected HC vs budget.",
            input_schema={
                "type": "object",
                "properties": {
                    "hiring_velocity_per_month": {"type": "number", "description": "Assumed new hires per month. If omitted, uses trailing 3-month average from data."},
                    "attrition_rate_annual_pct": {"type": "number", "description": "Annual attrition rate %. Default 15.", "default": 15.0},
                },
            },
            handler=project_year_end_headcount,
        ),
        ToolSpec(
            name="compute_headcount_cost_impact",
            description="Calculate the dollar cost impact of a headcount variance (over or under plan) for the remaining months of the period.",
            input_schema={
                "type": "object",
                "properties": {
                    "hc_delta": {"type": "number", "description": "Headcount variance vs plan (negative = under plan = savings, positive = over plan = overage)"},
                    "months_remaining_in_period": {"type": "integer", "description": "Remaining months in the budget period"},
                    "avg_fully_loaded_cost": {"type": "number", "description": "Average fully-loaded annual cost per head. If omitted, derived from data."},
                },
                "required": ["hc_delta", "months_remaining_in_period"],
            },
            handler=compute_headcount_cost_impact,
        ),
    ]
