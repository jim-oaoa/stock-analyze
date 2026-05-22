"use client";

import { useGridStore } from "@/store/gridStore";
import { formatNumber, formatPercent } from "@/lib/utils";
import type { QuarterKey } from "@/lib/types";
import type { ComputedQuarterData } from "@/lib/formulas";

interface ComputedCellProps {
  quarterKey: QuarterKey;
  field: keyof ComputedQuarterData;
}

export function ComputedCell({ quarterKey, field }: ComputedCellProps) {
  const cell = useGridStore((s) => s.cells[quarterKey]);
  const value = cell?.[field] ?? null;

  const display =
    field === "adjustedROE" ? formatPercent(value) : formatNumber(value);

  return (
    <span className="block w-full min-w-[72px] px-1.5 py-1 text-right text-xs font-mono text-zinc-500 bg-zinc-50 select-none">
      {display}
    </span>
  );
}
