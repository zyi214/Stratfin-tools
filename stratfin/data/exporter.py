from __future__ import annotations

from pathlib import Path

import pandas as pd
from rich.console import Console
from rich.table import Table

console = Console()


def export_to_csv(df: pd.DataFrame, path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    console.print(f"[green]Exported {len(df)} rows → {path}[/green]")


def export_to_excel(
    df: pd.DataFrame, path: str | Path, sheet_name: str = "Results"
) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    df.to_excel(path, index=False, sheet_name=sheet_name, engine="openpyxl")
    console.print(f"[green]Exported {len(df)} rows → {path} (sheet: {sheet_name})[/green]")


def print_dataframe_as_table(df: pd.DataFrame, title: str = "") -> None:
    table = Table(title=title, show_lines=True)
    for col in df.columns:
        table.add_column(str(col), style="cyan")
    for _, row in df.iterrows():
        table.add_row(*[str(v) for v in row.values])
    console.print(table)
