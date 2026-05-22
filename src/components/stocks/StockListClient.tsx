"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddStockDialog } from "./AddStockDialog";

interface Stock {
  id: string;
  symbol: string;
  name: string;
  industry: string | null;
}

interface StockListClientProps {
  stocks: Stock[];
}

export function StockListClient({ stocks }: StockListClientProps) {
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = stocks.filter(
    (s) =>
      s.symbol.toLowerCase().includes(query.toLowerCase()) ||
      s.name.includes(query),
  );

  return (
    <>
      {/* 搜尋列 + 新增按鈕 */}
      <div className="mb-4 flex gap-2">
        <Input
          placeholder="搜尋代碼或名稱…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 max-w-xs"
        />
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          + 新增股票
        </Button>
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-zinc-500">
            {query ? `找不到符合「${query}」的股票` : "尚無股票"}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setDialogOpen(true)}
          >
            新增第一支股票
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map((stock) => (
            <a
              key={stock.id}
              href={`/stocks/${stock.symbol}`}
              className="flex items-center justify-between rounded-lg border p-4 hover:bg-zinc-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="w-16 font-mono text-sm font-bold text-zinc-800">
                  {stock.symbol}
                </span>
                <span className="text-sm">{stock.name}</span>
              </div>
              {stock.industry && (
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                  {stock.industry}
                </span>
              )}
            </a>
          ))}
        </div>
      )}

      <AddStockDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}
