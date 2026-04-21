from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

import anthropic
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel

from stratfin.core.tool_registry import ToolSpec

console = Console()

DEFAULT_MODEL = os.environ.get("STRATFIN_MODEL", "claude-sonnet-4-6")
MAX_TOKENS = int(os.environ.get("STRATFIN_MAX_TOKENS", "8096"))


@dataclass
class AgentConfig:
    name: str
    model: str = DEFAULT_MODEL
    max_tokens: int = MAX_TOKENS


class Agent:
    def __init__(
        self,
        config: AgentConfig,
        system_prompt: str,
        tools: list[ToolSpec],
        data_context: str = "",
    ) -> None:
        self.config = config
        self.system_prompt = system_prompt
        self.tools: dict[str, ToolSpec] = {t.name: t for t in tools}
        self.data_context = data_context
        self.conversation_history: list[dict] = []
        self.client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self._tool_api_defs = [t.to_api_dict() for t in tools]

    def _build_system_blocks(self) -> list[dict]:
        if self.data_context:
            return [
                {"type": "text", "text": self.system_prompt},
                {
                    "type": "text",
                    "text": f"\n\n## LOADED DATA\n\n{self.data_context}",
                    "cache_control": {"type": "ephemeral"},
                },
            ]
        return [
            {
                "type": "text",
                "text": self.system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ]

    def _call_api(self) -> anthropic.types.Message:
        return self.client.messages.create(
            model=self.config.model,
            max_tokens=self.config.max_tokens,
            system=self._build_system_blocks(),
            tools=self._tool_api_defs,
            messages=self.conversation_history,
        )

    def _dispatch_tool(self, block: anthropic.types.ToolUseBlock) -> str:
        spec = self.tools.get(block.name)
        if spec is None:
            return json.dumps({"error": f"Unknown tool: {block.name}"})
        try:
            result = spec.handler(**block.input)
            if isinstance(result, (dict, list)):
                return json.dumps(result, default=str)
            return str(result)
        except Exception as exc:
            return json.dumps({"error": str(exc)})

    def _process_response(self, response: anthropic.types.Message) -> str | None:
        self.conversation_history.append(
            {"role": "assistant", "content": response.content}
        )

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    console.print(
                        f"[dim]  → [bold]{block.name}[/bold]("
                        + json.dumps(block.input, default=str)[:120]
                        + ")[/dim]"
                    )
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": self._dispatch_tool(block),
                        }
                    )
            self.conversation_history.append(
                {"role": "user", "content": tool_results}
            )
            return None

        return "\n".join(
            block.text for block in response.content if hasattr(block, "text")
        )

    def run_turn(self, user_message: str) -> str:
        self.conversation_history.append(
            {"role": "user", "content": user_message}
        )
        while True:
            response = self._call_api()
            result = self._process_response(response)
            if result is not None:
                return result

    def chat(self) -> None:
        console.print(
            Panel(
                f"[bold green]{self.config.name}[/bold green]\n"
                "[dim]Type your question. 'exit' to quit.[/dim]",
                border_style="green",
            )
        )
        while True:
            try:
                user_input = console.input("[bold cyan]You:[/bold cyan] ").strip()
            except (EOFError, KeyboardInterrupt):
                console.print("\n[dim]Session ended.[/dim]")
                break
            if user_input.lower() in {"exit", "quit", "q"}:
                console.print("[dim]Goodbye.[/dim]")
                break
            if not user_input:
                continue
            response_text = self.run_turn(user_input)
            console.print(f"\n[bold green]{self.config.name}:[/bold green]")
            console.print(Markdown(response_text))
            console.print()

    def run_task(self, task: str) -> str:
        return self.run_turn(task)

    def reset(self) -> None:
        self.conversation_history.clear()
