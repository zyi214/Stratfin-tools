import math
import pytest
from stratfin.tools.capital_tools import compute_npv, compute_irr_and_payback, run_sensitivity_analysis, compare_projects


def test_npv_positive_project():
    result = compute_npv(
        initial_investment=1_000_000,
        cash_flows=[300_000, 350_000, 400_000, 450_000],
        discount_rate_pct=10.0,
    )
    assert result["npv"] > 0
    assert result["recommendation"] == "INVEST"


def test_npv_negative_project():
    result = compute_npv(
        initial_investment=2_000_000,
        cash_flows=[100_000, 100_000, 100_000],
        discount_rate_pct=10.0,
    )
    assert result["npv"] < 0
    assert result["recommendation"] == "PASS"


def test_npv_known_value():
    # NPV of [-100, 110] at 10% = -100 + 110/1.1 = 0
    result = compute_npv(100, [110], 10.0)
    assert abs(result["npv"]) < 0.01


def test_irr_above_hurdle():
    result = compute_irr_and_payback(
        initial_investment=500_000,
        cash_flows=[150_000, 180_000, 210_000, 240_000],
        hurdle_rate_pct=15.0,
    )
    assert result["irr_pct"] is not None
    assert result["passes_hurdle"] is True
    assert result["payback_years"] is not None


def test_irr_no_sign_change():
    # All outflows — no IRR possible
    result = compute_irr_and_payback(
        initial_investment=100_000,
        cash_flows=[-10_000, -20_000, -30_000],
        hurdle_rate_pct=10.0,
    )
    assert result["irr_pct"] is None
    assert "cannot be computed" in (result["irr_note"] or "")


def test_payback_never_recovered():
    result = compute_irr_and_payback(
        initial_investment=1_000_000,
        cash_flows=[10_000, 10_000, 10_000],
        hurdle_rate_pct=10.0,
    )
    assert result["payback_years"] is None


def test_sensitivity_returns_correct_steps():
    result = run_sensitivity_analysis(
        initial_investment=500_000,
        base_cash_flows=[150_000, 180_000, 210_000],
        discount_rate_pct=10.0,
        sensitivity_variable="discount_rate",
        low_value=5.0,
        high_value=20.0,
        steps=6,
    )
    assert len(result["scenarios"]) == 6
    # Higher discount rate should produce lower NPV
    npvs = [s["npv"] for s in result["scenarios"]]
    assert npvs[0] > npvs[-1]


def test_compare_projects_sorted_by_pi():
    result = compare_projects(
        projects=[
            {"name": "A", "initial_investment": 1_000_000, "cash_flows": [250_000] * 5},
            {"name": "B", "initial_investment": 200_000, "cash_flows": [80_000] * 5},
        ],
        discount_rate_pct=10.0,
        hurdle_rate_pct=12.0,
    )
    pis = [p["profitability_index"] for p in result["projects"]]
    assert pis[0] >= pis[1]
