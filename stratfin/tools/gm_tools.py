from __future__ import annotations

import pandas as pd

from stratfin.core.tool_registry import ToolSpec

_df: pd.DataFrame | None = None


def set_dataframe(df: pd.DataFrame) -> None:
    global _df
    _df = df


def _get_df() -> pd.DataFrame:
    if _df is None:
        raise RuntimeError("No GM/COGS data loaded. Use --file to load a CSV/Excel file.")
    return _df


# ── tool handlers ────────────────────────────────────────────────────────────

def compute_gm_summary(period_filter: str | None = None) -> dict:
    df = _get_df()
    if period_filter:
        df = df[df["period"].astype(str).str.contains(period_filter, case=False, na=False)]
    if df.empty:
        return {"error": f"No data for period: {period_filter}"}

    periods = sorted(df["period"].unique().tolist())
    rows = []
    for p in periods:
        pf = df[df["period"] == p]
        revenue = float(pf["revenue"].sum())
        cogs = float(pf["total_cogs"].sum())
        gp = revenue - cogs
        gm_pct = (gp / revenue * 100) if revenue else None
        rows.append({
            "period": p,
            "revenue": round(revenue, 2),
            "total_cogs": round(cogs, 2),
            "gross_profit": round(gp, 2),
            "gm_pct": round(gm_pct, 1) if gm_pct is not None else None,
        })

    # MoM change for last two periods
    delta = {}
    if len(rows) >= 2:
        prev, curr = rows[-2], rows[-1]
        delta = {
            "period_vs": f"{curr['period']} vs {prev['period']}",
            "gm_pct_change": round((curr["gm_pct"] or 0) - (prev["gm_pct"] or 0), 1),
            "revenue_change": round(curr["revenue"] - prev["revenue"], 2),
            "cogs_change": round(curr["total_cogs"] - prev["total_cogs"], 2),
        }

    return {"periods": rows, "period_over_period": delta}


def analyze_bom(sku_filter: str | None = None) -> dict:
    df = _get_df()
    if sku_filter:
        df = df[df["sku"].astype(str).str.contains(sku_filter, case=False, na=False)]
    if df.empty:
        return {"error": f"No BOM data found for SKU: {sku_filter}"}

    required = {"component", "unit_cost", "qty_per_unit"}
    if not required.issubset(set(df.columns)):
        return {"error": f"BOM analysis requires columns: {required}. Found: {list(df.columns)}"}

    latest = df[df["period"] == df["period"].max()] if "period" in df.columns else df
    bom = latest.groupby("component").agg(
        unit_cost=("unit_cost", "mean"),
        qty_per_unit=("qty_per_unit", "mean"),
    ).reset_index()
    bom["line_cost"] = bom["unit_cost"] * bom["qty_per_unit"]
    total = bom["line_cost"].sum()
    bom["pct_of_bom"] = (bom["line_cost"] / total * 100).round(1) if total else 0
    bom = bom.sort_values("line_cost", ascending=False)

    return {
        "sku_filter": sku_filter,
        "total_bom_cost": round(total, 4),
        "components": bom.to_dict("records"),
    }


def compute_yield_impact(
    units_started: int,
    yield_pct: float,
    unit_cost: float,
) -> dict:
    started = int(units_started)
    y = float(yield_pct) / 100
    cost = float(unit_cost)

    good_units = int(started * y)
    scrap_units = started - good_units
    scrap_cost = scrap_units * cost
    effective_unit_cost = (started * cost) / good_units if good_units else None

    return {
        "units_started": started,
        "yield_pct": yield_pct,
        "good_units": good_units,
        "scrap_units": scrap_units,
        "scrap_cost": round(scrap_cost, 2),
        "nominal_unit_cost": cost,
        "effective_unit_cost_after_yield": round(effective_unit_cost, 4) if effective_unit_cost else None,
        "yield_cost_premium_pct": round((effective_unit_cost / cost - 1) * 100, 1) if effective_unit_cost else None,
    }


