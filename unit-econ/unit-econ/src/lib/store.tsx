import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Scenario, defaultConfig, defaultInputs, calculateCosts } from "./formulas";
import * as XLSX from "xlsx";

interface StoreContextType {
  scenarios: Scenario[];
  baseScenarioId: string;
  activeScenarioId: string;
  setActiveScenarioId: (id: string) => void;
  updateScenario: (id: string, scenario: Partial<Scenario>) => void;
  addScenario: (scenario: Omit<Scenario, "id">) => string;
  deleteScenario: (id: string) => void;
  exportScenarios: () => void;
  exportAsCSV: () => void;
  exportAsExcel: () => void;
  importScenarios: (data: any) => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

const STORAGE_KEY = "unit-econ-scenarios";

function buildExportRows(scenarios: Scenario[]) {
  const headers = [
    "Metric",
    ...scenarios.map((s) => s.name),
  ];

  const breakdowns = scenarios.map((s) => calculateCosts(s.config, s.inputs));

  const configRows = [
    ["Product Name", ...scenarios.map((s) => s.config.name)],
    ["Selling Price (ASP)", ...scenarios.map((s) => s.config.sellingPrice)],
    ["Annual Volume (units)", ...scenarios.map((s) => s.config.annualVolume)],
    ["Model Granularity", ...scenarios.map((s) => s.config.granularity)],
    ["", ...scenarios.map(() => "")],
  ];

  const costRows = [
    ["--- Cost Breakdown ($/unit) ---", ...scenarios.map(() => "")],
    ["Materials", ...breakdowns.map((b) => +b.materials.toFixed(4))],
    ["Labor", ...breakdowns.map((b) => +b.labor.toFixed(4))],
    ["Overhead", ...breakdowns.map((b) => +b.overhead.toFixed(4))],
    ["Tooling (amortized)", ...breakdowns.map((b) => +b.tooling.toFixed(4))],
    ["Yield Loss", ...breakdowns.map((b) => +b.yieldLoss.toFixed(4))],
    ["Scrap Disposal", ...breakdowns.map((b) => +b.scrapDisposal.toFixed(4))],
    ["Packaging", ...breakdowns.map((b) => +b.packaging.toFixed(4))],
    ["Logistics", ...breakdowns.map((b) => +b.logistics.toFixed(4))],
    ["Warranty Provision", ...breakdowns.map((b) => +b.warranty.toFixed(4))],
    ["", ...scenarios.map(() => "")],
    ["Total CPU", ...breakdowns.map((b) => +b.totalCost.toFixed(4))],
    ["Gross Margin ($)", ...breakdowns.map((b) => +b.grossMargin.toFixed(4))],
    ["Gross Margin (%)", ...breakdowns.map((b) => +(b.grossMarginPercent * 100).toFixed(2))],
    ["Annual Profit", ...breakdowns.map((b, i) => +(b.grossMargin * scenarios[i].config.annualVolume).toFixed(0))],
  ];

  return { headers, rows: [...configRows, ...costRows] };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [scenarios, setScenarios] = useState<Scenario[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to load scenarios", e);
    }
    return [
      {
        id: "base",
        name: "Base Case",
        config: defaultConfig,
        inputs: defaultInputs,
        isBaseCase: true,
      },
    ];
  });

  const [activeScenarioId, setActiveScenarioId] = useState("base");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  }, [scenarios]);

  const baseScenarioId = scenarios.find((s) => s.isBaseCase)?.id || scenarios[0]?.id || "base";

  const updateScenario = (id: string, updates: Partial<Scenario>) => {
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const addScenario = (scenarioData: Omit<Scenario, "id">) => {
    const id = "scenario_" + Date.now();
    const newScenario = { ...scenarioData, id };
    setScenarios((prev) => [...prev, newScenario]);
    return id;
  };

  const deleteScenario = (id: string) => {
    if (scenarios.find((s) => s.id === id)?.isBaseCase) return;
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    if (activeScenarioId === id) {
      setActiveScenarioId(baseScenarioId);
    }
  };

  const exportScenarios = () => {
    const dataStr =
      "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(scenarios, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "unit-econ-scenarios.json");
    a.click();
  };

  const exportAsCSV = () => {
    const { headers, rows } = buildExportRows(scenarios);
    const allRows = [headers, ...rows];
    const csv = allRows
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(",")
      )
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unit-econ-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsExcel = () => {
    const { headers, rows } = buildExportRows(scenarios);
    const wsData = [headers, ...rows];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws["!cols"] = [
      { wch: 28 },
      ...scenarios.map(() => ({ wch: 20 })),
    ];

    // Bold the header row
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = { font: { bold: true } };
    }

    XLSX.utils.book_append_sheet(wb, ws, "Unit Economics");

    // Also add a raw inputs sheet
    const inputRows: any[][] = [
      ["Input", ...scenarios.map((s) => s.name)],
      ["-- Simple Inputs --"],
      ["Materials (simple)", ...scenarios.map((s) => s.inputs.materialsSimple)],
      ["Labor (simple)", ...scenarios.map((s) => s.inputs.laborSimple)],
      ["Overhead (simple)", ...scenarios.map((s) => s.inputs.overheadSimple)],
      ["-- Standard Inputs --"],
      ["Materials (standard)", ...scenarios.map((s) => s.inputs.materialsStandard)],
      ["Labor Hours/Unit", ...scenarios.map((s) => s.inputs.laborHoursStandard)],
      ["Labor Rate ($/hr)", ...scenarios.map((s) => s.inputs.laborRateStandard)],
      ["Overhead Rate/Unit", ...scenarios.map((s) => s.inputs.overheadRateStandard)],
      ["-- Advanced --"],
      ["Tooling Cost ($)", ...scenarios.map((s) => s.inputs.toolingCost)],
      ["Tooling Amort. Years", ...scenarios.map((s) => s.inputs.toolingAmortizationYears)],
      ["Yield Rate (%)", ...scenarios.map((s) => +(s.inputs.yieldRate * 100).toFixed(2))],
      ["Scrap Disposal $/unit", ...scenarios.map((s) => s.inputs.scrapDisposalCostPerUnit)],
      ["Packaging $/unit", ...scenarios.map((s) => s.inputs.packagingCost)],
      ["Inbound Logistics $/unit", ...scenarios.map((s) => s.inputs.logisticsInbound)],
      ["Outbound Logistics $/unit", ...scenarios.map((s) => s.inputs.logisticsOutbound)],
      ["Warranty Provision (%)", ...scenarios.map((s) => +(s.inputs.warrantyProvisionPercent * 100).toFixed(2))],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(inputRows);
    ws2["!cols"] = [{ wch: 28 }, ...scenarios.map(() => ({ wch: 20 }))];
    XLSX.utils.book_append_sheet(wb, ws2, "Raw Inputs");

    XLSX.writeFile(wb, "unit-econ-export.xlsx");
  };

  const importScenarios = (data: any) => {
    if (Array.isArray(data) && data.length > 0 && data[0].id) {
      setScenarios(data);
      setActiveScenarioId(data[0].id);
    }
  };

  return (
    <StoreContext.Provider
      value={{
        scenarios,
        baseScenarioId,
        activeScenarioId,
        setActiveScenarioId,
        updateScenario,
        addScenario,
        deleteScenario,
        exportScenarios,
        exportAsCSV,
        exportAsExcel,
        importScenarios,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider");
  return context;
}

export function useActiveScenario() {
  const { scenarios, activeScenarioId, updateScenario } = useStore();
  const scenario = scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];

  const update = (updates: Partial<Scenario>) => {
    updateScenario(activeScenarioId, updates);
  };

  return { scenario, update };
}
