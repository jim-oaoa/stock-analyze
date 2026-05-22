import { enableMapSet } from "immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { devtools } from "zustand/middleware";

// Required for immer to handle Set/Map types in Zustand store
enableMapSet();
import {
  RawQuarterData,
  ComputedQuarterData,
  computeQuarterFields,
  computeAdjustedROE,
} from "@/lib/formulas";
import type { QuarterKey, QuarterLabel, ApiFinancialRow } from "@/lib/types";

// ─── Cell type ────────────────────────────────────────────────────────────────

export interface GridCell extends RawQuarterData, ComputedQuarterData {
  key: QuarterKey;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
}

// ─── State & Actions ──────────────────────────────────────────────────────────

interface GridState {
  stockId: string | null;
  cells: Record<QuarterKey, GridCell>;
  dirtyKeys: Set<QuarterKey>;
  activeKey: QuarterKey | null;
}

interface GridActions {
  loadFinancials: (stockId: string, apiData: ApiFinancialRow[]) => void;
  setCellField: (
    key: QuarterKey,
    field: keyof RawQuarterData,
    value: number | null,
  ) => void;
  markSaving: (key: QuarterKey) => void;
  confirmSave: (key: QuarterKey) => void;
  revertCell: (key: QuarterKey, serverData: RawQuarterData) => void;
  setActiveKey: (key: QuarterKey | null) => void;
  reset: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function quarterIndex(q: QuarterLabel): 1 | 2 | 3 | 4 {
  return ({ Q1: 1, Q2: 2, Q3: 3, Q4: 4 } as const)[q];
}

const PREV_QUARTER: Partial<Record<QuarterLabel, QuarterLabel>> = {
  Q2: "Q1",
  Q3: "Q2",
  Q4: "Q3",
};

/**
 * Cascades previousNetValue Q1→Q4 within a year, then recomputes derived fields.
 * Cross-year cascade is intentionally omitted — handled server-side via /propagate.
 */
function recomputeYear(
  cells: Record<QuarterKey, GridCell>,
  year: number,
): void {
  let cumulativeEPS = 0;

  for (const q of ["Q1", "Q2", "Q3", "Q4"] as QuarterLabel[]) {
    const key: QuarterKey = `${year}-${q}`;
    const cell = cells[key];
    if (!cell) continue;

    const qi = quarterIndex(q);

    // Cascade: previous quarter's netValue becomes this quarter's previousNetValue
    if (qi > 1) {
      const prevQ = PREV_QUARTER[q]!;
      const prevKey: QuarterKey = `${year}-${prevQ}`;
      const prevCell = cells[prevKey];
      if (prevCell?.netValue !== null && prevCell?.netValue !== undefined) {
        cell.previousNetValue = prevCell.netValue;
      }
    }

    const computed = computeQuarterFields(cell);
    cell.netValueChange = computed.netValueChange;
    cell.netValue = computed.netValue;
    cell.adjustedNetValue = computed.adjustedNetValue;

    cumulativeEPS += cell.eps ?? 0;
    cell.adjustedROE = computeAdjustedROE(
      cumulativeEPS,
      qi,
      cell.adjustedNetValue,
    );
  }
}

function parseDecimal(value: string | null): number | null {
  if (value === null) return null;
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

// ─── Initial State ────────────────────────────────────────────────────────────

const initialState: GridState = {
  stockId: null,
  cells: {},
  dirtyKeys: new Set(),
  activeKey: null,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGridStore = create<GridState & GridActions>()(
  devtools(
    immer((set) => ({
      ...initialState,

      loadFinancials(stockId, apiData) {
        set((state) => {
          state.stockId = stockId;
          state.cells = {} as Record<QuarterKey, GridCell>;
          state.dirtyKeys = new Set();

          for (const row of apiData) {
            const qi = quarterIndex(row.quarter);
            const key: QuarterKey = `${row.year}-${row.quarter}`;
            state.cells[key] = {
              key,
              year: row.year,
              quarter: qi,
              eps: parseDecimal(row.eps),
              oci: parseDecimal(row.oci),
              other: parseDecimal(row.other),
              dividends: parseDecimal(row.dividends),
              otherEquityItems: parseDecimal(row.otherEquityItems),
              previousNetValue: parseDecimal(row.previousNetValue),
              netValueChange: null,
              netValue: null,
              adjustedNetValue: null,
              adjustedROE: null,
              isDirty: false,
              isSaving: false,
              saveError: null,
            };
          }

          const years = [...new Set(apiData.map((r) => r.year))];
          for (const year of years) {
            recomputeYear(state.cells as Record<QuarterKey, GridCell>, year);
          }
        });
      },

      setCellField(key, field, value) {
        set((state) => {
          const cell = state.cells[key];
          if (!cell) return;
          (cell as unknown as Record<string, unknown>)[field] = value;
          cell.isDirty = true;
          cell.saveError = null;
          state.dirtyKeys.add(key);
          recomputeYear(
            state.cells as Record<QuarterKey, GridCell>,
            cell.year,
          );
        });
      },

      markSaving(key) {
        set((state) => {
          const cell = state.cells[key];
          if (cell) cell.isSaving = true;
        });
      },

      confirmSave(key) {
        set((state) => {
          const cell = state.cells[key];
          if (!cell) return;
          cell.isDirty = false;
          cell.isSaving = false;
          cell.saveError = null;
          state.dirtyKeys.delete(key);
        });
      },

      revertCell(key, serverData) {
        set((state) => {
          const cell = state.cells[key];
          if (!cell) return;
          Object.assign(cell, serverData);
          cell.isDirty = false;
          cell.isSaving = false;
          cell.saveError = "Save failed — reverted to last saved value.";
          state.dirtyKeys.delete(key);
          recomputeYear(
            state.cells as Record<QuarterKey, GridCell>,
            cell.year,
          );
        });
      },

      setActiveKey(key) {
        set((state) => {
          state.activeKey = key;
        });
      },

      reset() {
        set(() => ({ ...initialState }));
      },
    })),
    { name: "GridStore" },
  ),
);
