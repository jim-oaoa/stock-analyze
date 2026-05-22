"use client";

import { useValuationStore } from "@/store/valuationStore";
import { BAND_COLORS } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { QuarterKey } from "@/lib/types";
import type { ValuationBands } from "@/lib/formulas";

interface ValuationBandCellProps {
  quarterKey: QuarterKey;
  bandField: keyof ValuationBands;
}

export function ValuationBandCell({
  quarterKey,
  bandField,
}: ValuationBandCellProps) {
  const band = useValuationStore((s) => s.bands[quarterKey]);
  const value = band?.[bandField] ?? null;

  return (
    <span
      className={cn(
        "block w-full min-w-[72px] px-1.5 py-1 text-right text-xs font-mono font-medium select-none",
        bandField !== "baseValue"
          ? BAND_COLORS[bandField as keyof typeof BAND_COLORS]
          : "bg-white text-zinc-700",
      )}
    >
      {formatNumber(value)}
    </span>
  );
}
