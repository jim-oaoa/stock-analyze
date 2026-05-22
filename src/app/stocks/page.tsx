import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

type StockListItem = Prisma.StockGetPayload<{
  select: { id: true; symbol: true; name: true; industry: true };
}>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "股票列表 | 股票估值矩陣",
};

export default async function StocksPage() {
  const stocks = await prisma.stock.findMany({
    orderBy: { symbol: "asc" },
    select: { id: true, symbol: true, name: true, industry: true },
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">股票列表</h1>
      </div>

      {stocks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          尚無股票，請透過 POST /api/stocks 新增。
        </p>
      ) : (
        <div className="grid gap-3">
          {stocks.map((stock: StockListItem) => (
            <a
              key={stock.id}
              href={`/stocks/${stock.symbol}`}
              className="flex items-center justify-between rounded-lg border p-4 hover:bg-zinc-50 transition-colors"
            >
              <div>
                <span className="font-mono font-semibold">{stock.symbol}</span>
                <span className="ml-3 text-sm">{stock.name}</span>
              </div>
              {stock.industry && (
                <span className="text-xs text-zinc-500">{stock.industry}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
