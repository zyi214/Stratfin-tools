from __future__ import annotations

from pathlib import Path

import pandas as pd


def load_file(path: str | Path) -> pd.DataFrame:
    p = Path(path)
    if p.suffix == ".csv":
        df = pd.read_csv(p)
    elif p.suffix in {".xlsx", ".xls"}:
        df = pd.read_excel(p, engine="openpyxl")
    else:
        raise ValueError(f"Unsupported file type: {p.suffix}. Use .csv or .xlsx")
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    return df


def load_file_as_context(path: str | Path, max_rows: int = 200) -> str:
    df = load_file(path)
    p = Path(path)
    note = ""
    if len(df) > max_rows:
        note = f"\n[Showing first {max_rows} of {len(df)} rows]"
        sample = df.head(max_rows)
    else:
        sample = df
    header = f"File: {p.name} | {df.shape[0]} rows × {df.shape[1]} columns\nColumns: {', '.join(df.columns)}\n"
    return header + sample.to_csv(index=False) + note
