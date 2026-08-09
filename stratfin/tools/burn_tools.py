from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from stratfin.core.tool_registry import ToolSpec

_df: pd.DataFrame | None = None


def set_dataframe(df: pd.DataFrame) -> None:
    global _df
    _df = df


def _get_df() -> pd.DataFrame:
    if _df is None:
        raise RuntimeError("No burn data loaded. Use --file to load a CSV/Excel file.")
    return _df


# ── tool handlers ────────────────────────────────────────────────────────────

def compute_runway(
    cash_balance: float,
    monthly_burn: float,
    raise_threshold_months: float = 6.0,
) -> dict:
    balance = float(cash_balance)
    burn = float(monthly_burn)
    threshold = float(raise_threshold_months)

    if burn <= 0:
        return {"error": "monthly_burn must be a positive number (net cash outflow)"}

    runway_months = balance / burn
    raise_by = date.today() + timedelta(days=(runway_months - threshold) * 30.44)
    zero_date = date.today() + timedelta(days=runway_months * 30.44)

    urgency = "CRITICAL" if runway_months < threshold else ("WARNING" if runway_months < threshold + 3 else "OK")

    return {
        "runway_months": round(runway_months, 1),
        "cash_zero_date": zero_date.isoformat(),
        "raise_by_date": raise_by.isoformat(),
        "raise_threshold_months": threshold,
        "monthly_burn": burn,
        "cash_balance": balance,
        "status": urgency,
        "note": f"You need to start fundraising by {raise_by.isoformat()} to maintain {threshold} months of runway buffer.",
    }


def model_burn_scenarios(
    base_opex: float,
    scenarios: list,
    cash_balance: float,
) -> dict:
    results = []
    for s in scenarios:
        name = s.get("name", "Unnamed")
        delta_pct = float(s.get("opex_delta_pct", 0))
        adjusted_burn = float(base_opex) * (1 + delta_pct / 100)
        runway = float(cash_balance) / adjusted_burn if adjusted_burn > 0 else None
        results.append({
            "scenario": name,
            "opex_delta_pct": delta_pct,
            "monthly_burn": round(adjusted_burn, 0),
            "runway_months": round(runway, 1) if runway else None,
            "cash_zero_date": (
                date.today() + timedelta(days=runway * 30.44)
            ).isoformat() if runway else "N/A",
        })
    return {"base_opex": base_opex, "cash_balance": cash_balance, "scenarios": results}


def analyze_burn_by_category(period_filter: str | None = None) -> dict:
    df = _get_df()
    if period_filter:
        df = df[df["period"].astype(str).str.contains(period_filter, case=False, na=False)]
    if df.empty:
        return {"error": f"No data found for period filter: {period_filter}"}

    outflows = df[df["type"].str.lower() == "outflow"].copy()
    inflows = df[df["type"].str.lower() == "inflow"].copy()

    by_cat = (
        outflows.groupby("category")["amount"]
        .sum()
        .sort_values(ascending=False)
        .reset_index()
    )
    by_cat["pct_of_total"] = (by_cat["amount"] / by_cat["amount"].sum() * 100).round(1)

    total_outflow = float(outflows["amount"].sum())
    total_inflow = float(inflows["amount"].sum())
    net_burn = total_outflow - total_inflow

    return {
        "period_filter": period_filter,
        "total_outflows": round(total_outflow, 2),
        "total_inflows": round(total_inflow, 2),
        "net_burn": round(net_burn, 2),
        "by_category": by_cat.to_dict("records"),
        "periods_included": df["period"].unique().tolist(),
    }


def project_cash_to_eoy(
    starting_cash: float,
    monthly_forecast_cfs: list,
) -> dict:
    balance = float(starting_cash)
    waterfall = []
    for i, cf in enumerate(monthly_forecast_cfs):
        cf = float(cf)
        balance += cf
        waterfall.append({
            "month": i + 1,
            "net_cf": round(cf, 2),
            "ending_cash": round(balance, 2),
            "status": "positive" if balance >= 0 else "NEGATIVE",
        })
    first_negative = next(
        (w["month"] for w in waterfall if w["status"] == "NEGATIVE"), None
    )
    return {
        "starting_cash": starting_cash,
        "ending_cash": round(balance, 2),
        "months_projected": len(monthly_forecast_cfs),
        "first_negative_month": first_negative,
        "waterfall": waterfall,
    }


# ── tool definitions ─────────────────────────────────────────────────────────

def get_tools() -> list[ToolSpec]:
    return [
        ToolSpec(
            name="compute_runway",
            description="Calculate cash runway in months given current cash balance and monthly burn rate. Flags when the company needs to start fundraising to maintain a safety buffer.",
            input_schema={
                "type": "object",
                "properties": {
                    "cash_balance": {"type": "number", "description": "Current cash on hand in dollars"},
                    "monthly_burn": {"type": "number", "description": "Net monthly cash outflow (positive number)"},
                    "raise_threshold_months": {"type": "number", "description": "Minimum runway buffer before starting a raise. Default 6 months.", "default": 6.0},
                },
                "required": ["cash_balance", "monthly_burn"],
            },
            handler=compute_runway,
        ),
        ToolSpec(
            name="model_burn_scenarios",
            description="Model runway under multiple OpEx scenarios (e.g. base case, hiring freeze, accelerated hiring). Returns a comparison table of runway by scenario.",
            input_schema={
                "type": "object",
                "properties": {
                    "base_opex": {"type": "number", "description": "Current monthly OpEx / burn rate in dollars"},
                    "cash_balance": {"type": "number", "description": "Current cash balance in dollars"},
                    "scenarios": {
                        "type": "array",
                        "description": "List of scenarios, each with a name and opex_delta_pct (e.g. -20 for 20% reduction)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "opex_delta_pct": {"type": "number"},
                            },
                        },
                    },
                },
                "required": ["base_opex", "cash_balance", "scenarios"],
            },
            handler=model_burn_scenarios,
        ),
        ToolSpec(
            name="analyze_burn_by_category",
            description="Break down actual cash burn by spend category (payroll, COGS, R&D, G&A, etc.) from loaded data. Optionally filter to a specific period.",
            input_schema={
                "type": "object",
                "properties": {
                    "period_filter": {"type": "string", "description": "Optional period string to filter on, e.g. '2025-Q1' or '2025-03'"},
                },
            },
            handler=analyze_burn_by_category,
        ),
        ToolSpec(
            name="project_cash_to_eoy",
            description="Build a month-by-month cash waterfall from a starting balance and list of projected monthly net cash flows. Flags the first month cash goes negative.",
            input_schema={
                "type": "object",
                "properties": {
                    "starting_cash": {"type": "number", "description": "Cash balance at the start of the projection period"},
                    "monthly_forecast_cfs": {"type": "array", "items": {"type": "number"}, "description": "List of monthly net cash flows (negative = net outflow)"},
                },
                "required": ["starting_cash", "monthly_forecast_cfs"],
            },
            handler=project_cash_to_eoy,
        ),
    ]
