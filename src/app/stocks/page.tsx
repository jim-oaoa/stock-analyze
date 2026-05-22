import { prisma } from "@/lib/prisma";
import { StockListClient } from "@/components/stocks/StockListClient";
import type { Metadata } from "next";

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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">股票列表</h1>
      <StockListClient stocks={stocks} />
    </main>
  );
}
