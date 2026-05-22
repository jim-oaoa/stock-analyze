import { describe, it, expect, beforeEach } from "vitest";
import { useValuationStore } from "@/store/valuationStore";
import { useGridStore } from "@/store/gridStore";
import type { ApiFinancialRow } from "@/lib/types";
import { DEFAULT_MULTIPLIER } from "@/lib/constants";

beforeEach(() => {
  useGridStore.getState().reset();
  useValuationStore.setState({ multiplier: DEFAULT_MULTIPLIER, bands: {} });
});

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

describe("useValuationStore", () => {
  it("recomputeBands produces correct base values", () => {
    const rows: ApiFinancialRow[] = [
      makeRow(2024, "Q1", {
        eps: "2.00",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: "20.00",
      }),
    ];
    useGridStore.getState().loadFinancials("stock-1", rows);
    const { cells } = useGridStore.getState();

    useValuationStore.getState().recomputeBands(cells);

    const band = useValuationStore.getState().bands["2024-Q1"];
    expect(band).toBeDefined();

    // adjustedNetValue = 22, adjustedROE = (2*4)/22 ≈ 0.3636
    // baseValue = 1.5 * 22 * (1 + 8/22) = 1.5 * 22 * 30/22 = 1.5 * 30 = 45
    expect(band?.baseValue).toBeCloseTo(45.0);
    expect(band?.bearZone).toBeCloseTo(45 * 0.85);
    expect(band?.fairZone).toBeCloseTo(45 * 1.0);
    expect(band?.bullZone).toBeCloseTo(45 * 1.15);
    expect(band?.overvalued).toBeCloseTo(45 * 1.3);
    expect(band?.bubble).toBeCloseTo(45 * 2.0);
  });

  it("setMultiplier changes the stored multiplier", () => {
    useValuationStore.getState().setMultiplier(2.0);
    expect(useValuationStore.getState().multiplier).toBe(2.0);
  });

  it("recomputeBands uses the current multiplier", () => {
    const rows: ApiFinancialRow[] = [
      makeRow(2024, "Q1", {
        eps: "2.00",
        oci: "0.00",
        other: "0.00",
        dividends: "0.00",
        otherEquityItems: "0.00",
        previousNetValue: "20.00",
      }),
    ];
    useGridStore.getState().loadFinancials("stock-1", rows);
    const { cells } = useGridStore.getState();

    useValuationStore.getState().setMultiplier(2.0);
    useValuationStore.getState().recomputeBands(cells);

    const band = useValuationStore.getState().bands["2024-Q1"];
    // baseValue = 2.0 * 22 * (1 + 8/22) = 2.0 * 30 = 60
    expect(band?.baseValue).toBeCloseTo(60.0);
  });

  it("returns null bands when data is incomplete", () => {
    const rows: ApiFinancialRow[] = [
      makeRow(2024, "Q1", { eps: "2.00" }), // missing oci/other/dividends/previousNetValue
    ];
    useGridStore.getState().loadFinancials("stock-1", rows);
    const { cells } = useGridStore.getState();

    useValuationStore.getState().recomputeBands(cells);

    const band = useValuationStore.getState().bands["2024-Q1"];
    expect(band?.baseValue).toBeNull();
  });
});
