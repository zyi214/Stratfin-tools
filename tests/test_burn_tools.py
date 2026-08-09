import pytest
from stratfin.tools import burn_tools
from stratfin.tools.burn_tools import (
    compute_runway,
    model_burn_scenarios,
    project_cash_to_eoy,
    analyze_burn_by_category,
)


def test_runway_basic(burn_df):
    burn_tools.set_dataframe(burn_df)
    result = compute_runway(cash_balance=5_000_000, monthly_burn=400_000)
    assert result["runway_months"] == pytest.approx(12.5, rel=0.01)
    assert result["status"] in {"OK", "WARNING", "CRITICAL"}


def test_runway_critical():
    result = compute_runway(cash_balance=1_000_000, monthly_burn=400_000, raise_threshold_months=6)
    assert result["status"] == "CRITICAL"
    assert result["runway_months"] < 6


def test_runway_ok():
    result = compute_runway(cash_balance=10_000_000, monthly_burn=400_000, raise_threshold_months=6)
    assert result["status"] == "OK"


def test_model_burn_scenarios():
    result = model_burn_scenarios(
        base_opex=500_000,
        cash_balance=6_000_000,
        scenarios=[
            {"name": "Hiring Freeze", "opex_delta_pct": -20},
            {"name": "Accelerated Hiring", "opex_delta_pct": +30},
        ],
    )
    rows = result["scenarios"]
    assert len(rows) == 2
    # Hiring freeze should have more runway
    freeze = next(r for r in rows if r["scenario"] == "Hiring Freeze")
    accel = next(r for r in rows if r["scenario"] == "Accelerated Hiring")
    assert freeze["runway_months"] > accel["runway_months"]


def test_project_cash_to_eoy_positive():
    result = project_cash_to_eoy(
        starting_cash=2_000_000,
        monthly_forecast_cfs=[-200_000] * 8,
    )
    assert result["ending_cash"] == pytest.approx(400_000, rel=0.01)
    assert result["first_negative_month"] is None


def test_project_cash_to_eoy_goes_negative():
    result = project_cash_to_eoy(
        starting_cash=500_000,
        monthly_forecast_cfs=[-200_000] * 6,
    )
    assert result["first_negative_month"] is not None
    assert result["first_negative_month"] == 3


def test_analyze_burn_by_category(burn_df):
    burn_tools.set_dataframe(burn_df)
    result = analyze_burn_by_category()
    assert result["total_outflows"] > result["total_inflows"]
    assert result["net_burn"] > 0
    assert len(result["by_category"]) > 0
    # Payroll should be the largest category
    categories = [r["category"] for r in result["by_category"]]
    assert "Payroll" in categories
