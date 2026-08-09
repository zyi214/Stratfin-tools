from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import typer
from dotenv import load_dotenv
from rich.console import Console

load_dotenv()
console = Console()

app = typer.Typer(
    name="stratfin",
    help="Strategic Finance AI Team — powered by Claude. Built for hardware startups.",
    rich_markup_mode="rich",
    no_args_is_help=True,
)


def _require_api_key() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        console.print(
            "[red bold]Error:[/red bold] ANTHROPIC_API_KEY is not set.\n"
            "Add it to a .env file or export it: [dim]export ANTHROPIC_API_KEY=sk-ant-...[/dim]"
        )
        raise typer.Exit(1)


def _load_context(file: Optional[Path]) -> str:
    if file is None:
        return ""
    if not file.exists():
        console.print(f"[red]File not found: {file}[/red]")
        raise typer.Exit(1)
    from stratfin.data.loader import load_file, load_file_as_context
    from stratfin.tools import burn_tools, capital_tools, gm_tools, headcount_tools
    console.print(f"[dim]Loading {file.name}...[/dim]")
    df = load_file(file)
    # Push df into whichever tool module is active (all share the same call)
    # Each agent's __init__ calls set_dataframe on its own module; here we push
    # to all so the context string is generated from the same df.
    return load_file_as_context(file)


@app.command("burn")
def burn_cmd(
    file: Optional[Path] = typer.Option(None, "--file", "-f", help="CSV/Excel file with cash flow data"),
    task: Optional[str] = typer.Option(None, "--task", "-t", help="Single-shot task (skips interactive mode)"),
) -> None:
    """[bold]Burn & Runway Agent[/bold] — Cash management, runway modeling, fundraise timing."""
    _require_api_key()
    from stratfin.agents.burn import BurnRunwayAgent
    from stratfin.data.loader import load_file

    df = None
    context = ""
    if file:
        from stratfin.data.loader import load_file_as_context
        df = load_file(file)
        context = load_file_as_context(file)
        from stratfin.tools.burn_tools import set_dataframe
        set_dataframe(df)

    agent = BurnRunwayAgent(data_context=context)
    if task:
        console.print(agent.run_task(task))
    else:
        agent.chat()


@app.command("gm")
def gm_cmd(
    file: Optional[Path] = typer.Option(None, "--file", "-f", help="CSV/Excel file with COGS/BOM data"),
    task: Optional[str] = typer.Option(None, "--task", "-t", help="Single-shot task"),
) -> None:
    """[bold]Gross Margin & COGS Agent[/bold] — BOM analysis, yield impact, GM bridge."""
    _require_api_key()
    from stratfin.agents.gm import GrossMarginAgent
    from stratfin.data.loader import load_file, load_file_as_context

    df = None
    context = ""
    if file:
        df = load_file(file)
        context = load_file_as_context(file)
        from stratfin.tools.gm_tools import set_dataframe
        set_dataframe(df)

    agent = GrossMarginAgent(data_context=context)
    if task:
        console.print(agent.run_task(task))
    else:
        agent.chat()


@app.command("capital")
def capital_cmd(
    file: Optional[Path] = typer.Option(None, "--file", "-f", help="CSV/Excel file with project cash flows"),
    task: Optional[str] = typer.Option(None, "--task", "-t", help="Single-shot task"),
) -> None:
    """[bold]NRE & Capital Allocation Agent[/bold] — NPV, IRR, sensitivity, project comparison."""
    _require_api_key()
    from stratfin.agents.capital import NRECapitalAgent
    from stratfin.data.loader import load_file, load_file_as_context

    df = None
    context = ""
    if file:
        df = load_file(file)
        context = load_file_as_context(file)
        from stratfin.tools.capital_tools import set_dataframe
        set_dataframe(df)

    agent = NRECapitalAgent(data_context=context)
    if task:
        console.print(agent.run_task(task))
    else:
        agent.chat()


@app.command("headcount")
def headcount_cmd(
    file: Optional[Path] = typer.Option(None, "--file", "-f", help="CSV/Excel file with headcount data"),
    task: Optional[str] = typer.Option(None, "--task", "-t", help="Single-shot task"),
) -> None:
    """[bold]Headcount & OpEx Agent[/bold] — HC reconciliation, open positions, cost impact."""
    _require_api_key()
    from stratfin.agents.headcount import HeadcountOpExAgent
    from stratfin.data.loader import load_file, load_file_as_context

    df = None
    context = ""
    if file:
        df = load_file(file)
        context = load_file_as_context(file)
        from stratfin.tools.headcount_tools import set_dataframe
        set_dataframe(df)

    agent = HeadcountOpExAgent(data_context=context)
    if task:
        console.print(agent.run_task(task))
    else:
        agent.chat()


if __name__ == "__main__":
    app()
