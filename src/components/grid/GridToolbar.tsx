"use client";

import { useGridStore } from "@/store/gridStore";
import { useValuationStore } from "@/store/valuationStore";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function GridToolbar() {
  const dirtyKeys = useGridStore((s) => s.dirtyKeys);
  const { multiplier, setMultiplier } = useValuationStore();
  const cells = useGridStore((s) => s.cells);
  const { recomputeBands } = useValuationStore();

  const dirtyCount = dirtyKeys.size;

  function handleMultiplierChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      setMultiplier(val);
      recomputeBands(cells);
    }
  }

  return (
    <div className="flex items-center gap-4 px-2 py-2 border-b bg-white sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 whitespace-nowrap">乘數 (×)</span>
        <Input
          type="number"
          step="0.1"
          min="0.1"
          max="10"
          value={multiplier}
          onChange={handleMultiplierChange}
          className="w-20 h-7 text-xs text-right font-mono"
          aria-label="Valuation multiplier"
        />
      </div>

      {dirtyCount > 0 && (
        <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-400">
          {dirtyCount} 筆未儲存
        </Badge>
      )}

      <div className="ml-auto text-xs text-zinc-400">
        自動存檔（800ms）
      </div>
    </div>
  );
}
