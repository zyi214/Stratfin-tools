/**
 * FormulaTooltip — a small "?" badge that reveals the formula for a calculated
 * field when hovered. Uses pure CSS hover (no JS state), so it's zero overhead.
 *
 * Usage:
 *   <span className="flex items-center gap-1">
 *     Some Label
 *     <FormulaTooltip formula="A × B + C" />
 *   </span>
 */
export function FormulaTooltip({
  formula,
  side = "top",
}: {
  formula: string;
  /** Which side the tooltip appears on relative to the "?" badge. Default: top. */
  side?: "top" | "bottom";
}) {
  return (
    <span className="relative inline-flex items-center group/ft ml-0.5 flex-shrink-0">
      {/* The "?" badge */}
      <span
        aria-label={`Formula: ${formula}`}
        title={formula}
        className={[
          "inline-flex w-3.5 h-3.5 rounded-full items-center justify-center",
          "border border-muted-foreground/20 bg-transparent",
          "text-[9px] font-bold leading-none text-muted-foreground/35",
          "cursor-help select-none transition-colors duration-100",
          "group-hover/ft:border-muted-foreground/50 group-hover/ft:text-muted-foreground/70",
        ].join(" ")}
      >
        ?
      </span>

      {/* Floating tooltip — anchored by left edge of the "?" icon */}
      <span
        className={[
          "absolute z-[200] pointer-events-none",
          "opacity-0 group-hover/ft:opacity-100",
          "transition-opacity duration-100",
          // Panel styling
          "bg-[hsl(222,30%,8%)] border border-[hsl(222,20%,22%)]",
          "rounded-lg shadow-2xl px-3 py-2",
          // Horizontal: center on the badge, but clamp so it doesn't overflow left
          "left-0 -translate-x-[calc(50%-7px)]",
          // Vertical
          side === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
        ].join(" ")}
        style={{ minWidth: "max-content" }}
      >
        {/* Caret */}
        <span
          className={[
            "absolute left-[calc(50%-7px+0px)] w-2 h-2",
            "border-[hsl(222,20%,22%)] bg-[hsl(222,30%,8%)]",
            "rotate-45",
            side === "bottom"
              ? "-top-[5px] border-t border-l"
              : "-bottom-[5px] border-b border-r",
          ].join(" ")}
        />
        <span className="text-[11px] font-mono text-[hsl(210,14%,70%)] leading-relaxed whitespace-nowrap">
          {formula}
        </span>
      </span>
    </span>
  );
}
