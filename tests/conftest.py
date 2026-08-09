import pandas as pd
import pytest


@pytest.fixture
def burn_df():
    return pd.DataFrame([
        {"period": "2025-01", "category": "Payroll", "type": "outflow", "amount": 500000, "cash_balance_eop": 4500000},
        {"period": "2025-01", "category": "G&A", "type": "outflow", "amount": 80000, "cash_balance_eop": 4500000},
        {"period": "2025-01", "category": "Revenue", "type": "inflow", "amount": 120000, "cash_balance_eop": 4500000},
        {"period": "2025-02", "category": "Payroll", "type": "outflow", "amount": 520000, "cash_balance_eop": 3700000},
        {"period": "2025-02", "category": "G&A", "type": "outflow", "amount": 85000, "cash_balance_eop": 3700000},
        {"period": "2025-02", "category": "Revenue", "type": "inflow", "amount": 150000, "cash_balance_eop": 3700000},
    ])


@pytest.fixture
def gm_df():
    return pd.DataFrame([
        {"period": "2025-Q1", "sku": "SKU-001", "component": "PCB", "unit_cost": 50.0, "qty_per_unit": 1,
         "units_produced": 1000, "yield_pct": 92.0, "revenue": 1200000, "total_cogs": 800000},
        {"period": "2025-Q1", "sku": "SKU-001", "component": "Enclosure", "unit_cost": 20.0, "qty_per_unit": 1,
         "units_produced": 1000, "yield_pct": 92.0, "revenue": 1200000, "total_cogs": 800000},
        {"period": "2025-Q2", "sku": "SKU-001", "component": "PCB", "unit_cost": 47.0, "qty_per_unit": 1,
         "units_produced": 1500, "yield_pct": 94.0, "revenue": 1850000, "total_cogs": 1100000},
        {"period": "2025-Q2", "sku": "SKU-001", "component": "Enclosure", "unit_cost": 19.5, "qty_per_unit": 1,
         "units_produced": 1500, "yield_pct": 94.0, "revenue": 1850000, "total_cogs": 1100000},
    ])


@pytest.fixture
def headcount_df():
    return pd.DataFrame([
        {"employee_id": "E001", "name": "Alice", "department": "Engineering", "level": "Senior",
         "role_type": "FTE", "status": "filled", "hire_date": "2023-01-01", "req_open_date": None,
         "budget_hc": 1, "lf_hc": 1, "annual_salary": 170000, "fully_loaded_cost": 221000},
        {"employee_id": "E002", "name": "Bob", "department": "Engineering", "level": "Mid",
         "role_type": "FTE", "status": "filled", "hire_date": "2023-06-01", "req_open_date": None,
         "budget_hc": 1, "lf_hc": 1, "annual_salary": 140000, "fully_loaded_cost": 182000},
        {"employee_id": "E003", "name": None, "department": "Engineering", "level": "Senior",
         "role_type": "FTE", "status": "open", "hire_date": None, "req_open_date": "2024-10-01",
         "budget_hc": 1, "lf_hc": 1, "annual_salary": 170000, "fully_loaded_cost": 221000},
        {"employee_id": "E004", "name": "Carol", "department": "Sales", "level": "Mid",
         "role_type": "FTE", "status": "filled", "hire_date": "2024-03-01", "req_open_date": None,
         "budget_hc": 1, "lf_hc": 1, "annual_salary": 110000, "fully_loaded_cost": 143000},
    ])
