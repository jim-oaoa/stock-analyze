import { describe, it, expect, beforeEach } from "vitest";
import { useGridStore } from "@/store/gridStore";
import type { ApiFinancialRow } from "@/lib/types";

// Reset Zustand store before each test
beforeEach(() => {
  useGridStore.getState().reset();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(
  year: number,
  quarter: ApiFinancialRow["quarter"],
  overrides: Partial<Omit<ApiFinancialRow, "id" | "stockId" | "year" | "quarter" | "updatedAt">> = {},
): ApiFinancialRow {
  return {
    id: `${year}-${quarter}`,
    stockId: "stock-1",
    year,
    quarter,
    eps: null,
    oci: null,
    other: null,
    dividends: null,
    otherEquityItems: null,
    previousNetValue: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── loadFinancials ───────────────────────────────────────────────────────────

describe("loadFinancials", () => {
  it("hydrates cells from API rows", () => {
    const rows: ApiFinancialRow[] = [
      makeRow(2024, "Q1", { eps: "2.00", previousNetValue: "20.00" }),
    ];
    useGridStore.getState().loadFinancials("stock-1", rows);

    const cell = useGridStore.getState().cells["2024-Q1"];
    expect(cell).toBeDefined();
    expect(cell?.eps).toBe(2.0);
    expect(cell?.previousNetValue).toBe(20.0);
  });

  it("triggers initial recomputation on load", () => {
    const rows: ApiFinancialRow[] = [
      makeRow(2024, "Q1", {
        eps: "2.00",
        oci: "0.00",
        other: "0.00",
        dividends: "-1.00",
        otherEquityItems: "0.50",
        previousNetValue: "20.00",
      }),
    ];
    useGridStore.getState().loadFinancials("stock-1", rows);

    const cell = useGridStore.getState().cells["2024-Q1"];
    // netValueChange = 2 + 0 + 0 + (-1) = 1
    expect(cell?.netValueChange).toBeCloseTo(1.0);
    // netValue = 20 + 1 = 21
    expect(cell?.netValue).toBeCloseTo(21.0);
    // adjustedNetValue = 21 - 0.5 = 20.5
    expect(cell?.adjustedNetValue).toBeCloseTo(20.5);
    // adjustedROE = (2 * 4) / 20.5 ≈ 0.3902
    expect(cell?.adjustedROE).toBeCloseTo(8 / 20.5);
  });
});

// ─── Year-internal cascade (Q1→Q4 previousNetValue) ──────────────────────────

describe("year-internal cascade", () => {
  it("cascades Q1 netValue into Q2 previousNetValue", () => {
    const rows: ApiFinancialRow[] = [
      makeRow(2024, "Q1", {
        eps: "2.00",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: "20.00",
      }),
      makeRow(2024, "Q2", {
        eps: "2.50",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: null, // will be cascaded from Q1
      }),
    ];
    useGridStore.getState().loadFinancials("stock-1", rows);

    const q1 = useGridStore.getState().cells["2024-Q1"];
    const q2 = useGridStore.getState().cells["2024-Q2"];

    // Q1 netValue = 20 + 2 = 22
    expect(q1?.netValue).toBeCloseTo(22.0);
    // Q2 previousNetValue should be cascaded from Q1 netValue
    expect(q2?.previousNetValue).toBeCloseTo(22.0);
    // Q2 netValue = 22 + 2.5 = 24.5
    expect(q2?.netValue).toBeCloseTo(24.5);
  });

  it("cascades all four quarters in sequence", () => {
    const rows: ApiFinancialRow[] = [
      makeRow(2024, "Q1", {
        eps: "1.00",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: "10.00",
      }),
      makeRow(2024, "Q2", {
        eps: "1.00",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: null,
      }),
      makeRow(2024, "Q3", {
        eps: "1.00",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: null,
      }),
      makeRow(2024, "Q4", {
        eps: "1.00",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: null,
      }),
    ];
    useGridStore.getState().loadFinancials("stock-1", rows);

    const cells = useGridStore.getState().cells;
    expect(cells["2024-Q1"]?.netValue).toBeCloseTo(11.0);
    expect(cells["2024-Q2"]?.previousNetValue).toBeCloseTo(11.0);
    expect(cells["2024-Q2"]?.netValue).toBeCloseTo(12.0);
    expect(cells["2024-Q3"]?.previousNetValue).toBeCloseTo(12.0);
    expect(cells["2024-Q3"]?.netValue).toBeCloseTo(13.0);
    expect(cells["2024-Q4"]?.previousNetValue).toBeCloseTo(13.0);
    expect(cells["2024-Q4"]?.netValue).toBeCloseTo(14.0);
  });
});

// ─── setCellField ─────────────────────────────────────────────────────────────

describe("setCellField", () => {
  it("marks cell as dirty and triggers recompute", () => {
    const rows: ApiFinancialRow[] = [
      makeRow(2024, "Q1", {
        eps: "1.00",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: "10.00",
      }),
    ];
    useGridStore.getState().loadFinancials("stock-1", rows);

    useGridStore.getState().setCellField("2024-Q1", "eps", 3.0);

    const cell = useGridStore.getState().cells["2024-Q1"];
    expect(cell?.eps).toBe(3.0);
    expect(cell?.isDirty).toBe(true);
    // netValue should update: 10 + 3 + 0 + 0 + 0 = 13
    expect(cell?.netValue).toBeCloseTo(13.0);
  });

  it("adds the key to dirtyKeys", () => {
    const rows = [makeRow(2024, "Q1", { eps: "1.00", previousNetValue: "10.00" })];
    useGridStore.getState().loadFinancials("stock-1", rows);
    useGridStore.getState().setCellField("2024-Q1", "eps", 2.0);

    expect(useGridStore.getState().dirtyKeys.has("2024-Q1")).toBe(true);
  });

  it("propagates edit into downstream cascade within the year", () => {
    const rows: ApiFinancialRow[] = [
      makeRow(2024, "Q1", {
        eps: "1.00",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: "10.00",
      }),
      makeRow(2024, "Q2", {
        eps: "1.00",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: null,
      }),
    ];
    useGridStore.getState().loadFinancials("stock-1", rows);

    // Edit Q1 EPS → Q2 previousNetValue should cascade
    useGridStore.getState().setCellField("2024-Q1", "eps", 5.0);

    const q2 = useGridStore.getState().cells["2024-Q2"];
    // Q1 netValue = 10 + 5 = 15 → Q2 previousNetValue = 15
    expect(q2?.previousNetValue).toBeCloseTo(15.0);
    // Q2 netValue = 15 + 1 = 16
    expect(q2?.netValue).toBeCloseTo(16.0);
  });
});

// ─── confirmSave / revertCell ─────────────────────────────────────────────────

describe("confirmSave", () => {
  it("clears isDirty and removes from dirtyKeys", () => {
    const rows = [makeRow(2024, "Q1", { eps: "1.00", previousNetValue: "10.00" })];
    useGridStore.getState().loadFinancials("stock-1", rows);
    useGridStore.getState().setCellField("2024-Q1", "eps", 2.0);
    useGridStore.getState().markSaving("2024-Q1");
    useGridStore.getState().confirmSave("2024-Q1");

    const cell = useGridStore.getState().cells["2024-Q1"];
    expect(cell?.isDirty).toBe(false);
    expect(cell?.isSaving).toBe(false);
    expect(useGridStore.getState().dirtyKeys.has("2024-Q1")).toBe(false);
  });
});

describe("revertCell", () => {
  it("restores server data and clears dirty state", () => {
    const rows = [
      makeRow(2024, "Q1", {
        eps: "1.00",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: "10.00",
      }),
    ];
    useGridStore.getState().loadFinancials("stock-1", rows);
    useGridStore.getState().setCellField("2024-Q1", "eps", 99.0);

    const serverData = {
      eps: 1.0,
      oci: 0.0,
      other: 0.0,
      dividends: 0.0,
      otherEquityItems: 0.0,
      previousNetValue: 10.0,
    };
    useGridStore.getState().revertCell("2024-Q1", serverData);

    const cell = useGridStore.getState().cells["2024-Q1"];
    expect(cell?.eps).toBe(1.0);
    expect(cell?.isDirty).toBe(false);
    expect(cell?.saveError).toBeTruthy();
  });
});
