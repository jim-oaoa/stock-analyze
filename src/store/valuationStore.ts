import { create } from "zustand";
import { persist } from "zustand/middleware";
import { computeValuationBands, type ValuationBands } from "@/lib/formulas";
import { DEFAULT_MULTIPLIER } from "@/lib/constants";
import type { QuarterKey } from "@/lib/types";
import type { GridCell } from "./gridStore";

export interface ValuationEntry extends ValuationBands {
  key: QuarterKey;
}

interface ValuationState {
  multiplier: number;
  bands: Record<QuarterKey, ValuationEntry>;
}

interface ValuationActions {
  setMultiplier: (value: number) => void;
  recomputeBands: (cells: Record<QuarterKey, GridCell>) => void;
}

export const useValuationStore = create<ValuationState & ValuationActions>()(
  persist(
    (set) => ({
      multiplier: DEFAULT_MULTIPLIER,
      bands: {},

      setMultiplier(value) {
        set({ multiplier: value });
      },

      recomputeBands(cells) {
        set((state) => {
          const newBands: Record<QuarterKey, ValuationEntry> = {};
          for (const [key, cell] of Object.entries(cells) as [
            QuarterKey,
            GridCell,
          ][]) {
            newBands[key] = {
              key,
              ...computeValuationBands(
                cell.adjustedNetValue,
                cell.adjustedROE,
                state.multiplier,
              ),
            };
          }
          return { bands: newBands };
        });
      },
    }),
    {
      name: "valuation-config",
      partialize: (state) => ({ multiplier: state.multiplier }),
    },
  ),
);
