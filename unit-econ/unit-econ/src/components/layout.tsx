import { ReactNode, useRef, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Calculator, Settings, Sliders, LayoutDashboard, Download, Upload, FileSpreadsheet, FileText, FileJson, ChevronRight, ArrowRightLeft, Pencil, Check, X, Plus, Building2, Layers } from "lucide-react";
import { useStore } from "@/lib/store";

const SCENARIO_COLORS = [
  "hsl(210,90%,56%)",
  "hsl(38,90%,52%)",
  "hsl(142,70%,42%)",
  "hsl(262,52%,62%)",
];

function ScenarioTag() {
  const { scenarios, activeScenarioId, setActiveScenarioId, updateScenario, addScenario } = useStore();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const active = scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0];
  const activeIdx = scenarios.findIndex((s) => s.id === activeScenarioId);
  const color = SCENARIO_COLORS[Math.max(0, activeIdx) % SCENARIO_COLORS.length];

  useEffect(() => {
    if (renaming) {
      setDraft(active?.name ?? "");
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [renaming, active?.name]);

  if (!active) return null;

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== active.name) {
      updateScenario(active.id, { name: trimmed });
    }
    setRenaming(false);
  };

  const cancelRename = () => {
    setRenaming(false);
  };

  return (
    <div className="px-3 pb-3">
      <div className="text-xs text-muted-foreground/60 uppercase tracking-wider mb-1.5 px-1">
        Editing
      </div>
      <div className="relative">
        {/* Rename mode */}
        {renaming ? (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-primary/60 bg-muted/20">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: color, boxShadow: `0 0 6px ${color}99` }}
            />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") cancelRename();
              }}
              onBlur={commitRename}
              className="flex-1 bg-transparent text-xs font-semibold text-foreground outline-none min-w-0"
              maxLength={48}
            />
            <button
              onMouseDown={(e) => { e.preventDefault(); commitRename(); }}
              className="text-green-400 hover:text-green-300 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); cancelRename(); }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          /* Display mode */
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-border/60 bg-muted/20 group"
          >
            {/* Name — click to open switcher */}
            <button
              onClick={() => setSwitcherOpen((o) => !o)}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: color, boxShadow: `0 0 6px ${color}99` }}
              />
              <span className="flex-1 text-xs font-semibold text-foreground truncate">
                {active.name}
              </span>
            </button>

            {/* Pencil — visible on hover, opens rename */}
            <button
              onClick={() => setRenaming(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-foreground shrink-0"
              title="Rename scenario"
            >
              <Pencil className="w-3 h-3" />
            </button>

            {/* Chevron — always shown */}
            <button
              onClick={() => setSwitcherOpen((o) => !o)}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
              title="Switch scenario"
            >
              <ChevronRight className={`w-3 h-3 transition-transform ${switcherOpen ? "rotate-90" : ""}`} />
            </button>
          </div>
        )}

        {/* Switcher dropdown */}
        {switcherOpen && !renaming && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setSwitcherOpen(false)} />
            <div className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-card border border-border rounded-lg shadow-xl py-1 overflow-hidden">
              {scenarios.length > 1 && (
                <>
                  <p className="text-xs text-muted-foreground px-3 pt-2 pb-1.5 font-medium">
                    Switch scenario
                  </p>
                  {scenarios.map((s, idx) => {
                    const sc = SCENARIO_COLORS[idx % SCENARIO_COLORS.length];
                    const isActive = s.id === activeScenarioId;
                    return (
                      <button
                        key={s.id}
                        onClick={() => { setActiveScenarioId(s.id); setSwitcherOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                          isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/40"
                        }`}
                      >
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: sc }} />
                        <span className="flex-1 text-left truncate font-medium">{s.name}</span>
                        {isActive && <span className="text-primary text-xs">✓</span>}
                      </button>
                    );
                  })}
                  <div className="border-t border-border my-1" />
                </>
              )}
              <button
                onClick={() => {
                  const newId = addScenario({
                    ...active,
                    name: `${active.name} (copy)`,
                    isBaseCase: false,
                  });
                  setActiveScenarioId(newId);
                  setSwitcherOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-primary hover:bg-primary/10 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium">New scenario (clone current)</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExportMenu({
  onCSV,
  onExcel,
  onJSON,
}: {
  onCSV: () => void;
  onExcel: () => void;
  onJSON: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 text-xs text-sidebar-foreground hover:text-white transition-colors w-full p-2 rounded-md hover:bg-sidebar-accent"
      >
        <div className="flex items-center gap-2">
          <Download className="w-3 h-3" />
          Export Data
        </div>
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute left-full bottom-0 ml-2 z-20 bg-card border border-border rounded-lg shadow-xl py-1 w-44 overflow-hidden">
            <p className="text-xs text-muted-foreground px-3 pt-2 pb-1 font-medium uppercase tracking-wider">
              Choose format
            </p>
            <button
              onClick={() => { onExcel(); close(); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground hover:bg-muted/40 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-400" />
              <div className="text-left">
                <div className="font-medium">Excel (.xlsx)</div>
                <div className="text-xs text-muted-foreground">2 sheets: summary + inputs</div>
              </div>
            </button>
            <button
              onClick={() => { onCSV(); close(); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground hover:bg-muted/40 transition-colors"
            >
              <FileText className="w-4 h-4 text-blue-400" />
              <div className="text-left">
                <div className="font-medium">CSV (.csv)</div>
                <div className="text-xs text-muted-foreground">Cost breakdown table</div>
              </div>
            </button>
            <button
              onClick={() => { onJSON(); close(); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-foreground hover:bg-muted/40 transition-colors"
            >
              <FileJson className="w-4 h-4 text-yellow-400" />
              <div className="text-left">
                <div className="font-medium">JSON (.json)</div>
                <div className="text-xs text-muted-foreground">Full scenario data</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { exportScenarios, exportAsCSV, exportAsExcel, importScenarios } = useStore();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/setup", label: "Setup", icon: Settings },
    { href: "/calculator", label: "Cost Model", icon: Calculator },
    { href: "/solver", label: "Solver", icon: Sliders },
    { href: "/scenarios", label: "Scenarios", icon: Layers },
    { href: "/make-vs-buy", label: "Make vs. Buy", icon: ArrowRightLeft },
    { href: "/facility", label: "Facility Investment", icon: Building2 },
  ];

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        importScenarios(data);
      } catch {
        alert("Invalid JSON file. Only JSON exports can be re-imported.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2 text-sidebar-foreground font-semibold">
            <Calculator className="w-5 h-5 text-primary" />
            <span>Unit Econ Tool</span>
          </div>
        </div>

        <div className="px-3 pt-3">
          <ScenarioTag />
        </div>

        <div className="flex-1 py-2 px-3 flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer text-sm font-medium ${
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-sidebar-border space-y-1">
          <ExportMenu
            onExcel={exportAsExcel}
            onCSV={exportAsCSV}
            onJSON={exportScenarios}
          />
          <label className="flex items-center gap-2 text-xs text-sidebar-foreground hover:text-white transition-colors w-full p-2 rounded-md hover:bg-sidebar-accent cursor-pointer">
            <Upload className="w-3 h-3" />
            Import Data
            <input type="file" className="hidden" accept=".json" onChange={handleImport} />
          </label>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto bg-background p-6">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
