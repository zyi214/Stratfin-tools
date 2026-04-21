import pytest
from stratfin.tools import headcount_tools
from stratfin.tools.headcount_tools import (
    reconcile_headcount,
    analyze_open_positions,
    project_year_end_headcount,
    compute_headcount_cost_impact,
)


def test_reconcile_headcount_by_department(headcount_df):
    headcount_tools.set_dataframe(headcount_df)
    result = reconcile_headcount(group_by="department")
    rows = {r["department"]: r for r in result["rows"]}
    assert "Engineering" in rows
    assert "Sales" in rows
    # Engineering: 2 filled, 1 open, budget=3
    eng = rows["Engineering"]
    assert eng["actual_hc"] == 2
    assert eng["budget_hc"] == 3
    assert eng["vs_budget"] == -1
    assert eng["open_positions"] == 1


def test_reconcile_total_row(headcount_df):
    headcount_tools.set_dataframe(headcount_df)
    result = reconcile_headcount()
    total = next(r for r in result["rows"] if r["department"] == "TOTAL")
    assert total["actual_hc"] == 3  # Alice, Bob, Carol
    assert total["open_positions"] == 1


def test_analyze_open_positions(headcount_df):
    headcount_tools.set_dataframe(headcount_df)
    result = analyze_open_positions()
    assert result["open_position_count"] == 1


def test_analyze_open_positions_department_filter(headcount_df):
    headcount_tools.set_dataframe(headcount_df)
    result = analyze_open_positions(department="Sales")
    assert result["open_position_count"] == 0


def test_project_year_end_headcount(headcount_df):
    headcount_tools.set_dataframe(headcount_df)
    result = project_year_end_headcount(hiring_velocity_per_month=2.0, attrition_rate_annual_pct=10.0)
    assert result["current_hc"] == 3
    assert isinstance(result["projected_year_end_hc"], float)


def test_compute_headcount_cost_impact(headcount_df):
    headcount_tools.set_dataframe(headcount_df)
    result = compute_headcount_cost_impact(hc_delta=-2, months_remaining_in_period=6)
    # Should be negative total impact (savings)
    assert result["total_period_cost_impact"] < 0
    assert "Savings" in result["interpretation"]


def test_compute_headcount_cost_impact_overage(headcount_df):
    headcount_tools.set_dataframe(headcount_df)
    result = compute_headcount_cost_impact(hc_delta=3, months_remaining_in_period=6)
    assert result["total_period_cost_impact"] > 0
    assert "Overage" in result["interpretation"]
