import pytest
from stratfin.tools import gm_tools
from stratfin.tools.gm_tools import (
    compute_gm_summary,
    analyze_bom,
    compute_yield_impact,
    gm_bridge,
)


def test_gm_summary_two_periods(gm_df):
    gm_tools.set_dataframe(gm_df)
    result = compute_gm_summary()
    assert len(result["periods"]) == 2
    for row in result["periods"]:
        assert row["gm_pct"] is not None
        assert 0 < row["gm_pct"] < 100


def test_gm_summary_period_filter(gm_df):
    gm_tools.set_dataframe(gm_df)
    result = compute_gm_summary(period_filter="Q1")
    assert len(result["periods"]) == 1
    assert result["periods"][0]["period"] == "2025-Q1"


def test_analyze_bom(gm_df):
    gm_tools.set_dataframe(gm_df)
    result = analyze_bom()
    assert result["total_bom_cost"] > 0
    pcts = [c["pct_of_bom"] for c in result["components"]]
    assert abs(sum(pcts) - 100.0) < 0.2


def test_compute_yield_impact_100pct():
    result = compute_yield_impact(units_started=1000, yield_pct=100.0, unit_cost=50.0)
    assert result["scrap_units"] == 0
    assert result["scrap_cost"] == 0.0
    assert result["effective_unit_cost_after_yield"] == pytest.approx(50.0)


def test_compute_yield_impact_partial():
    result = compute_yield_impact(units_started=1000, yield_pct=90.0, unit_cost=100.0)
    assert result["good_units"] == 900
    assert result["scrap_units"] == 100
    assert result["scrap_cost"] == pytest.approx(10_000.0)
    # Effective cost = 100_000 total / 900 good = 111.11
    assert result["effective_unit_cost_after_yield"] == pytest.approx(111.1111, rel=0.001)


def test_gm_bridge(gm_df):
    gm_tools.set_dataframe(gm_df)
    result = gm_bridge("2025-Q1", "2025-Q2")
    assert result["from_period"] == "2025-Q1"
    assert result["to_period"] == "2025-Q2"
    # Bridge should sum to ending GP
    bridge = result["bridge"]
    starting = bridge[0]["amount"]
    drivers = sum(b["amount"] for b in bridge[1:-1])
    ending = bridge[-1]["amount"]
    assert abs((starting + drivers) - ending) < 1.0