def gm_bridge(from_period: str, to_period: str) -> dict:
    df = _get_df()
    p1 = df[df["period"].astype(str) == from_period]
    p2 = df[df["period"].astype(str) == to_period]
    if p1.empty or p2.empty:
        return {"error": f"Could not find data for periods '{from_period}' and/or '{to_period}'"}

    r1, c1 = float(p1["revenue"].sum()), float(p1["total_cogs"].sum())
    r2, c2 = float(p2["revenue"].sum()), float(p2["total_cogs"].sum())
    gp1, gp2 = r1 - c1, r2 - c2
    gm1 = gp1 / r1 * 100 if r1 else 0
    gm2 = gp2 / r2 * 100 if r2 else 0

    volume_impact = (r2 - r1) * (gm1 / 100)
    cogs_impact = -(c2 - c1)
    mix_and_price_impact = (gp2 - gp1) - volume_impact - cogs_impact

    return {
        "from_period": from_period,
        "to_period": to_period,
        "from_gm_pct": round(gm1, 1),
        "to_gm_pct": round(gm2, 1),
        "gm_pct_change": round(gm2 - gm1, 1),
        "bridge": [
            {"driver": "Starting Gross Profit", "amount": round(gp1, 2)},
            {"driver": "Volume Impact", "amount": round(volume_impact, 2)},
            {"driver": "COGS / Cost Impact", "amount": round(cogs_impact, 2)},
            {"driver": "Mix & Price Impact", "amount": round(mix_and_price_impact, 2)},
            {"driver": "Ending Gross Profit", "amount": round(gp2, 2)},
        ],
    }


def cost_reduction_tracker() -> dict:
    df = _get_df()
    if "initiative" not in df.columns:
        return {"error": "Cost reduction tracking requires an 'initiative' column in the data"}

    required = {"initiative", "planned_savings", "actual_savings"}
    if not required.issubset(set(df.columns)):
        return {"error": f"Required columns: {required}. Found: {list(df.columns)}"}

    summary = df.groupby("initiative").agg(
        planned_savings=("planned_savings", "sum"),
        actual_savings=("actual_savings", "sum"),
    ).reset_index()
    summary["attainment_pct"] = (
        summary["actual_savings"] / summary["planned_savings"] * 100
    ).round(1).where(summary["planned_savings"] != 0)
    summary["gap"] = summary["planned_savings"] - summary["actual_savings"]

    total_planned = float(summary["planned_savings"].sum())
    total_actual = float(summary["actual_savings"].sum())

    return {
        "total_planned_savings": round(total_planned, 2),
        "total_actual_savings": round(total_actual, 2),
        "overall_attainment_pct": round(total_actual / total_planned * 100, 1) if total_planned else None,
        "initiatives": summary.to_dict("records"),
    }


# ── tool definitions ─────────────────────────────────────────────────────────

def get_tools() -> list[ToolSpec]:
    return [
        ToolSpec(
            name="compute_gm_summary",
            description="Compute revenue, COGS, gross profit, and GM% by period from loaded data. Shows period-over-period changes.",
            input_schema={
                "type": "object",
                "properties": {
                    "period_filter": {"type": "string", "description": "Optional filter, e.g. '2025-Q1' or '2025'"},
                },
            },
            handler=compute_gm_summary,
        ),
        ToolSpec(
            name="analyze_bom",
            description="Break down bill of materials (BOM) by component — unit cost, quantity per unit, line cost, and % of total BOM. Optionally filter by SKU.",
            input_schema={
                "type": "object",
                "properties": {
                    "sku_filter": {"type": "string", "description": "Optional SKU name or partial match to filter on"},
                },
            },
            handler=analyze_bom,
        ),
        ToolSpec(
            name="compute_yield_impact",
            description="Compute the cost impact of manufacturing yield — scrap units, scrap cost, and effective unit cost after yield losses.",
            input_schema={
                "type": "object",
                "properties": {
                    "units_started": {"type": "integer", "description": "Total units entered into manufacturing"},
                    "yield_pct": {"type": "number", "description": "Manufacturing yield as a percentage (e.g., 92.5 for 92.5%)"},
                    "unit_cost": {"type": "number", "description": "Nominal cost per unit started"},
                },
                "required": ["units_started", "yield_pct", "unit_cost"],
            },
            handler=compute_yield_impact,
        ),
        ToolSpec(
            name="gm_bridge",
            description="Build a gross margin bridge (waterfall) between two periods, decomposed into volume, COGS/cost, and mix & price drivers.",
            input_schema={
                "type": "object",
                "properties": {
                    "from_period": {"type": "string", "description": "Starting period label (must match data exactly)"},
                    "to_period": {"type": "string", "description": "Ending period label"},
                },
                "required": ["from_period", "to_period"],
            },
            handler=gm_bridge,
        ),
        ToolSpec(
            name="cost_reduction_tracker",
            description="Compare planned vs. actual cost reduction savings by initiative. Requires data with columns: initiative, planned_savings, actual_savings.",
            input_schema={"type": "object", "properties": {}},
            handler=cost_reduction_tracker,
        ),
    ]
