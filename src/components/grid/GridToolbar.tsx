"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGridStore } from "@/store/gridStore";
import { useValuationStore } from "@/store/valuationStore";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function GridToolbar() {
  const dirtyKeys = useGridStore((s) => s.dirtyKeys);
  const stockId   = useGridStore((s) => s.stockId);
  const { multiplier, setMultiplier } = useValuationStore();
  const cells = useGridStore((s) => s.cells);
  const { recomputeBands } = useValuationStore();
  const router = useRouter();

  const [importState, setImportState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const dirtyCount = dirtyKeys.size;

  function handleMultiplierChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      setMultiplier(val);
      recomputeBands(cells);
    }
  }

  function handleRefresh() {
    if (!stockId || importState === "loading") return;
    setImportState("loading");

    void (async () => {
      try {
        const res = await fetch(`/api/financials/${stockId}/import`, {
          method: "POST",
        });
        if (!res.ok) {
          setImportState("error");
          setTimeout(() => setImportState("idle"), 3000);
          return;
        }
        setImportState("done");
        setTimeout(() => {
          setImportState("idle");
          router.refresh();
        }, 800);
      } catch {
        setImportState("error");
        setTimeout(() => setImportState("idle"), 3000);
      }
    })();
  }

  const refreshLabel =
    importState === "loading" ? "更新中…" :
    importState === "done"    ? "✓ 完成" :
    importState === "error"   ? "✗ 失敗" :
    "↻ 更新資料";

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

      <div className="ml-auto flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          className={[
            "h-7 px-2 text-xs",
            importState === "loading" ? "text-zinc-400 cursor-not-allowed" :
            importState === "done"    ? "text-green-600 border-green-400" :
            importState === "error"   ? "text-red-500 border-red-400" :
            "text-zinc-500",
          ].join(" ")}
          onClick={handleRefresh}
          disabled={importState === "loading"}
          title="從 FinMind 重新抓取最新財務資料"
        >
          {importState === "loading" && (
            <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border border-zinc-400 border-t-transparent" />
          )}
          {refreshLabel}
        </Button>

        <span className="text-xs text-zinc-400">自動存檔（800ms）</span>
      </div>
    </div>
  );
}
